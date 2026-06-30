/**
 * Seeds machine_readings with the 7 REAL production machines from
 * Inference_on_Real_Data.ipynb (BN429, BN430, BN451, O2, O3, R1, R2),
 * reconstructed from the notebook's actual data + transformation logic
 * (the two output CSVs you ran only contained the *results* — fail_prob,
 * day, obj_score — not the raw sensor inputs machine_readings needs).
 *
 * Known limitations, carried over from the notebook (not introduced here):
 *   1. All 7 machines share the EXACT same sensor snapshot (one HMI
 *      reading reused for everyone), so fail_prob is identical (0.262)
 *      across all of them. Only cost/duration/priority genuinely differ,
 *      since those come from each machine's own production quantity.
 *   2. That shared snapshot is itself out of the range the PdM model was
 *      trained on (air_temp ~327K vs. a normal ~295-305K; tool_wear
 *      ~119,100 min vs. a normal 0-250 min) — a units mix-up in the
 *      original notebook (lifetime hours x60, not wear-since-last-change).
 *      fail_prob computed from this is a rough placeholder, not a
 *      trustworthy per-machine signal, until real distinct sensor data
 *      exists for each machine.
 *
 * Usage:
 *   node database/seed-real-production-machines.js
 *
 * Requires the backend to already be running (default http://localhost:3000).
 * Override with: BACKEND_URL=http://localhost:3000/api node database/seed-real-production-machines.js
 */

const axios = require("axios");

const BASE_URL = process.env.BACKEND_URL || "http://localhost:3000/api";

// Reconstructed from the notebook's PART 5/6/7 logic, run against the same
// embedded HMI + production text the notebook uses. Sensor fields (type
// through tool_wear) are identical across all 7 by construction (see
// limitation #1 above) — only the cost/duration/priority fields, which
// come from each machine's own production quantity, actually differ.
const machines = [
  {
    machine_id: "BN429",
    type: "M",
    air_temperature: 327.35,
    process_temperature: 443.15,
    rotational_speed: 42,
    torque: 50,
    tool_wear: 119100,
    maint_duration_hrs: 3,
    maint_cost_usd: 324,
    downtime_cost_per_hr: 811,
    energy_cost_usd: 0.4617,
    deadline_hours: 72,
    priority: 1,
  },
  {
    machine_id: "BN430",
    type: "M",
    air_temperature: 327.35,
    process_temperature: 443.15,
    rotational_speed: 42,
    torque: 50,
    tool_wear: 119100,
    maint_duration_hrs: 6,
    maint_cost_usd: 882,
    downtime_cost_per_hr: 2206,
    energy_cost_usd: 0.4617,
    deadline_hours: 72,
    priority: 2,
  },
  {
    machine_id: "BN451",
    type: "M",
    air_temperature: 327.35,
    process_temperature: 443.15,
    rotational_speed: 42,
    torque: 50,
    tool_wear: 119100,
    maint_duration_hrs: 3,
    maint_cost_usd: 363,
    downtime_cost_per_hr: 908,
    energy_cost_usd: 0.4617,
    deadline_hours: 72,
    priority: 1,
  },
  {
    machine_id: "O2",
    type: "M",
    air_temperature: 327.35,
    process_temperature: 443.15,
    rotational_speed: 42,
    torque: 50,
    tool_wear: 119100,
    maint_duration_hrs: 4,
    maint_cost_usd: 400,
    downtime_cost_per_hr: 1000,
    energy_cost_usd: 0.4617,
    deadline_hours: 72,
    priority: 1,
  },
  {
    machine_id: "O3",
    type: "M",
    air_temperature: 327.35,
    process_temperature: 443.15,
    rotational_speed: 42,
    torque: 50,
    tool_wear: 119100,
    maint_duration_hrs: 11,
    maint_cost_usd: 1800,
    downtime_cost_per_hr: 4500,
    energy_cost_usd: 0.4617,
    deadline_hours: 72,
    priority: 2,
  },
  {
    machine_id: "R1",
    type: "M",
    air_temperature: 327.35,
    process_temperature: 443.15,
    rotational_speed: 42,
    torque: 50,
    tool_wear: 119100,
    maint_duration_hrs: 7,
    maint_cost_usd: 1050,
    downtime_cost_per_hr: 2625,
    energy_cost_usd: 0.4617,
    deadline_hours: 72,
    priority: 2,
  },
  {
    machine_id: "R2",
    type: "M",
    air_temperature: 327.35,
    process_temperature: 443.15,
    rotational_speed: 42,
    torque: 50,
    tool_wear: 119100,
    maint_duration_hrs: 9,
    maint_cost_usd: 1500,
    downtime_cost_per_hr: 3750,
    energy_cost_usd: 0.4617,
    deadline_hours: 72,
    priority: 2,
  },
];

async function seedMachines(postFn) {
  for (const machine of machines) {
    try {
      await postFn(machine);
      console.log(`  [Seed] \u2705 ${machine.machine_id}`);
    } catch (error) {
      console.error(`  [Seed] \u274c ${machine.machine_id}:`, error.message);
    }
  }
}

// Stand-alone mode: node database/seed-real-production-machines.js
if (require.main === module) {
  console.log(`Seeding ${machines.length} real production machines via ${BASE_URL}\n`);
  const postFn = (m) => axios.post(`${BASE_URL}/machine-readings`, m);
  seedMachines(postFn)
    .then(() => {
      console.log("\nDone. These will show up in Module 1's \"From Database\" picker and Module 3's live schedule.");
    })
    .catch((error) => {
      console.error("Seed script failed:", error.message);
      process.exit(1);
    });
}

module.exports = { machines, seedMachines };