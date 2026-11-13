from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

AssetClass = Literal["equity", "etf", "fund", "crypto", "bond", "real_estate", "cash"]
TransactionType = Literal["buy", "sell", "dividend", "split", "fee"]


class PortfolioSummary(BaseModel):
    total_value: float
    total_cost: float
    total_pnl: float
    total_pnl_pct: float
    daily_change: float
    daily_change_pct: float
    currency: str
    n_positions: int


class Position(BaseModel):
    id: int
    ticker: str
    name: str
    asset_class: AssetClass
    quantity: float
    avg_cost: float
    current_price: float
    current_value: float
    pnl: float
    pnl_pct: float
    weight: float
    currency: str
    daily_change_pct: float


class RiskMetrics(BaseModel):
    volatility_annual: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    var_95: float
    beta: float | None = None


class SnapshotPoint(BaseModel):
    date: date
    total_value: float
    total_cost: float


class DividendEntry(BaseModel):
    ticker: str
    amount: float
    date: date
    projected_annual: float


class CorrelationMatrix(BaseModel):
    tickers: list[str]
    matrix: list[list[float]]


class OverlapPair(BaseModel):
    ticker_a: str
    ticker_b: str
    overlap_pct: float
    shared_holdings: list[str]


class RebalanceRow(BaseModel):
    asset_class: AssetClass
    current_pct: float
    target_pct: float
    diff_pct: float
    current_value: float
    target_value: float


class RebalanceTrade(BaseModel):
    ticker: str
    asset_class: AssetClass
    action: Literal["buy", "sell"]
    amount: float
    approx_quantity: float


class RebalanceSuggestion(BaseModel):
    rows: list[RebalanceRow]
    trades: list[RebalanceTrade]


class TaxSummary(BaseModel):
    fiscal_year: int
    realized_gains_short_term: float
    realized_gains_long_term: float
    realized_gains_total: float
    estimated_tax: float
    unrealized_gains: float
    effective_rate: float | None = None


class TransactionCreate(BaseModel):
    ticker: str
    type: TransactionType
    quantity: float
    price: float
    fees: float = 0
    date: date
    notes: str | None = None
    # Metadata to auto-create the asset if it doesn't exist yet
    asset_name: str | None = None
    asset_class: AssetClass | None = None
    asset_exchange: str | None = None
    asset_currency: str | None = None


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    asset_id: int
    type: TransactionType
    quantity: float
    price: float
    fees: float
    date: date
    notes: str | None
    created_at: datetime
