"""Cálculo de posiciones y resumen del portfolio a partir del historial de operaciones."""

import json
import statistics
from datetime import date, timedelta
from math import sqrt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.asset import Asset
from app.models.snapshot import PortfolioSnapshot
from app.models.transaction import Transaction
from app.schemas.portfolio import (
    CorrelationMatrix,
    DividendEntry,
    OverlapPair,
    PortfolioSummary,
    Position,
    RebalanceRow,
    RebalanceSuggestion,
    RebalanceTrade,
    RiskMetrics,
    SnapshotPoint,
    TaxSummary,
)
from app.services import market_data

TRADING_DAYS_PER_YEAR = 252
RISK_FREE_RATE = 0.02
CORRELATION_PERIOD = "1y"
LONG_TERM_HOLDING_DAYS = 365

# Tramos IRPF 2024 sobre la base del ahorro (plusvalías): (límite_superior, tipo)
IRPF_BRACKETS = [
    (6_000.0, 0.19),
    (50_000.0, 0.21),
    (200_000.0, 0.23),
    (float("inf"), 0.27),
]


def _build_positions(db: Session) -> list[Position]:
    assets = db.scalars(select(Asset)).all()
    positions: list[Position] = []

    for asset in assets:
        quantity = 0.0
        cost_basis = 0.0  # acumulado: coste medio ponderado

        for tx in sorted(asset.transactions, key=lambda t: t.date):
            if tx.type == "buy":
                cost_basis += tx.quantity * tx.price + tx.fees
                quantity += tx.quantity
            elif tx.type == "sell":
                if quantity > 0:
                    avg_cost = cost_basis / quantity
                    cost_basis -= avg_cost * tx.quantity
                quantity -= tx.quantity
            elif tx.type == "split" and tx.price:
                quantity *= tx.price
                # el coste total no cambia en un split

        if quantity <= 0:
            continue

        avg_cost = cost_basis / quantity if quantity else 0.0
        price_data = market_data.get_current_price(asset.ticker)
        current_price = price_data["price"] if price_data else avg_cost
        daily_change_pct = price_data["change_pct"] if price_data else 0.0
        # Todo se expresa en la divisa base (EUR) para poder sumar posiciones en distintas divisas.
        # Aproximación: el coste histórico se convierte al tipo de cambio actual.
        fx = market_data.get_fx_rate(asset.currency, settings.base_currency)
        avg_cost *= fx
        cost_basis *= fx
        current_price *= fx
        current_value = quantity * current_price
        pnl = current_value - cost_basis
        pnl_pct = (pnl / cost_basis * 100) if cost_basis else 0.0

        positions.append(
            Position(
                id=asset.id,
                ticker=asset.ticker,
                name=asset.name,
                asset_class=asset.asset_class,
                quantity=quantity,
                avg_cost=avg_cost,
                current_price=current_price,
                current_value=current_value,
                pnl=pnl,
                pnl_pct=pnl_pct,
                weight=0.0,  # se calcula tras conocer el valor total
                currency=settings.base_currency,
                daily_change_pct=daily_change_pct,
            )
        )

    total_value = sum(p.current_value for p in positions)
    if total_value:
        for p in positions:
            p.weight = p.current_value / total_value * 100

    return positions


def get_positions(db: Session) -> list[Position]:
    return _build_positions(db)


def get_summary(db: Session) -> PortfolioSummary:
    positions = _build_positions(db)

    total_value = sum(p.current_value for p in positions)
    total_cost = sum(p.avg_cost * p.quantity for p in positions)
    total_pnl = total_value - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost else 0.0

    # daily_change = suma de la variación diaria de cada posición (en valor absoluto)
    daily_change = sum(p.current_value * p.daily_change_pct / 100 for p in positions)
    previous_value = total_value - daily_change
    daily_change_pct = (daily_change / previous_value * 100) if previous_value else 0.0

    return PortfolioSummary(
        total_value=total_value,
        total_cost=total_cost,
        total_pnl=total_pnl,
        total_pnl_pct=total_pnl_pct,
        daily_change=daily_change,
        daily_change_pct=daily_change_pct,
        currency=settings.base_currency,
        n_positions=len(positions),
    )


def get_dividends(db: Session) -> list[DividendEntry]:
    """Historial de dividendos cobrados, con una proyección anual basada en los últimos 12 meses."""
    rows = db.execute(
        select(Transaction, Asset.ticker)
        .join(Asset, Transaction.asset_id == Asset.id)
        .where(Transaction.type == "dividend")
        .order_by(Transaction.date.desc())
    ).all()

    one_year_ago = date.today() - timedelta(days=365)
    trailing_by_ticker: dict[str, float] = {}
    for tx, ticker in rows:
        if tx.date >= one_year_ago:
            trailing_by_ticker[ticker] = trailing_by_ticker.get(ticker, 0.0) + tx.quantity * tx.price

    return [
        DividendEntry(
            ticker=ticker,
            amount=round(tx.quantity * tx.price, 2),
            date=tx.date,
            projected_annual=round(trailing_by_ticker.get(ticker, 0.0), 2),
        )
        for tx, ticker in rows
    ]


def get_history(db: Session, days: int = 365) -> list[SnapshotPoint]:
    snapshots = db.scalars(
        select(PortfolioSnapshot).order_by(PortfolioSnapshot.date.desc()).limit(days)
    ).all()
    return [
        SnapshotPoint(date=s.date, total_value=s.total_value, total_cost=s.total_cost)
        for s in reversed(snapshots)
    ]


def save_daily_snapshot(db: Session) -> None:
    """Crea o actualiza el snapshot del portfolio correspondiente al día de hoy."""
    today = date.today()
    positions = _build_positions(db)
    total_value = sum(p.current_value for p in positions)
    total_cost = sum(p.avg_cost * p.quantity for p in positions)
    positions_json = json.dumps([p.model_dump(mode="json") for p in positions])

    snapshot = db.scalar(select(PortfolioSnapshot).where(PortfolioSnapshot.date == today))
    if snapshot is None:
        snapshot = PortfolioSnapshot(date=today)
        db.add(snapshot)

    snapshot.total_value = total_value
    snapshot.total_cost = total_cost
    snapshot.positions_json = positions_json
    db.commit()


def calculate_risk_metrics(db: Session) -> RiskMetrics:
    """Métricas de riesgo a partir de la serie de valores diarios en `portfolio_snapshots`."""
    snapshots = db.scalars(select(PortfolioSnapshot).order_by(PortfolioSnapshot.date)).all()
    snaps = [s for s in snapshots if s.total_value > 0]

    # Rentabilidad diaria descontando aportaciones: (ΔValor − ΔAportado) / Valor previo.
    # Sin esto, cada compra cuenta como un día de subida y dispara volatilidad y Sortino.
    daily_returns = [
        (snaps[i].total_value - snaps[i - 1].total_value - (snaps[i].total_cost - snaps[i - 1].total_cost))
        / snaps[i - 1].total_value
        for i in range(1, len(snaps))
    ]
    # Índice de valor (base 1) para el drawdown, también sin aportaciones
    values = [1.0]
    for r in daily_returns:
        values.append(values[-1] * (1 + r))

    if len(daily_returns) < 2:
        return RiskMetrics(
            volatility_annual=0.0,
            sharpe_ratio=0.0,
            sortino_ratio=0.0,
            max_drawdown=0.0,
            var_95=0.0,
            beta=None,
        )

    mean_daily = statistics.mean(daily_returns)
    std_daily = statistics.pstdev(daily_returns)
    volatility_annual = std_daily * sqrt(TRADING_DAYS_PER_YEAR)
    return_annual = mean_daily * TRADING_DAYS_PER_YEAR
    sharpe_ratio = (return_annual - RISK_FREE_RATE) / volatility_annual if volatility_annual else 0.0

    downside_returns = [r for r in daily_returns if r < 0]
    downside_std_annual = (
        statistics.pstdev(downside_returns) * sqrt(TRADING_DAYS_PER_YEAR)
        if len(downside_returns) > 1
        else 0.0
    )
    sortino_ratio = (return_annual - RISK_FREE_RATE) / downside_std_annual if downside_std_annual else 0.0

    peak = values[0]
    max_drawdown = 0.0
    for v in values:
        peak = max(peak, v)
        drawdown = (v - peak) / peak if peak else 0.0
        max_drawdown = min(max_drawdown, drawdown)

    sorted_returns = sorted(daily_returns)
    var_95_index = max(0, round(len(sorted_returns) * 0.05) - 1)
    var_95 = sorted_returns[var_95_index]

    return RiskMetrics(
        volatility_annual=volatility_annual,
        sharpe_ratio=sharpe_ratio,
        sortino_ratio=sortino_ratio,
        max_drawdown=max_drawdown,
        var_95=var_95,
        beta=None,  # requiere histórico del benchmark — pendiente
    )


def _daily_returns_by_ticker(db: Session, tickers: list[str]) -> dict[str, dict[date, float]]:
    """Para cada ticker: {fecha: retorno_diario} a partir del cierre, alineable por fecha."""
    result: dict[str, dict[date, float]] = {}
    for ticker in tickers:
        rows = market_data.get_ohlcv(db, ticker, period=CORRELATION_PERIOD, interval="1d")
        closes = [(row["date"], row["close"]) for row in rows if row["close"] is not None]
        returns: dict[date, float] = {}
        for i in range(1, len(closes)):
            prev_date, prev_close = closes[i - 1]
            curr_date, curr_close = closes[i]
            if prev_close:
                returns[curr_date] = (curr_close - prev_close) / prev_close
        result[ticker] = returns
    return result


def _pearson_correlation(a: list[float], b: list[float]) -> float:
    if len(a) < 2 or len(b) < 2:
        return 0.0
    mean_a, mean_b = statistics.mean(a), statistics.mean(b)
    cov = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    std_a = sqrt(sum((x - mean_a) ** 2 for x in a))
    std_b = sqrt(sum((y - mean_b) ** 2 for y in b))
    if std_a == 0 or std_b == 0:
        return 0.0
    return cov / (std_a * std_b)


def calculate_correlations(db: Session) -> CorrelationMatrix:
    """Matriz de correlación de Pearson entre los retornos diarios de cada activo (último año)."""
    positions = _build_positions(db)
    tickers = [p.ticker for p in positions]
    if len(tickers) < 2:
        return CorrelationMatrix(tickers=tickers, matrix=[[1.0] * len(tickers)] if tickers else [])

    returns_by_ticker = _daily_returns_by_ticker(db, tickers)

    matrix: list[list[float]] = []
    for ticker_a in tickers:
        row: list[float] = []
        for ticker_b in tickers:
            if ticker_a == ticker_b:
                row.append(1.0)
                continue
            returns_a = returns_by_ticker[ticker_a]
            returns_b = returns_by_ticker[ticker_b]
            shared_dates = sorted(set(returns_a) & set(returns_b))
            series_a = [returns_a[d] for d in shared_dates]
            series_b = [returns_b[d] for d in shared_dates]
            row.append(round(_pearson_correlation(series_a, series_b), 4))
        matrix.append(row)

    return CorrelationMatrix(tickers=tickers, matrix=matrix)


def detect_overlaps(db: Session) -> list[OverlapPair]:
    """Solapamiento entre fondos/ETFs de la cartera, comparando sus top holdings."""
    positions = [p for p in _build_positions(db) if p.asset_class in ("etf", "fund")]
    holdings_by_ticker = {p.ticker: market_data.get_top_holdings(p.ticker) for p in positions}

    pairs: list[OverlapPair] = []
    for i, pos_a in enumerate(positions):
        for pos_b in positions[i + 1 :]:
            holdings_a = {h["name"]: h["weight_pct"] for h in holdings_by_ticker[pos_a.ticker]}
            holdings_b = {h["name"]: h["weight_pct"] for h in holdings_by_ticker[pos_b.ticker]}
            shared = sorted(set(holdings_a) & set(holdings_b))
            if not shared:
                continue
            overlap_pct = sum(min(holdings_a[name], holdings_b[name]) for name in shared)
            pairs.append(
                OverlapPair(
                    ticker_a=pos_a.ticker,
                    ticker_b=pos_b.ticker,
                    overlap_pct=round(overlap_pct, 2),
                    shared_holdings=shared,
                )
            )

    return sorted(pairs, key=lambda p: p.overlap_pct, reverse=True)


def suggest_rebalance(db: Session, target_weights: dict[str, float]) -> RebalanceSuggestion:
    """target_weights: {asset_class: peso_objetivo_pct}. Sugiere operaciones para alcanzarlos."""
    positions = _build_positions(db)
    total_value = sum(p.current_value for p in positions)

    by_class: dict[str, list[Position]] = {}
    for p in positions:
        by_class.setdefault(p.asset_class, []).append(p)

    rows: list[RebalanceRow] = []
    trades: list[RebalanceTrade] = []

    for asset_class, target_pct in target_weights.items():
        class_positions = by_class.get(asset_class, [])
        current_value = sum(p.current_value for p in class_positions)
        current_pct = (current_value / total_value * 100) if total_value else 0.0
        target_value = total_value * target_pct / 100
        diff_value = target_value - current_value

        rows.append(
            RebalanceRow(
                asset_class=asset_class,
                current_pct=round(current_pct, 2),
                target_pct=round(target_pct, 2),
                diff_pct=round(target_pct - current_pct, 2),
                current_value=round(current_value, 2),
                target_value=round(target_value, 2),
            )
        )

        if abs(diff_value) < 1.0 or not class_positions:
            continue

        action = "buy" if diff_value > 0 else "sell"
        # Reparte la diferencia entre las posiciones existentes de la clase, proporcional a su peso actual
        for p in class_positions:
            share = (p.current_value / current_value) if current_value else (1 / len(class_positions))
            amount = abs(diff_value) * share
            if amount < 1.0:
                continue
            trades.append(
                RebalanceTrade(
                    ticker=p.ticker,
                    asset_class=asset_class,
                    action=action,
                    amount=round(amount, 2),
                    approx_quantity=round(amount / p.current_price, 4) if p.current_price else 0.0,
                )
            )

    return RebalanceSuggestion(rows=rows, trades=trades)


def calculate_tax_impact(db: Session, fiscal_year: int | None = None) -> TaxSummary:
    """Estimación fiscal IRPF (España) sobre plusvalías realizadas en `fiscal_year` (año natural)."""
    fiscal_year = fiscal_year or date.today().year

    assets = db.scalars(select(Asset)).all()
    short_term_gains = 0.0
    long_term_gains = 0.0

    for asset in assets:
        lots: list[list] = []  # [quantity, price_per_unit, date] — FIFO
        for tx in sorted(asset.transactions, key=lambda t: t.date):
            if tx.type == "buy":
                cost_per_unit = tx.price + (tx.fees / tx.quantity if tx.quantity else 0.0)
                lots.append([tx.quantity, cost_per_unit, tx.date])
            elif tx.type == "sell":
                remaining = tx.quantity
                proceeds_per_unit = tx.price - (tx.fees / tx.quantity if tx.quantity else 0.0)
                while remaining > 1e-9 and lots:
                    lot = lots[0]
                    used = min(lot[0], remaining)
                    gain = used * (proceeds_per_unit - lot[1])
                    if tx.date.year == fiscal_year:
                        holding_days = (tx.date - lot[2]).days
                        if holding_days >= LONG_TERM_HOLDING_DAYS:
                            long_term_gains += gain
                        else:
                            short_term_gains += gain
                    lot[0] -= used
                    remaining -= used
                    if lot[0] <= 1e-9:
                        lots.pop(0)

    realized_total = short_term_gains + long_term_gains
    estimated_tax = _progressive_irpf_tax(realized_total) if realized_total > 0 else 0.0
    effective_rate = (estimated_tax / realized_total) if realized_total > 0 else None

    unrealized_gains = sum(p.pnl for p in _build_positions(db))

    return TaxSummary(
        fiscal_year=fiscal_year,
        realized_gains_short_term=round(short_term_gains, 2),
        realized_gains_long_term=round(long_term_gains, 2),
        realized_gains_total=round(realized_total, 2),
        estimated_tax=round(estimated_tax, 2),
        unrealized_gains=round(unrealized_gains, 2),
        effective_rate=round(effective_rate, 4) if effective_rate is not None else None,
    )


def _progressive_irpf_tax(amount: float) -> float:
    """Aplica los tramos progresivos de la base del ahorro sobre `amount` (plusvalías netas)."""
    tax = 0.0
    lower = 0.0
    for upper, rate in IRPF_BRACKETS:
        if amount <= lower:
            break
        taxable_in_bracket = min(amount, upper) - lower
        tax += taxable_in_bracket * rate
        lower = upper
    return tax
