from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

SIGNAL_ACTIONS = ("BUY", "HOLD", "SELL")


class Signal(Base):
    __tablename__ = "signals"
    __table_args__ = (
        CheckConstraint(f"action IN {SIGNAL_ACTIONS}", name="ck_signals_action"),
        CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_signals_confidence"),
        Index("idx_signals_ticker", "ticker", "generated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    predicted_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    horizon_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    model_version: Mapped[str] = mapped_column(String, nullable=False)
    shap_json: Mapped[str | None] = mapped_column(String, nullable=True)
    features_json: Mapped[str | None] = mapped_column(String, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
