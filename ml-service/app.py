from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import pandas as pd
import numpy as np
import joblib

from energy_model import (
    build_energy_feature_frame,
    build_energy_recommendations,
    classify_energy_status,
    compute_efficiency_score,
    ensure_energy_model,
)
import shap_explain

app = FastAPI(
    title="Factory Brain - Intelligent Operations ML Service",
    version="2.0"
)


# =============================
# Load Models
# =============================
MAINTENANCE_MODELS = {
    "machine": joblib.load("model/model_Machine_failure_best.pkl"),
    "twf": joblib.load("model/model_TWF_best.pkl"),
    "hdf": joblib.load("model/model_HDF_best.pkl"),
    "pwf": joblib.load("model/model_PWF_best.pkl"),
    "osf": joblib.load("model/model_OSF_best.pkl"),
    "rnf": joblib.load("model/model_RNF_best.pkl"),
}
ENERGY_BUNDLE = ensure_energy_model()


# =============================
# Input Schemas
# =============================
class PredictionRequest(BaseModel):
    Type: str
    Air_temperature_K: float
    Process_temperature_K: float
    Rotational_speed_rpm: int
    Torque_Nm: float
    Tool_wear_min: int


class EnergyHistoryPoint(BaseModel):
    usage_kwh: float
    lagging_reactive_kvarh: float
    leading_reactive_kvarh: float
    co2_tco2: float


class EnergyPredictionRequest(BaseModel):
    timestamp: str
    load_type: str
    # Oldest-first list of trailing 15-minute readings. The dashboard form
    # collects 32 of these (8 hours); energy_model.py computes lags and
    # rolling stats directly from this series rather than from flat fields.
    history: list[EnergyHistoryPoint]


# =============================
# Maintenance Feature Engineering
# =============================
def feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Encode machine type: L=0, M=1, H=2 — matches the label encoding used during training
    type_map = {"L": 0, "M": 1, "H": 2}
    if "Type" in df.columns and df["Type"].dtype == object:
        df["Type"] = df["Type"].map(type_map).fillna(1).astype(int)

    df["temp_diff"] = df["Process temperature [K]"] - df["Air temperature [K]"]
    df["temp_ratio"] = df["Process temperature [K]"] / df["Air temperature [K]"]

    df["angular_velocity"] = df["Rotational speed [rpm]"] * (2 * np.pi / 60)
    df["power"] = df["Torque [Nm]"] * df["angular_velocity"]

    df["torque_squared"] = df["Torque [Nm]"] ** 2
    df["tool_wear_squared"] = df["Tool wear [min]"] ** 2

    df["tool_wear_per_rotation"] = (
        df["Tool wear [min]"] / (df["Rotational speed [rpm]"] + 1)
    )
    df["torque_speed_interaction"] = (
        df["Torque [Nm]"] * df["Rotational speed [rpm]"]
    )

    # Thresholds match the 75th/25th percentile of the AI4I 2020 training
    # data (Torque 75th pct = 46.80, Rotational speed 25th pct = 1423.00,
    # temp_diff 75th pct = 11.00) — the model was trained on these quantile
    # cutoffs, not on round numbers. Using 40/1500/10 here previously caused
    # train/serve skew on these three flags.
    df["high_temp_diff"] = (df["temp_diff"] > 11.00).astype(int)
    df["low_speed"] = (df["Rotational speed [rpm]"] < 1423.00).astype(int)
    df["high_torque"] = (df["Torque [Nm]"] > 46.80).astype(int)

    return df


def prepare_dataframe(data: PredictionRequest) -> pd.DataFrame:
    df = pd.DataFrame([{
        "Type": data.Type,
        "Air temperature [K]": data.Air_temperature_K,
        "Process temperature [K]": data.Process_temperature_K,
        "Rotational speed [rpm]": data.Rotational_speed_rpm,
        "Torque [Nm]": data.Torque_Nm,
        "Tool wear [min]": data.Tool_wear_min,
    }])

    return feature_engineering(df)


# =============================
# Predictions
# =============================
def predict_maintenance(df: pd.DataFrame):
    results = {}

    for name, model in MAINTENANCE_MODELS.items():
        # Reorder columns to match the exact order the model was trained with.
        # Newer sklearn raises ValueError if order differs even when names match.
        if hasattr(model, "feature_names_in_"):
            df_input = df.reindex(columns=model.feature_names_in_, fill_value=0)
        else:
            df_input = df
        prob = model.predict_proba(df_input)[0][1]
        results[name] = {
            "failure": int(prob > 0.5),
            "failure_probability": round(float(prob), 2),
            # None if shap isn't installed, the model type isn't supported,
            # or anything else goes wrong — explanation is best-effort and
            # never blocks the actual prediction.
            "shap_explanation": shap_explain.explain_maintenance_prediction(
                model, df_input, model_key=name
            ),
        }

    overall = "NORMAL"
    if any(v["failure"] == 1 for v in results.values()):
        overall = "FAILURE"

    return {
        "overall_status": overall,
        "predictions": results
    }


def predict_energy(data: EnergyPredictionRequest):
    payload = data.model_dump()
    features = ENERGY_BUNDLE["features"]
    feature_frame = build_energy_feature_frame(payload, features)
    # IMPORTANT: the deployed model (Gradient Boosting) was trained on RAW,
    # unscaled features in EOM.ipynb — only the linear/distance-based
    # candidate models (Linear/Ridge/Lasso/ElasticNet/KNN/Neural Network)
    # were trained on the scaled version. Applying energy_scaler.pkl here
    # fed the tree-based model z-scored inputs that never crossed its
    # raw-value split thresholds, making predictions almost constant
    # regardless of the real input. Predict directly on the raw frame.
    predicted_usage = float(ENERGY_BUNDLE["model"].predict(feature_frame)[0])
    thresholds = ENERGY_BUNDLE["thresholds"]
    status = classify_energy_status(predicted_usage, thresholds)
    efficiency_score = compute_efficiency_score(payload, predicted_usage, thresholds)
    recommendations = build_energy_recommendations(payload, predicted_usage, thresholds)

    return {
        "predicted_usage_kwh": round(predicted_usage, 2),
        "status": status,
        "efficiency_score": efficiency_score,
        "peak_window": feature_frame["hour"].iloc[0] in {9, 11, 14},
        "recommendations": recommendations,
        "model_name": ENERGY_BUNDLE["metadata"]["model_name"],
        "thresholds": thresholds,
        "shap_explanation": shap_explain.explain_energy_prediction(
            ENERGY_BUNDLE["model"], feature_frame
        ),
    }


# =============================
# Routes
# =============================
@app.get("/")
def root():
    return {
        "status": "Factory Brain ML Service is running",
        "modelsLoaded": len(MAINTENANCE_MODELS) + 1,
        "services": ["predictive-maintenance", "energy-optimization"],
    }


@app.get("/energy/defaults")
def energy_defaults():
    return {
        "defaults": ENERGY_BUNDLE["defaults"],
        "metadata": ENERGY_BUNDLE["metadata"],
        "thresholds": ENERGY_BUNDLE["thresholds"],
    }


@app.post("/predict")
def predict(data: PredictionRequest):
    df = prepare_dataframe(data)
    return predict_maintenance(df)


@app.post("/predict-energy")
def predict_energy_route(data: EnergyPredictionRequest):
    return predict_energy(data)


# =============================
# Retrain
# =============================
class TrainingRow(BaseModel):
    Type: str
    Air_temperature_K: float
    Process_temperature_K: float
    Rotational_speed_rpm: int
    Torque_Nm: float
    Tool_wear_min: int
    Machine_failure: int


class RetrainRequest(BaseModel):
    rows: List[TrainingRow]
    deploy: bool = False


@app.post("/retrain")
def retrain_model(data: RetrainRequest):
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, f1_score

    if len(data.rows) < 50:
        raise HTTPException(status_code=400, detail="Need at least 50 labeled rows")

    records = [{
        "Type": r.Type,
        "Air temperature [K]": r.Air_temperature_K,
        "Process temperature [K]": r.Process_temperature_K,
        "Rotational speed [rpm]": r.Rotational_speed_rpm,
        "Torque [Nm]": r.Torque_Nm,
        "Tool wear [min]": r.Tool_wear_min,
    } for r in data.rows]
    targets = [r.Machine_failure for r in data.rows]

    df = pd.DataFrame(records)
    df = feature_engineering(df)
    X = pd.get_dummies(df, columns=["Type"])

    existing = MAINTENANCE_MODELS["machine"]
    if hasattr(existing, "feature_names_in_"):
        X = X.reindex(columns=existing.feature_names_in_, fill_value=0)

    y = pd.Series(targets)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if y.sum() > 1 else None
    )

    new_model = RandomForestClassifier(
        n_estimators=150, random_state=42, class_weight="balanced", n_jobs=-1
    )
    new_model.fit(X_train, y_train)
    y_pred = new_model.predict(X_test)

    acc = float(accuracy_score(y_test, y_pred))
    f1 = float(f1_score(y_test, y_pred, zero_division=0))

    if data.deploy:
        MAINTENANCE_MODELS["machine"] = new_model
        joblib.dump(new_model, "model/model_Machine_failure_best.pkl")

    return {
        "rows_used": len(data.rows),
        "train_size": int(len(X_train)),
        "test_size": int(len(X_test)),
        "accuracy": round(acc, 4),
        "f1_score": round(f1, 4),
        "failure_rate_pct": round(float(y.mean()) * 100, 1),
        "deployed": data.deploy,
    }