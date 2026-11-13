"""Genera señales BUY/HOLD/SELL combinando LightGBM (clasificación) y LSTM
(regresión de retorno esperado), y las persiste en la tabla `signals` de SQLite.

señal_final = 0.6 * señal_lgbm + 0.4 * señal_lstm
BUY  si señal_final > +0.15 y confidence_lgbm > 0.60
SELL si señal_final < -0.15 y confidence_lgbm > 0.60
HOLD en el resto
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import yfinance as yf
from sqlalchemy import create_engine, text

from ..features.build import build_feature_frame, feature_columns
from ..models.lgbm_trainer import CONFIDENCE_THRESHOLD, LGBMTrainer
from ..models.lstm_trainer import LSTMTrainer

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"

LOOKBACK_DAYS = 400  # suficiente para el warmup de 252 días del LSTM + indicadores
LGBM_WEIGHT = 0.6
LSTM_WEIGHT = 0.4
BUY_THRESHOLD = 0.15
SELL_THRESHOLD = -0.15
LSTM_NORMALIZATION = 0.10  # un retorno esperado de ±10% se considera señal extrema (±1.0)
HORIZON_DAYS = 30
SIGNAL_TTL_DAYS = 7

_ACTION_TO_SIGN = {"SELL": -1.0, "HOLD": 0.0, "BUY": 1.0}


def generate_signal(ticker: str, db_path: str, *, models_dir: Path = MODELS_DIR) -> dict:
    lgbm, lstm = _load_models(ticker, models_dir)

    ohlcv = download_recent_data(ticker)
    features = build_feature_frame(ohlcv)
    cols = feature_columns(features)
    X = features[cols].dropna()

    if X.empty:
        raise ValueError(f"No hay suficientes datos para generar features de {ticker}")

    lgbm_pred = lgbm.predict(X.iloc[[-1]]).iloc[0]
    lgbm_signal = _ACTION_TO_SIGN[lgbm_pred["action"]] * float(lgbm_pred["confidence"])

    lstm_return = lstm.predict_last(X)
    lstm_signal = float(np.clip(lstm_return / LSTM_NORMALIZATION, -1.0, 1.0))

    final_signal = LGBM_WEIGHT * lgbm_signal + LSTM_WEIGHT * lstm_signal
    confident = float(lgbm_pred["confidence"]) > CONFIDENCE_THRESHOLD

    if final_signal > BUY_THRESHOLD and confident:
        action = "BUY"
    elif final_signal < SELL_THRESHOLD and confident:
        action = "SELL"
    else:
        action = "HOLD"

    shap_rows = lgbm.explain(X, n_last=1)
    generated_at = datetime.now(timezone.utc)

    record = {
        "ticker": ticker,
        "action": action,
        "confidence": round(float(lgbm_pred["confidence"]), 4),
        "predicted_return": round(float(lstm_return), 5),
        "horizon_days": HORIZON_DAYS,
        "model_version": f"ensemble_{generated_at:%Y%m%d}",
        "shap_json": json.dumps(shap_rows[0]["values"]) if shap_rows else None,
        "features_json": json.dumps({c: round(float(X.iloc[-1][c]), 5) for c in cols}),
        "generated_at": generated_at,
        "expires_at": generated_at + timedelta(days=SIGNAL_TTL_DAYS),
    }

    _save_signal(db_path, record)
    return record


def _load_models(ticker: str, models_dir: Path) -> tuple[LGBMTrainer, LSTMTrainer]:
    lgbm_path = find_latest_model(models_dir, f"lgbm_*_{ticker}.pkl")
    lstm_path = find_latest_model(models_dir, f"lstm_*_{ticker}.pt")

    if lgbm_path is None or lstm_path is None:
        raise FileNotFoundError(
            f"No se encontraron modelos entrenados para {ticker} en {models_dir}. "
            "Ejecuta primero `pipeline.py --tickers {ticker} --train`."
        )

    return LGBMTrainer.load(lgbm_path), LSTMTrainer.load(lstm_path)


def find_latest_model(directory: Path, pattern: str) -> Path | None:
    matches = sorted(directory.glob(pattern))
    return matches[-1] if matches else None


def download_recent_data(ticker: str):
    raw = yf.Ticker(ticker).history(period=f"{LOOKBACK_DAYS}d", interval="1d")
    if raw.empty:
        raise ValueError(f"yfinance no devolvió datos para {ticker}")

    raw = raw.rename(columns=str.lower)[["open", "high", "low", "close", "volume"]]
    raw.index = raw.index.tz_localize(None)
    return raw


def _save_signal(db_path: str, record: dict) -> None:
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO signals
                    (ticker, action, confidence, predicted_return, horizon_days,
                     model_version, shap_json, features_json, generated_at, expires_at)
                VALUES
                    (:ticker, :action, :confidence, :predicted_return, :horizon_days,
                     :model_version, :shap_json, :features_json, :generated_at, :expires_at)
                """
            ),
            record,
        )
