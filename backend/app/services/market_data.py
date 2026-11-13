"""Wrapper sobre yfinance: búsqueda de activos, precios, OHLCV (con caché en BD) y fundamentales."""

import time
from datetime import date, timedelta

import yfinance as yf
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.price import Price

_QUOTE_TYPE_TO_ASSET_CLASS = {
    "EQUITY": "equity",
    "ETF": "etf",
    "MUTUALFUND": "fund",
    "CRYPTOCURRENCY": "crypto",
    "INDEX": "etf",
    "CURRENCY": "cash",
    "FUTURE": "etf",
}

_PERIOD_TO_DAYS = {
    "1mo": 31,
    "3mo": 92,
    "6mo": 183,
    "1y": 366,
    "2y": 731,
    "5y": 1827,
    "10y": 3654,
    "ytd": 366,
    "max": 36500,
}

# Caché en memoria con TTL para get_current_price: {ticker: (timestamp, data)}
_price_cache: dict[str, tuple[float, dict]] = {}


def _ticker(symbol: str) -> yf.Ticker:
    return yf.Ticker(symbol)


def search_asset(query: str, limit: int = 10) -> list[dict]:
    """Busca activos por ticker, ISIN o nombre usando la búsqueda de Yahoo Finance."""
    results = yf.Search(query, max_results=limit).quotes
    return [
        {
            "ticker": r.get("symbol"),
            "name": r.get("shortname") or r.get("longname") or r.get("symbol"),
            "asset_class": _QUOTE_TYPE_TO_ASSET_CLASS.get(r.get("quoteType", ""), "equity"),
            "exchange": r.get("exchange"),
            "currency": r.get("currency"),
        }
        for r in results
    ]


def get_current_price(ticker: str) -> dict | None:
    """Precio actual con variación diaria. Cacheado en memoria con TTL `settings.yfinance_cache_ttl`."""
    now = time.monotonic()
    cached = _price_cache.get(ticker)
    if cached and now - cached[0] < settings.yfinance_cache_ttl:
        return cached[1]

    fast = _ticker(ticker).fast_info
    if not fast:
        return None

    last_price = fast.get("lastPrice")
    previous_close = fast.get("previousClose")
    if last_price is None:
        return None

    change = (last_price - previous_close) if previous_close else 0.0
    change_pct = (change / previous_close * 100) if previous_close else 0.0

    data = {
        "price": float(last_price),
        "change": float(change),
        "change_pct": float(change_pct),
        "volume": fast.get("lastVolume"),
        "market_cap": fast.get("marketCap"),
    }
    _price_cache[ticker] = (now, data)
    return data


def get_fx_rate(from_currency: str, to_currency: str) -> float:
    """Tipo de cambio actual (1 from = X to) desde Yahoo, p. ej. USDEUR=X. Si falla, devuelve 1.0."""
    if not from_currency or not to_currency or from_currency.upper() == to_currency.upper():
        return 1.0
    data = get_current_price(f"{from_currency.upper()}{to_currency.upper()}=X")
    return data["price"] if data and data.get("price") else 1.0


def get_ohlcv(db: Session, ticker: str, period: str = "1y", interval: str = "1d") -> list[dict]:
    """OHLCV con caché en la tabla `prices`. Solo cachea velas diarias (interval='1d')."""
    if interval != "1d":
        df = _ticker(ticker).history(period=period, interval=interval)
        return _dataframe_to_ohlcv(df)

    days = _PERIOD_TO_DAYS.get(period, 366)
    start = date.today() - timedelta(days=days)

    cached_rows = db.scalars(
        select(Price)
        .where(Price.ticker == ticker, Price.date >= start)
        .order_by(Price.date)
    ).all()

    has_today = bool(cached_rows) and cached_rows[-1].date >= date.today() - timedelta(days=1)
    if cached_rows and has_today:
        return [_price_row_to_dict(row) for row in cached_rows]

    df = _ticker(ticker).history(period=period, interval=interval)
    rows = _dataframe_to_ohlcv(df)
    _upsert_prices(db, ticker, rows)
    return rows


def _dataframe_to_ohlcv(df) -> list[dict]:
    return [
        {
            "date": idx.date() if hasattr(idx, "date") else idx,
            "open": float(row["Open"]) if row.get("Open") == row.get("Open") else None,
            "high": float(row["High"]) if row.get("High") == row.get("High") else None,
            "low": float(row["Low"]) if row.get("Low") == row.get("Low") else None,
            "close": float(row["Close"]),
            "volume": float(row["Volume"]) if row.get("Volume") == row.get("Volume") else None,
            "adj_close": float(row["Adj Close"]) if "Adj Close" in row and row["Adj Close"] == row["Adj Close"] else None,
        }
        for idx, row in df.iterrows()
    ]


def _price_row_to_dict(row: Price) -> dict:
    return {
        "date": row.date,
        "open": row.open,
        "high": row.high,
        "low": row.low,
        "close": row.close,
        "volume": row.volume,
        "adj_close": row.adj_close,
    }


def _upsert_prices(db: Session, ticker: str, rows: list[dict]) -> None:
    if not rows:
        return
    values = [{"ticker": ticker, **row} for row in rows]
    stmt = sqlite_insert(Price).values(values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Price.ticker, Price.date],
        set_={
            "open": stmt.excluded.open,
            "high": stmt.excluded.high,
            "low": stmt.excluded.low,
            "close": stmt.excluded.close,
            "volume": stmt.excluded.volume,
            "adj_close": stmt.excluded.adj_close,
        },
    )
    db.execute(stmt)
    db.commit()


def get_asset_info(ticker: str) -> dict:
    info = _ticker(ticker).get_info()
    return {
        "name": info.get("shortName") or info.get("longName"),
        "sector": info.get("sector"),
        "country": info.get("country"),
        "isin": info.get("isin"),
        "description": info.get("longBusinessSummary"),
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        "currency": info.get("currency"),
    }


def get_fundamentals(ticker: str) -> dict:
    info = _ticker(ticker).get_info()
    return {
        "pe_ratio": info.get("trailingPE"),
        "pb_ratio": info.get("priceToBook"),
        "dividend_yield": info.get("dividendYield"),
        "beta": info.get("beta"),
    }


def get_top_holdings(ticker: str) -> list[dict]:
    """Top holdings de un fondo/ETF: [{name, weight_pct}]. Vacío si no aplica (acciones, cripto...)."""
    try:
        funds_data = _ticker(ticker).get_funds_data()
        top = funds_data.top_holdings
        if top is None or top.empty:
            return []
        name_col = "Name" if "Name" in top.columns else top.columns[0]
        weight_col = "Holding Percent" if "Holding Percent" in top.columns else top.columns[-1]
        return [
            {"name": str(row[name_col]), "weight_pct": float(row[weight_col]) * 100}
            for _, row in top.iterrows()
        ]
    except Exception:
        return []
