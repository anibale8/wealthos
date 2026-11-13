"""Evaluación periódica de alertas de precio, señal ML y desviación de rebalanceo."""

import json
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.signal import Signal
from app.services import market_data, portfolio

COOLDOWN_HOURS = 24
_PRICE_OPERATORS = {
    "gt": lambda current, target: current > target,
    "gte": lambda current, target: current >= target,
    "lt": lambda current, target: current < target,
    "lte": lambda current, target: current <= target,
}


def check_alerts(db: Session) -> list[Alert]:
    """Evalúa todas las alertas activas, marca `last_triggered` en las que se disparan
    y devuelve la lista de alertas recién disparadas (para notificar)."""
    alerts = db.scalars(select(Alert).where(Alert.is_active.is_(True))).all()
    triggered: list[Alert] = []

    for alert in alerts:
        if _in_cooldown(alert):
            continue
        try:
            condition = json.loads(alert.condition_json)
        except (json.JSONDecodeError, TypeError):
            continue

        fired = (
            _check_price_alert(alert, condition)
            if alert.type == "price"
            else _check_signal_alert(db, alert, condition)
            if alert.type == "signal"
            else _check_rebalance_alert(db, alert, condition)
            if alert.type == "rebalance"
            else False
        )

        if fired:
            alert.last_triggered = datetime.utcnow()
            triggered.append(alert)

    if triggered:
        db.commit()

    return triggered


def _in_cooldown(alert: Alert) -> bool:
    if alert.last_triggered is None:
        return False
    return datetime.utcnow() - alert.last_triggered < timedelta(hours=COOLDOWN_HOURS)


def _check_price_alert(alert: Alert, condition: dict) -> bool:
    if not alert.ticker:
        return False
    operator = condition.get("operator")
    target = condition.get("value")
    comparator = _PRICE_OPERATORS.get(operator)
    if comparator is None or target is None:
        return False

    price_data = market_data.get_current_price(alert.ticker)
    if price_data is None:
        return False
    return bool(comparator(price_data["price"], float(target)))


def _check_signal_alert(db: Session, alert: Alert, condition: dict) -> bool:
    if not alert.ticker:
        return False
    expected_action = condition.get("action")
    min_confidence = float(condition.get("min_confidence", 0.6))

    latest = db.scalar(
        select(Signal)
        .where(Signal.ticker == alert.ticker)
        .order_by(Signal.generated_at.desc())
        .limit(1)
    )
    if latest is None:
        return False
    if expected_action and latest.action != expected_action:
        return False
    return latest.confidence >= min_confidence


def _check_rebalance_alert(db: Session, alert: Alert, condition: dict) -> bool:
    asset_class = condition.get("asset_class")
    target_pct = condition.get("target_pct")
    max_deviation_pct = condition.get("max_deviation_pct")
    if asset_class is None or target_pct is None or max_deviation_pct is None:
        return False

    positions = portfolio.get_positions(db)
    total_value = sum(p.current_value for p in positions)
    if not total_value:
        return False

    current_value = sum(p.current_value for p in positions if p.asset_class == asset_class)
    current_pct = current_value / total_value * 100
    return abs(current_pct - float(target_pct)) > float(max_deviation_pct)
