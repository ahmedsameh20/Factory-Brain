const express = require("express");
const axios = require("axios");
const cors = require("cors");
require('dotenv').config();

const { pool, initializeDatabase } = require('./config/database');

const app = express();
app.use(cors());
app.use(express.json());

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000/predict";

// ----------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------

async function getFailureStats() {
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
  const [healthyRows] = await pool.execute(
    "SELECT COUNT(*) as count FROM predictions WHERE status = 'NORMAL'"
  );
  const [failureRows] = await pool.execute(
    "SELECT COUNT(*) as count FROM predictions WHERE status = 'FAILURE'"
  );
  const [criticalRows] = await pool.execute(
    "SELECT COUNT(*) as count FROM predictions WHERE failure_machine = TRUE"
  );
  
  const total = healthyRows[0].count + failureRows[0].count;
  
  return {
    healthy: healthyRows[0].count,
    atRisk: failureRows[0].count - criticalRows[0].count,
    critical: criticalRows[0].count
  };
}

async function getRecentPredictions(limit = 10) {
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
  
  return rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    input: {
      type: row.type,
      air_temperature: row.air_temperature,
      process_temperature: row.process_temperature,
      rotational_speed: row.rotational_speed,
      torque: row.torque,
      tool_wear: row.tool_wear
    },
    result: {
      status: row.status,
      failures: {
        machine: Boolean(row.machine),
        twf: Boolean(row.twf),
        hdf: Boolean(row.hdf),
        pwf: Boolean(row.pwf),
        osf: Boolean(row.osf),
        rnf: Boolean(row.rnf)
      }
    }
  }));
}

// ----------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------

// POST /api/predict - Make a prediction
app.post("/api/predict", async (req, res) => {
  try {
    const {
      type,
      air_temperature,
      process_temperature,
      rotational_speed,
      torque,
      tool_wear
    } = req.body;

    // Mapping (Node → ML)
    const mlPayload = {
      Type: type,
      Air_temperature_K: air_temperature,
      Process_temperature_K: process_temperature,
      Rotational_speed_rpm: rotational_speed,
      Torque_Nm: torque,
      Tool_wear_min: tool_wear
    };

    // Call ML service
    const mlResponse = await axios.post(
      ML_SERVICE_URL,
      mlPayload,
      { headers: { "Content-Type": "application/json" } }
    );

    const mlData = mlResponse.data;

    // Build failures object
    const failures = {
      machine: mlData.overall_status === "FAILURE",
      twf: Boolean(mlData.predictions?.twf?.failure),
      hdf: Boolean(mlData.predictions?.hdf?.failure),
      pwf: Boolean(mlData.predictions?.pwf?.failure),
      osf: Boolean(mlData.predictions?.osf?.failure),
      rnf: Boolean(mlData.predictions?.rnf?.failure)
    };

    // Store in database
    const predictionId = Date.now().toString();
    await pool.execute(
      `INSERT INTO predictions 
       (id, machine_type, air_temperature, process_temperature, rotational_speed, torque, tool_wear, status,
        failure_machine, failure_twf, failure_hdf, failure_pwf, failure_osf, failure_rnf)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        predictionId,
        type,
        air_temperature,
        process_temperature,
        rotational_speed,
        torque,
        tool_wear,
        mlData.overall_status,
        failures.machine,
        failures.twf,
        failures.hdf,
        failures.pwf,
        failures.osf,
        failures.rnf
      ]
    );

    // Response frontend
    return res.status(200).json({
      success: true,
      status: mlData.overall_status,
      failures
    });

  } catch (error) {
    console.error("Prediction Error:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: "ML service error",
        details: error.response.data
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to get prediction from ML service"
    });
  }
});

// GET /api/dashboard/stats - Get dashboard statistics
app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const health = await getMachineHealth();
    const failureStats = await getFailureStats();
    const [totalRows] = await pool.execute('SELECT COUNT(*) as count FROM predictions');
    const recentPredictions = await getRecentPredictions(10);
    
    return res.status(200).json({
      success: true,
      data: {
        machineHealth: health,
        totalPredictions: totalRows[0].count,
        failureStats,
        recentPredictions
      }
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to get dashboard statistics"
    });
  }
});

// GET /api/dashboard/recent - Get recent predictions only
app.get("/api/dashboard/recent", async (req, res) => {
  try {
    const recentPredictions = await getRecentPredictions(10);
    return res.status(200).json({
      success: true,
      data: { recentPredictions }
    });
  } catch (error) {
    console.error("Recent Predictions Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to get recent predictions"
    });
  }
});

// GET /api/health - Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    // Check database connection
    let dbStatus = 'offline';
    try {
      await pool.execute('SELECT 1');
      dbStatus = 'online';
    } catch (e) {
      dbStatus = 'offline';
    }
    
    // Check ML service
    let mlServiceStatus = 'offline';
    try {
      await axios.get("http://127.0.0.1:8000/", { timeout: 2000 });
      mlServiceStatus = 'online';
    } catch (e) {
      mlServiceStatus = 'offline';
    }
    
    return res.status(200).json({
      success: true,
      data: {
        backend: 'online',
        database: dbStatus,
        mlService: mlServiceStatus,
        modelsLoaded: 6,
        averageAccuracy: 0.94
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Health check failed"
    });
  }
});

// ----------------------------------------------------------------------
// Start Server
// ----------------------------------------------------------------------

const PORT = process.env.PORT || 3000;

// Initialize database and start server
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
      console.log(`Connected to MySQL database: ${process.env.DB_NAME || 'colab'}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
