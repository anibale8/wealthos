"""Retornos logarítmicos, momentum a varios horizontes y reversión a la media."""

import numpy as np
import pandas as pd

# (nombre_columna, nº de días)
_RETURN_HORIZONS = (("ret_1d", 1), ("ret_5d", 5), ("ret_10d", 10), ("ret_20d", 20), ("ret_60d", 60))
_MOMENTUM_HORIZONS = (("mom_1m", 21), ("mom_3m", 63), ("mom_6m", 126), ("mom_12m", 252))


def compute_momentum_features(df: pd.DataFrame) -> pd.DataFrame:
    """Añade retornos logarítmicos, momentum y una señal de reversión a la media.

    IMPORTANTE: `ret_1d_fwd` es el target de entrenamiento (retorno del día siguiente)
    y NUNCA debe usarse como feature — un modelo que lo viera haría data leakage.
    """
    out = df.copy()
    log_close = np.log(df["close"])

    for name, horizon in _RETURN_HORIZONS:
        out[name] = log_close.diff(horizon)

    for name, horizon in _MOMENTUM_HORIZONS:
        out[name] = df["close"].pct_change(horizon)

    # Reversión a la media: retorno de los últimos 5 días (en negativo, una caída
    # reciente sugiere posible rebote, y viceversa)
    out["mom_reversal"] = -out["ret_5d"]

    # Target de entrenamiento — excluir siempre de la lista de features del modelo
    out["ret_1d_fwd"] = log_close.shift(-1) - log_close

    return out
