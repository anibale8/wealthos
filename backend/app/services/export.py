"""Generación de informes exportables (PDF y Excel) de la cartera."""

import io
from datetime import date

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.asset import Asset
from app.models.signal import Signal
from app.models.transaction import Transaction
from app.services import portfolio as portfolio_service

# ─── Paleta ────────────────────────────────────────────────────────────────
BRAND       = colors.HexColor("#259970")
BRAND_DARK  = colors.HexColor("#1a7a55")
BRAND_LIGHT = colors.HexColor("#e8f5f0")
PROFIT      = colors.HexColor("#16a34a")
LOSS        = colors.HexColor("#dc2626")
NEUTRAL     = colors.HexColor("#64748b")
ROW_ALT     = colors.HexColor("#f8fafc")
BORDER      = colors.HexColor("#e2e8f0")
TEXT_MAIN   = colors.HexColor("#0f172a")
TEXT_MUTED  = colors.HexColor("#64748b")
WHITE       = colors.white
PAGE_W, PAGE_H = A4


def _styles() -> dict:
    ss = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title", fontName="Helvetica-Bold", fontSize=28,
            textColor=WHITE, spaceAfter=6, leading=34,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub", fontName="Helvetica", fontSize=12,
            textColor=colors.HexColor("#d1fae5"), spaceAfter=4, leading=16,
        ),
        "section": ParagraphStyle(
            "section", fontName="Helvetica-Bold", fontSize=13,
            textColor=BRAND_DARK, spaceAfter=4, spaceBefore=14,
        ),
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=9,
            textColor=TEXT_MAIN, leading=14,
        ),
        "muted": ParagraphStyle(
            "muted", fontName="Helvetica", fontSize=8,
            textColor=TEXT_MUTED, leading=12,
        ),
        "disclaimer": ParagraphStyle(
            "disclaimer", fontName="Helvetica-Oblique", fontSize=7.5,
            textColor=TEXT_MUTED, leading=11,
        ),
    }


class _PageDecorator:
    """Dibuja cabecera y pie de página en cada hoja."""

    def __init__(self, title: str, generated: str):
        self.title = title
        self.generated = generated

    def __call__(self, canvas, doc):
        canvas.saveState()
        w, h = PAGE_W, PAGE_H

        # Franja superior
        canvas.setFillColor(BRAND)
        canvas.rect(0, h - 1.1 * cm, w, 1.1 * cm, fill=True, stroke=False)
        canvas.setFillColor(WHITE)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(2 * cm, h - 0.7 * cm, "WealthOS")
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(w - 2 * cm, h - 0.7 * cm, self.title)

        # Franja inferior
        canvas.setFillColor(colors.HexColor("#f1f5f9"))
        canvas.rect(0, 0, w, 0.85 * cm, fill=True, stroke=False)
        canvas.setFillColor(TEXT_MUTED)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(2 * cm, 0.3 * cm, self.generated)
        canvas.drawRightString(w - 2 * cm, 0.3 * cm, f"Página {doc.page}")

        canvas.restoreState()


def generate_pdf_report(db: Session) -> bytes:
    summary   = portfolio_service.get_summary(db)
    positions = portfolio_service.get_positions(db)
    history   = portfolio_service.get_history(db, days=365)
    txns      = _recent_transactions(db, limit=30)

    buffer    = io.BytesIO()
    hoy = date.today()
    generated = f"Generado el {hoy.day} de {_MESES[hoy.month - 1]} de {hoy.year}"
    decorator = _PageDecorator("Informe de cartera", generated)

    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.8 * cm, bottomMargin=1.5 * cm,
        title="WealthOS — Informe de cartera",
        author="WealthOS",
    )
    S = _styles()
    story = []

    # ─── Portada ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 3.5 * cm))

    # Bloque de color con título
    cover_block = Table(
        [[Paragraph("WealthOS", S["cover_title"])],
         [Paragraph("Informe de cartera de inversión", S["cover_sub"])],
         [Paragraph(generated, S["cover_sub"])]],
        colWidths=[PAGE_W - 4 * cm],
    )
    cover_block.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND),
        ("LEFTPADDING",  (0, 0), (-1, -1), 24),
        ("RIGHTPADDING", (0, 0), (-1, -1), 24),
        ("TOPPADDING",   (0, 0), (0, 0),   28),
        ("TOPPADDING",   (0, 1), (-1, -1),  6),
        ("BOTTOMPADDING",(0, -1),(-1, -1), 28),
        ("ROUNDEDCORNERS", [6]),
    ]))
    story.append(cover_block)
    story.append(Spacer(1, 1.5 * cm))

    # KPIs de portada — 2×2
    sign_pnl = "+" if summary.total_pnl >= 0 else ""
    sign_day = "+" if summary.daily_change >= 0 else ""
    cover_kpis = [
        [
            _kpi_cell("Patrimonio total", _fmt_eur(summary.total_value), None),
            _kpi_cell("P&L total", f"{sign_pnl}{_fmt_eur(summary.total_pnl)}", summary.total_pnl),
        ],
        [
            _kpi_cell("Variación hoy", f"{sign_day}{_fmt_eur(summary.daily_change)}", summary.daily_change),
            _kpi_cell("Posiciones activas", str(summary.n_positions), None),
        ],
    ]
    kpi_tbl = Table(cover_kpis, colWidths=[(PAGE_W - 4 * cm) / 2] * 2, hAlign="LEFT")
    kpi_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), WHITE),
        ("BOX",          (0, 0), (-1, -1), 0.5, BORDER),
        ("INNERGRID",    (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING",  (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING",   (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 14),
        ("ROUNDEDCORNERS", [4]),
    ]))
    story.append(kpi_tbl)
    story.append(PageBreak())

    # ─── Evolución del valor ──────────────────────────────────────────────────
    if len(history) >= 2:
        story.append(Paragraph("Evolución del patrimonio", S["section"]))
        story.append(_section_rule())
        story.append(Spacer(1, 0.2 * cm))
        story.append(_evolution_chart(history))
        story.append(Spacer(1, 0.8 * cm))

    # ─── Posiciones ───────────────────────────────────────────────────────────
    story.append(Paragraph(f"Posiciones actuales ({len(positions)})", S["section"]))
    story.append(_section_rule())
    story.append(Spacer(1, 0.2 * cm))
    pos_rows = [["Ticker", "Nombre", "Clase", "Cantidad", "Valor", "P&L", "P&L %", "Peso"]]
    for p in sorted(positions, key=lambda x: x.current_value, reverse=True):
        pos_rows.append([
            p.ticker,
            p.name[:26],
            p.asset_class,
            f"{p.quantity:g}",
            _fmt_eur(p.current_value),
            _colored_val(_fmt_eur(p.pnl), p.pnl, S),
            _colored_val(_fmt_pct(p.pnl_pct), p.pnl_pct, S),
            _fmt_pct(p.weight),
        ])
    story.append(_pro_table(
        pos_rows,
        col_widths=[1.9*cm, 4*cm, 1.8*cm, 1.8*cm, 2.5*cm, 2.5*cm, 1.8*cm, 1.6*cm],
    ))
    story.append(Spacer(1, 0.8 * cm))

    # ─── Operaciones recientes ────────────────────────────────────────────────
    story.append(Paragraph("Operaciones recientes", S["section"]))
    story.append(_section_rule())
    story.append(Spacer(1, 0.2 * cm))
    if txns:
        tx_rows = [["Fecha", "Ticker", "Tipo", "Cantidad", "Precio", "Importe total"]]
        for tx, ticker in txns:
            tx_rows.append([
                tx.date.strftime("%d/%m/%Y"), ticker, _TIPOS.get(tx.type, tx.type.capitalize()),
                f"{tx.quantity:g}", _fmt_money(tx.price, tx.asset.currency),
                _fmt_money(tx.quantity * tx.price + tx.fees, tx.asset.currency),
            ])
        story.append(_pro_table(
            tx_rows,
            col_widths=[2.2*cm, 2*cm, 2*cm, 2.2*cm, 2.6*cm, 2.9*cm],
        ))
    else:
        story.append(Paragraph("No hay operaciones registradas todavía.", S["muted"]))

    story.append(Spacer(1, 1.5 * cm))
    story.append(Paragraph(
        "Este informe es informativo y se genera automáticamente a partir de los datos registrados en WealthOS. "
        "No constituye asesoramiento de inversión ni fiscal. Los datos de mercado provienen de fuentes públicas "
        "y pueden no reflejar precios en tiempo real.",
        S["disclaimer"],
    ))

    doc.build(story, onFirstPage=decorator, onLaterPages=decorator)
    return buffer.getvalue()


# ─── Excel ────────────────────────────────────────────────────────────────────

def generate_excel_report(db: Session) -> bytes:
    positions = portfolio_service.get_positions(db)
    transactions = _recent_transactions(db, limit=500)
    history = portfolio_service.get_history(db, days=730)
    signals = db.scalars(select(Signal).order_by(Signal.generated_at.desc()).limit(200)).all()

    wb = Workbook()

    _write_sheet(
        wb.active, "Posiciones",
        headers=["Ticker", "Nombre", "Clase", "Cantidad", "Coste medio", "Precio actual",
                 "Valor", "P&L", "P&L %", "Peso %", "Divisa"],
        rows=[
            [p.ticker, p.name, p.asset_class, p.quantity, p.avg_cost, p.current_price,
             p.current_value, p.pnl, p.pnl_pct, p.weight, p.currency]
            for p in positions
        ],
    )

    _write_sheet(
        wb.create_sheet("Operaciones"), "Operaciones",
        headers=["Fecha", "Ticker", "Tipo", "Cantidad", "Precio", "Comisiones", "Importe total", "Notas"],
        rows=[
            [tx.date, ticker, tx.type, tx.quantity, tx.price, tx.fees,
             tx.quantity * tx.price + tx.fees, tx.notes or ""]
            for tx, ticker in transactions
        ],
    )

    _write_sheet(
        wb.create_sheet("Rendimiento"), "Rendimiento",
        headers=["Fecha", "Valor total", "Coste total", "P&L"],
        rows=[[s.date, s.total_value, s.total_cost, s.total_value - s.total_cost] for s in history],
    )

    _write_sheet(
        wb.create_sheet("Señales"), "Señales",
        headers=["Fecha", "Ticker", "Acción", "Confianza", "Retorno esperado", "Horizonte (días)", "Modelo"],
        rows=[
            [sig.generated_at.replace(tzinfo=None) if sig.generated_at else None, sig.ticker, sig.action,
             sig.confidence, sig.predicted_return, sig.horizon_days, sig.model_version]
            for sig in signals
        ],
    )

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# ─── Helpers PDF ─────────────────────────────────────────────────────────────

def _section_rule() -> Table:
    rule = Table([[""]], colWidths=[PAGE_W - 4 * cm], rowHeights=[2])
    rule.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.5, BRAND)]))
    return rule


def _kpi_cell(label: str, value: str, numeric: float | None) -> Paragraph:
    if numeric is None:
        hex_color = "1a7a55"
    elif numeric >= 0:
        hex_color = "16a34a"
    else:
        hex_color = "dc2626"
    return Paragraph(
        f'<font size="8" color="#64748b">{label.replace("&", "&amp;")}</font><br/>'
        f'<font size="15" color="#{hex_color}" face="Helvetica-Bold">{value}</font>',
        ParagraphStyle("kpi", leading=22),
    )


def _colored_val(text: str, numeric: float, styles) -> Paragraph:
    hex_color = "16a34a" if numeric >= 0 else "dc2626"
    return Paragraph(
        f'<font color="#{hex_color}">{text}</font>',
        ParagraphStyle("cv", fontSize=8, fontName="Helvetica", leading=11),
    )


def _pro_table(rows: list, col_widths: list) -> Table:
    tbl = Table(rows, colWidths=col_widths, repeatRows=1)
    n = len(rows)
    style_cmds = [
        # Header
        ("BACKGROUND",    (0, 0),  (-1, 0),   BRAND),
        ("TEXTCOLOR",     (0, 0),  (-1, 0),   WHITE),
        ("FONTNAME",      (0, 0),  (-1, 0),   "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0),  (-1, 0),   8),
        ("BOTTOMPADDING", (0, 0),  (-1, 0),   7),
        ("TOPPADDING",    (0, 0),  (-1, 0),   7),
        # Data rows
        ("FONTSIZE",      (0, 1),  (-1, -1),  8),
        ("TOPPADDING",    (0, 1),  (-1, -1),  5),
        ("BOTTOMPADDING", (0, 1),  (-1, -1),  5),
        ("ALIGN",         (3, 0),  (-1, -1),  "RIGHT"),
        ("LINEBELOW",     (0, 0),  (-1, -1),  0.3, BORDER),
    ]
    # Alternating rows
    for i in range(2, n, 2):
        style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))

    tbl.setStyle(TableStyle(style_cmds))
    return tbl


def _evolution_chart(history: list) -> Drawing:
    # history viene ordenado ascendente (más antiguo primero), lo usamos tal cual
    points = list(history)
    data = [[(i, p.total_value) for i, p in enumerate(points)]]
    min_v = min(p.total_value for p in points) * 0.97
    max_v = max(p.total_value for p in points) * 1.03

    cw, ch = 16 * cm, 6.5 * cm
    drawing = Drawing(cw, ch)

    # Fondo
    drawing.add(Rect(45, 25, cw - 55, ch - 35, fillColor=colors.HexColor("#f8fafc"), strokeColor=BORDER, strokeWidth=0.5))

    # Área de relleno bajo la curva (simulada con rectángulos de baja altura si hay pocos puntos)
    plot = LinePlot()
    plot.x = 45
    plot.y = 25
    plot.height = ch - 35
    plot.width = cw - 55
    plot.data = data
    plot.lines[0].strokeColor = BRAND
    plot.lines[0].strokeWidth = 2
    plot.xValueAxis.visible = False
    plot.yValueAxis.strokeColor = colors.HexColor("#e2e8f0")
    plot.yValueAxis.gridStrokeColor = colors.HexColor("#e2e8f0")
    plot.yValueAxis.gridStrokeDashArray = [2, 2]
    plot.yValueAxis.visibleGrid = True
    plot.yValueAxis.visibleTicks = False
    plot.yValueAxis.labelTextFormat = lambda v: f"{v:,.0f}"
    plot.yValueAxis.valueMin = min_v
    plot.yValueAxis.valueMax = max_v
    plot.yValueAxis.strokeWidth = 0
    drawing.add(plot)

    # Etiquetas de fecha en X
    first_date = _mes_corto(points[0].date)
    mid_date   = _mes_corto(points[len(points) // 2].date)
    last_date  = _mes_corto(points[-1].date)
    x_start = 45
    x_end   = int(cw - 10)
    x_mid   = (x_start + x_end) // 2

    for x_pos, label in ((x_start, first_date), (x_mid, mid_date), (x_end, last_date)):
        drawing.add(String(x_pos, 12, label, fontSize=7, fillColor=TEXT_MUTED, textAnchor="middle"))

    return drawing


def _recent_transactions(db: Session, limit: int):
    return db.execute(
        select(Transaction, Asset.ticker)
        .join(Asset, Transaction.asset_id == Asset.id)
        .order_by(Transaction.date.desc())
        .limit(limit)
    ).all()


def _write_sheet(sheet, name, *, headers, rows):
    sheet.title = name
    header_fill = PatternFill("solid", fgColor="259970")
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
    for row in rows:
        sheet.append(row)
    for idx, header in enumerate(headers, start=1):
        sheet.column_dimensions[get_column_letter(idx)].width = max(12, len(header) + 4)


def _fmt_eur(value: float) -> str:
    return f"{value:,.2f} {settings.base_currency}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_pct(value: float) -> str:
    sign = "+" if value >= 0 else ""
    return f"{sign}{value:.2f} %"


_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
          "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
_TIPOS = {"buy": "Compra", "sell": "Venta", "dividend": "Dividendo", "split": "Split", "fee": "Comisión"}


def _mes_corto(d) -> str:
    return f"{_MESES[d.month - 1][:3].capitalize()} {d.year}"


def _fmt_money(value: float, currency: str | None) -> str:
    """Importe con formato español en la divisa indicada (las operaciones se guardan en la divisa del activo)."""
    return f"{value:,.2f} {currency or settings.base_currency}".replace(",", "X").replace(".", ",").replace("X", ".")
