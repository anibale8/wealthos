"""Indicadores técnicos (RSI, MACD, Bollinger, ATR, OBV, Stochastic) vía la librería `ta`."""

import pandas as pd
from ta.momentum import RSIIndicator, StochasticOscillator
from ta.trend import MACD
from ta.volatility import AverageTrueRange, BollingerBands
from ta.volume import OnBalanceVolumeIndicator


def compute_technical_features(df: pd.DataFrame) -> pd.DataFrame:
    """Recibe un DataFrame OHLCV (columnas open/high/low/close/volume) y devuelve
    uno nuevo con las columnas de indicadores técnicos añadidas.

    Los primeros días de cada indicador son NaN (periodo de calentamiento de las
    medias móviles); se rellenan hacia adelante y, si aún quedan NaN al principio
    de la serie, hacia atrás.
    """
    out = df.copy()

    out["rsi_14"] = RSIIndicator(close=df["close"], window=14).rsi()

    macd = MACD(close=df["close"], window_slow=26, window_fast=12, window_sign=9)
    out["macd"] = macd.macd()
    out["macd_signal"] = macd.macd_signal()
    out["macd_hist"] = macd.macd_diff()

    bb = BollingerBands(close=df["close"], window=20, window_dev=2)
    bb_high, bb_low = bb.bollinger_hband(), bb.bollinger_lband()
    # Posición relativa del precio dentro de las bandas: 0 = banda inferior, 1 = banda superior
    out["bb_pct"] = (df["close"] - bb_low) / (bb_high - bb_low)

    out["atr_14"] = AverageTrueRange(high=df["high"], low=df["low"], close=df["close"], window=14).average_true_range()

    out["obv"] = OnBalanceVolumeIndicator(close=df["close"], volume=df["volume"]).on_balance_volume()

    stoch = StochasticOscillator(high=df["high"], low=df["low"], close=df["close"], window=14, smooth_window=3)
    out["stoch_k"] = stoch.stoch()
    out["stoch_d"] = stoch.stoch_signal()

    new_cols = ["rsi_14", "macd", "macd_signal", "macd_hist", "bb_pct", "atr_14", "obv", "stoch_k", "stoch_d"]
    out[new_cols] = out[new_cols].ffill().bfill()

    return out
