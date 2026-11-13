"""CLI del pipeline de ML de WealthOS: entrena modelos y/o genera señales.

Uso:
    python -m src.pipeline --tickers AAPL MSFT IBE.MC --train
    python -m src.pipeline --tickers AAPL MSFT IBE.MC --signals
    python -m src.pipeline --tickers AAPL --train --signals
"""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

from .features.build import build_feature_frame, feature_columns
from .models.lgbm_trainer import LGBMTrainer, make_target
from .models.lstm_trainer import LSTMTrainer
from .signals.generator import MODELS_DIR, generate_signal

TRAINING_PERIOD = "5y"
DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "backend" / "data" / "wealthos.db"


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    version = f"v{datetime.now(timezone.utc):%Y%m%d}"

    for ticker in args.tickers:
        print(f"\n=== {ticker} ===")
        if args.train:
            _train_ticker(ticker, version)
        if args.signals:
            _generate_for_ticker(ticker, args.db_path)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pipeline de entrenamiento y señales de WealthOS ML")
    parser.add_argument("--tickers", nargs="+", required=True, help="Tickers a procesar (formato yfinance)")
    parser.add_argument("--train", action="store_true", help="Reentrena LGBM y LSTM con datos actualizados")
    parser.add_argument("--signals", action="store_true", help="Genera señales y las guarda en la base de datos")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH), help="Ruta al fichero SQLite de WealthOS")
    return parser.parse_args(argv)


def _train_ticker(ticker: str, version: str) -> None:
    ohlcv = _download_history(ticker)
    features = build_feature_frame(ohlcv)
    cols = feature_columns(features)

    target = make_target(features["close"])
    valid = target.notna() & features[cols].notna().all(axis=1)
    X = features.loc[valid, cols]
    y = target.loc[valid]

    print(f"  Entrenando LightGBM con {len(X)} muestras y {len(cols)} features...")
    lgbm = LGBMTrainer(ticker).train(X, y)
    summary = lgbm.metrics_summary()
    print(f"  LGBM -> accuracy media: {summary['accuracy_mean']:.4f}, F1 macro media: {summary['f1_macro_mean']:.4f}")
    print(f"  Guardado: {lgbm.save(MODELS_DIR, version)}")

    print("  Entrenando LSTM (puede tardar varios minutos)...")
    lstm = LSTMTrainer(ticker).train(X, features.loc[valid, "close"])
    last_epoch = lstm.history[-1] if lstm.history else {}
    print(f"  LSTM -> épocas: {len(lstm.history)}, val_loss final: {last_epoch.get('val_loss')}")
    print(f"  Guardado: {lstm.save(MODELS_DIR, version)}")


def _generate_for_ticker(ticker: str, db_path: str) -> None:
    try:
        record = generate_signal(ticker, db_path)
    except FileNotFoundError as exc:
        print(f"  [AVISO] {exc}", file=sys.stderr)
        return

    print(
        f"  Señal: {record['action']} (confianza {record['confidence']:.0%}, "
        f"retorno esperado {record['predicted_return']:+.2%}, expira {record['expires_at']:%Y-%m-%d})"
    )


def _download_history(ticker: str):
    raw = yf.Ticker(ticker).history(period=TRAINING_PERIOD, interval="1d")
    if raw.empty:
        raise ValueError(f"yfinance no devolvió datos para {ticker}")

    raw = raw.rename(columns=str.lower)[["open", "high", "low", "close", "volume"]]
    raw.index = raw.index.tz_localize(None)
    return raw


if __name__ == "__main__":
    main()
