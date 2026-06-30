# Factory Brain

**Live site:** [factorybrain.site](https://factorybrain.site/)

Factory Brain is an intelligent operations platform for manufacturing plants. It combines five connected modules — predictive maintenance, energy usage forecasting, maintenance scheduling, fleet health analytics, and model retraining — behind a single authenticated dashboard. A plant can see machine health, predict energy demand, get a prioritized maintenance plan, monitor the entire fleet at a glance, and retrain the ML models with new labeled data — all from the same control center.

## Modules

1. **Predictive Maintenance** — Given live sensor readings (temperature, rotational speed, torque, tool wear) for a machine, predicts overall failure risk plus five specific failure modes (TWF, HDF, PWF, OSF, RNF), with a SHAP-based explanation of which sensor values drove the prediction. Inline anomaly warnings flag values outside the AI4I 2020 training-data normal ranges before submission.
2. **Energy Usage Forecasting** — Given a trailing window of energy readings (usage, reactive power, CO2), forecasts upcoming plant-wide energy usage, classifies it (optimal/monitor/critical), scores efficiency, flags peak-demand windows, and returns SHAP-based recommendations.
3. **Maintenance Scheduling** — Combines each machine's latest failure probability and the latest energy cost forecast into a single objective score, then runs a heuristic scheduler that assigns maintenance to days within a capacity constraint. Supports both a sortable table view and a 7-day calendar view.
4. **Batch CSV Prediction** — Upload a CSV of up to 100 machines and run all maintenance predictions in parallel, with per-row failure-mode breakdown and CSV export.
5. **Analytics (Fleet Health + KPI)** — Fleet health heatmap showing every machine's failure probability with color-coded risk tiers (Healthy/Monitor/At Risk/Critical). KPI panel with total predictions, failure rate, MTBF estimate, energy efficiency score, and a 7-day activity bar chart.
6. **Model Retraining** — Upload labeled sensor data (min 50 rows), train a new RandomForest classifier on it, review accuracy/F1 results, and optionally deploy it to replace the production model — all from the dashboard.

## Architecture

```
frontend/dashboard   React dashboard (Create React App)
        |
        v (JWT Bearer token on every request)
backend (Node/Express)  --- MySQL ("colab" db, falls back to in-memory store if unavailable)
        |
        v
ml-service (FastAPI)   --- trained scikit-learn / XGBoost / LightGBM models + SHAP explanations
                       --- POST /retrain for live model retraining
```

- **Frontend** (`frontend/dashboard`) — React app with full JWT auth gate, manual and database-mode predictions, batch CSV upload, fleet heatmap, KPI dashboard, maintenance schedule (table + calendar), model retraining UI, alert/notification settings, and SHAP explanation views.
- **Backend** (`backend`) — Express API that logs every prediction to MySQL, exposes dashboard stats, runs maintenance scheduling, and proxies retrain requests to the ML service. Calls the ML service over HTTP. Falls back to in-memory store if MySQL is unreachable.
- **ML Service** (`ml-service`) — FastAPI service that loads the trained models and serves `/predict`, `/predict-energy`, and `/retrain`, including SHAP explanations.

## Prerequisites

- Node.js 18+
- Python 3.10+
- MySQL (optional — the backend runs in-memory mode if it can't connect)

## Setup

### 1. ML Service

```bash
cd ml-service
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

### 2. Backend

```bash
cd backend
npm install
```

Create a `.env` file in `backend/` (optional — sensible defaults are used otherwise):

```
PORT=3000
ML_SERVICE_BASE_URL=http://127.0.0.1:8000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=colab
DB_PORT=3306

# Auth (change these in production)
APP_USERNAME=admin
APP_PASSWORD=admin123
JWT_SECRET=factory-brain-dev-secret-change-me

# Energy rate for cost calculations
ENERGY_RATE_USD_PER_KWH=0.15
```

```bash
npm start
```

### 3. Frontend

```bash
cd frontend/dashboard
npm install
npm start
```

The dashboard runs on the default CRA dev port. If the backend is also on 3000, set `PORT` in the backend `.env` to something else (e.g. 4000) and update `REACT_APP_API_BASE_URL` in the frontend accordingly.

**Default login credentials:** `admin` / `admin123` — change via `APP_USERNAME` and `APP_PASSWORD` env vars on the backend.

## Key API Endpoints (backend)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/login` | POST | — | Get a JWT token |
| `/api/auth/verify` | GET | Bearer | Verify token validity |
| `/api/predict` | POST | Bearer | Run a maintenance failure prediction |
| `/api/predict-energy` | POST | Bearer | Run an energy usage forecast |
| `/api/predict/batch` | POST | Bearer | Batch predict up to 100 machines from CSV |
| `/api/anomaly-check` | POST | Bearer | Check sensor values against normal ranges |
| `/api/dashboard/stats` | GET | — | Aggregated stats + recent prediction history |
| `/api/machine-readings` | GET/POST | — / Bearer | Per-machine readings for live scheduling |
| `/api/energy-readings/latest` | GET/POST | — / Bearer | Live energy reading time series |
| `/api/maintenance-schedule/live` | GET | — | Computed live maintenance schedule |
| `/api/fleet-health` | GET | Bearer | All machines ranked by failure probability |
| `/api/kpi` | GET | Bearer | KPI metrics: MTBF, failure rate, daily activity, energy efficiency |
| `/api/settings` | GET/POST | — / Bearer | Runtime settings (energy rate, alert threshold) |
| `/api/retrain` | POST | Bearer | Proxy to ML service to retrain the machine model |
| `/api/health` | GET | — | Backend/DB/ML service health check |

## Project Structure

```
Factory-Brain/
├── backend/                 Express API, MySQL config, scheduling logic, auth middleware
├── frontend/dashboard/      React dashboard (CRA)
│   └── src/
│       ├── components/      PredictionForm, EnergyPredictionForm, MaintenanceSchedule,
│       │                    BatchPrediction, FleetHealth, KPIPanel, RetrainPanel,
│       │                    CalendarView, SettingsPanel, LoginPage, Charts, ...
│       ├── services/api.js  Axios client with JWT interceptors
│       └── styles/          Dashboard.css
├── ml-service/              FastAPI service + trained models (model/*.pkl)
└── steel_factory_outputs/   Generated model evaluation charts/results
```

## Authentication

All mutation endpoints require a `Authorization: Bearer <token>` header. The token is obtained from `POST /api/auth/login` and expires after 24 hours. The frontend stores it in `localStorage` and automatically attaches it to every request. A 401 response clears the token and shows the login page.

## Deployment

For a VPS deploy (systemd services + Nginx reverse proxy), use [deploy.sh](deploy.sh) from the repo root on the server:

```bash
./deploy.sh
```

It pulls `origin/main`, reinstalls dependencies only when their lockfile/requirements changed, rebuilds the frontend, and restarts the `factorybrain-ml` / `factorybrain-backend` systemd services.

## Notes

- Models in `ml-service/model/` are pre-trained `.pkl` artifacts. The retraining pipeline in the dashboard trains a `RandomForestClassifier` on uploaded labeled data and can optionally overwrite the production `.pkl` file.
- Runtime settings (energy rate, alert threshold, notifications toggle) are in-memory only and reset on server restart.
- The maintenance scheduler's objective score and urgency formulas are documented inline in [backend/server.js](backend/server.js).
