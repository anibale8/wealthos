from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

AlertType = Literal["price", "signal", "rebalance"]


class AlertCreate(BaseModel):
    type: AlertType
    ticker: str | None = None
    name: str
    condition_json: str


class AlertUpdate(BaseModel):
    is_active: bool


class AlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: AlertType
    ticker: str | None
    name: str
    condition_json: str
    is_active: bool
    last_triggered: datetime | None
    created_at: datetime
