"""
ML Model loader — XGBoost fraud detection
Model trained on credit card fraud dataset (AUC: 0.9768)
"""

import joblib
import numpy as np
import os
from pathlib import Path

_model = None
_scaler = None

MODEL_PATH = Path(__file__).parent / "fraud_model.pkl"
SCALER_PATH = Path(__file__).parent / "scaler.pkl"

# Feature columns (same as training — 30 features: Time, V1-V28, Amount)
FEATURE_COLUMNS = (
    ["Time"]
    + [f"V{i}" for i in range(1, 29)]
    + ["Amount"]
)


def load_model():
    global _model, _scaler
    if MODEL_PATH.exists():
        _model = joblib.load(MODEL_PATH)
        print(f"✅ Loaded fraud model from {MODEL_PATH}")
    else:
        # Fallback: create a dummy model for development
        print("⚠️  fraud_model.pkl not found — using dummy model (score=0)")
        _model = None

    if SCALER_PATH.exists():
        _scaler = joblib.load(SCALER_PATH)
    else:
        _scaler = None


def is_model_loaded() -> bool:
    return _model is not None


def predict_fraud_score(features: dict) -> int:
    """
    Takes a transaction feature dict, returns risk score 0-100.

    Features expected:
      Time, V1..V28, Amount
      (same columns as creditcard.csv)

    Returns:
      int 0-100  (0 = safe, 100 = definitely fraud)
    """
    if _model is None:
        # Dummy: simple heuristic based on Amount
        amount = features.get("Amount", 0)
        return min(int(amount / 50), 100)

    import pandas as pd
    from sklearn.preprocessing import StandardScaler

    row = {col: features.get(col, 0.0) for col in FEATURE_COLUMNS}
    df = pd.DataFrame([row])

    # Scale Time and Amount (same as training)
    if _scaler is not None:
        df[["Amount", "Time"]] = _scaler.transform(df[["Amount", "Time"]])
    else:
        # Inline normalize if no scaler saved
        df["Amount"] = (df["Amount"] - 88.35) / 250.12
        df["Time"] = (df["Time"] - 94813.86) / 47488.14

    prob = _model.predict_proba(df)[0][1]
    return int(prob * 100)


def get_feature_columns() -> list[str]:
    return FEATURE_COLUMNS