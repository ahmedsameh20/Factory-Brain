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
const { BLOCKS, PHASE_ORDER } = require("./energy-feed-data");

const BASE_URL = process.env.BACKEND_URL || "http://localhost:3000/api";
const TICK_MS = Number(process.env.TICK_MS) || 5000;
const BLOCK_TICKS = Number(process.env.BLOCK_TICKS) || 12;
const READING_STEP_MIN = Number(process.env.READING_STEP_MIN) || 15;

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