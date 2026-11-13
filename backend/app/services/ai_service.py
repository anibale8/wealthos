"""Integración con Claude: contexto de cartera, chat con streaming, análisis de PDFs,
comparación de fondos, simulación de escenarios y detección de sesgos."""

import io
import json
from collections import Counter
from collections.abc import AsyncGenerator
from statistics import mean

import anthropic
import pdfplumber
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.asset import Asset
from app.models.transaction import Transaction
from app.schemas.ai import (
    BiasAnalysis,
    BiasFinding,
    FundAnalysis,
    FundComparison,
    FundComparisonRow,
    PositionImpact,
    ScenarioAnalysis,
)
from app.services import portfolio as portfolio_service

MODEL = "claude-sonnet-4-20250514"
MAX_CONTEXT_TRANSACTIONS = 20

SYSTEM_PROMPT = """Eres WealthOS AI, un asesor de inversiones personal integrado en la plataforma.
Tienes acceso completo a la cartera actual del usuario.

PORTFOLIO DEL USUARIO:
{portfolio_json}

REGLAS:
- Responde siempre en español
- Sé directo y usa datos reales del portfolio cuando sea relevante
- Aclara que tu análisis es informativo, no asesoramiento regulado
- Cuando detectes sesgos cognitivos, nómbralos con su nombre técnico
  y aporta evidencia del historial de operaciones
- Para comparaciones usa siempre datos reales (TER, composición, retornos)
- Usa markdown con tablas cuando sea útil para el usuario"""

_sync_client: anthropic.Anthropic | None = None
_async_client: anthropic.AsyncAnthropic | None = None


def _client() -> anthropic.Anthropic:
    global _sync_client
    if _sync_client is None:
        _sync_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _sync_client


def _async_client_instance() -> anthropic.AsyncAnthropic:
    global _async_client
    if _async_client is None:
        _async_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _async_client


def _extract_json(text: str) -> dict:
    """Extrae el primer objeto JSON de la respuesta de Claude (puede venir en un bloque ```json)."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        cleaned = cleaned.removeprefix("json").strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("La respuesta de Claude no contiene un objeto JSON")
    return json.loads(cleaned[start : end + 1])


def _ask_for_json(prompt: str, *, max_tokens: int = 2048) -> dict:
    response = _client().messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(block.text for block in response.content if block.type == "text")
    return _extract_json(text)


# ---------------------------------------------------------------------------
# Contexto de cartera
# ---------------------------------------------------------------------------


def build_portfolio_context(db: Session) -> str:
    """Serializa la cartera a JSON legible para Claude (máx. ~4000 tokens)."""
    summary = portfolio_service.get_summary(db)
    positions = portfolio_service.get_positions(db)
    metrics = portfolio_service.calculate_risk_metrics(db)

    recent_txs = db.scalars(
        select(Transaction).order_by(Transaction.date.desc()).limit(MAX_CONTEXT_TRANSACTIONS)
    ).all()
    assets_by_id = {a.id: a for a in db.scalars(select(Asset)).all()}

    context = {
        "resumen": summary.model_dump(),
        "posiciones": [
            {
                "ticker": p.ticker,
                "nombre": p.name,
                "clase": p.asset_class,
                "cantidad": p.quantity,
                "coste_medio": round(p.avg_cost, 2),
                "precio_actual": round(p.current_price, 2),
                "valor_actual": round(p.current_value, 2),
                "pnl": round(p.pnl, 2),
                "pnl_pct": round(p.pnl_pct, 2),
                "peso_pct": round(p.weight, 2),
            }
            for p in positions
        ],
        "metricas_riesgo": metrics.model_dump(),
        "operaciones_recientes": [
            {
                "ticker": assets_by_id[tx.asset_id].ticker if tx.asset_id in assets_by_id else "?",
                "tipo": tx.type,
                "cantidad": tx.quantity,
                "precio": tx.price,
                "fecha": tx.date.isoformat(),
            }
            for tx in recent_txs
        ],
    }
    return json.dumps(context, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Chat con streaming
# ---------------------------------------------------------------------------


async def stream_chat(messages: list[dict], portfolio_ctx: str) -> AsyncGenerator[str, None]:
    """Yield de fragmentos de texto desde Claude, con la cartera inyectada en el system prompt."""
    system = SYSTEM_PROMPT.format(portfolio_json=portfolio_ctx)
    async with _async_client_instance().messages.stream(
        model=MODEL,
        max_tokens=2048,
        system=system,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text


# ---------------------------------------------------------------------------
# Análisis de PDFs (KID / folletos de fondos)
# ---------------------------------------------------------------------------


def _extract_pdf_text(file_bytes: bytes, *, max_chars: int = 15_000) -> str:
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
            if sum(len(t) for t in text_parts) > max_chars:
                break
    return "\n".join(text_parts)[:max_chars]


def analyze_pdf(file_bytes: bytes) -> FundAnalysis:
    document_text = _extract_pdf_text(file_bytes)
    if not document_text.strip():
        raise ValueError("No se pudo extraer texto del PDF (¿está escaneado como imagen?)")

    prompt = f"""Analiza este documento de un fondo de inversión (KID, folleto o ficha) y extrae
los datos clave en un objeto JSON con EXACTAMENTE estas claves:

{{
  "fund_name": str,
  "isin": str | null,
  "ter": float | null,        // gastos corrientes en % (ej. 0.22)
  "risk_level": int | null,   // nivel de riesgo SRRI/SRI 1-7
  "benchmark": str | null,
  "returns_1y": float | null, // rentabilidad a 1 año en %
  "returns_3y": float | null, // rentabilidad anualizada a 3 años en %
  "top_holdings": [{{"name": str, "weight_pct": float | null}}],
  "summary": str,             // resumen de 3-4 frases en español
  "key_risks": [str]          // lista de riesgos clave en español
}}

Responde ÚNICAMENTE con el objeto JSON, sin texto adicional.

DOCUMENTO:
{document_text}"""

    data = _ask_for_json(prompt, max_tokens=2048)
    return FundAnalysis(**data)


# ---------------------------------------------------------------------------
# Comparador de fondos
# ---------------------------------------------------------------------------


def _lookup_fund_by_isin(isin: str) -> dict | None:
    """Best-effort: busca datos públicos del fondo por ISIN. Si falla, devuelve None
    y dejamos que Claude trabaje solo con el ISIN (avisando de la limitación)."""
    try:
        import httpx
        from bs4 import BeautifulSoup

        resp = httpx.get(
            "https://www.morningstar.es/es/util/SecuritySearch.ashx",
            params={"q": isin, "limit": 1},
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0 (compatible; WealthOS/0.1)"},
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        name_el = soup.find(["a", "span"])
        return {"isin": isin, "name": name_el.get_text(strip=True) if name_el else isin}
    except Exception:
        return None


def compare_funds(isins: list[str]) -> FundComparison:
    looked_up = [_lookup_fund_by_isin(isin) or {"isin": isin, "name": isin} for isin in isins]

    prompt = f"""Compara estos fondos de inversión por ISIN: {", ".join(isins)}.
Datos públicos disponibles (pueden ser incompletos): {json.dumps(looked_up, ensure_ascii=False)}

Usa tu conocimiento general sobre fondos y categorías de inversión para completar la comparación
lo mejor posible. Si no tienes datos exactos de TER/rentabilidad para un ISIN concreto, indica
null en esos campos en lugar de inventar cifras.

Responde ÚNICAMENTE con un objeto JSON con EXACTAMENTE estas claves:

{{
  "funds": [
    {{"isin": str, "name": str, "ter": float | null, "risk_level": int | null,
      "category": str | null, "returns_1y": float | null, "returns_3y": float | null}}
  ],
  "comparison_table": str,   // tabla en formato markdown comparando los fondos
  "recommendation": str,     // análisis narrativo y recomendación final en español
  "overlap_pct": float | null  // solapamiento estimado de cartera entre fondos, si aplica
}}"""

    data = _ask_for_json(prompt, max_tokens=2048)
    return FundComparison(
        funds=[FundComparisonRow(**f) for f in data.get("funds", [])],
        comparison_table=data["comparison_table"],
        recommendation=data["recommendation"],
        overlap_pct=data.get("overlap_pct"),
    )


# ---------------------------------------------------------------------------
# Simulador de escenarios
# ---------------------------------------------------------------------------


def simulate_scenario(scenario: str, portfolio_ctx: str) -> ScenarioAnalysis:
    prompt = f"""Dada la siguiente cartera de inversión:
{portfolio_ctx}

Y este escenario macroeconómico hipotético: "{scenario}"

Estima el impacto orientativo de este escenario sobre cada posición de la cartera, basándote
en análisis histórico de activos similares ante eventos comparables. Sé realista y conservador.

Responde ÚNICAMENTE con un objeto JSON con EXACTAMENTE estas claves:

{{
  "scenario_summary": str,  // resumen del escenario y su lógica de impacto, en español
  "impact_by_position": [
    {{"ticker": str, "name": str, "impact_pct": float, "rationale": str}}
  ],
  "portfolio_impact_pct": float,  // impacto total ponderado estimado sobre la cartera
  "recommendations": [str]  // recomendaciones orientativas en español
}}"""

    data = _ask_for_json(prompt, max_tokens=2048)
    return ScenarioAnalysis(
        scenario_summary=data["scenario_summary"],
        impact_by_position=[PositionImpact(**p) for p in data.get("impact_by_position", [])],
        portfolio_impact_pct=data["portfolio_impact_pct"],
        recommendations=data.get("recommendations", []),
    )


# ---------------------------------------------------------------------------
# Detector de sesgos
# ---------------------------------------------------------------------------


def _transaction_stats(transactions: list[Transaction], assets_by_id: dict[int, Asset]) -> dict:
    if not transactions:
        return {}

    by_type = Counter(tx.type for tx in transactions)
    sorted_txs = sorted(transactions, key=lambda t: t.date)

    holding_periods: list[int] = []
    open_buys: dict[int, list[Transaction]] = {}
    winners = losers = 0

    for tx in sorted_txs:
        if tx.type == "buy":
            open_buys.setdefault(tx.asset_id, []).append(tx)
        elif tx.type == "sell" and open_buys.get(tx.asset_id):
            buy = open_buys[tx.asset_id].pop(0)
            holding_periods.append((tx.date - buy.date).days)
            if tx.price > buy.price:
                winners += 1
            else:
                losers += 1

    span_days = (sorted_txs[-1].date - sorted_txs[0].date).days or 1

    return {
        "total_operaciones": len(transactions),
        "por_tipo": dict(by_type),
        "operaciones_por_mes": round(len(transactions) / (span_days / 30), 2),
        "tenencia_media_dias": round(mean(holding_periods), 1) if holding_periods else None,
        "operaciones_cerradas": winners + losers,
        "ganadoras": winners,
        "perdedoras": losers,
        "tickers_operados": sorted({assets_by_id[tx.asset_id].ticker for tx in transactions if tx.asset_id in assets_by_id}),
    }


def detect_biases(transactions: list[Transaction], assets_by_id: dict[int, Asset]) -> BiasAnalysis:
    stats = _transaction_stats(transactions, assets_by_id)
    if not stats:
        return BiasAnalysis(biases_detected=[])

    prompt = f"""Analiza estas estadísticas del historial de operaciones de un inversor particular
y detecta posibles sesgos cognitivos de inversión (ej. efecto disposición, overtrading, FOMO,
aversión a la pérdida, anclaje, exceso de confianza):

ESTADÍSTICAS:
{json.dumps(stats, ensure_ascii=False)}

Responde ÚNICAMENTE con un objeto JSON con esta clave:

{{
  "biases_detected": [
    {{
      "type": str,            // nombre técnico del sesgo en español
      "description": str,     // explicación del sesgo y por qué aplica aquí
      "evidence": str,        // evidencia concreta extraída de las estadísticas
      "severity": "leve" | "moderado" | "alto",
      "recommendation": str   // recomendación concreta y accionable
    }}
  ]
}}

Si las estadísticas no muestran señales claras de ningún sesgo, devuelve una lista vacía."""

    data = _ask_for_json(prompt, max_tokens=2048)
    return BiasAnalysis(biases_detected=[BiasFinding(**b) for b in data.get("biases_detected", [])])
