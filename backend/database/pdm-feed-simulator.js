/**
 * Live predictive-maintenance feed simulator.
 *
 * The PdM equivalent of live-feed-simulator.js (which only ever handled
 * Energy). This keeps 12 machine profiles continuously updating in
 * machine_readings, so Module 1's "From Database" picker has real variety
 * instead of 5 static machines that never change — and so the same machine
 * checked twice, minutes apart, can genuinely show a different result.
 *
 * Unlike Energy (an append-only history), machine_readings is a
 * current-state table — one row per machine_id, upserted in place. So this
 * script doesn't insert new rows each tick; it updates each machine's
 * sensor values, simulating real drift over time:
 *   - tool_wear climbs steadily (realistic wear accumulation), then resets
 *     near zero occasionally, simulating a tool change/maintenance event
 *   - air/process temperature, rotational speed, and torque jitter mildly
 *     around each machine's own baseline (sensor noise), staying within
 *     the range the model was actually trained on
 *   - 2 of the 12 machines are deliberately "degrading": their tool_wear
 *     climbs faster and their process temperature drifts upward too, so
 *     their predicted failure risk visibly increases over repeated checks
 *     instead of everything staying flat
 *
 * This is a stand-in for a real PLC/SCADA feed, same as the energy one —
 * swap this out when real per-machine telemetry exists; nothing else needs
 * to change, since it talks to the same POST /api/machine-readings a real
 * feed would use.
 *
 * Usage:
 *   node database/pdm-feed-simulator.js
 *   (Ctrl+C to stop)
 *
 * Requires the backend to already be running (default http://localhost:3000).
 * Override with: BACKEND_URL=http://localhost:3000/api node database/pdm-feed-simulator.js
 *
 * TICK_MS  How often (real time) machines get updated. Default 20000 (20s).
 */

const axios = require("axios");

const BASE_URL = process.env.BACKEND_URL || "http://localhost:3000/api";
const TICK_MS = Number(process.env.TICK_MS) || 20000;

// 12 seed profiles spanning healthy -> already-elevated risk, each with its
// own baseline sensor values and business fields (cost/duration/priority/
// deadline stay fixed per machine — only the sensor readings evolve).
const MACHINES = [
  { id: "M-LIVE-001", type: "L", baseline: { air: 298.3, proc: 308.6, speed: 1540, torque: 38.0 }, tool_wear: 8,   degrading: false, maint_duration_hrs: 3, maint_cost_usd: 380,  downtime_cost_per_hr: 760,  energy_cost_usd: 0.42, deadline_hours: 96, priority: 3 },
  { id: "M-LIVE-002", type: "L", baseline: { air: 298.6, proc: 308.9, speed: 1525, torque: 41.0 }, tool_wear: 45,  degrading: false, maint_duration_hrs: 3, maint_cost_usd: 410,  downtime_cost_per_hr: 820,  energy_cost_usd: 0.45, deadline_hours: 84, priority: 3 },
  { id: "M-LIVE-003", type: "M", baseline: { air: 299.1, proc: 309.4, speed: 1480, torque: 44.0 }, tool_wear: 15,  degrading: false, maint_duration_hrs: 4, maint_cost_usd: 520,  downtime_cost_per_hr: 1050, energy_cost_usd: 0.51, deadline_hours: 72, priority: 2 },
  { id: "M-LIVE-004", type: "M", baseline: { air: 299.4, proc: 309.8, speed: 1455, torque: 46.5 }, tool_wear: 70,  degrading: false, maint_duration_hrs: 4, maint_cost_usd: 540,  downtime_cost_per_hr: 1100, energy_cost_usd: 0.53, deadline_hours: 60, priority: 2 },
  { id: "M-LIVE-005", type: "M", baseline: { air: 300.0, proc: 310.4, speed: 1410, torque: 49.0 }, tool_wear: 130, degrading: false, maint_duration_hrs: 5, maint_cost_usd: 610,  downtime_cost_per_hr: 1250, energy_cost_usd: 0.58, deadline_hours: 40, priority: 2 },
  { id: "M-LIVE-006", type: "H", baseline: { air: 298.4, proc: 308.7, speed: 1500, torque: 43.0 }, tool_wear: 20,  degrading: false, maint_duration_hrs: 4, maint_cost_usd: 470,  downtime_cost_per_hr: 940,  energy_cost_usd: 0.47, deadline_hours: 90, priority: 2 },
  { id: "M-LIVE-007", type: "H", baseline: { air: 299.2, proc: 309.5, speed: 1465, torque: 47.0 }, tool_wear: 95,  degrading: false, maint_duration_hrs: 5, maint_cost_usd: 600,  downtime_cost_per_hr: 1200, energy_cost_usd: 0.56, deadline_hours: 55, priority: 2 },
  { id: "M-LIVE-008", type: "H", baseline: { air: 300.2, proc: 310.6, speed: 1340, torque: 53.0 }, tool_wear: 175, degrading: false, maint_duration_hrs: 6, maint_cost_usd: 760,  downtime_cost_per_hr: 1520, energy_cost_usd: 0.64, deadline_hours: 24, priority: 1 },
  { id: "M-LIVE-009", type: "L", baseline: { air: 298.2, proc: 308.5, speed: 1548, torque: 36.5 }, tool_wear: 3,   degrading: false, maint_duration_hrs: 3, maint_cost_usd: 360,  downtime_cost_per_hr: 720,  energy_cost_usd: 0.40, deadline_hours: 100, priority: 3 },
  { id: "M-LIVE-010", type: "M", baseline: { air: 298.9, proc: 309.2, speed: 1495, torque: 42.5 }, tool_wear: 30,  degrading: false, maint_duration_hrs: 4, maint_cost_usd: 500,  downtime_cost_per_hr: 1000, energy_cost_usd: 0.49, deadline_hours: 78, priority: 2 },
  // Degrading machines: faster wear growth + a slow upward temperature
  // drift, so their failure risk visibly climbs over repeated checks
  // instead of everything staying flat.
  { id: "M-LIVE-011", type: "H", baseline: { air: 299.6, proc: 309.9, speed: 1420, torque: 50.0 }, tool_wear: 150, degrading: true,  maint_duration_hrs: 6, maint_cost_usd: 720,  downtime_cost_per_hr: 1440, energy_cost_usd: 0.61, deadline_hours: 18, priority: 1 },
  { id: "M-LIVE-012", type: "M", baseline: { air: 299.8, proc: 310.1, speed: 1395, torque: 51.5 }, tool_wear: 165, degrading: true,  maint_duration_hrs: 5, maint_cost_usd: 690,  downtime_cost_per_hr: 1380, energy_cost_usd: 0.59, deadline_hours: 22, priority: 1 },
];

// Tool wear that crosses this triggers a simulated maintenance event (reset
// near zero) on the NEXT tick, so wear-driven risk doesn't drift forever
// outside the range the model was actually trained on (AI4I tool wear is
// roughly 0-250 min).
const WEAR_RESET_THRESHOLD = 230;

function jitter(value, spreadPct = 0.015) {
  const factor = 1 + (Math.random() * 2 - 1) * spreadPct;
  return value * factor;
}

function tick(machine) {
  // Wear accumulates each tick; degrading machines accumulate roughly 3x
  // faster, plus their process temperature creeps upward.
  const wearStep = (machine.degrading ? 6 : 2) * (0.6 + Math.random() * 0.8);
  machine.tool_wear += wearStep;

  let tempDriftOffset = 0;
  if (machine.degrading) {
    // Increment sized so the cumulative drift (~4-5K after ~30 ticks)
    // is actually visible above the jitter noise (jitter() below is +/-1.5%
    // of ~310K, i.e. roughly +/-4.6K on its own) -- a smaller increment
    // here would be completely swamped by that noise and never show up
    // as a real trend, only as randomness.
    machine._tempDrift = (machine._tempDrift || 0) + 0.15;
    tempDriftOffset = machine._tempDrift;
  }

  let resetThisTick = false;
  if (machine.tool_wear >= WEAR_RESET_THRESHOLD) {
    machine.tool_wear = 5 + Math.random() * 15;
    machine._tempDrift = 0;
    resetThisTick = true;
  }

  const reading = {
    machine_id: machine.id,
    type: machine.type,
    air_temperature: Number(jitter(machine.baseline.air + tempDriftOffset * 0.4).toFixed(2)),
    process_temperature: Number(jitter(machine.baseline.proc + tempDriftOffset).toFixed(2)),
    rotational_speed: Number(jitter(machine.baseline.speed).toFixed(0)),
    torque: Number(jitter(machine.baseline.torque).toFixed(2)),
    tool_wear: Number(machine.tool_wear.toFixed(1)),
    maint_duration_hrs: machine.maint_duration_hrs,
    maint_cost_usd: machine.maint_cost_usd,
    downtime_cost_per_hr: machine.downtime_cost_per_hr,
    energy_cost_usd: machine.energy_cost_usd,
    deadline_hours: machine.deadline_hours,
    priority: machine.priority,
  };

  return { reading, resetThisTick };
}

async function runTick() {
  for (const machine of MACHINES) {
    const { reading, resetThisTick } = tick(machine);
    try {
      await axios.post(`${BASE_URL}/machine-readings`, reading);
      const tag = machine.degrading ? "\u26a0\ufe0f degrading" : "   stable ";
      const resetNote = resetThisTick ? "  \u21bb maintenance event (tool wear reset)" : "";
      console.log(
        `[${reading.machine_id}] ${tag}  wear=${reading.tool_wear.toString().padStart(6)} min  ` +
        `proc_temp=${reading.process_temperature}K${resetNote}`
      );
    } catch (error) {
      console.error(`  \u274c ${machine.id}:`, error.message);
    }
  }
  console.log("");
}

console.log(`Live PdM feed simulator starting.`);
console.log(`Updating ${MACHINES.length} machines via ${BASE_URL}/machine-readings every ${TICK_MS / 1000}s.`);
console.log(`2 machines (M-LIVE-011, M-LIVE-012) are deliberately degrading -- watch their risk climb over repeated checks.`);
console.log(`Press Ctrl+C to stop.\n`);

runTick();
setInterval(runTick, TICK_MS);