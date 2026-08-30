from __future__ import annotations

import hashlib
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pdfplumber
from PIL import Image

from .models import LABELS, save_json
from .raster import render_image_preview, render_pdf_preview


WIDE_BOARD_REGIONS = [
    ("title", [0.01, 0.01, 0.32, 0.10]), ("render", [0.00, 0.00, 0.33, 0.31]),
    ("render", [0.00, 0.29, 0.33, 0.63]), ("render", [0.00, 0.61, 0.33, 0.99]),
    ("prologue", [0.33, 0.00, 0.47, 0.18]), ("context", [0.47, 0.00, 0.69, 0.18]),
    ("concept", [0.69, 0.00, 0.86, 0.18]), ("site_analysis", [0.86, 0.00, 0.99, 0.18]),
    ("program", [0.33, 0.18, 0.50, 0.33]), ("design_process", [0.50, 0.18, 0.61, 0.33]),
    ("detail", [0.61, 0.18, 0.99, 0.44]), ("accessibility", [0.33, 0.33, 0.53, 0.48]),
    ("materials", [0.53, 0.33, 0.74, 0.48]), ("master_plan", [0.33, 0.48, 0.53, 0.99]),
    ("floor_plan", [0.53, 0.48, 0.99, 0.84]), ("facade", [0.53, 0.84, 0.71, 0.99]),
    ("section", [0.71, 0.84, 0.99, 0.99]),
]

PORTRAIT_BOARD_REGIONS = [
    ("title", [0.01, 0.01, 0.34, 0.07]), ("project_info", [0.01, 0.18, 0.18, 0.27]),
    ("render", [0.00, 0.00, 0.60, 0.27]), ("render", [0.60, 0.00, 1.00, 0.27]),
    ("prologue", [0.60, 0.00, 0.78, 0.13]), ("site_analysis", [0.60, 0.13, 1.00, 0.28]),
    ("design_process", [0.00, 0.27, 0.26, 0.43]), ("program", [0.26, 0.27, 0.50, 0.43]),
    ("concept", [0.50, 0.27, 0.72, 0.43]), ("detail", [0.72, 0.27, 1.00, 0.49]),
    ("circulation", [0.00, 0.43, 0.25, 0.62]), ("master_plan", [0.25, 0.43, 0.60, 0.64]),
    ("floor_plan", [0.00, 0.62, 0.50, 0.91]), ("floor_plan", [0.50, 0.62, 1.00, 0.84]),
    ("section", [0.00, 0.91, 0.58, 1.00]), ("elevation", [0.58, 0.84, 1.00, 1.00]),
]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _physical_layout(size_mm: tuple[float, float] | None, aspect: float) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    flags: list[dict[str, Any]] = []
    if size_mm:
        width_mm, height_mm = size_mm
        source = "measured"
    elif 1.9 <= aspect <= 2.1:
        width_mm, height_mm, source = 1800.0, 900.0, "aspect_inferred"
        flags.append({"code": "physical_size_inferred", "severity": "review", "block_ids": [], "message": "1800×900 mm was inferred from the 2:1 aspect ratio; confirm before print/export."})
    else:
        width_mm = height_mm = None
        source = "unknown"
        flags.append({"code": "physical_size_unknown", "severity": "review", "block_ids": [], "message": "No reliable physical size metadata was found; set sheet dimensions manually."})
    sheets = [{"id": "sheet-01", "source_page": 1, "name": "전체 보드", "reading_order": 1, "bbox_document_normalized": [0, 0, 1, 1], "physical_size_mm": [width_mm, height_mm]}]
    layout_mode = "continuous_board" if aspect >= 1.6 else "single_sheet"
    arrangement = {"rows": 1, "columns": 1, "flow": "left_to_right"}
    if width_mm and height_mm and abs(width_mm - 841) < 8 and abs(height_mm - 1782) < 12:
        layout_mode = "multi_sheet_board"
        arrangement = {"rows": 3, "columns": 1, "flow": "top_to_bottom"}
        sheets = []
        for index in range(3):
            sheets.append({"id": f"sheet-{index + 1:02d}", "source_page": 1, "name": f"A1 landscape {index + 1}", "reading_order": index + 1, "bbox_document_normalized": [0, index / 3, 1, (index + 1) / 3], "physical_size_mm": [841, 594]})
        flags.append({"code": "sheet_split_inferred", "severity": "review", "block_ids": [], "message": "841×1782 mm matches three stacked A1-landscape sheets; confirm the inferred split lines."})
    physical = {"layout_mode": layout_mode, "physical_size_mm": [width_mm, height_mm], "measurement_source": source, "sheet_count": len(sheets), "sheet_arrangement": arrangement}
    return physical, sheets, flags


def _words_for_bbox(words: list[dict[str, Any]], bbox: list[float], width: float, height: float) -> str:
    selected = []
    x0, y0, x1, y1 = bbox
    for word in words:
        cx = (float(word["x0"]) + float(word["x1"])) / 2 / width
        cy = (float(word["top"]) + float(word["bottom"])) / 2 / height
        if x0 <= cx <= x1 and y0 <= cy <= y1:
            selected.append(word)
    selected.sort(key=lambda item: (round(float(item["top"]) / 5), float(item["x0"])))
    return " ".join(str(item["text"]).strip() for item in selected if str(item["text"]).strip())


def _ocr_preview(image: Image.Image) -> tuple[list[dict[str, Any]], str]:
    if not shutil.which("tesseract"):
        return [], "ocr:unavailable"
    try:
        import pytesseract
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, config="--psm 11")
        words = []
        for index, text in enumerate(data["text"]):
            text = text.strip()
            if not text:
                continue
            confidence = max(0.0, min(1.0, float(data["conf"][index]) / 100))
            words.append({"text": text, "x0": data["left"][index], "x1": data["left"][index] + data["width"][index], "top": data["top"][index], "bottom": data["top"][index] + data["height"][index], "confidence": confidence})
        return words, "ocr:tesseract-preview"
    except Exception:
        return [], "ocr:failed"


def _sheet_for_bbox(bbox: list[float], sheets: list[dict[str, Any]]) -> tuple[str, list[float]]:
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    sheet = next((item for item in sheets if item["bbox_document_normalized"][0] <= cx <= item["bbox_document_normalized"][2] and item["bbox_document_normalized"][1] <= cy <= item["bbox_document_normalized"][3]), sheets[0])
    sx0, sy0, sx1, sy1 = sheet["bbox_document_normalized"]
    local = [
        max(0.0, min(1.0, (bbox[0] - sx0) / (sx1 - sx0))),
        max(0.0, min(1.0, (bbox[1] - sy0) / (sy1 - sy0))),
        max(0.0, min(1.0, (bbox[2] - sx0) / (sx1 - sx0))),
        max(0.0, min(1.0, (bbox[3] - sy0) / (sy1 - sy0))),
    ]
    if local[0] >= local[2]: local[0], local[2] = 0.0, 1.0
    if local[1] >= local[3]: local[1], local[3] = 0.0, 1.0
    return sheet["id"], [round(value, 6) for value in local]


def _classify_scale(text: str) -> str | None:
    match = re.search(r"(?:scale\s*)?1\s*[:/]\s*(\d{2,5})", text, re.I)
    return f"1:{match.group(1)}" if match else None


def extract_panel(input_path: str | Path, output_path: str | Path, assets_dir: str | Path) -> dict[str, Any]:
    source_path, output_path, assets_dir = Path(input_path).resolve(), Path(output_path).resolve(), Path(assets_dir).resolve()
    if source_path.suffix.lower() not in {".pdf", ".png", ".jpg", ".jpeg"}:
        raise ValueError("Supported input formats: PDF, PNG, JPG, JPEG")
    assets_dir.mkdir(parents=True, exist_ok=True)
    preview_path = assets_dir / "source-preview.jpg"
    words: list[dict[str, Any]] = []
    if source_path.suffix.lower() == ".pdf":
        preview_w, preview_h, size_mm = render_pdf_preview(source_path, preview_path)
        with pdfplumber.open(source_path) as document:
            page = document.pages[0]
            words = page.extract_words(x_tolerance=2, y_tolerance=2, keep_blank_chars=False)
            word_width, word_height = float(page.width), float(page.height)
        extraction_method = "embedded_text" if words else "image_only_pdf"
        original_pixels = None
    else:
        preview_w, preview_h, original_pixels, size_mm = render_image_preview(source_path, preview_path)
        word_width, word_height = float(preview_w), float(preview_h)
        extraction_method = "image_preview"
    image = Image.open(preview_path).convert("RGB")
    if not words:
        words, extraction_method = _ocr_preview(image)
        word_width, word_height = float(preview_w), float(preview_h)
    aspect = preview_w / preview_h
    physical, sheets, review_flags = _physical_layout(size_mm, aspect)
    regions = WIDE_BOARD_REGIONS if aspect >= 1.55 else PORTRAIT_BOARD_REGIONS
    blocks = []
    for order, (label, bbox) in enumerate(regions, 1):
        block_id = f"pb-{order:03d}"
        x0, y0, x1, y1 = bbox
        crop_path = assets_dir / f"block-{order:03d}.png"
        image.crop((round(x0 * preview_w), round(y0 * preview_h), round(x1 * preview_w), round(y1 * preview_h))).save(crop_path)
        text = _words_for_bbox(words, bbox, word_width, word_height)
        sheet_id, local_bbox = _sheet_for_bbox(bbox, sheets)
        confidence = 0.78 if text else 0.56
        blocks.append({"id": block_id, "source_page": 1, "source_sheet_id": sheet_id, "bbox_normalized": bbox, "bbox_sheet_normalized": local_bbox, "label": label if label in LABELS else "caption", "subtype": None, "drawing_scale": _classify_scale(text), "reading_order": order, "story_role": None, "text": text, "confidence": confidence, "asset_ref": crop_path.as_posix(), "parent_block_id": None})
        if not text:
            review_flags.append({"code": "low_confidence_ocr", "severity": "review", "block_ids": [block_id], "message": "No reliable OCR text was found in this layout region; label and text require review."})
    manifest = {
        "schema_version": "2.0", "created_at": datetime.now(timezone.utc).isoformat(),
        "source": {"path": str(source_path), "sha256": _sha256(source_path), "media_type": source_path.suffix.lower().lstrip("."), "page_count": 1, "page_image": preview_path.as_posix(), "preview_pixel_size": [preview_w, preview_h], "original_pixel_size": list(original_pixels) if original_pixels else None, "extraction_method": extraction_method},
        "physical_layout": physical, "sheets": sheets, "blocks": blocks, "review_flags": review_flags,
        "approval": {"status": "pending", "approved_by": None, "approved_at": None, "approved_fixture": False},
    }
    save_json(output_path, manifest)
    return manifest
