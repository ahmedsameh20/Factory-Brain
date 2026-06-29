/**
 * Live energy feed simulator — structured block version.
 *
 * Cycles through three distinct, clearly-labeled blocks in order:
 *   OPTIMAL -> MONITOR -> CRITICAL -> repeat
 *
 * Each block's raw values (usage_kwh, reactive power, CO2) are built from
 * REAL data pulled from the original Steel Industry training dataset, not
 * invented numbers. The CRITICAL block's values are scaled 1.4x beyond
 * their real originals -- explained below, this was necessary to reliably
 * cross the model's actual classification threshold.
 *
 * IMPORTANT, please read before assuming this is "broken" if a block ever
 * shows the "wrong" status:
 *
 * The deployed system always uses the REAL CURRENT moment (whatever hour it
 * actually is when you click "Predict from last 8 hours") as the forecast
 * target time -- never a stored/historical timestamp. The model's hour-of-
 * day features turned out to have a much bigger effect on classification
 * than expected: the exact same CRITICAL-block data was tested at every
 * hour of the day, and only some hours actually produce CRITICAL:
 *
 *   Hours  0- 3, 12, 21-23 : tends to show OPTIMAL  (model's own blind spot)
 *   Hours  4-11, 17-20     : tends to show MONITOR
 *   Hours 13-16            : best chance of CRITICAL specifically
 *
 * "Tends to" is deliberate: which exact tick within the block you catch
 * also matters a little (the sliding 32-reading window shifts each tick),
 * so MONITOR vs CRITICAL can vary tick-to-tick even within a good hour.
 * Both are clearly non-optimal either way -- if the goal is "see something
 * other than OPTIMAL," this reliably delivers that; if the goal is
 * specifically CRITICAL, afternoon gives the best odds. This is a genuine,
 * verified characteristic of the trained model responding to time-of-day,
 * not a simulator bug -- no amount of scaling the input values fixed it
 * for every single hour (it was tried). The OPTIMAL block, by contrast,
 * tested OPTIMAL at every single
 * hour with no exceptions.
 *
 * No Math.random() anywhere — fully deterministic given the same starting
 * conditions, aside from this real, model-driven hour-of-day sensitivity.
 *
 * Usage:
 *   node database/live-feed-simulator.js
 *   (Ctrl+C to stop)
 *
 * Requires the backend to already be running (default http://localhost:3000).
 * Override with: BACKEND_URL=http://localhost:3000/api node database/live-feed-simulator.js
 *
 * TICK_MS       How often (real time) a new reading is posted. Default 5000
 *               (5s) -- with BLOCK_TICKS=12, each block lasts about a
 *               minute.
 * BLOCK_TICKS   How many ticks each block lasts before switching to the
 *               next one. Default 12 (~1 minute at the default TICK_MS).
 * READING_STEP_MIN  How far apart (in the data's own clock) each new
 *               reading is from the last. Default 15, matching the
 *               model's expected 15-minute spacing.
 */

const axios = require("axios");

const BASE_URL = process.env.BACKEND_URL || "http://localhost:3000/api";
const TICK_MS = Number(process.env.TICK_MS) || 5000;
const BLOCK_TICKS = Number(process.env.BLOCK_TICKS) || 12;
const READING_STEP_MIN = Number(process.env.READING_STEP_MIN) || 15;

const BLOCKS = {
  "optimal": {
    "load_type": "Maximum_Load",
    "points": [
      {
        "usage_kwh": 2.77,
        "lagging_reactive_kvarh": 5.22,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.74,
        "lagging_reactive_kvarh": 5.22,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 3.82,
        "lagging_reactive_kvarh": 6.8,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 3.89,
        "lagging_reactive_kvarh": 7.02,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.7,
        "lagging_reactive_kvarh": 5.04,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.77,
        "lagging_reactive_kvarh": 5.04,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.74,
        "lagging_reactive_kvarh": 5.15,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.81,
        "lagging_reactive_kvarh": 5.33,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.74,
        "lagging_reactive_kvarh": 5.15,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.7,
        "lagging_reactive_kvarh": 5.26,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.7,
        "lagging_reactive_kvarh": 5.26,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.74,
        "lagging_reactive_kvarh": 5.04,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.66,
        "lagging_reactive_kvarh": 4.9,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.66,
        "lagging_reactive_kvarh": 5.0,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.66,
        "lagging_reactive_kvarh": 5.04,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.66,
        "lagging_reactive_kvarh": 4.9,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 2.92,
        "lagging_reactive_kvarh": 5.0,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 4.61,
        "lagging_reactive_kvarh": 6.05,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 4.9,
        "lagging_reactive_kvarh": 6.23,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 25.45,
        "lagging_reactive_kvarh": 23.15,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.01
      },
      {
        "usage_kwh": 61.09,
        "lagging_reactive_kvarh": 54.07,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 34.99,
        "lagging_reactive_kvarh": 24.73,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 37.3,
        "lagging_reactive_kvarh": 9.54,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 54.65,
        "lagging_reactive_kvarh": 27.97,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 55.01,
        "lagging_reactive_kvarh": 30.28,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 37.76,
        "lagging_reactive_kvarh": 10.15,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 36.72,
        "lagging_reactive_kvarh": 8.71,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 37.22,
        "lagging_reactive_kvarh": 10.22,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 39.67,
        "lagging_reactive_kvarh": 10.19,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 43.09,
        "lagging_reactive_kvarh": 14.22,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 43.34,
        "lagging_reactive_kvarh": 14.8,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 45.76,
        "lagging_reactive_kvarh": 17.14,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 40.25,
        "lagging_reactive_kvarh": 14.72,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 48.06,
        "lagging_reactive_kvarh": 22.82,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 38.59,
        "lagging_reactive_kvarh": 20.74,
        "leading_reactive_kvarh": 0.4,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 5.36,
        "lagging_reactive_kvarh": 0.0,
        "leading_reactive_kvarh": 17.46,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 4.97,
        "lagging_reactive_kvarh": 0.0,
        "leading_reactive_kvarh": 17.24,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 4.46,
        "lagging_reactive_kvarh": 0.0,
        "leading_reactive_kvarh": 16.52,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 4.9,
        "lagging_reactive_kvarh": 0.0,
        "leading_reactive_kvarh": 16.88,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 30.74,
        "lagging_reactive_kvarh": 8.71,
        "leading_reactive_kvarh": 5.04,
        "co2_tco2": 0.01
      },
      {
        "usage_kwh": 41.58,
        "lagging_reactive_kvarh": 13.03,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 43.27,
        "lagging_reactive_kvarh": 14.11,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 44.1,
        "lagging_reactive_kvarh": 14.76,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 42.7,
        "lagging_reactive_kvarh": 12.92,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 38.7,
        "lagging_reactive_kvarh": 13.61,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 44.93,
        "lagging_reactive_kvarh": 17.68,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.02
      }
    ]
  },
  "monitor": {
    "load_type": "Medium_Load",
    "points": [
      {
        "usage_kwh": 45.36,
        "lagging_reactive_kvarh": 2.12,
        "leading_reactive_kvarh": 4.03,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 84.31,
        "lagging_reactive_kvarh": 9.94,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 72.9,
        "lagging_reactive_kvarh": 7.52,
        "leading_reactive_kvarh": 0.83,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 57.24,
        "lagging_reactive_kvarh": 4.14,
        "leading_reactive_kvarh": 2.74,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 85.07,
        "lagging_reactive_kvarh": 10.22,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 38.63,
        "lagging_reactive_kvarh": 0.68,
        "leading_reactive_kvarh": 4.14,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 36.47,
        "lagging_reactive_kvarh": 0.0,
        "leading_reactive_kvarh": 4.9,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 54.76,
        "lagging_reactive_kvarh": 4.1,
        "leading_reactive_kvarh": 3.1,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 58.79,
        "lagging_reactive_kvarh": 4.5,
        "leading_reactive_kvarh": 1.94,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 70.99,
        "lagging_reactive_kvarh": 6.88,
        "leading_reactive_kvarh": 0.68,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 83.56,
        "lagging_reactive_kvarh": 10.3,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 77.33,
        "lagging_reactive_kvarh": 6.01,
        "leading_reactive_kvarh": 0.07,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 82.91,
        "lagging_reactive_kvarh": 9.97,
        "leading_reactive_kvarh": 0.07,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 67.68,
        "lagging_reactive_kvarh": 6.26,
        "leading_reactive_kvarh": 1.44,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 89.32,
        "lagging_reactive_kvarh": 11.48,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 71.32,
        "lagging_reactive_kvarh": 7.42,
        "leading_reactive_kvarh": 1.26,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 88.09,
        "lagging_reactive_kvarh": 10.84,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 70.42,
        "lagging_reactive_kvarh": 20.56,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 84.64,
        "lagging_reactive_kvarh": 27.22,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 76.72,
        "lagging_reactive_kvarh": 11.95,
        "leading_reactive_kvarh": 0.83,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 89.35,
        "lagging_reactive_kvarh": 11.34,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 69.88,
        "lagging_reactive_kvarh": 6.3,
        "leading_reactive_kvarh": 1.26,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 40.03,
        "lagging_reactive_kvarh": 0.72,
        "leading_reactive_kvarh": 2.99,
        "co2_tco2": 0.02
      },
      {
        "usage_kwh": 90.58,
        "lagging_reactive_kvarh": 13.64,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 88.02,
        "lagging_reactive_kvarh": 11.3,
        "leading_reactive_kvarh": 0.18,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 79.31,
        "lagging_reactive_kvarh": 8.75,
        "leading_reactive_kvarh": 0.65,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 86.87,
        "lagging_reactive_kvarh": 10.73,
        "leading_reactive_kvarh": 0.07,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 66.67,
        "lagging_reactive_kvarh": 7.31,
        "leading_reactive_kvarh": 1.22,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 77.87,
        "lagging_reactive_kvarh": 9.79,
        "leading_reactive_kvarh": 0.22,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 89.14,
        "lagging_reactive_kvarh": 12.71,
        "leading_reactive_kvarh": 0.11,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 74.34,
        "lagging_reactive_kvarh": 7.06,
        "leading_reactive_kvarh": 0.65,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 93.31,
        "lagging_reactive_kvarh": 14.18,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 93.31,
        "lagging_reactive_kvarh": 14.18,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 57.53,
        "lagging_reactive_kvarh": 4.9,
        "leading_reactive_kvarh": 2.23,
        "co2_tco2": 0.03
      },
      {
        "usage_kwh": 88.88,
        "lagging_reactive_kvarh": 25.81,
        "leading_reactive_kvarh": 0.14,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 78.95,
        "lagging_reactive_kvarh": 39.35,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 91.19,
        "lagging_reactive_kvarh": 43.96,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 81.65,
        "lagging_reactive_kvarh": 38.84,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 81.54,
        "lagging_reactive_kvarh": 40.46,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      },
      {
        "usage_kwh": 86.83,
        "lagging_reactive_kvarh": 42.88,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.04
      }
    ]
  },
  "critical": {
    "load_type": "Medium_Load",
    "points": [
      {
        "usage_kwh": 4.89,
        "lagging_reactive_kvarh": 6.45,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 4.69,
        "lagging_reactive_kvarh": 6.4,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 5.49,
        "lagging_reactive_kvarh": 8.72,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 4.69,
        "lagging_reactive_kvarh": 6.2,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 4.69,
        "lagging_reactive_kvarh": 6.05,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 5.49,
        "lagging_reactive_kvarh": 8.22,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 4.73,
        "lagging_reactive_kvarh": 6.05,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 4.69,
        "lagging_reactive_kvarh": 6.24,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 8.16,
        "lagging_reactive_kvarh": 8.88,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 8.97,
        "lagging_reactive_kvarh": 8.32,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 9.42,
        "lagging_reactive_kvarh": 7.15,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 69.9,
        "lagging_reactive_kvarh": 45.3,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.028
      },
      {
        "usage_kwh": 182.76,
        "lagging_reactive_kvarh": 108.92,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      },
      {
        "usage_kwh": 113.9,
        "lagging_reactive_kvarh": 78.72,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.056
      },
      {
        "usage_kwh": 160.93,
        "lagging_reactive_kvarh": 59.28,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 151.26,
        "lagging_reactive_kvarh": 42.78,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 133.36,
        "lagging_reactive_kvarh": 38.61,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.056
      },
      {
        "usage_kwh": 190.61,
        "lagging_reactive_kvarh": 71.92,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      },
      {
        "usage_kwh": 152.56,
        "lagging_reactive_kvarh": 66.12,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 189.06,
        "lagging_reactive_kvarh": 78.12,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      },
      {
        "usage_kwh": 150.0,
        "lagging_reactive_kvarh": 63.1,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 195.15,
        "lagging_reactive_kvarh": 82.46,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      },
      {
        "usage_kwh": 133.11,
        "lagging_reactive_kvarh": 52.42,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.056
      },
      {
        "usage_kwh": 193.73,
        "lagging_reactive_kvarh": 104.48,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      },
      {
        "usage_kwh": 175.64,
        "lagging_reactive_kvarh": 98.98,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      },
      {
        "usage_kwh": 162.74,
        "lagging_reactive_kvarh": 92.33,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 168.03,
        "lagging_reactive_kvarh": 91.88,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      },
      {
        "usage_kwh": 13.51,
        "lagging_reactive_kvarh": 1.01,
        "leading_reactive_kvarh": 28.88,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 12.19,
        "lagging_reactive_kvarh": 0.0,
        "leading_reactive_kvarh": 36.85,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 12.4,
        "lagging_reactive_kvarh": 0.0,
        "leading_reactive_kvarh": 35.98,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 12.25,
        "lagging_reactive_kvarh": 0.0,
        "leading_reactive_kvarh": 35.98,
        "co2_tco2": 0.0
      },
      {
        "usage_kwh": 83.36,
        "lagging_reactive_kvarh": 35.78,
        "leading_reactive_kvarh": 7.97,
        "co2_tco2": 0.042
      },
      {
        "usage_kwh": 83.36,
        "lagging_reactive_kvarh": 35.78,
        "leading_reactive_kvarh": 7.97,
        "co2_tco2": 0.042
      },
      {
        "usage_kwh": 106.6,
        "lagging_reactive_kvarh": 52.72,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.042
      },
      {
        "usage_kwh": 156.59,
        "lagging_reactive_kvarh": 77.87,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 169.5,
        "lagging_reactive_kvarh": 74.79,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      },
      {
        "usage_kwh": 133.06,
        "lagging_reactive_kvarh": 61.99,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.056
      },
      {
        "usage_kwh": 151.4,
        "lagging_reactive_kvarh": 63.95,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 130.44,
        "lagging_reactive_kvarh": 46.37,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.056
      },
      {
        "usage_kwh": 117.38,
        "lagging_reactive_kvarh": 39.12,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.056
      },
      {
        "usage_kwh": 156.65,
        "lagging_reactive_kvarh": 60.38,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 155.43,
        "lagging_reactive_kvarh": 61.8,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 177.0,
        "lagging_reactive_kvarh": 79.58,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      },
      {
        "usage_kwh": 157.75,
        "lagging_reactive_kvarh": 69.71,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 115.11,
        "lagging_reactive_kvarh": 50.15,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.056
      },
      {
        "usage_kwh": 135.63,
        "lagging_reactive_kvarh": 49.2,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.056
      },
      {
        "usage_kwh": 191.77,
        "lagging_reactive_kvarh": 75.5,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      },
      {
        "usage_kwh": 140.81,
        "lagging_reactive_kvarh": 50.81,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.07
      },
      {
        "usage_kwh": 184.16,
        "lagging_reactive_kvarh": 68.89,
        "leading_reactive_kvarh": 0.0,
        "co2_tco2": 0.084
      }
    ]
  }
};

const PHASE_ORDER = ["optimal", "monitor", "critical"];
let phaseIndex = 0;
let tickInPhase = 0;
let cursor = new Date();

async function postReading(point, loadType) {
  cursor = new Date(cursor.getTime() + READING_STEP_MIN * 60 * 1000);
  const reading = {
    reading_timestamp: cursor.toISOString().slice(0, 19).replace("T", " "),
    usage_kwh: point.usage_kwh,
    lagging_reactive_kvarh: point.lagging_reactive_kvarh,
    leading_reactive_kvarh: point.leading_reactive_kvarh,
    co2_tco2: point.co2_tco2,
    load_type: loadType,
  };
  try {
    await axios.post(`${BASE_URL}/energy-readings`, reading);
  } catch (error) {
    // Most common cause: the backend (node server.js) isn't running yet, or
    // crashed. Print one short line instead of letting axios's full error
    // object (sockets, headers, the works) flood the terminal and crash
    // the whole process via an unhandled rejection.
    const reason = error.code === "ECONNREFUSED"
      ? `connection refused at ${BASE_URL} -- is the backend (node server.js) running?`
      : error.message;
    console.error(`  \u274c Failed to post reading: ${reason}`);
  }
  return reading;
}

async function enterPhase(phaseName) {
  const block = BLOCKS[phaseName];
  console.log(`\n--- Entering ${phaseName.toUpperCase()} block (re-priming with its real 32-reading context) ---`);
  const seedPoints = block.points.slice(0, 32);
  for (const point of seedPoints) {
    await postReading(point, block.load_type);
  }
  console.log(`    (posted ${seedPoints.length} seed readings)`);
}

async function tick() {
  try {
    const phaseName = PHASE_ORDER[phaseIndex];
    const block = BLOCKS[phaseName];

    if (tickInPhase === 0) {
      await enterPhase(phaseName);
    }

    const continuation = block.points.slice(32);
    const point = continuation[tickInPhase % continuation.length];
    const reading = await postReading(point, block.load_type);

    const tag = phaseName.toUpperCase().padEnd(8);
    console.log(
      `[${tag}] tick ${tickInPhase + 1}/${BLOCK_TICKS}  [${reading.reading_timestamp}]  usage=${reading.usage_kwh.toString().padStart(7)} kWh`
    );

    tickInPhase += 1;
    if (tickInPhase >= BLOCK_TICKS) {
      tickInPhase = 0;
      phaseIndex = (phaseIndex + 1) % PHASE_ORDER.length;
    }
  } catch (error) {
    // Catch-all so any unexpected error just gets logged and the simulator
    // keeps running and retries on the next tick, rather than taking the
    // whole process down.
    console.error("  \u274c Unexpected error during tick:", error.message);
  }
}

console.log(`Live energy feed simulator starting (structured OPTIMAL -> MONITOR -> CRITICAL blocks).`);
console.log(`Posting to ${BASE_URL}/energy-readings every ${TICK_MS / 1000}s, ${BLOCK_TICKS} ticks per block (~${(TICK_MS * BLOCK_TICKS / 60000).toFixed(1)} min/block).`);
console.log(`Each reading ${READING_STEP_MIN} simulated minutes after the last.`);
console.log(`NOTE: CRITICAL has the best odds during local afternoon hours (~1-4pm) -- see the`);
console.log(`file header for why time-of-day affects this. Test then for the clearest result.`);
console.log(`Press Ctrl+C to stop.`);

tick().then(() => {
  setInterval(tick, TICK_MS);
});