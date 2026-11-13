from datetime import date

from pydantic import BaseModel


class AssetSearchResult(BaseModel):
    ticker: str
    name: str
    asset_class: str
    exchange: str | None = None
    currency: str | None = None


class PriceResponse(BaseModel):
    price: float
    change: float
    change_pct: float
    volume: float | None = None
    market_cap: float | None = None


class OHLCVPoint(BaseModel):
    date: date
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float
    volume: float | None = None
    adj_close: float | None = None


class AssetInfo(BaseModel):
    name: str | None = None
    sector: str | None = None
    country: str | None = None
    isin: str | None = None
    description: str | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None
    currency: str | None = None


class AssetFundamentals(BaseModel):
    pe_ratio: float | None = None
    pb_ratio: float | None = None
    dividend_yield: float | None = None
    beta: float | None = None
