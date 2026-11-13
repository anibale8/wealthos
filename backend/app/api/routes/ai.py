import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.asset import Asset
from app.models.transaction import Transaction
from app.schemas.ai import (
    BiasAnalysis,
    ChatRequest,
    FundAnalysis,
    FundComparison,
    FundComparisonRequest,
    ScenarioAnalysis,
    ScenarioRequest,
)
from app.services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])

MAX_PDF_SIZE = 10 * 1024 * 1024


@router.post("/chat")
async def chat(body: ChatRequest, db: Session = Depends(get_db)) -> StreamingResponse:
    portfolio_ctx = ai_service.build_portfolio_context(db) if body.include_portfolio else "{}"
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    async def generate():
        try:
            async for chunk in ai_service.stream_chat(messages, portfolio_ctx):
                yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/analyze-pdf", response_model=FundAnalysis)
async def analyze_pdf(file: UploadFile = File(...)) -> FundAnalysis:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF")

    contents = await file.read()
    if len(contents) > MAX_PDF_SIZE:
        raise HTTPException(status_code=400, detail="El PDF supera el tamaño máximo de 10MB")

    try:
        return ai_service.analyze_pdf(contents)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/compare-funds", response_model=FundComparison)
def compare_funds(body: FundComparisonRequest) -> FundComparison:
    if not (1 <= len(body.isins) <= 4):
        raise HTTPException(status_code=400, detail="Indica entre 1 y 4 ISINs para comparar")
    return ai_service.compare_funds(body.isins)


@router.post("/scenario", response_model=ScenarioAnalysis)
def scenario(body: ScenarioRequest, db: Session = Depends(get_db)) -> ScenarioAnalysis:
    portfolio_ctx = ai_service.build_portfolio_context(db)
    return ai_service.simulate_scenario(body.scenario, portfolio_ctx)


@router.get("/biases", response_model=BiasAnalysis)
def biases(db: Session = Depends(get_db)) -> BiasAnalysis:
    transactions = list(db.scalars(select(Transaction).order_by(Transaction.date)).all())
    assets_by_id = {a.id: a for a in db.scalars(select(Asset)).all()}
    return ai_service.detect_biases(transactions, assets_by_id)
