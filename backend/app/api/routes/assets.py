from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.asset import (
    AssetFundamentals,
    AssetInfo,
    AssetSearchResult,
    OHLCVPoint,
    PriceResponse,
)
from app.services import market_data

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/search", response_model=list[AssetSearchResult])
def search(q: str, limit: int = 10) -> list[dict]:
    return market_data.search_asset(q, limit=limit)


@router.get("/{ticker}/price", response_model=PriceResponse)
def get_price(ticker: str) -> dict:
    data = market_data.get_current_price(ticker)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No se encontró precio para '{ticker}'")
    return data


@router.get("/{ticker}/history", response_model=list[OHLCVPoint])
def get_history(
    ticker: str, period: str = "1y", interval: str = "1d", db: Session = Depends(get_db)
) -> list[dict]:
    return market_data.get_ohlcv(db, ticker, period=period, interval=interval)


@router.get("/{ticker}/info", response_model=AssetInfo)
def get_info(ticker: str) -> dict:
    return market_data.get_asset_info(ticker)


@router.get("/{ticker}/metrics", response_model=AssetFundamentals)
def get_metrics(ticker: str) -> dict:
    return market_data.get_fundamentals(ticker)
