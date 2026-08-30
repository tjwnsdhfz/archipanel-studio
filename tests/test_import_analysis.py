from __future__ import annotations

from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageDraw

from studio_server.import_analysis import analyze_asset


def test_png_whitespace_regions_are_normalized_and_traceable(tmp_path: Path) -> None:
    source = tmp_path / "panel.png"
    image = Image.new("RGB", (1200, 800), "white"); draw = ImageDraw.Draw(image)
    for box, color in [((30, 30, 570, 360), "#5c6e72"), ((630, 30, 1170, 360), "#c26439"), ((30, 440, 570, 770), "#252525"), ((630, 440, 1170, 770), "#9b9d91")]: draw.rectangle(box, fill=color)
    image.save(source)
    result = analyze_asset(source, "image/png", 12)
    assert 4 <= result["candidateCount"] <= 12
    for candidate in result["pages"][0]["candidates"]:
        box = candidate["bboxNormalized"]
        assert 0 <= box["x"] < 1 and 0 <= box["y"] < 1
        assert box["x"] + box["w"] <= 1.000001 and box["y"] + box["h"] <= 1.000001


def test_multipage_pdf_keeps_page_and_original_text(tmp_path: Path) -> None:
    source = tmp_path / "plans.pdf"; document = fitz.open()
    for index in range(2):
        page = document.new_page(width=400, height=300)
        page.insert_text((30, 40), f"FLOOR PLAN {index + 1}", fontsize=20)
        page.draw_rect(fitz.Rect(30, 70, 370, 270), color=(0, 0, 0))
    document.save(source); document.close()
    result = analyze_asset(source, "application/pdf", 10)
    assert result["pageCount"] == 2
    assert {page["pageIndex"] for page in result["pages"]} == {0, 1}
    text = "\n".join(candidate["text"] for page in result["pages"] for candidate in page["candidates"] if candidate["kind"] == "text")
    assert "FLOOR PLAN 1" in text and "FLOOR PLAN 2" in text
