from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib

app = FastAPI(
    title="Factory Brain - Predictive Maintenance ML Service",
    version="1.0"
)

# =============================
# Load Models
# =============================
MODELS = {
    "machine": joblib.load("model/model_Machine_failure_best.pkl"),
    "twf": joblib.load("model/model_TWF_best.pkl"),
    "hdf": joblib.load("model/model_HDF_best.pkl"),
    "pwf": joblib.load("model/model_PWF_best.pkl"),
    "osf": joblib.load("model/model_OSF_best.pkl"),
    "rnf": joblib.load("model/model_RNF_best.pkl"),
}

# =============================
# Input Schema (API friendly)
# =============================
class PredictionRequest(BaseModel):
    Type: str
    Air_temperature_K: float
    Process_temperature_K: float
    Rotational_speed_rpm: int
    Torque_Nm: float
    Tool_wear_min: int


# =============================
# Feature Engineering
# =============================
def feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

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

    df["high_temp_diff"] = (df["temp_diff"] > 10).astype(int)
    df["low_speed"] = (df["Rotational speed [rpm]"] < 1500).astype(int)
    df["high_torque"] = (df["Torque [Nm]"] > 40).astype(int)

    return df


# =============================
# Prepare Input
# =============================
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
# Prediction
# =============================
def predict_all(df: pd.DataFrame):
    results = {}

    for name, model in MODELS.items():
        prob = model.predict_proba(df)[0][1]
        results[name] = {
            "failure": int(prob > 0.5),
            "failure_probability": round(float(prob), 2)
        }

    overall = "NORMAL"
    if any(v["failure"] == 1 for v in results.values()):
        overall = "FAILURE"

    return {
        "overall_status": overall,
        "predictions": results
    }


# =============================
# Routes
# =============================
@app.get("/")
def root():
    return {"status": "Factory Brain ML Service is running"}


@app.post("/predict")
def predict(data: PredictionRequest):
    df = prepare_dataframe(data)
    return predict_all(df)
