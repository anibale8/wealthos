"""CLI de soporte bajo demanda para el backend (predicción puntual y backtest).

El backend NO tiene instaladas las dependencias pesadas de ML (lightgbm, torch,
shap...) — vive en el venv ligero de `backend/`. Para servir `/api/ml/predict`
y `/api/ml/backtest` invoca este script como subproceso con el intérprete del
venv de `ml/` (que sí las tiene) y parsea el JSON que imprime por stdout.

Uso:
    python -m src.cli predict --ticker AAPL --horizon 30
    python -m src.cli backtest --ticker AAPL [--start 2023-01-01]
"""

import argparse
import json
import sys

import numpy as np
import pandas as pd
import yfinance as yf

from .features.build import build_feature_frame, feature_columns
from .models.lgbm_trainer import LGBMTrainer
from .models.lstm_trainer import LSTMTrainer
from .signals.backtester import run_backtest
from .signals.generator import MODELS_DIR, download_recent_data, find_latest_model

CONFIDENCE_BAND_Z = 1.28  # ~80% del intervalo bajo normalidad
BACKTEST_PERIOD = "5y"


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    try:
        result = _predict(args.ticker, args.horizon) if args.command == "predict" else _backtest(args.ticker, args.start)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

    print(json.dumps(result))


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CLI de soporte ML bajo demanda")
    sub = parser.add_subparsers(dest="command", required=True)

    predict_parser = sub.add_parser("predict")
    predict_parser.add_argument("--ticker", required=True)
    predict_parser.add_argument("--horizon", type=int, default=30)

    backtest_parser = sub.add_parser("backtest")
    backtest_parser.add_argument("--ticker", required=True)
    backtest_parser.add_argument("--start", default=None)

    return parser.parse_args(argv)


def _load_lgbm(ticker: str) -> LGBMTrainer:
    path = find_latest_model(MODELS_DIR, f"lgbm_*_{ticker}.pkl")
    if path is None:
        raise FileNotFoundError(f"No hay modelo LightGBM entrenado para {ticker}")
    return LGBMTrainer.load(path)


def _load_lstm(ticker: str) -> LSTMTrainer:
    path = find_latest_model(MODELS_DIR, f"lstm_*_{ticker}.pt")
    if path is None:
        raise FileNotFoundError(f"No hay modelo LSTM entrenado para {ticker}")
    return LSTMTrainer.load(path)


def _predict(ticker: str, horizon: int) -> dict:
    lgbm = _load_lgbm(ticker)
    lstm = _load_lstm(ticker)

    features = build_feature_frame(download_recent_data(ticker))
    cols = feature_columns(features)
    X = features[cols].dropna()
    if X.empty:
        raise ValueError(f"No hay suficientes datos para predecir {ticker}")

    last_close = float(features["close"].iloc[-1])
    last_date = features.index[-1]

    lgbm_pred = lgbm.predict(X.iloc[[-1]]).iloc[0]
    expected_return = lstm.predict_last(X)
    daily_vol = float(np.log(features["close"]).diff().rolling(60).std().iloc[-1])

    predictions = []
    for day in range(1, horizon + 1):
        date = last_date + pd.Timedelta(days=day)
        value = last_close * (1 + expected_return * (day / horizon))
        spread = last_close * daily_vol * np.sqrt(day) * CONFIDENCE_BAND_Z
        predictions.append({
            "date": date.date().isoformat(),
            "value": round(value, 4),
            "lower": round(value - spread, 4),
            "upper": round(value + spread, 4),
        })

    shap_rows = lgbm.explain(X, n_last=1)

    return {
        "ticker": ticker,
        "horizon_days": horizon,
        "predictions": predictions,
        "confidence": round(float(lgbm_pred["confidence"]), 4),
        "predicted_return": round(float(expected_return), 5),
        "shap_values": shap_rows[0]["values"] if shap_rows else {},
    }


def _backtest(ticker: str, start: str | None) -> dict:
    lgbm = _load_lgbm(ticker)

    raw = (
        yf.Ticker(ticker).history(start=start, interval="1d")
        if start
        else yf.Ticker(ticker).history(period=BACKTEST_PERIOD, interval="1d")
    )
    if raw.empty:
        raise ValueError(f"yfinance no devolvió datos para {ticker}")

    raw = raw.rename(columns=str.lower)[["open", "high", "low", "close", "volume"]]
    raw.index = raw.index.tz_localize(None)

    features = build_feature_frame(raw)
    cols = feature_columns(features)
    X = features[cols].dropna()

    # El backtest usa la señal del clasificador LGBM (re-evaluada día a día sobre
    # el histórico); re-ejecutar el LSTM fila a fila sería mucho más costoso y el
    # ensemble completo solo se calcula para la señal "en vivo" más reciente.
    signals_history = lgbm.predict(X)[["action"]]
    prices = features.loc[X.index, ["close"]]

    if start:
        cutoff = pd.Timestamp(start)
        signals_history = signals_history[signals_history.index >= cutoff]
        prices = prices[prices.index >= cutoff]

    return run_backtest(ticker, signals_history, prices, initial_capital=10_000.0)


if __name__ == "__main__":
    main()
