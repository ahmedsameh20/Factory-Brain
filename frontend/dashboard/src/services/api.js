import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || "http://localhost:3000/api"
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fb_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear token and reload so LoginPage appears
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config.url.includes("/auth/login")
    ) {
      localStorage.removeItem("fb_token");
      localStorage.removeItem("fb_user");
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

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

// Auth
export const login = (username, password) => api.post("/auth/login", { username, password });
export const verifyToken = () => api.get("/auth/verify");

// Analytics
export const getFleetHealth = () => api.get("/fleet-health");
export const getKPI = () => api.get("/kpi");
export const anomalyCheck = (sensors) => api.post("/anomaly-check", sensors);

// Retraining
export const retrainModel = (rows, deploy = false) => api.post("/retrain", { rows, deploy });