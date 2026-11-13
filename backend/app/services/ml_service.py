"""Puente con el módulo ML (`ml/`).

El backend consulta directamente la tabla `signals` (poblada por el scheduler /
pipeline ML), pero delega predicción puntual, backtest y reentrenamiento al
intérprete del venv de `ml/` vía subprocess: ese venv tiene instaladas las
dependencias pesadas (lightgbm, torch, shap...) que el backend no necesita.
"""

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.signal import Signal

ML_DIR = Path(__file__).resolve().parents[3] / "ml"
ML_PYTHON = ML_DIR / ".venv" / ("Scripts" if os.name == "nt" else "bin") / ("python.exe" if os.name == "nt" else "python")

SUBPROCESS_TIMEOUT = 300  # segundos: descarga de datos + features + SHAP puede tardar


def list_signals(db: Session, min_confidence: float = 0.0) -> list[Signal]:
    now = datetime.now(timezone.utc)
    stmt = (
        select(Signal)
        .where(Signal.confidence >= min_confidence)
        .where((Signal.expires_at.is_(None)) | (Signal.expires_at >= now))
        .order_by(Signal.confidence.desc())
    )
    return list(db.scalars(stmt).all())


def predict(ticker: str, horizon: int = 30) -> dict:
    return _run_cli(["predict", "--ticker", ticker, "--horizon", str(horizon)])


def backtest(ticker: str, start: str | None = None) -> dict:
    args = ["backtest", "--ticker", ticker]
    if start:
        args += ["--start", start]
    return _run_cli(args)


def train(tickers: list[str]) -> None:
    """Lanza el reentrenamiento + regeneración de señales en segundo plano."""
    _ensure_ml_python()
    subprocess.Popen(
        [str(ML_PYTHON), "-m", "src.pipeline", "--tickers", *tickers, "--train", "--signals"],
        cwd=ML_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _run_cli(args: list[str]) -> dict:
    _ensure_ml_python()

    result = subprocess.run(
        [str(ML_PYTHON), "-m", "src.cli", *args],
        cwd=ML_DIR,
        capture_output=True,
        text=True,
        timeout=SUBPROCESS_TIMEOUT,
    )

    lines = [line for line in result.stdout.strip().splitlines() if line.strip()]
    payload = json.loads(lines[-1]) if lines else {}

    if result.returncode != 0 or "error" in payload:
        raise RuntimeError(payload.get("error") or result.stderr.strip() or "Error desconocido en el proceso ML")

    return payload


def _ensure_ml_python() -> None:
    if not ML_PYTHON.exists():
        raise RuntimeError(
            f"No se encontró el intérprete de ML en {ML_PYTHON}. "
            "Crea el entorno con: cd ml && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt"
        )
