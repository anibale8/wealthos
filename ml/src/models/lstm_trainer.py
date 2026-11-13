"""LSTM de regresión: predice el retorno esperado a `horizon_days` a partir de
una secuencia de 60 días de features.

Normalización con MinMaxScaler ajustado SOLO sobre la ventana de 252 días previa
a cada secuencia (sin look-ahead: el escalador nunca ve datos futuros).
"""

from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.preprocessing import MinMaxScaler
from torch import nn
from torch.utils.data import DataLoader, Dataset

SEQUENCE_LENGTH = 60
SCALER_WINDOW = 252
DEFAULT_HORIZON = 30


class _SequenceDataset(Dataset):
    """Genera secuencias de longitud `SEQUENCE_LENGTH` con stride 1, normalizando
    cada una con un MinMaxScaler ajustado sobre los `SCALER_WINDOW` días previos."""

    def __init__(self, features: np.ndarray, targets: np.ndarray):
        self.sequences: list[np.ndarray] = []
        self.targets: list[float] = []

        start = SCALER_WINDOW
        for end in range(start, len(features)):
            seq_start = end - SEQUENCE_LENGTH
            if seq_start < 0:
                continue

            scaler_slice = features[end - SCALER_WINDOW:end]
            scaler = MinMaxScaler().fit(scaler_slice)

            seq = scaler.transform(features[seq_start:end])
            self.sequences.append(seq.astype("float32"))
            self.targets.append(float(targets[end - 1]))

    def __len__(self) -> int:
        return len(self.sequences)

    def __getitem__(self, idx: int):
        return torch.from_numpy(self.sequences[idx]), torch.tensor(self.targets[idx], dtype=torch.float32)


class LSTMRegressor(nn.Module):
    """LSTM(128) → Dropout(0.2) → LSTM(64) → Dense(1)."""

    def __init__(self, n_features: int):
        super().__init__()
        self.lstm1 = nn.LSTM(input_size=n_features, hidden_size=128, batch_first=True)
        self.dropout = nn.Dropout(0.2)
        self.lstm2 = nn.LSTM(input_size=128, hidden_size=64, batch_first=True)
        self.head = nn.Linear(64, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.lstm1(x)
        out = self.dropout(out)
        out, _ = self.lstm2(out)
        return self.head(out[:, -1, :]).squeeze(-1)


class LSTMTrainer:
    def __init__(self, ticker: str, horizon_days: int = DEFAULT_HORIZON, *, patience: int = 10, max_epochs: int = 100):
        self.ticker = ticker
        self.horizon_days = horizon_days
        self.patience = patience
        self.max_epochs = max_epochs
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        self.model: LSTMRegressor | None = None
        self.feature_names: list[str] = []
        self.history: list[dict] = []

    def _make_target(self, close: pd.Series) -> pd.Series:
        return close.shift(-self.horizon_days) / close - 1

    def train(self, X: pd.DataFrame, close: pd.Series, *, val_fraction: float = 0.15) -> "LSTMTrainer":
        self.feature_names = list(X.columns)
        target = self._make_target(close)

        valid = target.notna() & X.notna().all(axis=1)
        features = X[valid].to_numpy(dtype="float64")
        targets = target[valid].to_numpy(dtype="float64")

        dataset = _SequenceDataset(features, targets)
        if len(dataset) < 50:
            raise ValueError(f"Datos insuficientes para entrenar LSTM ({len(dataset)} secuencias)")

        split = int(len(dataset) * (1 - val_fraction))
        train_ds = torch.utils.data.Subset(dataset, range(0, split))
        val_ds = torch.utils.data.Subset(dataset, range(split, len(dataset)))

        train_loader = DataLoader(train_ds, batch_size=32, shuffle=True)
        val_loader = DataLoader(val_ds, batch_size=64, shuffle=False)

        self.model = LSTMRegressor(n_features=features.shape[1]).to(self.device)
        optimizer = torch.optim.Adam(self.model.parameters(), lr=1e-3)
        loss_fn = nn.HuberLoss()

        best_val_loss = float("inf")
        best_state = None
        epochs_without_improvement = 0
        self.history = []

        for epoch in range(1, self.max_epochs + 1):
            train_loss = self._run_epoch(train_loader, optimizer, loss_fn, training=True)
            val_loss = self._run_epoch(val_loader, optimizer, loss_fn, training=False)
            self.history.append({"epoch": epoch, "train_loss": round(train_loss, 6), "val_loss": round(val_loss, 6)})

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_state = {k: v.clone() for k, v in self.model.state_dict().items()}
                epochs_without_improvement = 0
            else:
                epochs_without_improvement += 1
                if epochs_without_improvement >= self.patience:
                    break

        if best_state is not None:
            self.model.load_state_dict(best_state)

        return self

    def _run_epoch(self, loader: DataLoader, optimizer, loss_fn, *, training: bool) -> float:
        assert self.model is not None
        self.model.train(training)
        total_loss, n_batches = 0.0, 0

        context = torch.enable_grad() if training else torch.no_grad()
        with context:
            for batch_x, batch_y in loader:
                batch_x, batch_y = batch_x.to(self.device), batch_y.to(self.device)
                preds = self.model(batch_x)
                loss = loss_fn(preds, batch_y)

                if training:
                    optimizer.zero_grad()
                    loss.backward()
                    optimizer.step()

                total_loss += loss.item()
                n_batches += 1

        return total_loss / max(n_batches, 1)

    def predict_last(self, X: pd.DataFrame) -> float:
        """Predicción de retorno esperado para la última secuencia disponible."""
        if self.model is None:
            raise RuntimeError("El modelo no está entrenado")

        features = X[self.feature_names].to_numpy(dtype="float64")
        if len(features) < SEQUENCE_LENGTH:
            raise ValueError("Se necesitan al menos 60 días de histórico para predecir")

        scaler_slice = features[-SCALER_WINDOW:] if len(features) >= SCALER_WINDOW else features
        scaler = MinMaxScaler().fit(scaler_slice)
        seq = scaler.transform(features[-SEQUENCE_LENGTH:]).astype("float32")

        self.model.eval()
        with torch.no_grad():
            tensor = torch.from_numpy(seq).unsqueeze(0).to(self.device)
            return float(self.model(tensor).item())

    def save(self, directory: str | Path, version: str) -> Path:
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"lstm_{version}_{self.ticker}.pt"

        torch.save({
            "state_dict": self.model.state_dict(),
            "feature_names": self.feature_names,
            "horizon_days": self.horizon_days,
            "n_features": len(self.feature_names),
            "history": self.history,
            "ticker": self.ticker,
            "version": version,
        }, path)
        return path

    @classmethod
    def load(cls, path: str | Path) -> "LSTMTrainer":
        checkpoint = torch.load(path, map_location="cpu", weights_only=False)
        trainer = cls(ticker=checkpoint["ticker"], horizon_days=checkpoint["horizon_days"])
        trainer.feature_names = checkpoint["feature_names"]
        trainer.history = checkpoint["history"]
        trainer.model = LSTMRegressor(n_features=checkpoint["n_features"])
        trainer.model.load_state_dict(checkpoint["state_dict"])
        trainer.model.to(trainer.device)
        return trainer
