from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.asset import Asset
from app.models.transaction import Transaction
from app.schemas.portfolio import (
    CorrelationMatrix,
    DividendEntry,
    OverlapPair,
    PortfolioSummary,
    Position,
    RebalanceSuggestion,
    RiskMetrics,
    SnapshotPoint,
    TaxSummary,
    TransactionCreate,
    TransactionRead,
)
from app.services import csv_importer, export as export_service
from app.services import portfolio as portfolio_service

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/summary", response_model=PortfolioSummary)
def get_summary(db: Session = Depends(get_db)) -> PortfolioSummary:
    return portfolio_service.get_summary(db)


@router.get("/positions", response_model=list[Position])
def get_positions(db: Session = Depends(get_db)) -> list[Position]:
    return portfolio_service.get_positions(db)


@router.get("/history", response_model=list[SnapshotPoint])
def get_history(days: int = 365, db: Session = Depends(get_db)) -> list[SnapshotPoint]:
    return portfolio_service.get_history(db, days=days)


@router.get("/metrics", response_model=RiskMetrics)
def get_metrics(db: Session = Depends(get_db)) -> RiskMetrics:
    return portfolio_service.calculate_risk_metrics(db)


@router.get("/dividends", response_model=list[DividendEntry])
def get_dividends(db: Session = Depends(get_db)) -> list[DividendEntry]:
    return portfolio_service.get_dividends(db)


@router.get("/correlations", response_model=CorrelationMatrix)
def get_correlations(db: Session = Depends(get_db)) -> CorrelationMatrix:
    return portfolio_service.calculate_correlations(db)


@router.get("/overlaps", response_model=list[OverlapPair])
def get_overlaps(db: Session = Depends(get_db)) -> list[OverlapPair]:
    return portfolio_service.detect_overlaps(db)


@router.post("/rebalance", response_model=RebalanceSuggestion)
def post_rebalance(
    target_weights: dict[str, float] = Body(..., embed=True),
    db: Session = Depends(get_db),
) -> RebalanceSuggestion:
    return portfolio_service.suggest_rebalance(db, target_weights)


@router.get("/tax-impact", response_model=TaxSummary)
def get_tax_impact(year: int | None = None, db: Session = Depends(get_db)) -> TaxSummary:
    return portfolio_service.calculate_tax_impact(db, fiscal_year=year)


@router.get("/export/pdf")
def export_pdf(db: Session = Depends(get_db)) -> Response:
    pdf_bytes = export_service.generate_pdf_report(db)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=wealthos_informe.pdf",
            "Cache-Control": "no-store",
        },
    )


@router.get("/export/excel")
def export_excel(db: Session = Depends(get_db)) -> Response:
    excel_bytes = export_service.generate_excel_report(db)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=wealthos_informe.xlsx",
            "Cache-Control": "no-store",
        },
    )


@router.get("/transactions", response_model=list[TransactionRead])
def list_transactions(db: Session = Depends(get_db)) -> list[Transaction]:
    return db.scalars(select(Transaction).order_by(Transaction.date.desc())).all()


@router.post("/transactions", response_model=TransactionRead, status_code=201)
def add_transaction(data: TransactionCreate, db: Session = Depends(get_db)) -> Transaction:
    asset = db.scalar(select(Asset).where(Asset.ticker == data.ticker))
    if asset is None:
        if not data.asset_name:
            raise HTTPException(status_code=404, detail=f"Activo '{data.ticker}' no encontrado en cartera")
        asset = Asset(
            ticker=data.ticker,
            name=data.asset_name,
            asset_class=data.asset_class or "equity",
            currency=data.asset_currency or "USD",
            exchange=data.asset_exchange,
        )
        db.add(asset)
        db.flush()

    tx = Transaction(
        asset_id=asset.id,
        type=data.type,
        quantity=data.quantity,
        price=data.price,
        fees=data.fees,
        date=data.date,
        notes=data.notes,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)) -> None:
    tx = db.get(Transaction, transaction_id)
    if tx is None:
        raise HTTPException(status_code=404, detail="Operación no encontrada")
    db.delete(tx)
    db.commit()


@router.post("/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    broker: str = Form(default="auto"),
) -> dict:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Se requiere un archivo CSV")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo no puede superar 5 MB")
    return csv_importer.parse_csv(content, broker_hint=broker)


@router.post("/import/confirm", status_code=201)
def import_confirm(rows: list[dict], db: Session = Depends(get_db)) -> dict:
    created = 0
    skipped = 0
    for row in rows:
        if row.get("status") == "error":
            skipped += 1
            continue
        ticker = (row.get("ticker") or "").strip().upper()
        if not ticker:
            skipped += 1
            continue
        asset = db.scalar(select(Asset).where(Asset.ticker == ticker))
        if asset is None:
            asset = Asset(ticker=ticker, name=ticker, asset_class="equity", currency="USD")
            db.add(asset)
            db.flush()
        from datetime import date as date_type
        try:
            tx_date = date_type.fromisoformat(row["date"])
        except (KeyError, ValueError):
            skipped += 1
            continue
        tx = Transaction(
            asset_id=asset.id,
            type=row.get("type", "buy"),
            quantity=float(row.get("quantity", 0)),
            price=float(row.get("price", 0)),
            fees=float(row.get("fees", 0)),
            date=tx_date,
            notes=row.get("notes"),
        )
        db.add(tx)
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped}
