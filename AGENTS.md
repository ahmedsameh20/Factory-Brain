# Factory Brain - Predictive Maintenance System

## Project Overview

Factory Brain is a predictive maintenance system designed to monitor industrial machines and predict potential failures. The system uses machine learning models to analyze sensor data (temperature, rotational speed, torque, tool wear) and determine if a machine is likely to fail.

The project follows a microservices architecture with three main components:
- **Frontend**: React-based dashboard for user interaction
- **Backend**: Node.js/Express API gateway
- **ML Service**: Python/FastAPI service hosting the prediction models

## Technology Stack

### Frontend
- **Framework**: React 19.2.4
- **Build Tool**: Create React App 5.0.1
- **HTTP Client**: Axios 1.13.5
- **Styling**: CSS with Tailwind CSS 4.1.18 (dev dependency)
- **Port**: 3000 (development)

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js 4.18.2
- **HTTP Client**: Axios 1.6.0
- **CORS**: cors 2.8.5
- **Environment**: dotenv 16.0.3
- **Port**: 3000

### ML Service
- **Language**: Python 3.x
- **Framework**: FastAPI
- **Server**: Uvicorn
- **ML Libraries**: scikit-learn, joblib, pandas, numpy
- **Port**: 8000

## Project Structure

```
factory_brain/
├── backend/                    # Node.js API Gateway
│   ├── server.js              # Main entry point
│   ├── routes/                # Route handlers
│   │   └── predict.routes.js  # Prediction routes (unused)
│   ├── services/              # Business logic
│   │   └── ml.service.js      # ML service client (unused)
│   ├── package.json           # Dependencies
│   └── node_modules/          # Installed packages
├── frontend/                   # React Application
│   └── dashboard/             # Main React app
│       ├── public/            # Static assets
│       ├── src/               # Source code
│       │   ├── components/    # React components
│       │   │   ├── PredictionForm.jsx
│       │   │   └── ResultCard.jsx
│       │   ├── services/      # API clients
│       │   │   └── api.js
│       │   ├── styles/        # CSS files
│       │   │   └── Dashboard.css
│       │   ├── App.js         # Main App component
│       │   └── index.js       # Entry point
│       ├── package.json       # Dependencies
│       └── node_modules/      # Installed packages
├── ml-service/                 # Python ML Service
│   ├── app.py                 # FastAPI application
│   ├── requirements.txt       # Python dependencies
│   └── model/                 # Trained ML models
│       ├── model_HDF_best.pkl
│       ├── model_Machine_failure_best.pkl
│       ├── model_OSF_best.pkl
│       ├── model_PWF_best.pkl
│       ├── model_RNF_best.pkl
│       └── model_TWF_best.pkl
├── package.json               # Root package.json (legacy)
└── node_modules/              # Root node_modules (legacy)
```

## Architecture

### Data Flow
1. User submits machine data via the React frontend
2. Frontend sends POST request to backend at `/api/predict`
3. Backend transforms the payload and forwards to ML service at `/predict`
4. ML service runs predictions through 6 trained models
5. Results flow back: ML Service → Backend → Frontend

### ML Models
The system uses 6 separate machine learning models to predict different failure types:
- **Machine**: Overall failure prediction
- **TWF**: Tool Wear Failure
- **HDF**: Heat Dissipation Failure
- **PWF**: Power Failure
- **OSF**: Overstrain Failure
- **RNF**: Random Failure

### API Endpoints

#### Backend (Port 3000)
- `POST /api/predict` - Submit machine data for prediction
  - Input: `{ type, air_temperature, process_temperature, rotational_speed, torque, tool_wear }`
  - Output: `{ success, status, failures: { machine, twf, hdf, pwf, osf, rnf } }`

#### ML Service (Port 8000)
- `GET /` - Health check
- `POST /predict` - Run ML predictions
  - Input: `{ Type, Air_temperature_K, Process_temperature_K, Rotational_speed_rpm, Torque_Nm, Tool_wear_min }`
  - Output: `{ overall_status, predictions: { ... } }`

## Build and Run Commands

### Prerequisites
- Node.js 18+ with npm
- Python 3.9+ with pip

### Running the Application

All three services must be running simultaneously:

**1. Start ML Service (Port 8000)**
```bash
cd ml-service
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

**2. Start Backend (Port 3000)**
```bash
cd backend
npm install
npm start
```

**3. Start Frontend (Port 3001)**
```bash
cd frontend/dashboard
npm install
npm start
```
The frontend will likely start on port 3001 since 3000 is taken by the backend.

### Accessing the Application
- Frontend Dashboard: http://localhost:3001
- Backend API: http://localhost:3000
- ML Service API Docs: http://localhost:8000/docs (Swagger UI)

## Code Style Guidelines

### JavaScript/React
- Use ES6+ syntax with functional components
- Use React hooks (useState) for state management
- Component files use PascalCase (e.g., `PredictionForm.jsx`)
- Service/helper files use camelCase (e.g., `api.js`)
- CSS class names use kebab-case

### Python
- Follow PEP 8 style guide
- Use type hints where appropriate (Pydantic models for API)
- Functions use snake_case
- Constants are UPPER_CASE
- Comments use `#` with space after

### File Organization
- Components in `src/components/`
- API clients in `src/services/`
- Styles in `src/styles/`
- Models in `ml-service/model/`

## Testing Instructions

### Frontend Tests
```bash
cd frontend/dashboard
npm test
```
Uses Jest and React Testing Library (configured via Create React App).

### Backend Tests
No test framework is currently configured. Consider adding Jest or Mocha.

### ML Service Tests
No automated tests are configured. Manual testing via Swagger UI at `/docs` endpoint.

## Known Issues and Notes

1. **Missing Database Module**: `backend/server.js` references `require("./db")` but no `db.js` file exists. This may cause the backend to fail on startup.

2. **Unused Route Files**: The `routes/` and `services/` directories in backend contain files that are not being used by `server.js`. All routing logic is currently inline in `server.js`.

3. **Port Conflicts**: Both frontend (CRA default) and backend are configured for port 3000. The frontend will automatically prompt to use a different port.

4. **Hardcoded URLs**: Service URLs are hardcoded (e.g., `http://127.0.0.1:8000/predict`). These should be moved to environment variables for production.

5. **Legacy Root Package**: The root `package.json` appears to be a legacy file and is not used by the current architecture.

## Security Considerations

- CORS is enabled for all origins (`app.use(cors())`) - restrict this in production
- No input validation/sanitization on the backend (relies on ML service validation)
- No authentication/authorization implemented
- No rate limiting configured
- Error messages expose internal details (`error.response.data`)

## Development Workflow

1. Make changes to the relevant service
2. Restart the service if necessary (React has hot reload)
3. Test via the frontend dashboard or API tools like Postman/curl
4. Check ML service logs for prediction debugging

## Environment Variables (Recommended)

Create `.env` files for each service:

**backend/.env**
```
PORT=3000
ML_SERVICE_URL=http://127.0.0.1:8000/predict
```

**frontend/.env**
```
REACT_APP_API_URL=http://localhost:3000/api
PORT=3001
```

**ml-service/.env**
```
PORT=8000
```
