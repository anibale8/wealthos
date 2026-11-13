import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.signal import Signal
from app.schemas.signal import BacktestResponse, PredictionResponse, SignalResponse, TrainRequest
from app.services import ml_service

router = APIRouter(prefix="/api/ml", tags=["ml"])


@router.get("/signals", response_model=list[SignalResponse])
async def get_signals(min_confidence: float = Query(0.0, ge=0.0, le=1.0), db: Session = Depends(get_db)):
    return [_to_signal_response(signal) for signal in ml_service.list_signals(db, min_confidence)]


@router.get("/predict/{ticker}", response_model=PredictionResponse)
async def predict_ticker(ticker: str, horizon: int = Query(30, ge=1, le=365)):
    try:
        return ml_service.predict(ticker.upper(), horizon)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/backtest/{ticker}", response_model=BacktestResponse)
async def backtest_ticker(ticker: str, start: date | None = Query(None)):
    try:
        return ml_service.backtest(ticker.upper(), start.isoformat() if start else None)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/train", status_code=202)
async def train_models(body: TrainRequest):
    if not body.tickers:
        raise HTTPException(status_code=400, detail="Indica al menos un ticker")

    tickers = [t.upper() for t in body.tickers]
    try:
        ml_service.train(tickers)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {"status": "started", "tickers": tickers}


def _to_signal_response(signal: Signal) -> SignalResponse:
    return SignalResponse(
        id=signal.id,
        ticker=signal.ticker,
        action=signal.action,
        confidence=signal.confidence,
        predicted_return=signal.predicted_return,
        horizon_days=signal.horizon_days,
        model_version=signal.model_version,
        shap_values=json.loads(signal.shap_json) if signal.shap_json else None,
        generated_at=signal.generated_at,
        expires_at=signal.expires_at,
    )
