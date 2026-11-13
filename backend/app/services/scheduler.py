"""Tareas periódicas: refresco de precios, snapshot diario del portfolio y
regeneración semanal de señales ML."""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.asset import Asset
from app.services import alerts, market_data, ml_service, portfolio

scheduler = BackgroundScheduler(timezone="Europe/Madrid")


def fetch_daily_prices() -> None:
    """Refresca la caché OHLCV de los activos en cartera (cierre del mercado europeo)."""
    db = SessionLocal()
    try:
        tickers = db.scalars(
            select(Asset.ticker).where(Asset.is_active.is_(True)).distinct()
        ).all()
        for ticker in tickers:
            market_data.get_ohlcv(db, ticker, period="5d", interval="1d")
    finally:
        db.close()


def save_portfolio_snapshot() -> None:
    """Guarda el snapshot diario del portfolio (valor total, coste, desglose por posición)."""
    db = SessionLocal()
    try:
        portfolio.save_daily_snapshot(db)
    finally:
        db.close()


def regenerate_signals() -> None:
    """Lanza el reentrenamiento + regeneración de señales para los activos en cartera
    (delegado al venv de `ml/`, que tiene las dependencias pesadas — ver ml_service)."""
    db = SessionLocal()
    try:
        tickers = db.scalars(
            select(Asset.ticker).where(Asset.is_active.is_(True)).distinct()
        ).all()
        if tickers:
            ml_service.train(list(tickers))
    finally:
        db.close()


def check_alerts() -> None:
    """Evalúa alertas activas (precio, señal ML, desviación de rebalanceo) cada 5 min."""
    db = SessionLocal()
    try:
        alerts.check_alerts(db)
    finally:
        db.close()


def start() -> None:
    if scheduler.running:
        return
    scheduler.add_job(
        fetch_daily_prices,
        CronTrigger(day_of_week="mon-fri", hour=18, minute=30),
        id="fetch_daily_prices",
        replace_existing=True,
    )
    scheduler.add_job(
        save_portfolio_snapshot,
        CronTrigger(day_of_week="mon-fri", hour=20, minute=0),
        id="save_portfolio_snapshot",
        replace_existing=True,
    )
    scheduler.add_job(
        regenerate_signals,
        CronTrigger(day_of_week="sat", hour=9, minute=0),
        id="regenerate_signals",
        replace_existing=True,
    )
    scheduler.add_job(
        check_alerts,
        CronTrigger(minute="*/5"),
        id="check_alerts",
        replace_existing=True,
    )
    scheduler.start()


def shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
