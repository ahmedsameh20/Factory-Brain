const express = require("express");
const axios = require("axios");
const cors = require("cors");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const ML_SERVICE_URL = "http://127.0.0.1:8000/predict";

app.post("/api/predict", async (req, res) => {
  try {
    //  Frontend
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

    //  Call ML service
    const mlResponse = await axios.post(
      ML_SERVICE_URL,
      mlPayload,
      { headers: { "Content-Type": "application/json" } }
    );

    const mlData = mlResponse.data;

    // failures (boolean )
    const failures = {
      machine: mlData.overall_status === "FAILURE",
      twf: Boolean(mlData.predictions?.twf),
      hdf: Boolean(mlData.predictions?.hdf),
      pwf: Boolean(mlData.predictions?.pwf),
      osf: Boolean(mlData.predictions?.osf),
      rnf: Boolean(mlData.predictions?.rnf)
    };

    //  Response frontend
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

app.listen(3000, () => {
  console.log("Backend running on http://localhost:3000");
});
