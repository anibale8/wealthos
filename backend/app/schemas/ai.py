from typing import Literal

from pydantic import BaseModel

ChatRole = Literal["user", "assistant"]


class ChatMessage(BaseModel):
    role: ChatRole
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    include_portfolio: bool = True


class FundHolding(BaseModel):
    name: str
    weight_pct: float | None = None


class FundAnalysis(BaseModel):
    fund_name: str
    isin: str | None = None
    ter: float | None = None
    risk_level: int | None = None
    benchmark: str | None = None
    returns_1y: float | None = None
    returns_3y: float | None = None
    top_holdings: list[FundHolding] = []
    summary: str
    key_risks: list[str] = []


class FundComparisonRequest(BaseModel):
    isins: list[str]


class FundComparisonRow(BaseModel):
    isin: str
    name: str
    ter: float | None = None
    risk_level: int | None = None
    category: str | None = None
    returns_1y: float | None = None
    returns_3y: float | None = None


class FundComparison(BaseModel):
    funds: list[FundComparisonRow]
    comparison_table: str
    recommendation: str
    overlap_pct: float | None = None


class ScenarioRequest(BaseModel):
    scenario: str


class PositionImpact(BaseModel):
    ticker: str
    name: str
    impact_pct: float
    rationale: str


class ScenarioAnalysis(BaseModel):
    scenario_summary: str
    impact_by_position: list[PositionImpact]
    portfolio_impact_pct: float
    recommendations: list[str] = []


class BiasFinding(BaseModel):
    type: str
    description: str
    evidence: str
    severity: Literal["leve", "moderado", "alto"]
    recommendation: str


class BiasAnalysis(BaseModel):
    biases_detected: list[BiasFinding]
