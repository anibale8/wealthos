"""Parsers de CSV para distintos brokers. Devuelve filas normalizadas."""

import csv
import io
import re
from datetime import date, datetime
from typing import Any

SUPPORTED_BROKERS = ["auto", "generic", "revolut", "degiro", "ibkr", "etoro"]

# ─── Tipos normalizados ────────────────────────────────────────────────────

TYPE_MAP: dict[str, str] = {
    "buy": "buy", "compra": "buy", "purchase": "buy",
    "sell": "sell", "sale": "sell", "venta": "sell",
    "dividend": "dividend", "dividendo": "dividend", "div": "dividend",
    "split": "split", "stock split": "split",
    "fee": "fee", "comisión": "fee", "commission": "fee",
}


def _norm_type(raw: str) -> str:
    return TYPE_MAP.get(raw.lower().strip(), "buy")


def _parse_date(raw: str) -> str | None:
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d",
                "%d-%b-%Y", "%b %d, %Y", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(raw.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _parse_float(raw: str) -> float:
    cleaned = re.sub(r"[^\d\.\-,]", "", raw.replace(",", "."))
    # Si hay varios puntos (ej. "1.234.56"), quitar los de miles
    parts = cleaned.split(".")
    if len(parts) > 2:
        cleaned = "".join(parts[:-1]) + "." + parts[-1]
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return 0.0


# ─── Detección automática ─────────────────────────────────────────────────

def detect_broker(headers: list[str]) -> str:
    hs = {h.lower().strip() for h in headers}
    if "price per share" in hs and "fx rate" in hs:
        return "revolut"
    if "isin" in hs and ("local value" in hs or "transaction costs" in hs):
        return "degiro"
    if any("account id" in h for h in hs) and any("proceeds" in h for h in hs):
        return "ibkr"
    if "open rate" in hs and "leverage" in hs:
        return "etoro"
    return "generic"


# ─── Parsers por broker ───────────────────────────────────────────────────

def _parse_revolut(rows: list[dict]) -> list[dict]:
    out = []
    for i, row in enumerate(rows, 1):
        tx_type = _norm_type(row.get("Type", ""))
        if tx_type not in ("buy", "sell", "dividend"):
            continue
        ticker = row.get("Ticker", "").strip().upper()
        date_val = _parse_date(row.get("Date", ""))
        quantity = abs(_parse_float(row.get("Quantity", "0")))
        price = abs(_parse_float(row.get("Price per share", "0")))
        fees = 0.0
        out.append(_build_row(i, ticker, tx_type, date_val, quantity, price, fees, source="Revolut"))
    return out


def _parse_degiro(rows: list[dict]) -> list[dict]:
    out = []
    for i, row in enumerate(rows, 1):
        # Degiro usa Product + ISIN, sin ticker directo. Intentamos extraer ticker del nombre.
        product = row.get("Product", "") or row.get("Nombre", "")
        isin = row.get("ISIN", "").strip()
        # Ticket: último token del nombre en mayúsculas si parece ticker, si no usar isin[:6]
        ticker_candidate = product.strip().split()[-1] if product.strip() else ""
        ticker = ticker_candidate.upper() if (ticker_candidate.isupper() and 1 < len(ticker_candidate) <= 6) else isin
        if not ticker:
            continue
        qty_raw = row.get("Quantity", row.get("Cantidad", "0"))
        qty = abs(_parse_float(qty_raw))
        price_raw = row.get("Price", row.get("Precio", "0"))
        price = abs(_parse_float(price_raw))
        fees_raw = row.get("Transaction costs", row.get("Costes de transacción", "0"))
        fees = abs(_parse_float(fees_raw))
        # Degiro no tiene columna tipo — qty > 0 = compra, qty < 0 = venta
        raw_qty = _parse_float(qty_raw)
        tx_type = "sell" if raw_qty < 0 else "buy"
        date_raw = row.get("Date", row.get("Fecha", ""))
        date_val = _parse_date(date_raw)
        out.append(_build_row(i, ticker, tx_type, date_val, qty, price, fees, source="Degiro"))
    return out


def _parse_ibkr(rows: list[dict]) -> list[dict]:
    """Parsea el CSV simplificado de IBKR (Activity > Trades)."""
    out = []
    for i, row in enumerate(rows, 1):
        if row.get("Asset Category", "").strip().lower() != "stocks":
            continue
        ticker = row.get("Symbol", "").strip().upper()
        date_raw = row.get("Date/Time", row.get("Date", ""))
        date_val = _parse_date(date_raw.split(",")[0].strip())
        qty_raw = row.get("Quantity", "0")
        qty = _parse_float(qty_raw)
        price = abs(_parse_float(row.get("T. Price", row.get("Price", "0"))))
        fees = abs(_parse_float(row.get("Comm/Fee", row.get("Commission", "0"))))
        tx_type = "sell" if qty < 0 else "buy"
        out.append(_build_row(i, ticker, tx_type, date_val, abs(qty), price, fees, source="IBKR"))
    return out


def _parse_etoro(rows: list[dict]) -> list[dict]:
    out = []
    for i, row in enumerate(rows, 1):
        action = row.get("Action", row.get("Type", "")).lower()
        if "open" in action:
            tx_type = "buy"
        elif "close" in action:
            tx_type = "sell"
        elif "dividend" in action:
            tx_type = "dividend"
        else:
            continue
        ticker = row.get("Instrument", row.get("Asset", "")).strip().upper()
        date_val = _parse_date(row.get("Date", row.get("Open Date", "")))
        qty = abs(_parse_float(row.get("Units", row.get("Quantity", "0"))))
        price = abs(_parse_float(row.get("Open Rate", row.get("Price", "0"))))
        fees = abs(_parse_float(row.get("Spread", "0")))
        out.append(_build_row(i, ticker, tx_type, date_val, qty, price, fees, source="eToro"))
    return out


def _parse_generic(rows: list[dict]) -> list[dict]:
    out = []
    # Intentar mapear headers flexibles a campos estándar
    FIELD_ALIASES: dict[str, list[str]] = {
        "date":     ["date", "fecha", "trade date", "settlement date", "datetime"],
        "ticker":   ["ticker", "symbol", "activo", "isin", "asset", "instrumento"],
        "type":     ["type", "tipo", "action", "side", "operation"],
        "quantity": ["quantity", "cantidad", "qty", "shares", "units", "amount"],
        "price":    ["price", "precio", "price per share", "unit price"],
        "fees":     ["fees", "commission", "comisión", "charges", "cost", "fee"],
        "notes":    ["notes", "notas", "description", "comments"],
    }
    if not rows:
        return out
    headers = list(rows[0].keys())
    col_map: dict[str, str] = {}
    for field, aliases in FIELD_ALIASES.items():
        for h in headers:
            if h.lower().strip() in aliases:
                col_map[field] = h
                break

    for i, row in enumerate(rows, 1):
        date_val = _parse_date(row.get(col_map.get("date", ""), ""))
        ticker = row.get(col_map.get("ticker", ""), "").strip().upper()
        tx_type = _norm_type(row.get(col_map.get("type", ""), "buy"))
        quantity = abs(_parse_float(row.get(col_map.get("quantity", ""), "0")))
        price = abs(_parse_float(row.get(col_map.get("price", ""), "0")))
        fees = abs(_parse_float(row.get(col_map.get("fees", ""), "0")))
        notes = row.get(col_map.get("notes", ""), "") or None
        out.append(_build_row(i, ticker, tx_type, date_val, quantity, price, fees, notes=notes, source="Generic"))
    return out


# ─── Constructor de fila ──────────────────────────────────────────────────

def _build_row(
    row_num: int,
    ticker: str,
    tx_type: str,
    date_val: str | None,
    quantity: float,
    price: float,
    fees: float,
    notes: str | None = None,
    source: str = "",
) -> dict[str, Any]:
    errors = []
    if not ticker:
        errors.append("Ticker vacío")
    if not date_val:
        errors.append("Fecha inválida")
    if quantity <= 0:
        errors.append("Cantidad ≤ 0")
    if price < 0:
        errors.append("Precio negativo")

    return {
        "row_num": row_num,
        "ticker": ticker,
        "type": tx_type,
        "date": date_val,
        "quantity": quantity,
        "price": price,
        "fees": fees,
        "notes": notes,
        "source": source,
        "status": "error" if errors else "ok",
        "message": "; ".join(errors) if errors else None,
    }


# ─── Entry point ──────────────────────────────────────────────────────────

def parse_csv(file_bytes: bytes, broker_hint: str = "auto") -> dict[str, Any]:
    text = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return {"broker_detected": "generic", "rows": [], "total": 0, "errors": 0}

    headers = list(rows[0].keys())
    broker = broker_hint if broker_hint != "auto" else detect_broker(headers)

    parsers = {
        "revolut": _parse_revolut,
        "degiro":  _parse_degiro,
        "ibkr":    _parse_ibkr,
        "etoro":   _parse_etoro,
    }
    parsed = parsers.get(broker, _parse_generic)(rows)

    errors = sum(1 for r in parsed if r["status"] == "error")
    return {
        "broker_detected": broker,
        "rows": parsed,
        "total": len(parsed),
        "errors": errors,
    }
