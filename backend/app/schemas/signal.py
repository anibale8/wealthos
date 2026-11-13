from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

SignalAction = Literal["BUY", "HOLD", "SELL"]


class SignalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticker: str
    action: SignalAction
    confidence: float
    predicted_return: float | None
    horizon_days: int
    model_version: str
    shap_values: dict[str, float] | None
    generated_at: datetime
    expires_at: datetime | None


class PredictionPoint(BaseModel):
    date: str
    value: float
    lower: float
    upper: float


class PredictionResponse(BaseModel):
    ticker: str
    horizon_days: int
    predictions: list[PredictionPoint]
    confidence: float
    predicted_return: float
    shap_values: dict[str, float]


class EquityPoint(BaseModel):
    date: str
    value: float
    benchmark: float


class TradeRecord(BaseModel):
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    pnl: float
    pnl_pct: float


class BacktestSummary(BaseModel):
    total_return: float
    sharpe_ratio: float | None
    sortino_ratio: float | None
    max_drawdown: float
    hit_rate: float | None = None
    profit_factor: float | None = None
    n_trades: int | None = None
    trades: list[TradeRecord] | None = None


class BacktestResponse(BaseModel):
    ticker: str
    initial_capital: float
    equity_curve: list[EquityPoint]
    strategy: BacktestSummary
    benchmark: BacktestSummary


class TrainRequest(BaseModel):
    tickers: list[str]
