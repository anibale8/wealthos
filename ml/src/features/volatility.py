"""Volatilidad realizada (rolling std de retornos) y estimador Garman-Klass."""

import numpy as np
import pandas as pd

_ANNUALIZATION_FACTOR = np.sqrt(252)


def compute_volatility_features(df: pd.DataFrame) -> pd.DataFrame:
    """Añade volatilidad anualizada a 10/20/60 días, su ratio y el estimador
    Garman-Klass (usa el rango OHLC completo, más preciso que close-to-close)."""
    out = df.copy()
    log_ret = np.log(df["close"]).diff()

    out["vol_10d"] = log_ret.rolling(10).std() * _ANNUALIZATION_FACTOR
    out["vol_20d"] = log_ret.rolling(20).std() * _ANNUALIZATION_FACTOR
    out["vol_60d"] = log_ret.rolling(60).std() * _ANNUALIZATION_FACTOR
    out["vol_ratio"] = out["vol_10d"] / out["vol_60d"]

    out["garman_klass"] = _garman_klass(df)

    new_cols = ["vol_10d", "vol_20d", "vol_60d", "vol_ratio", "garman_klass"]
    out[new_cols] = out[new_cols].ffill().bfill()

    return out


def _garman_klass(df: pd.DataFrame) -> pd.Series:
    """Estimador de volatilidad Garman-Klass (varianza diaria, anualizada).

    GK = 0.5 * ln(H/L)^2 - (2*ln2 - 1) * ln(C/O)^2
    """
    log_hl = np.log(df["high"] / df["low"])
    log_co = np.log(df["close"] / df["open"])
    daily_var = 0.5 * log_hl**2 - (2 * np.log(2) - 1) * log_co**2
    return np.sqrt(daily_var.rolling(20).mean().clip(lower=0)) * _ANNUALIZATION_FACTOR
