"""Catálogo PDF con marca NEXA (navy + naranja), no Gorifit."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    Image,
)

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "packages" / "db" / "prisma" / "seed-data" / "productos-legacy.json"
OUT = ROOT / "apps" / "web" / "public" / "catalogo-nexa.pdf"

NAVY = colors.HexColor("#060c1a")
ORANGE = colors.HexColor("#ff5a1f")
MUTED = colors.HexColor("#6b7280")
PAPER = colors.HexColor("#f4f1ea")
LINE = colors.HexColor("#e3e1dc")


def money(pesos: int) -> str:
    return f"$ {pesos:,}".replace(",", ".")


def header_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, letter[1] - 42, letter[0], 42, fill=1, stroke=0)
    canvas.setFillColor(ORANGE)
    canvas.setFont("Times-Bold", 11)
    canvas.drawString(0.7 * inch, letter[1] - 27, "NEXA")
    canvas.setFillColor(colors.white)
    canvas.setFont("Times-Roman", 9)
    canvas.drawRightString(letter[0] - 0.7 * inch, letter[1] - 27, "Sports Nutrition")
    canvas.setFillColor(MUTED)
    canvas.setFont("Times-Roman", 8)
    canvas.drawString(0.7 * inch, 0.45 * inch, "nexa-sports-nutrition-web.vercel.app")
    canvas.drawRightString(letter[0] - 0.7 * inch, 0.45 * inch, f"{doc.page}")
    canvas.restoreState()


def main() -> None:
    items = json.loads(SRC.read_text(encoding="utf-8"))
    by_cat: dict[str, list] = defaultdict(list)
    for item in items:
        by_cat[item["categoria"]].append(item)

    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "NexaTitle",
        parent=styles["Title"],
        fontName="Times-Bold",
        fontSize=18,
        textColor=NAVY,
        spaceAfter=6,
        alignment=0,
    )
    lead = ParagraphStyle(
        "NexaLead",
        parent=styles["Normal"],
        fontSize=10,
        textColor=MUTED,
        spaceAfter=16,
        leading=14,
    )
    h1 = ParagraphStyle(
        "NexaH1",
        parent=styles["Heading1"],
        fontName="Times-Bold",
        fontSize=13,
        textColor=ORANGE,
        spaceBefore=12,
        spaceAfter=8,
    )
    cell = ParagraphStyle(
        "NexaCell",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=11,
        textColor=NAVY,
    )
    head = ParagraphStyle(
        "NexaHead",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=8,
        textColor=colors.white,
    )

    story = [
        Paragraph("Catálogo NEXA Sports Nutrition", title),
        Paragraph(
            "Precios en pesos colombianos. Los suplementos no reemplazan una alimentación "
            "equilibrada ni un criterio profesional. Marca NEXA — no Gorifit.",
            lead,
        ),
    ]

    order = ["Proteínas", "Creatinas", "Preentrenos", "Otros Suplementos"]
    cats = [c for c in order if c in by_cat] + [c for c in by_cat if c not in order]

    for cat in cats:
        rows = [
            [
                Paragraph("Imagen", head),
                Paragraph("Producto", head),
                Paragraph("Marca", head),
                Paragraph("Precio", head),
            ]
        ]
        for item in sorted(by_cat[cat], key=lambda p: p["nombre"]):
            img_path = ROOT / "apps" / "web" / "public" / item["imagen"].lstrip("/")
            if img_path.exists():
                img = Image(str(img_path), width=40, height=40)
            else:
                img = Paragraph("", cell)

            rows.append(
                [
                    img,
                    Paragraph(item["nombre"], cell),
                    Paragraph(item["marca"], cell),
                    Paragraph(money(item["precio"]), cell),
                ]
            )
        table = Table(rows, colWidths=[0.8 * inch, 3.4 * inch, 1.7 * inch, 1.1 * inch], repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Times-Bold"),
                    ("ALIGN", (3, 0), (3, -1), "RIGHT"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("GRID", (0, 0), (-1, -1), 0.3, LINE),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PAPER]),
                ]
            )
        )
        story.append(Paragraph(cat, h1))
        story.append(table)
        story.append(Spacer(1, 10))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.85 * inch,
        bottomMargin=0.7 * inch,
        title="Catálogo NEXA Sports Nutrition",
        author="NEXA Sports Nutrition",
    )
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"wrote {OUT} ({len(items)} products)")


if __name__ == "__main__":
    main()
