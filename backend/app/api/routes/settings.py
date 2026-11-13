from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings() -> dict:
    return {
        "anthropic_key_configured": bool(settings.anthropic_api_key),
        "base_currency": settings.base_currency,
        "environment": settings.environment,
        "version": "0.1.0",
    }


@router.post("/seed", status_code=202)
def seed_demo(db: Session = Depends(get_db)) -> dict:
    from app.scripts.seed_demo_data import run_seed
    try:
        run_seed(db)
        return {"status": "ok", "message": "Datos de demo cargados correctamente"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/reset", status_code=200)
def reset_all_data(db: Session = Depends(get_db)) -> dict:
    for table in ("portfolio_snapshots", "transactions", "assets", "signals", "alerts"):
        db.execute(text(f"DELETE FROM {table}"))
    db.commit()
    return {"status": "ok", "message": "Todos los datos han sido eliminados"}
