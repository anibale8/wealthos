"""Clasificador LightGBM (3 clases: SELL/HOLD/BUY) sobre el signo del retorno a 5 días.

Validación con TimeSeriesSplit(gap=5): el `gap` es OBLIGATORIO porque el target
(`ret_5d_fwd`) mira 5 días hacia el futuro — sin el hueco, las últimas filas del
fold de entrenamiento "verían" información que se solapa con el inicio del fold
de validación (data leakage temporal silencioso).
"""

import json
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import shap
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import TimeSeriesSplit

CONFIDENCE_THRESHOLD = 0.60
N_SPLITS = 5
GAP = 5
HORIZON_DAYS = 5

_LABEL_TO_CLASS = {-1: 0, 0: 1, 1: 2}  # SELL, HOLD, BUY → índices de clase de LightGBM
_CLASS_TO_ACTION = {0: "SELL", 1: "HOLD", 2: "BUY"}


def make_target(close: pd.Series, horizon: int = HORIZON_DAYS) -> pd.Series:
    """np.sign(retorno a `horizon` días) → {-1: SELL, 0: HOLD, 1: BUY}."""
    fwd_return = close.shift(-horizon) / close - 1
    return np.sign(fwd_return)


class LGBMTrainer:
    def __init__(self, ticker: str, params: dict | None = None):
        self.ticker = ticker
        self.params = params or {
            "objective": "multiclass",
            "num_class": 3,
            "n_estimators": 300,
            "learning_rate": 0.03,
            "max_depth": 5,
            "num_leaves": 24,
            "min_child_samples": 30,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "random_state": 42,
            "verbose": -1,
        }
        self.model: lgb.LGBMClassifier | None = None
        self.feature_names: list[str] = []
        self.fold_metrics: list[dict] = []

    def train(self, X: pd.DataFrame, y_raw: pd.Series) -> "LGBMTrainer":
        """X: features (sin target ni OHLCV). y_raw: serie con valores {-1, 0, 1}."""
        self.feature_names = list(X.columns)
        y = y_raw.map(_LABEL_TO_CLASS)

        splitter = TimeSeriesSplit(n_splits=N_SPLITS, gap=GAP)
        self.fold_metrics = []

        for fold, (train_idx, val_idx) in enumerate(splitter.split(X), start=1):
            model = lgb.LGBMClassifier(**self.params)
            model.fit(X.iloc[train_idx], y.iloc[train_idx])

            preds = model.predict(X.iloc[val_idx])
            self.fold_metrics.append({
                "fold": fold,
                "accuracy": round(accuracy_score(y.iloc[val_idx], preds), 4),
                "f1_macro": round(f1_score(y.iloc[val_idx], preds, average="macro"), 4),
                "n_train": int(len(train_idx)),
                "n_val": int(len(val_idx)),
            })

        # Modelo final: entrenado con todos los datos disponibles (tras validar con TS-CV)
        self.model = lgb.LGBMClassifier(**self.params)
        self.model.fit(X, y)
        return self

    def evaluate(self) -> list[dict]:
        if not self.fold_metrics:
            raise RuntimeError("Llama a train() antes de evaluate()")
        return self.fold_metrics

    def predict(self, X: pd.DataFrame) -> pd.DataFrame:
        """Devuelve un DataFrame con `action`, `confidence` y las probabilidades por clase."""
        if self.model is None:
            raise RuntimeError("El modelo no está entrenado")

        proba = self.model.predict_proba(X[self.feature_names])
        class_idx = proba.argmax(axis=1)
        confidence = proba.max(axis=1)

        return pd.DataFrame({
            "action": [_CLASS_TO_ACTION[i] for i in class_idx],
            "confidence": confidence,
            "proba_sell": proba[:, 0],
            "proba_hold": proba[:, 1],
            "proba_buy": proba[:, 2],
        }, index=X.index)

    def explain(self, X: pd.DataFrame, n_last: int = 1) -> list[dict]:
        """SHAP values (TreeExplainer) para las últimas `n_last` filas."""
        if self.model is None:
            raise RuntimeError("El modelo no está entrenado")

        explainer = shap.TreeExplainer(self.model)
        subset = X[self.feature_names].iloc[-n_last:]
        shap_values = explainer.shap_values(subset)

        # shap_values: lista de arrays (uno por clase) o array 3D según versión de SHAP/LightGBM
        results = []
        for row_i in range(len(subset)):
            row_shap = _extract_row_shap(shap_values, row_i)
            results.append({
                "date": subset.index[row_i].isoformat() if hasattr(subset.index[row_i], "isoformat") else str(subset.index[row_i]),
                "values": dict(zip(self.feature_names, [round(float(v), 5) for v in row_shap])),
            })
        return results

    def save(self, directory: str | Path, version: str) -> Path:
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"lgbm_{version}_{self.ticker}.pkl"

        joblib.dump({
            "model": self.model,
            "feature_names": self.feature_names,
            "confidence_threshold": CONFIDENCE_THRESHOLD,
            "fold_metrics": self.fold_metrics,
            "ticker": self.ticker,
            "version": version,
        }, path)
        return path

    @classmethod
    def load(cls, path: str | Path) -> "LGBMTrainer":
        data = joblib.load(path)
        trainer = cls(ticker=data["ticker"])
        trainer.model = data["model"]
        trainer.feature_names = data["feature_names"]
        trainer.fold_metrics = data["fold_metrics"]
        return trainer

    def metrics_summary(self) -> dict:
        if not self.fold_metrics:
            return {}
        accs = [m["accuracy"] for m in self.fold_metrics]
        f1s = [m["f1_macro"] for m in self.fold_metrics]
        return {
            "accuracy_mean": round(float(np.mean(accs)), 4),
            "f1_macro_mean": round(float(np.mean(f1s)), 4),
            "folds": self.fold_metrics,
        }


def _extract_row_shap(shap_values, row_i: int) -> np.ndarray:
    """Normaliza la salida de TreeExplainer.shap_values a un vector 1D para una fila,
    usando la clase con mayor magnitud (la que más influye en la predicción final)."""
    if isinstance(shap_values, list):
        # Una matriz (n_samples, n_features) por clase
        per_class = np.stack([sv[row_i] for sv in shap_values])
    else:
        arr = np.asarray(shap_values)
        if arr.ndim == 3:
            # (n_samples, n_features, n_classes) → transponer a (n_classes, n_features)
            per_class = arr[row_i].T
        else:
            return arr[row_i]

    magnitudes = np.abs(per_class).sum(axis=1)
    return per_class[int(magnitudes.argmax())]
