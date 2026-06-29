const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const database = require("./config/database");
const { initializeDatabase } = database;
const { BLOCKS: ENERGY_FEED_BLOCKS, PHASE_ORDER: ENERGY_FEED_PHASE_ORDER } = require("./database/energy-feed-data");

const app = express();
app.use(cors());
app.use(express.json());

const ML_SERVICE_BASE_URL = process.env.ML_SERVICE_BASE_URL || "http://127.0.0.1:8000";
const MAINTENANCE_ML_URL = `${ML_SERVICE_BASE_URL}/predict`;
const ENERGY_ML_URL = `${ML_SERVICE_BASE_URL}/predict-energy`;
const ENERGY_DEFAULTS_URL = `${ML_SERVICE_BASE_URL}/energy/defaults`;

// Module 2 forecasts plant-wide kWh, not a dollar cost — this rate converts
// its latest prediction into the energy_cost_usd figure Module 3's scoring
// needs. It's a single plant-wide number applied to every machine in a given
// scheduling run (Module 2 has no per-machine breakdown to draw from).
// Adjust to your actual utility rate.
const ENERGY_RATE_USD_PER_KWH = 0.15;

// ── Module 3 reuse of Module 1/2 outputs ───────────────────────────────────
// Returns the most recent logged prediction for a specific machine_id, or
// null if that machine has never been predicted yet (manual-mode predictions
// have machine_id = NULL and are never matched here, by design — only
// DB-mode PdM predictions are tied to a specific machine).
async function getLatestPredictionForMachine(machineId) {
  const { pool } = database;
  const [rows] = await pool.execute(
    "SELECT * FROM predictions WHERE machine_id = ? ORDER BY timestamp DESC LIMIT 1",
    [machineId]
  );
  return rows[0] || null;
}

// Converts Module 2's most recent energy forecast into a dollar figure for
// Module 3's scoring. Returns null if no energy prediction has ever been
// logged yet (fresh system), so callers can fall back to machine_readings'
// stored value instead.
async function getLatestEnergyCostUsd() {
  const { pool } = database;
  const [rows] = await pool.execute(
    "SELECT predicted_usage_kwh FROM energy_predictions ORDER BY timestamp DESC LIMIT 1"
  );
  if (!rows[0] || rows[0].predicted_usage_kwh == null) return null;
  return Number(rows[0].predicted_usage_kwh) * ENERGY_RATE_USD_PER_KWH;
}

// Single shared place that knows how to log a maintenance prediction, used
// by both the manual /api/predict route and Module 3's live-schedule
// fallback (when a machine has no prior logged prediction yet). Keeping
// this in one function means both paths always log the same shape of row.
async function logMaintenancePrediction(machineId, sensorValues, mlData) {
  const failures = {
    machine: mlData.overall_status === "FAILURE",
    twf: Boolean(mlData.predictions?.twf?.failure),
    hdf: Boolean(mlData.predictions?.hdf?.failure),
    pwf: Boolean(mlData.predictions?.pwf?.failure),
    osf: Boolean(mlData.predictions?.osf?.failure),
    rnf: Boolean(mlData.predictions?.rnf?.failure),
  };
  const failureProbability = mlData.predictions?.machine?.failure_probability ?? null;
  const predictionId = `${Date.now()}${machineId ? `-${machineId}` : ""}`;

  const { pool } = database;
  await pool.execute(
    `INSERT INTO predictions
     (id, machine_id, machine_type, air_temperature, process_temperature, rotational_speed, torque, tool_wear, status,
      failure_machine, failure_probability, failure_twf, failure_hdf, failure_pwf, failure_osf, failure_rnf)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      predictionId,
      machineId ?? null,
      sensorValues.type,
      sensorValues.air_temperature,
      sensorValues.process_temperature,
      sensorValues.rotational_speed,
      sensorValues.torque,
      sensorValues.tool_wear,
      mlData.overall_status,
      failures.machine,
      failureProbability,
      failures.twf,
      failures.hdf,
      failures.pwf,
      failures.osf,
      failures.rnf,
    ]
  );

  return { failures, failureProbability };
}

async function getFailureStats() {
  const { pool } = database;
  const [rows] = await pool.execute(`
    SELECT 
      SUM(failure_machine) as machine,
      SUM(failure_twf) as twf,
      SUM(failure_hdf) as hdf,
      SUM(failure_pwf) as pwf,
      SUM(failure_osf) as osf,
      SUM(failure_rnf) as rnf
    FROM predictions
  `);
  return rows[0] || { machine: 0, twf: 0, hdf: 0, pwf: 0, osf: 0, rnf: 0 };
}

async function getMachineHealth() {
  const { pool } = database;
  const [healthyRows] = await pool.execute(
    "SELECT COUNT(*) as count FROM predictions WHERE status = 'NORMAL'"
  );
  const [failureRows] = await pool.execute(
    "SELECT COUNT(*) as count FROM predictions WHERE status = 'FAILURE'"
  );
  const [criticalRows] = await pool.execute(
    "SELECT COUNT(*) as count FROM predictions WHERE failure_machine = TRUE"
  );

  return {
    healthy: healthyRows[0].count,
    atRisk: failureRows[0].count - criticalRows[0].count,
    critical: criticalRows[0].count,
  };
}

// ── Live scheduling math, ported 1:1 from SM.ipynb (objective_score,
// compute_scores, heuristic_scheduler) so the live endpoint produces the
// same kind of schedule the offline notebook does, just from current data. ──
function objectiveScore(row, w1 = 0.4, w2 = 0.35, w3 = 0.25) {
  const downtimeRisk = row.fail_prob * row.downtime_cost_hr * row.maint_duration;
  const maintenanceCost = row.maint_cost_usd;
  const energyCost = row.energy_cost_usd;
  return w1 * downtimeRisk + w2 * maintenanceCost + w3 * energyCost;
}

function computeScores(rows, w1 = 0.4, w2 = 0.35, w3 = 0.25) {
  const scored = rows.map((row) => ({
    ...row,
    obj_score: objectiveScore(row, w1, w2, w3),
  }));
  const scores = scored.map((r) => r.obj_score);
  const mn = Math.min(...scores);
  const mx = Math.max(...scores);
  return scored.map((r) => ({
    ...r,
    obj_score_norm: ((r.obj_score - mn) / (mx - mn + 1e-9)) * 100,
  }));
}

// Priority is stored as 1 (High) / 2 (Medium) / 3 (Low) — lower number,
// higher urgency. Normalized to a 0-1 weight where 1=High maps to 1.0.
const URGENCY_RISK_WEIGHT = 0.7; // fail_prob's share of urgency
const URGENCY_PRIORITY_WEIGHT = 0.3; // priority's guaranteed share, even at fail_prob=0

// A logged prediction older than this is treated as expired by Module 3's
// live schedule — it gets recomputed fresh rather than trusted forever.
// Without this, a machine's very first-ever prediction (right after seeding,
// or from before some later fix) would silently keep being reused with no
// way to tell whether it's still accurate. Tune to taste.
const PREDICTION_STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour

function heuristicScheduler(rows, capacityHoursPerDay = 16, nDays = 7) {
  const withUrgency = rows
    .map((row) => {
      const priorityWeight = (4 - row.priority) / 3;
      // Previously urgency = fail_prob * priority / deadline — a pure
      // product, so any machine with fail_prob = 0 got urgency = 0
      // regardless of priority, letting "High" priority machines lose to
      // "Low" priority ones on tie-break alone. Blending the two signals
      // means priority always contributes something, while fail_prob still
      // dominates whenever it's meaningfully non-zero.
      const riskComponent = URGENCY_RISK_WEIGHT * row.fail_prob;
      const priorityComponent = URGENCY_PRIORITY_WEIGHT * priorityWeight;
      const urgency = (riskComponent + priorityComponent) / (row.deadline_hours + 1e-9);
      // Kept on the row (not just folded into urgency) so the dashboard can
      // show an honest breakdown of where a ranking actually came from —
      // this is a formula breakdown, not SHAP, since there's no trained
      // model behind the scheduler to explain.
      return { ...row, urgency, riskComponent, priorityComponent };
    })
    .sort((a, b) => b.urgency - a.urgency);

  const dayLoad = {};
  for (let d = 1; d <= nDays; d += 1) dayLoad[d] = 0;

  return withUrgency.map((row) => {
    let assignedDay = null;
    for (let day = 1; day <= nDays; day += 1) {
      if (dayLoad[day] + row.maint_duration <= capacityHoursPerDay) {
        if (row.deadline_hours >= (day - 1) * 24) {
          dayLoad[day] += row.maint_duration;
          assignedDay = day;
          break;
        }
      }
    }

    return {
      machine_id: row.machine_id,
      day: assignedDay,
      action: assignedDay !== null ? "MAINTAIN" : "DEFERRED",
      duration_hrs: row.maint_duration,
      fail_prob: Number(row.fail_prob.toFixed(3)),
      urgency: Number(row.urgency.toFixed(4)),
      obj_score: Number(row.obj_score_norm.toFixed(2)),
      priority: row.priority,
      deadline_hrs: row.deadline_hours,
      prediction_source: row.prediction_source,
      urgency_breakdown: {
        risk_component: Number(row.riskComponent.toFixed(4)),
        priority_component: Number(row.priorityComponent.toFixed(4)),
        risk_weight: URGENCY_RISK_WEIGHT,
        priority_weight: URGENCY_PRIORITY_WEIGHT,
      },
    };
  });
}

// ── Simulated Annealing cost-convergence, ported from SM.ipynb's
// simulated_annealing() — same total_cost() (weighted downtime + maintenance
// + energy, plus deadline/capacity penalties) and same cooling schedule, just
// driven by the live `scored` rows instead of the notebook's static dataset.
// This exists purely to plot a "cost convergence curve": the heuristic
// scheduler above is still what actually assigns machines to days.
function simulatedAnnealingCostHistory(
  rows,
  { nDays = 7, capacityHours = 16, tStart = 1000, tEnd = 1, alpha = 0.97, iterations = 1500 } = {}
) {
  const n = rows.length;
  if (n === 0) {
    return { initialCost: 0, bestCost: 0, reductionPct: 0, history: [] };
  }

  const totalCost = (assignment) => {
    let cost = 0;
    let penalty = 0;
    const load = {};
    for (let d = 1; d <= nDays; d += 1) load[d] = 0;

    assignment.forEach((day, i) => {
      const row = rows[i];
      const downtime = 0.4 * row.fail_prob * row.downtime_cost_hr * row.maint_duration;
      const maint = 0.35 * row.maint_cost_usd;
      const energy = 0.25 * row.energy_cost_usd;
      cost += downtime + maint + energy;
      load[day] += row.maint_duration;
      if (day * 24 > row.deadline_hours + 24) penalty += 5000;
    });

    for (let d = 1; d <= nDays; d += 1) {
      if (load[d] > capacityHours) penalty += (load[d] - capacityHours) * 300;
    }

    return cost + penalty;
  };

  let assignment = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * nDays));
  const initialCost = totalCost(assignment);
  let bestAssignment = [...assignment];
  let bestCost = initialCost;
  let currentCost = initialCost;

  let T = tStart;
  const history = [];

  for (let it = 0; it < iterations; it += 1) {
    const neighbour = [...assignment];
    const idx = Math.floor(Math.random() * n);
    neighbour[idx] = 1 + Math.floor(Math.random() * nDays);

    const newCost = totalCost(neighbour);
    const delta = newCost - currentCost;

    if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
      assignment = neighbour;
      currentCost = newCost;
      if (currentCost < bestCost) {
        bestCost = currentCost;
        bestAssignment = [...assignment];
      }
    }

    T = Math.max(T * alpha, tEnd);
    if (it % 50 === 0) {
      history.push({ iteration: it, cost: Number(bestCost.toFixed(2)) });
    }
  }
  history.push({ iteration: iterations, cost: Number(bestCost.toFixed(2)) });

  const reductionPct = initialCost > 0 ? (1 - bestCost / initialCost) * 100 : 0;

  return {
    initialCost: Number(initialCost.toFixed(2)),
    bestCost: Number(bestCost.toFixed(2)),
    reductionPct: Number(reductionPct.toFixed(1)),
    history,
  };
}

async function getRecentMaintenancePredictions(limit = 10) {
  const { pool } = database;
  const [rows] = await pool.execute(`
    SELECT 
      id,
      timestamp,
      machine_type as type,
      air_temperature,
      process_temperature,
      rotational_speed,
      torque,
      tool_wear,
      status,
      failure_machine as machine,
      failure_twf as twf,
      failure_hdf as hdf,
      failure_pwf as pwf,
      failure_osf as osf,
      failure_rnf as rnf
    FROM predictions
    ORDER BY timestamp DESC
    LIMIT ${parseInt(limit)}
  `);

  return rows.map((row) => ({
    id: row.id,
    kind: "maintenance",
    timestamp: row.timestamp,
    input: {
      type: row.type,
      air_temperature: Number(row.air_temperature),
      process_temperature: Number(row.process_temperature),
      rotational_speed: Number(row.rotational_speed),
      torque: Number(row.torque),
      tool_wear: Number(row.tool_wear),
    },
    result: {
      status: row.status,
      failures: {
        machine: Boolean(row.machine),
        twf: Boolean(row.twf),
        hdf: Boolean(row.hdf),
        pwf: Boolean(row.pwf),
        osf: Boolean(row.osf),
        rnf: Boolean(row.rnf),
      },
    },
  }));
}

async function getEnergySummary() {
  const { pool } = database;
  const [countRows] = await pool.execute("SELECT COUNT(*) as count FROM energy_predictions");
  const [usageRows] = await pool.execute(`
    SELECT 
      AVG(predicted_usage_kwh) as averageUsage,
      MAX(predicted_usage_kwh) as peakUsage,
      AVG(efficiency_score) as averageEfficiency
    FROM energy_predictions
  `);
  const [statusRows] = await pool.execute(`
    SELECT 
      SUM(CASE WHEN status = 'OPTIMAL' THEN 1 ELSE 0 END) as optimal,
      SUM(CASE WHEN status = 'MONITOR' THEN 1 ELSE 0 END) as monitor,
      SUM(CASE WHEN status = 'CRITICAL' THEN 1 ELSE 0 END) as critical
    FROM energy_predictions
  `);

  return {
    totalPredictions: countRows[0].count || 0,
    averagePredictedUsage: Number(usageRows[0]?.averageUsage || 0).toFixed(2),
    peakPredictedUsage: Number(usageRows[0]?.peakUsage || 0).toFixed(2),
    averageEfficiencyScore: Number(usageRows[0]?.averageEfficiency || 0).toFixed(1),
    statusBreakdown: statusRows[0] || { optimal: 0, monitor: 0, critical: 0 },
  };
}

async function getRecentEnergyPredictions(limit = 10) {
  const { pool } = database;
  const [rows] = await pool.execute(`
    SELECT
      id,
      timestamp,
      input_timestamp,
      load_type,
      input_payload,
      predicted_usage_kwh,
      status,
      efficiency_score,
      peak_window,
      recommendations_json
    FROM energy_predictions
    ORDER BY timestamp DESC
    LIMIT ${parseInt(limit)}
  `);

  return rows.map((row) => ({
    id: row.id,
    kind: "energy",
    timestamp: row.timestamp,
    inputTimestamp: row.input_timestamp,
    input: row.input_payload ? JSON.parse(row.input_payload) : {},
    result: {
      loadType: row.load_type,
      predictedUsageKWh: Number(row.predicted_usage_kwh),
      status: row.status,
      efficiencyScore: Number(row.efficiency_score),
      peakWindow: Boolean(row.peak_window),
      recommendations: row.recommendations_json
        ? JSON.parse(row.recommendations_json)
        : [],
    },
  }));
}

async function getCombinedHistory(limit = 20) {
  const [maintenance, energy] = await Promise.all([
    getRecentMaintenancePredictions(limit),
    getRecentEnergyPredictions(limit),
  ]);

  return [...maintenance, ...energy]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

app.post("/api/predict", async (req, res) => {
  try {
    const {
      machine_id,
      type,
      air_temperature,
      process_temperature,
      rotational_speed,
      torque,
      tool_wear,
    } = req.body;

    const mlPayload = {
      Type: type,
      Air_temperature_K: air_temperature,
      Process_temperature_K: process_temperature,
      Rotational_speed_rpm: rotational_speed,
      Torque_Nm: torque,
      Tool_wear_min: tool_wear,
    };

    const mlResponse = await axios.post(MAINTENANCE_ML_URL, mlPayload, {
      headers: { "Content-Type": "application/json" },
    });

    const mlData = mlResponse.data;
    const { failures } = await logMaintenancePrediction(
      machine_id,
      { type, air_temperature, process_temperature, rotational_speed, torque, tool_wear },
      mlData
    );

    return res.status(200).json({
      success: true,
      predictionType: "maintenance",
      status: mlData.overall_status,
      failures,
      shapExplanation: mlData.predictions?.machine?.shap_explanation || null,
    });
  } catch (error) {
    console.error("Maintenance Prediction Error:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: "ML service error",
        details: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to get prediction from ML service",
    });
  }
});

app.post("/api/predict-energy", async (req, res) => {
  try {
    const mlResponse = await axios.post(ENERGY_ML_URL, req.body, {
      headers: { "Content-Type": "application/json" },
    });

    const mlData = mlResponse.data;
    const predictionId = `${Date.now()}-energy`;
    const { pool } = database;
    await pool.execute(
      `INSERT INTO energy_predictions
       (id, input_timestamp, load_type, input_payload, predicted_usage_kwh, status, efficiency_score, peak_window, recommendations_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        predictionId,
        req.body.timestamp,
        req.body.load_type,
        JSON.stringify(req.body),
        mlData.predicted_usage_kwh,
        mlData.status,
        mlData.efficiency_score,
        mlData.peak_window,
        JSON.stringify(mlData.recommendations || []),
      ]
    );

    return res.status(200).json({
      success: true,
      predictionType: "energy",
      predictedUsageKWh: mlData.predicted_usage_kwh,
      status: mlData.status,
      efficiencyScore: mlData.efficiency_score,
      peakWindow: mlData.peak_window,
      recommendations: mlData.recommendations || [],
      modelName: mlData.model_name,
      thresholds: mlData.thresholds,
      shapExplanation: mlData.shap_explanation || null,
    });
  } catch (error) {
    console.error("Energy Prediction Error:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: "ML service error",
        details: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to get energy prediction from ML service",
    });
  }
});

app.get("/api/energy/defaults", async (req, res) => {
  try {
    const response = await axios.get(ENERGY_DEFAULTS_URL, { timeout: 4000 });
    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch energy defaults",
    });
  }
});

app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const maintenanceHealth = await getMachineHealth();
    const maintenanceFailureStats = await getFailureStats();
    const { pool } = database;
    const [maintenanceCountRows] = await pool.execute(
      "SELECT COUNT(*) as count FROM predictions"
    );
    const [energyCountRows] = await pool.execute(
      "SELECT COUNT(*) as count FROM energy_predictions"
    );

    const [maintenanceRecentPredictions, energySummary, energyRecentPredictions, history] =
      await Promise.all([
        getRecentMaintenancePredictions(10),
        getEnergySummary(),
        getRecentEnergyPredictions(10),
        getCombinedHistory(20),
      ]);

    return res.status(200).json({
      success: true,
      data: {
        maintenance: {
          machineHealth: maintenanceHealth,
          totalPredictions: maintenanceCountRows[0].count,
          failureStats: maintenanceFailureStats,
          recentPredictions: maintenanceRecentPredictions,
        },
        energy: {
          ...energySummary,
          totalPredictions: energyCountRows[0].count,
          recentPredictions: energyRecentPredictions,
        },
        history,
      },
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to get dashboard statistics",
    });
  }
});

// ── "From database" mode: machine_readings (PdM + live schedule) ──────────
app.get("/api/machine-readings", async (req, res) => {
  try {
    const { pool } = database;
    const [rows] = await pool.execute("SELECT * FROM machine_readings ORDER BY machine_id");
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error("Machine Readings Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch machine readings",
    });
  }
});

// Upsert one machine's current reading. This is the interface an external
// process (PLC poller, MES integration, manual seed script, etc.) calls to
// keep machine_readings current — the dashboard only reads from it.
app.post("/api/machine-readings", async (req, res) => {
  try {
    const {
      machine_id,
      type,
      air_temperature,
      process_temperature,
      rotational_speed,
      torque,
      tool_wear,
      maint_duration_hrs,
      maint_cost_usd,
      downtime_cost_per_hr,
      energy_cost_usd,
      deadline_hours,
      priority,
    } = req.body;

    if (!machine_id) {
      return res.status(400).json({ success: false, error: "machine_id is required" });
    }

    const { pool } = database;
    await pool.execute(
      `INSERT INTO machine_readings
       (machine_id, type, air_temperature, process_temperature, rotational_speed, torque, tool_wear,
        maint_duration_hrs, maint_cost_usd, downtime_cost_per_hr, energy_cost_usd, deadline_hours, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         type = VALUES(type),
         air_temperature = VALUES(air_temperature),
         process_temperature = VALUES(process_temperature),
         rotational_speed = VALUES(rotational_speed),
         torque = VALUES(torque),
         tool_wear = VALUES(tool_wear),
         maint_duration_hrs = VALUES(maint_duration_hrs),
         maint_cost_usd = VALUES(maint_cost_usd),
         downtime_cost_per_hr = VALUES(downtime_cost_per_hr),
         energy_cost_usd = VALUES(energy_cost_usd),
         deadline_hours = VALUES(deadline_hours),
         priority = VALUES(priority)`,
      [
        machine_id,
        type,
        air_temperature,
        process_temperature,
        rotational_speed,
        torque,
        tool_wear,
        maint_duration_hrs ?? 4,
        maint_cost_usd ?? 500,
        downtime_cost_per_hr ?? 1000,
        energy_cost_usd ?? 20,
        deadline_hours ?? 48,
        priority ?? 2,
      ]
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Upsert Machine Reading Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to save machine reading",
    });
  }
});

// ── "From database" mode: energy_readings (Energy module) ─────────────────

async function insertEnergyReadingRow(reading) {
  const { pool } = database;
  await pool.execute(
    `INSERT INTO energy_readings
     (reading_timestamp, usage_kwh, lagging_reactive_kvarh, leading_reactive_kvarh, co2_tco2, load_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      reading.reading_timestamp,
      reading.usage_kwh,
      reading.lagging_reactive_kvarh,
      reading.leading_reactive_kvarh,
      reading.co2_tco2,
      reading.load_type || "Light_Load",
    ]
  );
}

// Request-driven counterpart to live-feed-simulator.js's timer-driven tick():
// same real OPTIMAL -> MONITOR -> CRITICAL blocks (see energy-feed-data.js),
// same per-phase seed-then-continue behavior, just advanced once per call
// instead of once per TICK_MS — so the "Predict from last 8 hours" button
// always pulls in one new real-data-based reading first, rather than reusing
// a frozen table when nobody happens to have the standalone simulator script
// running in the background. State is in-memory and resets on server restart.
const ENERGY_FEED_BLOCK_TICKS = 12;
const ENERGY_FEED_READING_STEP_MIN = 15;
let energyFeedPhaseIndex = 0;
let energyFeedTickInPhase = 0;
let energyFeedCursor = null;

async function advanceEnergyFeed() {
  if (energyFeedCursor === null) energyFeedCursor = new Date();

  const postReading = async (point, loadType) => {
    energyFeedCursor = new Date(energyFeedCursor.getTime() + ENERGY_FEED_READING_STEP_MIN * 60 * 1000);
    await insertEnergyReadingRow({
      reading_timestamp: energyFeedCursor.toISOString().slice(0, 19).replace("T", " "),
      usage_kwh: point.usage_kwh,
      lagging_reactive_kvarh: point.lagging_reactive_kvarh,
      leading_reactive_kvarh: point.leading_reactive_kvarh,
      co2_tco2: point.co2_tco2,
      load_type: loadType,
    });
  };

  const phaseName = ENERGY_FEED_PHASE_ORDER[energyFeedPhaseIndex];
  const block = ENERGY_FEED_BLOCKS[phaseName];

  if (energyFeedTickInPhase === 0) {
    // Entering a phase: re-prime its real 32-reading context first, exactly
    // like live-feed-simulator.js's enterPhase(), so the rolling window the
    // model sees matches that phase's real data, not a mix of two phases.
    const seedPoints = block.points.slice(0, 32);
    for (const point of seedPoints) {
      await postReading(point, block.load_type);
    }
  }

  const continuation = block.points.slice(32);
  const point = continuation[energyFeedTickInPhase % continuation.length];
  await postReading(point, block.load_type);

  energyFeedTickInPhase += 1;
  if (energyFeedTickInPhase >= ENERGY_FEED_BLOCK_TICKS) {
    energyFeedTickInPhase = 0;
    energyFeedPhaseIndex = (energyFeedPhaseIndex + 1) % ENERGY_FEED_PHASE_ORDER.length;
  }
}

app.get("/api/energy-readings/latest", async (req, res) => {
  try {
    await advanceEnergyFeed();

    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 32));
    const { pool } = database;
    const [rows] = await pool.execute(
      `SELECT * FROM energy_readings ORDER BY reading_timestamp DESC LIMIT ${limit}`
    );
    // Oldest-first, matching the manual-entry table's row order (last row =
    // most recent reading right before the forecast moment).
    return res.status(200).json({ success: true, data: rows.reverse() });
  } catch (error) {
    console.error("Energy Readings Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch energy readings",
    });
  }
});

// Insert one new live energy reading. Same role as the machine-readings POST
// above, but append-only since this is a time series rather than a
// current-state-per-machine table. Still here for any external process
// (PLC poller, MES integration) that wants to push real readings instead of
// relying on advanceEnergyFeed()'s synthetic-but-realistic ones.
app.post("/api/energy-readings", async (req, res) => {
  try {
    const { reading_timestamp } = req.body;

    if (!reading_timestamp) {
      return res.status(400).json({ success: false, error: "reading_timestamp is required" });
    }

    await insertEnergyReadingRow(req.body);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Insert Energy Reading Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to save energy reading",
    });
  }
});

// ── Module 3 live schedule: reuses what Modules 1 & 2 already produced.
// fail_prob comes from each machine's most recent LOGGED prediction (from
// Module 1, whether that prediction was made manually or via PdM's own
// "From Database" mode) — the ML model is only called directly as a
// fallback, for a machine that has never been predicted yet. The energy
// cost figure in the scoring comes from Module 2's latest forecast,
// converted to dollars, applied uniformly across all machines (Module 2's
// output is plant-wide, not per-machine).
app.get("/api/maintenance-schedule/live", async (req, res) => {
  try {
    // ?force=true bypasses the staleness check entirely, recomputing every
    // machine fresh regardless of how recently it was last predicted —
    // useful right after a code/model change, rather than waiting out
    // PREDICTION_STALE_AFTER_MS.
    const forceRefresh = req.query.force === "true";

    const { pool } = database;
    const [machines] = await pool.execute("SELECT * FROM machine_readings");

    if (machines.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          rows: [],
          summary: {
            total: 0,
            maintainCount: 0,
            deferredCount: 0,
            avgUrgency: 0,
            avgFailProb: 0,
            criticalCount: 0,
          },
        },
      });
    }

    const latestEnergyCostUsd = await getLatestEnergyCostUsd();

    const withFailProb = await Promise.all(
      machines.map(async (m) => {
        let failProb;
        let predictionSource;
        const loggedPrediction = await getLatestPredictionForMachine(m.machine_id);
        const loggedAt = loggedPrediction ? new Date(loggedPrediction.timestamp).getTime() : null;
        const isFresh =
          !forceRefresh && loggedAt !== null && Date.now() - loggedAt < PREDICTION_STALE_AFTER_MS;

        if (loggedPrediction && loggedPrediction.failure_probability != null && isFresh) {
          // Reuse Module 1's own output — no model call needed.
          failProb = Number(loggedPrediction.failure_probability);
          predictionSource = "reused";
        } else {
          // Never predicted before, OR the logged prediction is stale: fall
          // back to a direct model call, and log the result the same way
          // Module 1's own route does, so the next live-schedule run (and
          // the prediction history) has a fresh one too.
          const mlPayload = {
            Type: m.type,
            Air_temperature_K: Number(m.air_temperature),
            Process_temperature_K: Number(m.process_temperature),
            Rotational_speed_rpm: Number(m.rotational_speed),
            Torque_Nm: Number(m.torque),
            Tool_wear_min: Number(m.tool_wear),
          };
          const mlResponse = await axios.post(MAINTENANCE_ML_URL, mlPayload, {
            headers: { "Content-Type": "application/json" },
          });
          const mlData = mlResponse.data;
          failProb = mlData?.predictions?.machine?.failure_probability ?? 0;
          predictionSource = loggedPrediction
            ? forceRefresh
              ? "recomputed_forced"
              : "recomputed_stale"
            : "recomputed_new";

          await logMaintenancePrediction(
            m.machine_id,
            {
              type: m.type,
              air_temperature: Number(m.air_temperature),
              process_temperature: Number(m.process_temperature),
              rotational_speed: Number(m.rotational_speed),
              torque: Number(m.torque),
              tool_wear: Number(m.tool_wear),
            },
            mlData
          );
        }

        return {
          machine_id: m.machine_id,
          fail_prob: failProb,
          prediction_source: predictionSource,
          maint_duration: Number(m.maint_duration_hrs),
          maint_cost_usd: Number(m.maint_cost_usd),
          downtime_cost_hr: Number(m.downtime_cost_per_hr),
          // Module 2's latest forecast overrides the stored per-machine
          // value when available; falls back to machine_readings' own
          // figure if no energy prediction has ever been logged yet.
          energy_cost_usd:
            latestEnergyCostUsd != null ? latestEnergyCostUsd : Number(m.energy_cost_usd),
          deadline_hours: Number(m.deadline_hours),
          priority: Number(m.priority),
        };
      })
    );

    const scored = computeScores(withFailProb);
    const rows = heuristicScheduler(scored);
    const convergence = simulatedAnnealingCostHistory(scored);

    const maintainCount = rows.filter((r) => r.action === "MAINTAIN").length;
    const deferredCount = rows.filter((r) => r.action === "DEFERRED").length;
    const avgUrgency = rows.reduce((s, r) => s + (r.urgency || 0), 0) / rows.length;
    const avgFailProb = rows.reduce((s, r) => s + (r.fail_prob || 0), 0) / rows.length;
    const criticalCount = rows.filter(
      (r) => r.priority === 1 || (r.fail_prob && r.fail_prob >= 0.9)
    ).length;

    // The single highest-risk machine that actually got scheduled this run —
    // fetched fresh from the ML service (rather than reused) purely to get
    // its SHAP explanation for the waterfall plot, since logged predictions
    // don't persist shap_explanation.
    let topRiskMachine = null;
    const maintainedRows = rows
      .filter((r) => r.action === "MAINTAIN")
      .sort((a, b) => b.fail_prob - a.fail_prob);
    if (maintainedRows.length > 0) {
      const top = maintainedRows[0];
      const m = machines.find((mm) => mm.machine_id === top.machine_id);
      if (m) {
        try {
          const mlResponse = await axios.post(
            MAINTENANCE_ML_URL,
            {
              Type: m.type,
              Air_temperature_K: Number(m.air_temperature),
              Process_temperature_K: Number(m.process_temperature),
              Rotational_speed_rpm: Number(m.rotational_speed),
              Torque_Nm: Number(m.torque),
              Tool_wear_min: Number(m.tool_wear),
            },
            { headers: { "Content-Type": "application/json" } }
          );
          topRiskMachine = {
            machine_id: top.machine_id,
            day: top.day,
            fail_prob: top.fail_prob,
            shapExplanation: mlResponse.data?.predictions?.machine?.shap_explanation || null,
          };
        } catch (e) {
          topRiskMachine = { machine_id: top.machine_id, day: top.day, fail_prob: top.fail_prob, shapExplanation: null };
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        rows,
        summary: {
          total: rows.length,
          maintainCount,
          deferredCount,
          avgUrgency: Number(avgUrgency.toFixed(4)),
          avgFailProb: Number(avgFailProb.toFixed(4)),
          criticalCount,
        },
        energyCostSource: latestEnergyCostUsd != null ? "module2_forecast" : "machine_readings_default",
        convergence,
        topRiskMachine,
      },
    });
  } catch (error) {
    console.error("Live Maintenance Schedule Error:", error.message);
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: "ML service error",
        details: error.response.data,
      });
    }
    return res.status(500).json({
      success: false,
      error: "Failed to compute live maintenance schedule",
    });
  }
});

app.get("/api/maintenance-schedule", (req, res) => {
  try {
    const csvPath = path.join(__dirname, "..", "maintenance_schedule.csv");
    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const lines = csvContent.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const values = line.split(",");
      const row = {};
      headers.forEach((h, i) => {
        const val = values[i]?.trim() || "";
        row[h] = val === "" ? null : isNaN(val) ? val : Number(val);
      });
      return row;
    });

    const maintainCount = rows.filter((r) => r.action === "MAINTAIN").length;
    const deferredCount = rows.filter((r) => r.action === "DEFERRED").length;
    const avgUrgency =
      rows.reduce((sum, r) => sum + (r.urgency || 0), 0) / rows.length;
    const avgFailProb =
      rows.reduce((sum, r) => sum + (r.fail_prob || 0), 0) / rows.length;
    const criticalCount = rows.filter(
      (r) => r.priority === 1 || (r.fail_prob && r.fail_prob >= 0.9)
    ).length;

    return res.status(200).json({
      success: true,
      data: {
        rows,
        summary: {
          total: rows.length,
          maintainCount,
          deferredCount,
          avgUrgency: Number(avgUrgency.toFixed(4)),
          avgFailProb: Number(avgFailProb.toFixed(4)),
          criticalCount,
        },
      },
    });
  } catch (error) {
    console.error("Maintenance Schedule Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to load maintenance schedule",
    });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    let dbStatus = "offline";
    try {
      const { pool } = database;
      await pool.execute("SELECT 1");
      dbStatus = database.useMemoryStore ? "memory" : "online";
    } catch (e) {
      dbStatus = "offline";
    }

    let mlServiceStatus = "offline";
    let modelsLoaded = 0;
    try {
      const mlResponse = await axios.get(`${ML_SERVICE_BASE_URL}/`, { timeout: 2000 });
      mlServiceStatus = "online";
      modelsLoaded = mlResponse.data?.modelsLoaded || 0;
    } catch (e) {
      mlServiceStatus = "offline";
    }

    return res.status(200).json({
      success: true,
      data: {
        backend: "online",
        database: dbStatus,
        mlService: mlServiceStatus,
        modelsLoaded,
        averageAccuracy: 0.97,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Health check failed",
    });
  }
});

const PORT = process.env.PORT || 3000;

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
      if (database.useMemoryStore) {
        console.log("Using in-memory storage (MySQL unavailable)");
      } else {
        console.log(
          `Connected to MySQL database: ${process.env.DB_NAME || "colab"}`
        );
      }
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });