"""Combina los tres grupos de features (técnicos, momentum, volatilidad, volumen)
en un único DataFrame listo para entrenar o predecir."""

import pandas as pd

from .momentum import compute_momentum_features
from .technical import compute_technical_features
from .volatility import compute_volatility_features

# Columnas que NUNCA deben usarse como input del modelo (OHLCV crudo + el target)
NON_FEATURE_COLUMNS = ("open", "high", "low", "close", "volume", "ret_1d_fwd")


def build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    """df: OHLCV con índice de fechas y columnas open/high/low/close/volume."""
    out = compute_technical_features(df)
    out = compute_momentum_features(out)
    out = compute_volatility_features(out)

    out["volume_ratio"] = df["volume"] / df["volume"].rolling(20).mean()
    out["volume_trend"] = _rolling_slope(df["volume"], window=20)
    out[["volume_ratio", "volume_trend"]] = out[["volume_ratio", "volume_trend"]].ffill().bfill()

    return out


def feature_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in NON_FEATURE_COLUMNS]


def _rolling_slope(series: pd.Series, window: int) -> pd.Series:
    """Pendiente de una regresión lineal simple sobre una ventana móvil."""
    x = pd.Series(range(window), dtype="float64")
    x_mean = x.mean()
    x_var = ((x - x_mean) ** 2).sum()

    def slope(values: pd.Series) -> float:
        y = pd.Series(values.values, dtype="float64")
        return float(((x - x_mean) * (y - y.mean())).sum() / x_var)

    return series.rolling(window).apply(slope, raw=False)
