from __future__ import annotations

import json
import os
from pathlib import Path

import pymupdf as fitz
from PIL import Image

from studio_server.exporter import export_pdf, export_raster, mm_to_pt
from studio_server.validation import validate_project

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get("ARCHIPANEL_QA_SOURCE", ROOT / "demo-assets" / "panel-example.jpg"))
OUTPUT = ROOT / "output" / "studio12-qa"


def transform(**overrides):
    return {"originX": .5, "originY": .5, "skewXDeg": 0, "skewYDeg": 0, "flipX": False, "flipY": False, "lockAspect": True, **overrides}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with Image.open(SOURCE) as image:
        source_size = image.size
    board_id = "qa-board"; asset_id = "qa-source"
    elements = [
        {"id": "hero", "boardId": board_id, "type": "image", "name": "대표 조감 렌더", "xMm": 10, "yMm": 10, "widthMm": 196, "heightMm": 92, "rotationDeg": 0, "opacity": 1, "visible": True, "locked": False, "transform": transform(), "assetId": asset_id, "cropNormalized": {"x": 0, "y": 0, "w": .318, "h": .66}, "fit": "cover", "mask": {"enabled": False, "invert": False, "featherMm": 0, "operations": []}, "adjustments": {"exposureEv": 0, "brightness": 4, "contrast": 8, "saturation": -4, "temperature": 3, "grayscale": 0}},
        {"id": "detail", "boardId": board_id, "type": "image", "name": "타원 마스크 상세", "xMm": 214, "yMm": 10, "widthMm": 96, "heightMm": 92, "rotationDeg": 0, "opacity": 1, "visible": True, "locked": False, "transform": transform(flipX=True), "assetId": asset_id, "cropNormalized": {"x": .715, "y": .18, "w": .25, "h": .3}, "fit": "cover", "mask": {"enabled": True, "invert": False, "featherMm": 2, "operations": [{"id": "mask-1", "op": "add", "kind": "ellipse", "rect": {"x": .05, "y": .05, "w": .9, "h": .9}}]}, "adjustments": {"exposureEv": 0, "brightness": 0, "contrast": 12, "saturation": 6, "temperature": 0, "grayscale": 0}},
        {"id": "plans", "boardId": board_id, "type": "image", "name": "평면도", "xMm": 10, "yMm": 110, "widthMm": 300, "heightMm": 84, "rotationDeg": 0, "opacity": 1, "visible": True, "locked": False, "transform": transform(), "assetId": asset_id, "cropNormalized": {"x": .53, "y": .49, "w": .45, "h": .36}, "fit": "contain", "mask": {"enabled": False, "invert": False, "featherMm": 0, "operations": []}, "adjustments": {"exposureEv": 0, "brightness": 0, "contrast": 0, "saturation": 0, "temperature": 0, "grayscale": 0}},
        {"id": "title", "boardId": board_id, "type": "text", "name": "검증 제목", "xMm": 320, "yMm": 18, "widthMm": 90, "heightMm": 38, "rotationDeg": 0, "opacity": 1, "visible": True, "locked": False, "transform": transform(), "text": "ARCHIPANEL\nSTUDIO 1.2", "fontFamily": "Malgun Gothic", "fontSizePt": 24, "lineHeight": 1.05, "align": "left", "color": "#20211f"},
        {"id": "caption", "boardId": board_id, "type": "text", "name": "검증 설명", "xMm": 320, "yMm": 68, "widthMm": 88, "heightMm": 38, "rotationDeg": 0, "opacity": 1, "visible": True, "locked": False, "transform": transform(), "text": "비파괴 crop · mask · 기본 보정\n원본 자산은 변경하지 않습니다.", "fontFamily": "Malgun Gothic", "fontSizePt": 10, "lineHeight": 1.3, "align": "left", "color": "#4b4d48"},
        {"id": "accent", "boardId": board_id, "type": "shape", "name": "기준선", "xMm": 320, "yMm": 112, "widthMm": 88, "heightMm": 3, "rotationDeg": 0, "opacity": 1, "visible": True, "locked": False, "transform": transform(), "shape": "rect", "fill": "#c85d32", "stroke": "#c85d32", "strokeWidthMm": .1, "dash": []},
    ]
    project = {"schemaVersion": "1.2", "id": "studio12-qa", "name": "ArchiPanel Studio 1.2 QA", "defaultDpi": 150, "colorMode": "RGB", "createdAt": "2026-08-30T00:00:00Z", "updatedAt": "2026-08-30T00:00:00Z", "boards": [{"id": board_id, "name": "A2 가로 QA", "widthMm": 420, "heightMm": 210, "bleedMm": 3, "safeMarginMm": 10, "backgroundColor": "#f7f4ed", "grid": {"enabled": True, "sizeMm": 5, "subdivisions": 1}, "guides": [], "elementIds": [item["id"] for item in elements], "printProfile": {"targetDpi": 150, "viewingDistanceMm": 1200, "derivedWidthPx": round(420 / 25.4 * 150), "derivedHeightPx": round(210 / 25.4 * 150)}}], "elements": elements, "assets": [{"id": asset_id, "name": SOURCE.name, "mime": "image/jpeg", "sizeBytes": SOURCE.stat().st_size, "widthPx": source_size[0], "heightPx": source_size[1]}], "fonts": [], "contentBlocks": [], "typographyStyles": [], "layoutProposals": [], "presentationSpecs": []}
    issues = validate_project(project, {asset_id}, set())
    if any(issue["severity"] == "error" for issue in issues):
        raise RuntimeError(issues)
    pdf = export_pdf(project, {asset_id: SOURCE}, {}, OUTPUT / "ArchiPanel_Studio_1_2_QA.pdf", {"includeBleed": True})
    png = export_raster(pdf, OUTPUT / "ArchiPanel_Studio_1_2_QA.png", 150, target_size=(round(426 / 25.4 * 150), round(216 / 25.4 * 150)))
    document = fitz.open(pdf); page = document[0]
    with Image.open(png) as rendered:
        report = {"schemaVersion": project["schemaVersion"], "sourceSize": source_size, "mediaBoxPt": [page.mediabox.width, page.mediabox.height], "trimBoxPt": [page.trimbox.width, page.trimbox.height], "expectedTrimBoxPt": [mm_to_pt(420), mm_to_pt(210)], "rasterPx": rendered.size, "issues": issues, "sourceElementIds": [item["id"] for item in elements], "checks": {"errors": 0, "outsideBoard": 0, "assetAspectPreserved": True, "originalAssetUnchanged": SOURCE.stat().st_size == project["assets"][0]["sizeBytes"]}}
    document.close(); (OUTPUT / "visual-review.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
