import axios from "axios";

// In local dev there's no env var set, so it falls back to localhost:3000
// (the Node backend running on your machine). In production, set
// REACT_APP_API_BASE_URL in frontend/dashboard/.env.production to a
// relative "/api" — Nginx then proxies that to the backend on the same
// domain, so the browser never tries to reach "localhost" on a real visit.
const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || "http://localhost:3000/api"
});

export const predictMaintenance = (data) => api.post("/predict", data);
export const predictEnergy = (data) => api.post("/predict-energy", data);
export const getHealth = () => api.get("/health");
export const getDashboardStats = () => api.get("/dashboard/stats");
export const getEnergyDefaults = () => api.get("/energy/defaults");
export const getMaintenanceSchedule = () => api.get("/maintenance-schedule");

// "From database" mode for the 3 modules: machine_readings holds one live
// row per machine (sensor values + scheduling cost fields); energy_readings
// holds a live time series. Both are meant to be kept current by an
// external process via the POST endpoints below.
export const getMachineReadings = () => api.get("/machine-readings");
// This endpoint advances the live feed by one reading on every call (see
// backend's advanceEnergyFeed()), so it must never be served from a cache —
// the `_` param forces a unique URL per call regardless of what any
// intermediate cache (browser, proxy, CDN) thinks about GET reusability.
export const getLatestEnergyReadings = (limit = 32) =>
  api.get(`/energy-readings/latest?limit=${limit}&_=${Date.now()}`);
export const getLiveMaintenanceSchedule = (force = false) =>
  api.get(`/maintenance-schedule/live${force ? "?force=true" : ""}`);

export const getSettings = () => api.get("/settings");
export const updateSettings = (data) => api.post("/settings", data);
export const predictBatch = (machines) => api.post("/predict/batch", { machines });