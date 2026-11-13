"""Seed de datos de demo: 5 activos, ~2 años de operaciones realistas con precios
reales (yfinance), snapshots históricos reconstruidos y señales ML de prueba.

Uso (con el backend instalado):
    cd backend && python -m app.scripts.seed_demo_data
"""

import json
import random
from datetime import date, datetime, timedelta

from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.asset import Asset
from app.models.signal import Signal
from app.models.snapshot import PortfolioSnapshot
from app.models.transaction import Transaction
from app.services import market_data

random.seed(42)

DEMO_ASSETS = [
    {"ticker": "AAPL", "name": "Apple Inc.", "asset_class": "equity", "currency": "USD",
     "exchange": "NASDAQ", "sector": "Technology", "country": "United States"},
    {"ticker": "MSFT", "name": "Microsoft Corporation", "asset_class": "equity", "currency": "USD",
     "exchange": "NASDAQ", "sector": "Technology", "country": "United States"},
    {"ticker": "IBE.MC", "name": "Iberdrola S.A.", "asset_class": "equity", "currency": "EUR",
     "exchange": "BME", "sector": "Utilities", "country": "Spain"},
    {"ticker": "VWRL.L", "name": "Vanguard FTSE All-World UCITS ETF", "asset_class": "etf", "currency": "USD",
     "exchange": "LSE", "sector": None, "country": None},
    {"ticker": "BTC-USD", "name": "Bitcoin", "asset_class": "crypto", "currency": "USD",
     "exchange": None, "sector": None, "country": None},
]

# Importe aproximado por compra periódica, en la divisa del activo
INVESTMENT_PER_BUY = {
    "AAPL": 1500.0,
    "MSFT": 1500.0,
    "IBE.MC": 800.0,
    "VWRL.L": 1200.0,
    "BTC-USD": 600.0,
}

N_BUYS_PER_TICKER = 7

# Señales ML de prueba: 3 BUY, 1 SELL, 1 HOLD (ver criterio de éxito de la FASE 5)
SIGNAL_PLAN = [
    ("AAPL", "BUY", 0.78, 0.062),
    ("MSFT", "BUY", 0.71, 0.041),
    ("VWRL.L", "BUY", 0.66, 0.028),
    ("IBE.MC", "SELL", 0.69, -0.035),
    ("BTC-USD", "HOLD", 0.58, 0.008),
]
SIGNAL_MODEL_VERSION = "demo_v1"


def _get_or_create_asset(db, spec: dict) -> Asset:
    asset = db.scalar(select(Asset).where(Asset.ticker == spec["ticker"]))
    if asset is not None:
        return asset
    asset = Asset(**spec)
    db.add(asset)
    db.flush()
    return asset


def _price_series(db, ticker: str) -> list[tuple[date, float]]:
    """Descarga ~2 años de histórico (cacheado en la tabla `prices`) ordenado por fecha."""
    rows = market_data.get_ohlcv(db, ticker, period="2y", interval="1d")
    return sorted(((r["date"], r["close"]) for r in rows if r["close"]), key=lambda x: x[0])


def _price_on_or_after(series: list[tuple[date, float]], target: date) -> tuple[date, float] | None:
    for d, close in series:
        if d >= target:
            return d, close
    return series[-1] if series else None


def _seed_transactions(db, asset: Asset, series: list[tuple[date, float]]) -> None:
    """Genera compras escalonadas (DCA) más un dividendo de prueba para activos de renta variable.

    Sustituye cualquier operación previa del activo para dejar un dataset de demo consistente
    (p. ej. la cartera de prueba mínima sembrada manualmente durante la verificación de FASE 2)."""
    if not series:
        return
    if asset.transactions:
        for tx in list(asset.transactions):
            db.delete(tx)
        db.flush()

    start, end = series[0][0], series[-1][0]
    span_days = (end - start).days
    if span_days <= 0:
        return

    investment = INVESTMENT_PER_BUY.get(asset.ticker, 1000.0)
    step = span_days / N_BUYS_PER_TICKER
    held = 0.0

    for i in range(N_BUYS_PER_TICKER):
        target = start + timedelta(days=int(step * i) + random.randint(0, 5))
        match = _price_on_or_after(series, target)
        if match is None:
            continue
        tx_date, price = match
        amount = investment * random.uniform(0.85, 1.15)

        if asset.asset_class == "crypto":
            quantity = round(amount / price, 6)
        elif asset.asset_class in ("equity", "etf"):
            quantity = float(max(1, round(amount / price)))
        else:
            quantity = round(amount / price, 4)

        held += quantity
        db.add(Transaction(
            asset=asset, type="buy", quantity=quantity, price=round(price, 2),
            fees=round(amount * 0.001, 2), date=tx_date, notes="Compra periódica (demo)",
        ))

    if asset.ticker in ("AAPL", "MSFT", "VWRL.L") and held > 0:
        dividend_target = start + timedelta(days=int(span_days * 0.6))
        match = _price_on_or_after(series, dividend_target)
        if match is not None:
            div_date, price = match
            per_share = round(price * 0.0045, 4)  # yield trimestral aproximado
            db.add(Transaction(
                asset=asset, type="dividend", quantity=held, price=per_share,
                fees=0.0, date=div_date, notes="Dividendo trimestral (demo)",
            ))


def _value_at(series: list[tuple[date, float]], target: date) -> float | None:
    """Último cierre conocido en o antes de `target` (forward-fill)."""
    last = None
    for d, close in series:
        if d > target:
            break
        last = close
    return last if last is not None else (series[0][1] if series else None)


def _rebuild_snapshots(db, assets: list[Asset], price_series: dict[str, list[tuple[date, float]]]) -> None:
    """Reconstruye snapshots diarios del portfolio combinando transacciones e históricos de precio reales."""
    db.query(PortfolioSnapshot).delete()

    non_empty = {ticker: series for ticker, series in price_series.items() if series}
    if not non_empty:
        return

    reference_ticker = max(non_empty, key=lambda t: len(non_empty[t]))
    timeline = [d for d, _ in non_empty[reference_ticker]]
    transactions_by_asset = {asset.id: sorted(asset.transactions, key=lambda t: t.date) for asset in assets}

    for day in timeline:
        total_value = 0.0
        total_cost = 0.0
        breakdown = []

        for asset in assets:
            quantity = 0.0
            cost_basis = 0.0
            for tx in transactions_by_asset[asset.id]:
                if tx.date > day:
                    break
                if tx.type == "buy":
                    cost_basis += tx.quantity * tx.price + tx.fees
                    quantity += tx.quantity
                elif tx.type == "sell" and quantity > 0:
                    avg_cost = cost_basis / quantity
                    cost_basis -= avg_cost * tx.quantity
                    quantity -= tx.quantity

            if quantity <= 0:
                continue

            close = _value_at(non_empty.get(asset.ticker, []), day)
            if close is None:
                continue

            value = quantity * close
            total_value += value
            total_cost += cost_basis
            breakdown.append({"ticker": asset.ticker, "quantity": quantity, "value": round(value, 2)})

        if total_value <= 0:
            continue

        db.add(PortfolioSnapshot(
            date=day, total_value=round(total_value, 2), total_cost=round(total_cost, 2),
            positions_json=json.dumps(breakdown),
        ))


def _seed_signals(db) -> None:
    db.query(Signal).filter(Signal.model_version == SIGNAL_MODEL_VERSION).delete()
    now = datetime.utcnow()
    for ticker, action, confidence, predicted_return in SIGNAL_PLAN:
        db.add(Signal(
            ticker=ticker, action=action, confidence=confidence, predicted_return=predicted_return,
            horizon_days=30, model_version=SIGNAL_MODEL_VERSION,
            generated_at=now, expires_at=now + timedelta(days=7),
        ))


def run_seed(db) -> dict:
    """Seed usable desde una sesión existente (p. ej. endpoint /settings/seed)."""
    assets = [_get_or_create_asset(db, spec) for spec in DEMO_ASSETS]
    db.flush()

    price_series: dict[str, list[tuple[date, float]]] = {}
    for asset in assets:
        series = _price_series(db, asset.ticker)
        price_series[asset.ticker] = series
        _seed_transactions(db, asset, series)

    db.commit()
    for asset in assets:
        db.refresh(asset)

    _rebuild_snapshots(db, assets, price_series)
    _seed_signals(db)
    db.commit()

    n_transactions = sum(len(a.transactions) for a in assets)
    n_snapshots = db.scalar(select(func.count()).select_from(PortfolioSnapshot)) or 0
    return {
        "assets": len(assets),
        "transactions": n_transactions,
        "snapshots": n_snapshots,
        "signals": len(SIGNAL_PLAN),
    }


def main() -> None:
    db = SessionLocal()
    try:
        result = run_seed(db)
        print(
            f"Listo: {result['assets']} activos, {result['transactions']} operaciones, "
            f"{result['snapshots']} snapshots históricos, {result['signals']} señales de prueba."
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
