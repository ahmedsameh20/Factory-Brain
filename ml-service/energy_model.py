from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "model"
ENERGY_METADATA_PATH = MODEL_DIR / "energy_best_model_metadata.json"
ENERGY_SCALER_PATH = MODEL_DIR / "energy_scaler.pkl"
ENERGY_MODEL_PATH = MODEL_DIR / "model_Energy_Usage_best.pkl"

# How many trailing 15-minute readings the dashboard form collects.
# 32 readings = 8 hours of history. Lags/windows beyond this (up to 24h)
# are approximated from the available window rather than left undefined.
HISTORY_POINTS_REQUIRED = 32
INTERVAL_MINUTES = 15

LOAD_ORDER = {"Light_Load": 0, "Medium_Load": 1, "Maximum_Load": 2}
PEAK_HOURS = {8, 9, 10, 11, 14, 15, 16, 17}


def _load_metadata() -> dict:
    with ENERGY_METADATA_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def ensure_energy_model() -> dict:
    """Load the pre-trained Gradient Boosting energy model, scaler, and metadata.

    Unlike the maintenance models, this bundle is trained entirely offline in the
    EOM notebook (70 engineered features from historical load data). The service
    only loads and applies it — it never re-trains here.
    """
    metadata = _load_metadata()
    model = joblib.load(ENERGY_MODEL_PATH)
    scaler = joblib.load(ENERGY_SCALER_PATH)

    return {
        "model": model,
        "scaler": scaler,
        "features": metadata["features"],
        "metadata": metadata,
        "thresholds": _thresholds_from_metadata(metadata),
        "defaults": _build_form_defaults(),
    }


def _thresholds_from_metadata(metadata: dict) -> dict:
    # The notebook's test-set performance numbers don't include usage quantiles,
    # so thresholds are kept as static, documented operating bands consistent
    # with the dataset's known range (~0-160 kWh). Adjust here if the new
    # notebook run publishes quantile-based thresholds instead.
    return {
        "optimal_max": 25.0,
        "monitor_max": 65.0,
        "critical_min": 78.29,
    }


def _build_form_defaults() -> dict:
    """Defaults shown in the form: 32 flat readings at a plausible light-load level."""
    sample_row = {
        "usage_kwh": 27.51,
        "lagging_reactive_kvarh": 13.09,
        "leading_reactive_kvarh": 3.86,
        "co2_tco2": 0.0116,
    }
    history = [dict(sample_row) for _ in range(HISTORY_POINTS_REQUIRED)]
    return {
        "timestamp": "2026-04-04T10:00",
        "load_type": "Light_Load",
        "history": history,
    }


def _get_shift(hour: int) -> int:
    # Matches the EOM notebook's get_shift(): 0=morning, 1=afternoon, 2=night
    if 6 <= hour < 14:
        return 0
    if 14 <= hour < 22:
        return 1
    return 2


def _derive_time_features(timestamp: datetime) -> dict:
    hour = timestamp.hour
    minute = timestamp.minute
    day_of_week_num = timestamp.weekday()
    nsm = hour * 3600 + minute * 60 + timestamp.second

    return {
        "NSM": nsm,
        "hour": hour,
        "minute": minute,
        "day_of_week_num": day_of_week_num,
        "month": timestamp.month,
        "is_weekend": int(day_of_week_num >= 5),
        "day_of_month": timestamp.day,
        "week_of_year": int(timestamp.isocalendar()[1]),
        "shift": _get_shift(hour),
        "hour_sin": np.sin(2 * np.pi * hour / 24),
        "hour_cos": np.cos(2 * np.pi * hour / 24),
        "day_sin": np.sin(2 * np.pi * day_of_week_num / 7),
        "day_cos": np.cos(2 * np.pi * day_of_week_num / 7),
        "month_sin": np.sin(2 * np.pi * timestamp.month / 12),
        "month_cos": np.cos(2 * np.pi * timestamp.month / 12),
        "is_peak_production": int(hour in PEAK_HOURS),
        "time_fraction": (hour * 60 + minute) / (24 * 60),
    }


def _derive_load_features(load_type: str) -> dict:
    return {
        "load_Light_Load": int(load_type == "Light_Load"),
        "load_Maximum_Load": int(load_type == "Maximum_Load"),
        "load_Medium_Load": int(load_type == "Medium_Load"),
        "load_ordinal": LOAD_ORDER[load_type],
    }


def _history_series(history: list[dict], key: str) -> np.ndarray:
    """History arrives oldest-first; index -1 is the most recent reading
    (i.e. immediately before the timestamp being predicted)."""
    return np.array([float(point[key]) for point in history], dtype=float)


def _lag_value(series: np.ndarray, periods_back: int) -> float:
    """periods_back=1 means the most recent reading (lag of one 15-min interval)."""
    idx = len(series) - periods_back
    if idx >= 0:
        return float(series[idx])
    # Requested lag reaches further back than the supplied history window.
    # Fall back to the oldest available reading rather than guessing zero.
    return float(series[0])


def _rolling_window(series: np.ndarray, window_points: int) -> np.ndarray:
    """Trailing window of up to `window_points` values ending at the most
    recent reading. If the window is longer than the supplied history,
    this returns whatever history is available (an approximation, see
    HISTORY_POINTS_REQUIRED note above)."""
    return series[-window_points:] if window_points <= len(series) else series


def _derive_energy_lag_and_rolling_features(history: list[dict]) -> dict:
    energy = _history_series(history, "usage_kwh")
    reactive = _history_series(history, "lagging_reactive_kvarh")
    co2 = _history_series(history, "co2_tco2")

    feats: dict = {}

    # --- Lags (periods of 15-minute intervals: 1=15m, 2=30m, 4=1h, 8=2h, 16=4h, 32=8h, 96=24h)
    lag_points = {"15m": 1, "30m": 2, "1h": 4, "2h": 8, "4h": 16, "8h": 32, "24h": 96}
    for label, periods in lag_points.items():
        feats[f"energy_lag_{label}"] = _lag_value(energy, periods)

    for label, periods in {"15m": 1, "1h": 4, "24h": 96}.items():
        feats[f"reactive_lag_{label}"] = _lag_value(reactive, periods)

    for label, periods in {"15m": 1, "1h": 4}.items():
        feats[f"co2_lag_{label}"] = _lag_value(co2, periods)

    # --- CO2-derived (uses the 15m-lagged CO2, matching the notebook's "no leakage" design)
    co2_lag_15m = feats["co2_lag_15m"]
    reactive_lag_15m = feats["reactive_lag_15m"]
    co2_mean_window = float(np.mean(co2)) if len(co2) else 0.0
    feats["co2_lag_per_reactive"] = co2_lag_15m / (abs(reactive_lag_15m) + 1e-6)
    feats["co2_lag_deviation"] = co2_lag_15m - co2_mean_window
    feats["co2_lag_above_avg"] = int(co2_lag_15m > co2_mean_window)

    # --- Rolling stats over past energy values (windows: 1h=4pts, 2h=8pts, 4h=16pts, 24h=96pts)
    rolling_windows = {"1h": 4, "2h": 8, "4h": 16, "24h": 96}
    for label, points in rolling_windows.items():
        window = _rolling_window(energy, points)
        feats[f"energy_rmean_{label}"] = float(np.mean(window))
        feats[f"energy_rstd_{label}"] = float(np.std(window, ddof=0)) if len(window) > 1 else 0.0
        feats[f"energy_rmax_{label}"] = float(np.max(window))
        feats[f"energy_rmin_{label}"] = float(np.min(window))

    for label in rolling_windows:
        feats[f"energy_rrange_{label}"] = feats[f"energy_rmax_{label}"] - feats[f"energy_rmin_{label}"]

    for label, points in {"1h": 4, "4h": 16}.items():
        feats[f"reactive_rmean_{label}"] = float(np.mean(_rolling_window(reactive, points)))

    # --- Change / statistical features (computed entirely from lag values, no leakage)
    feats["energy_diff_1"] = feats["energy_lag_15m"] - feats["energy_lag_30m"]
    feats["energy_diff_4"] = feats["energy_lag_15m"] - feats["energy_lag_1h"]
    feats["energy_diff_96"] = feats["energy_lag_15m"] - feats["energy_lag_24h"]

    feats["energy_pct_change_1"] = feats["energy_diff_1"] / (abs(feats["energy_lag_30m"]) + 1e-6)
    feats["energy_pct_change_4"] = feats["energy_diff_4"] / (abs(feats["energy_lag_1h"]) + 1e-6)

    feats["energy_acceleration"] = (
        (feats["energy_lag_15m"] - feats["energy_lag_30m"])
        - (feats["energy_lag_30m"] - feats["energy_lag_1h"])
    )

    feats["energy_zscore_4h"] = (
        (feats["energy_lag_15m"] - feats["energy_rmean_4h"]) / (feats["energy_rstd_4h"] + 1e-6)
    )
    feats["energy_above_rmean_4h"] = int(feats["energy_lag_15m"] > feats["energy_rmean_4h"])

    return feats


def build_energy_feature_frame(payload: dict, features: list[str]) -> pd.DataFrame:
    """Builds the full 70-feature row the Gradient Boosting model expects.

    payload must contain:
      - timestamp: ISO datetime string for the point being forecast
      - load_type: 'Light_Load' | 'Medium_Load' | 'Maximum_Load'
      - history: list of HISTORY_POINTS_REQUIRED dicts (oldest-first), each with
        usage_kwh, lagging_reactive_kvarh, leading_reactive_kvarh, co2_tco2
    """
    timestamp = datetime.fromisoformat(payload["timestamp"])
    load_type = payload["load_type"]
    history = payload["history"]

    if len(history) < 2:
        raise ValueError("At least 2 historical readings are required to compute lag features.")

    time_features = _derive_time_features(timestamp)
    load_features = _derive_load_features(load_type)
    history_features = _derive_energy_lag_and_rolling_features(history)

    feature_values = {
        **time_features,
        **load_features,
        **history_features,
        "hour_x_load": time_features["hour"] * load_features["load_ordinal"],
        "weekend_x_load": time_features["is_weekend"] * load_features["load_ordinal"],
        "shift_x_load": time_features["shift"] * load_features["load_ordinal"],
        "peak_x_load": time_features["is_peak_production"] * load_features["load_ordinal"],
    }

    row = {feature: feature_values[feature] for feature in features}
    return pd.DataFrame([row])


def build_energy_recommendations(payload: dict, predicted_usage: float, thresholds: dict) -> list[str]:
    """Recommendations now read from the most recent history point (history[-1])
    rather than top-level snapshot fields, since the payload no longer carries
    lagging_current_power_factor / co2_tco2 directly."""
    recommendations = []
    timestamp = datetime.fromisoformat(payload["timestamp"])
    peak_hours = {9, 11, 14}
    latest = payload["history"][-1]

    if predicted_usage >= thresholds["critical_min"]:
        recommendations.append(
            "Predicted usage is in the critical band. Shift heavy operations to off-peak windows where possible."
        )
    elif predicted_usage >= thresholds["monitor_max"]:
        recommendations.append(
            "Energy consumption is elevated. Review the current load plan and avoid overlapping heavy processes."
        )
    else:
        recommendations.append(
            "Predicted usage is within a healthy operating range. Keep the current schedule and continue monitoring."
        )

    # Power factor isn't collected directly anymore; approximate "lagging power
    # factor below threshold" using the reactive/energy ratio from the latest
    # reading as a proxy signal instead of skipping the check entirely.
    latest_energy = float(latest["usage_kwh"])
    latest_reactive = float(latest["lagging_reactive_kvarh"])
    if latest_energy > 0 and (latest_reactive / latest_energy) > 0.5:
        recommendations.append(
            "Reactive power is high relative to active usage, suggesting a lagging power factor. "
            "Consider power factor correction equipment."
        )

    if payload["load_type"] == "Maximum_Load" and timestamp.hour in peak_hours:
        recommendations.append(
            "Maximum load is scheduled during a peak-demand hour. Rescheduling can reduce both cost and CO2 intensity."
        )

    if float(latest["co2_tco2"]) > 0.02:
        recommendations.append(
            "CO2 intensity is elevated. Review machine sequencing and standby energy use to reduce emissions."
        )

    return recommendations


def classify_energy_status(predicted_usage: float, thresholds: dict) -> str:
    if predicted_usage >= thresholds["critical_min"]:
        return "CRITICAL"
    if predicted_usage >= thresholds["monitor_max"]:
        return "MONITOR"
    return "OPTIMAL"


def compute_efficiency_score(payload: dict, predicted_usage: float, thresholds: dict) -> float:
    """Efficiency score now derives its power-factor and CO2 penalties from the
    most recent history reading (history[-1]) rather than removed top-level
    snapshot fields."""
    latest = payload["history"][-1]
    latest_energy = float(latest["usage_kwh"])
    latest_reactive = float(latest["lagging_reactive_kvarh"])
    latest_co2 = float(latest["co2_tco2"])

    # Proxy power factor penalty: higher reactive-to-active ratio implies a
    # worse (lower) power factor, since direct power-factor % is no longer
    # part of the collected payload.
    reactive_ratio = (latest_reactive / latest_energy) if latest_energy > 0 else 0.0
    pf_penalty = min(30.0, reactive_ratio * 40.0)

    usage_penalty = min(45.0, (predicted_usage / thresholds["critical_min"]) * 45.0)
    co2_penalty = max(0.0, latest_co2 - 0.01) * 1200
    score = 100.0 - usage_penalty - pf_penalty - co2_penalty
    return round(max(0.0, min(100.0, score)), 1)