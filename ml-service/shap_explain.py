"""
SHAP explainability for the Predictive Maintenance and Energy models.

Design notes (read before touching this file):

- Each PdM model is an imblearn Pipeline: preprocessor (ColumnTransformer:
  OneHotEncoder on Type + StandardScaler on the rest) -> smote (training-only,
  skipped at inference) -> classifier. SHAP needs to operate on the feature
  space the *classifier* actually sees (post-preprocessing), not the raw
  5-field input — so every explain function here transforms through
  `pipeline.named_steps["preprocessor"]` first.

- Tree-based classifiers (LightGBM, RandomForest, XGBoost) use shap.TreeExplainer
  directly — exact, fast, no background dataset required (tree_path_dependent
  perturbation, shap's default).

- The two Logistic Regression models (TWF, RNF) use a hand-computed closed-form
  linear SHAP instead of shap.LinearExplainer, specifically so this module has
  no dependency on a bundled background dataset at runtime:
    - For the StandardScaled numeric columns, the scaler's own training mean
      is ~0 in the *scaled* space by construction, so contribution = coef * x.
    - For the one-hot Type_H/Type_L/Type_M columns, contribution is taken
      relative to that category's real frequency in the AI4I training data
      (TYPE_FREQUENCY below), not relative to 0/1 — this is what gives a
      meaningful "Type" attribution instead of an arbitrary one.
  This is mathematically equivalent to shap.LinearExplainer(model,
  feature_perturbation="interventional") with that exact background.

- The energy model (Gradient Boosting) is a plain (non-pipeline) sklearn
  regressor trained on raw, UNSCALED features (see energy_model.py's own
  comments on this) — so its TreeExplainer runs directly on the raw
  70-feature frame, no preprocessing step to unwrap.
"""

import numpy as np
import pandas as pd
import logging
import traceback

logger = logging.getLogger("shap_explain")

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False

# Background frequency of each Type category in the AI4I 2020 training data —
# used as the reference point for the linear models' Type_* contributions.
TYPE_FREQUENCY = {"Type_H": 0.1003, "Type_L": 0.6000, "Type_M": 0.2997}

# Human-readable labels for the engineered/raw feature names, shown in the
# dashboard instead of the raw column names.
FEATURE_LABELS = {
    "Air temperature [K]": "Air Temperature",
    "Process temperature [K]": "Process Temperature",
    "Rotational speed [rpm]": "Rotational Speed",
    "Torque [Nm]": "Torque",
    "Tool wear [min]": "Tool Wear",
    "temp_diff": "Temp. Difference",
    "temp_ratio": "Temp. Ratio",
    "angular_velocity": "Angular Velocity",
    "power": "Power Draw",
    "torque_speed_interaction": "Torque x Speed",
    "tool_wear_per_rotation": "Wear per Rotation",
    "high_torque": "High-Torque Flag",
    "low_speed": "Low-Speed Flag",
    "high_temp_diff": "High Temp.-Diff Flag",
    "torque_squared": "Torque (squared)",
    "tool_wear_squared": "Tool Wear (squared)",
    "Type_H": "Machine Type: H",
    "Type_L": "Machine Type: L",
    "Type_M": "Machine Type: M",
}

# Which classifier families get a real shap.TreeExplainer vs. the hand-rolled
# closed-form linear path. Matched by class name so this doesn't need to
# import lightgbm/xgboost just to type-check against them.
TREE_CLASSIFIER_NAMES = {
    "LGBMClassifier",
    "RandomForestClassifier",
    "XGBClassifier",
    "GradientBoostingClassifier",
}
LINEAR_CLASSIFIER_NAMES = {"LogisticRegression"}

_tree_explainer_cache = {}


def _transform_through_preprocessor(pipeline, raw_df):
    """Runs the raw 5-field input through the pipeline's preprocessor step
    only, returning (transformed_array, output_feature_names)."""
    preprocessor = pipeline.named_steps["preprocessor"]
    transformed = preprocessor.transform(raw_df)
    if hasattr(transformed, "toarray"):
        transformed = transformed.toarray()
    feature_names = list(preprocessor.get_feature_names_out())
    # ColumnTransformer prefixes output names with the transformer name
    # ("cat__Type_H", "num__Torque [Nm]") — strip that back to the plain
    # column name for matching against FEATURE_LABELS/TYPE_FREQUENCY.
    feature_names = [name.split("__", 1)[-1] for name in feature_names]
    return transformed, feature_names


def _linear_shap_values(classifier, transformed_row, feature_names):
    """Closed-form SHAP for a binary LogisticRegression: contribution_i =
    coef_i * (x_i - reference_i), where reference_i is ~0 for StandardScaled
    numeric columns and the real category frequency for one-hot columns."""
    coefs = classifier.coef_[0]
    contributions = np.zeros_like(transformed_row)
    for i, name in enumerate(feature_names):
        reference = TYPE_FREQUENCY.get(name, 0.0)
        contributions[i] = coefs[i] * (transformed_row[i] - reference)
    return contributions


def _tree_shap_values(classifier, model_key, transformed_row):
    """Real SHAP values via shap.TreeExplainer, cached per model so the
    (relatively expensive) explainer construction only happens once."""
    if model_key not in _tree_explainer_cache:
        _tree_explainer_cache[model_key] = shap.TreeExplainer(classifier)
    explainer = _tree_explainer_cache[model_key]
    raw_values = explainer.shap_values(transformed_row.reshape(1, -1))

    # Binary classifiers can return either a single array (positive-class
    # contributions) or a [class_0, class_1] list depending on the model
    # family and shap version — normalize to "contribution toward failure".
    if isinstance(raw_values, list):
        values = raw_values[1][0]
    else:
        values = raw_values[0]
        if values.ndim == 2:
            values = values[:, 1]
    return np.asarray(values).flatten()


def explain_maintenance_prediction(model, raw_df, model_key, top_n=5):
    """Returns the top_n feature contributions toward THIS model's failure
    prediction, or None if shap isn't installed / something goes wrong —
    explanation is a nice-to-have, never worth failing the actual prediction
    over."""
    if not SHAP_AVAILABLE:
        return None
    try:
        # Support both plain classifiers and imblearn/sklearn Pipelines.
        if hasattr(model, "named_steps") and "preprocessor" in model.named_steps:
            transformed, feature_names = _transform_through_preprocessor(model, raw_df)
            row = transformed[0]
            classifier = model.named_steps["classifier"]
        else:
            # Plain classifier — raw_df is already the fully-engineered numeric frame
            classifier = model
            row = raw_df.values[0]
            feature_names = list(raw_df.columns)

        classifier_name = type(classifier).__name__

        if classifier_name in LINEAR_CLASSIFIER_NAMES:
            values = _linear_shap_values(classifier, row, feature_names)
        elif classifier_name in TREE_CLASSIFIER_NAMES:
            values = _tree_shap_values(classifier, model_key, row)
        else:
            return None

        return _top_contributions(feature_names, values, top_n)
    except Exception as exc:
        logger.error(
            "SHAP explanation failed for model_key=%s (SHAP_AVAILABLE=%s): %s\n%s",
            model_key, SHAP_AVAILABLE, exc, traceback.format_exc()
        )
        return None


def explain_energy_prediction(model, feature_frame, top_n=6):
    """Same idea for the energy regressor — it's a plain GradientBoosting
    model trained on raw unscaled features, so no preprocessor to unwrap."""
    if not SHAP_AVAILABLE:
        logger.error(
            "Energy SHAP explanation skipped: the 'shap' package is not "
            "installed in this environment. Run: pip install shap"
        )
        return None
    try:
        if "energy" not in _tree_explainer_cache:
            _tree_explainer_cache["energy"] = shap.TreeExplainer(model)
        explainer = _tree_explainer_cache["energy"]
        raw_values = explainer.shap_values(feature_frame)
        values = np.asarray(raw_values).flatten()
        feature_names = list(feature_frame.columns)
        return _top_contributions(feature_names, values, top_n, label_fn=_energy_label)
    except Exception as exc:
        logger.error("Energy SHAP explanation failed: %s\n%s", exc, traceback.format_exc())
        return None


def _energy_label(name):
    """Energy feature names are already fairly readable (energy_lag_15m,
    energy_rmean_4h, etc.) — just clean up the underscores for display."""
    return name.replace("_", " ")


def _top_contributions(feature_names, values, top_n, label_fn=None):
    label_fn = label_fn or (lambda n: FEATURE_LABELS.get(n, n))
    order = np.argsort(-np.abs(values))[:top_n]
    return [
        {
            "feature": label_fn(feature_names[i]),
            "contribution": round(float(values[i]), 4),
            "direction": "increases" if values[i] > 0 else "decreases",
        }
        for i in order
    ]