# Factory Brain

Factory Brain is an intelligent operations platform for manufacturing plants. It combines three connected modules — predictive maintenance, energy usage forecasting, and maintenance scheduling — behind a single dashboard, so a plant can see machine health, predict energy demand, and get a prioritized maintenance plan from the same data.

## Modules

1. **Predictive Maintenance** — Given live sensor readings (temperature, rotational speed, torque, tool wear) for a machine, predicts overall failure risk plus five specific failure modes (TWF, HDF, PWF, OSF, RNF), with a SHAP-based explanation of which sensor values drove the prediction.
2. **Energy Usage Forecasting** — Given a trailing window of energy readings (usage, reactive power, CO2), forecasts upcoming plant-wide energy usage, classifies it (optimal/monitor/critical), scores efficiency, flags peak-demand windows, and returns SHAP-based recommendations.
3. **Maintenance Scheduling** — Combines each machine's latest failure probability (from Module 1) and the latest energy cost forecast (from Module 2) into a single objective score, then runs a heuristic scheduler that assigns maintenance to days within a capacity constraint, deferring lower-urgency work.

## Architecture

```
frontend/dashboard   React dashboard (Create React App)
        |
        v
backend (Node/Express)  --- MySQL ("colab" db, falls back to in-memory store if unavailable)
        |
        v
ml-service (FastAPI)   --- trained scikit-learn / XGBoost / LightGBM models + SHAP explanations
```

- **Frontend** (`frontend/dashboard`) — React app for manual predictions, live machine/energy readings, maintenance schedule, and SHAP explanation views.
- **Backend** (`backend`) — Express API that logs every prediction to MySQL, exposes dashboard stats, and runs the live maintenance-scheduling logic. Calls the ML service over HTTP. If MySQL is unreachable it automatically falls back to an in-memory store so the app still runs.
- **ML Service** (`ml-service`) — FastAPI service that loads the trained models and serves `/predict` and `/predict-energy`, including SHAP explanations.

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

The dashboard runs on `http://localhost:3000`'s default CRA port (3000) — if the backend is also on 3000, set `PORT` in the backend `.env` to something else (e.g. 4000) and point the frontend's API base URL at it via `frontend/dashboard/src/services/api.js`.

## Key API Endpoints (backend)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/predict` | POST | Run a maintenance failure prediction for given sensor values |
| `/api/predict-energy` | POST | Run an energy usage forecast for a trailing reading window |
| `/api/dashboard/stats` | GET | Aggregated stats for both modules + recent prediction history |
| `/api/machine-readings` | GET/POST | Current per-machine readings used for live scheduling ("From Database" mode) |
| `/api/energy-readings/latest` | GET/POST | Live energy reading time series |
| `/api/maintenance-schedule/live` | GET | Computed live maintenance schedule (reuses Modules 1 & 2 outputs) |
| `/api/health` | GET | Backend/DB/ML service health check |

## Project Structure

```
Factory-Brain/
├── backend/                 Express API, MySQL config, scheduling logic
├── frontend/dashboard/      React dashboard (CRA)
├── ml-service/              FastAPI service + trained models (model/*.pkl)
└── steel_factory_outputs/   Generated model evaluation charts/results
```

## Deployment

For a VPS deploy (systemd services + Nginx reverse proxy), see the setup steps covered when this was deployed, then use [deploy.sh](deploy.sh) for subsequent updates — run it from the repo root on the server:

```bash
./deploy.sh
```

It pulls `origin/main`, reinstalls dependencies only when their lockfile/requirements changed, rebuilds the frontend, and restarts the `factorybrain-ml` / `factorybrain-backend` systemd services.

## Notes

- Models in `ml-service/model/` are pre-trained `.pkl` artifacts; retraining notebooks/scripts are not part of this repo's runtime path.
- The maintenance scheduler's objective score and urgency formulas are documented inline in [backend/server.js](backend/server.js).
