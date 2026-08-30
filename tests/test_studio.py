from __future__ import annotations

import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

import pymupdf as fitz
from PIL import Image

from studio_server.exporter import export_pdf, export_raster, mm_to_pt
from studio_server.app import SYSTEM_FONTS, system_fonts
from studio_server.font_catalog import inspect_font
from studio_server.validation import validate_project


def fixture(asset_id: str | None = None) -> dict:
    board_id = "board-01"
    elements = [
        {
            "id": "text-01", "boardId": board_id, "type": "text", "name": "한글 제목",
            "xMm": 10, "yMm": 10, "widthMm": 80, "heightMm": 15, "rotationDeg": 0,
            "opacity": 1, "visible": True, "locked": False, "text": "건축 패널",
            "fontFamily": "Malgun Gothic", "fontSizePt": 14, "lineHeight": 1.2,
            "align": "left", "color": "#202020",
        },
        {
            "id": "shape-01", "boardId": board_id, "type": "shape", "name": "기준선",
            "xMm": 10, "yMm": 30, "widthMm": 80, "heightMm": 10, "rotationDeg": 0,
            "opacity": 1, "visible": True, "locked": False, "shape": "rect",
            "fill": "#c85d32", "stroke": "#202020", "strokeWidthMm": 0.2, "dash": [],
        },
    ]
    ids = ["text-01", "shape-01"]
    assets = []
    if asset_id:
        elements.append({
            "id": "image-01", "boardId": board_id, "type": "image", "name": "렌더",
            "xMm": 10, "yMm": 42, "widthMm": 80, "heightMm": 40, "rotationDeg": 0,
            "opacity": 1, "visible": True, "locked": False, "assetId": asset_id,
            "cropNormalized": {"x": 0, "y": 0, "w": 1, "h": 1}, "fit": "contain",
        })
        ids.append("image-01")
        assets.append({"id": asset_id, "name": "render.png", "mime": "image/png", "sizeBytes": 1})
    return {
        "schemaVersion": "1.0", "id": "project-01", "name": "검증 패널", "defaultDpi": 300,
        "colorMode": "RGB", "createdAt": "2026-08-25T00:00:00Z", "updatedAt": "2026-08-25T00:00:00Z",
        "boards": [{"id": board_id, "name": "100x90", "widthMm": 100, "heightMm": 90, "bleedMm": 3, "safeMarginMm": 5, "backgroundColor": "#f7f4ed", "grid": {"enabled": True, "sizeMm": 5, "subdivisions": 1}, "guides": [], "elementIds": ids}],
        "elements": elements, "assets": assets, "fonts": [],
    }


class StudioTests(unittest.TestCase):
    def test_studio_schema_and_example_are_json(self) -> None:
        import json
        root = Path(__file__).resolve().parents[1]
        schema = json.loads((root / "schemas" / "panel-project-v1.1.schema.json").read_text(encoding="utf-8"))
        example = json.loads((root / "examples" / "Studio_sample_project.json").read_text(encoding="utf-8"))
        self.assertTrue(schema["$schema"].endswith("2020-12/schema"))
        self.assertEqual(example["schemaVersion"], "1.1")
        self.assertEqual(example["colorMode"], "RGB")

        current = json.loads((root / "schemas" / "panel-project-v1.2.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(current["properties"]["schemaVersion"]["const"], "1.2")
        self.assertIn("transform", current["$defs"]["element"]["required"])

    def test_project_validation_preserves_missing_assets_as_error(self) -> None:
        project = fixture("asset-missing")
        issues = validate_project(project, set(), set())
        self.assertIn("missing-asset", [issue["code"] for issue in issues])

    def test_pdf_uses_exact_media_trim_and_bleed_boxes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "panel.pdf"
            export_pdf(fixture(), {}, {}, output, {"includeBleed": True})
            document = fitz.open(output)
            page = document[0]
            self.assertAlmostEqual(page.mediabox.width, mm_to_pt(106), places=2)
            self.assertAlmostEqual(page.mediabox.height, mm_to_pt(96), places=2)
            self.assertAlmostEqual(page.trimbox.width, mm_to_pt(100), places=2)
            self.assertAlmostEqual(page.trimbox.height, mm_to_pt(90), places=2)
            self.assertTrue(page.get_text().strip())
            document.close()

    def test_image_ratio_and_raster_dimensions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image_path = root / "source.png"
            Image.new("RGB", (800, 400), "#79aab0").save(image_path)
            pdf_path = root / "panel.pdf"
            png_path = root / "panel.png"
            export_pdf(fixture("asset-01"), {"asset-01": image_path}, {}, pdf_path, {"includeBleed": False})
            expected = (round(100 / 25.4 * 150), round(90 / 25.4 * 150))
            export_raster(pdf_path, png_path, 150, target_size=expected)
            with Image.open(png_path) as result:
                self.assertEqual(result.size, expected)

    def test_multiply_blend_rasterizes_board_with_correct_color(self) -> None:
        project = fixture()
        common = {"boardId": "board-01", "type": "shape", "name": "혼합", "xMm": 10, "yMm": 10, "widthMm": 50, "heightMm": 50, "rotationDeg": 0, "opacity": 1, "visible": True, "locked": False, "shape": "rect", "stroke": "transparent", "strokeWidthMm": 0, "dash": []}
        project["elements"] = [{**common, "id": "base", "fill": "#ff0000"}, {**common, "id": "blend", "fill": "#00ffff", "blendMode": "multiply"}]
        project["boards"][0]["elementIds"] = ["base", "blend"]
        project["boards"][0]["printProfile"] = {"targetDpi": 72}
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "blend.pdf"
            export_pdf(project, {}, {}, output, {"includeBleed": False})
            document = fitz.open(output); pixmap = document[0].get_pixmap(dpi=72, alpha=False)
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            pixel = image.getpixel((round(35 / 25.4 * 72), round(35 / 25.4 * 72)))
            self.assertLess(max(pixel), 20)
            self.assertFalse(document[0].get_text().strip())
            document.close()

    def test_kopub_catalog_exposes_installed_dotum_and_batang(self) -> None:
        catalog = system_fonts()["fonts"]
        ids = {font["id"] for font in catalog}
        self.assertTrue({"kopub-dotum-light", "kopub-dotum-medium", "kopub-dotum-bold"}.issubset(ids))
        self.assertTrue({"kopub-batang-light", "kopub-batang-medium", "kopub-batang-bold"}.issubset(ids))
        self.assertTrue(all(Path(font["file"]).is_file() for font in SYSTEM_FONTS.values()))

    def test_kopub_font_is_embedded_in_pdf(self) -> None:
        font_id = "system-kopub-dotum-medium"
        font_path = Path(SYSTEM_FONTS["kopub-dotum-medium"]["file"])
        project = deepcopy(fixture())
        text = project["elements"][0]
        text.update({"fontAssetId": font_id, "fontFamily": "KoPubWorld Dotum_Pro", "weight": 500})
        project["fonts"] = [{"id": font_id, "assetId": font_id, "family": "KoPubWorld Dotum_Pro", "style": "Medium", "weight": 500, "embeddingAllowed": "unknown"}]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "kopub-panel.pdf"
            export_pdf(project, {}, {font_id: font_path}, output, {"includeBleed": False})
            document = fitz.open(output)
            fonts = document[0].get_fonts(full=True)
            self.assertTrue(any("KoPub" in " ".join(map(str, font)) for font in fonts))
            self.assertIn("건축 패널", document[0].get_text())
            document.close()

    def test_font_inspection_reports_fingerprint_korean_and_embedding(self) -> None:
        metadata = inspect_font(Path(SYSTEM_FONTS["kopub-dotum-medium"]["file"]))
        self.assertEqual(len(metadata["fingerprintSha256"]), 64)
        self.assertTrue(metadata["supportsKorean"])
        self.assertIn(metadata["embeddingPolicy"], {"installable", "editable", "preview_print", "restricted"})


if __name__ == "__main__":
    unittest.main()
