from __future__ import annotations

import json
import threading
import unittest
import urllib.request
from pathlib import Path

from PIL import Image

from archipanel_agent.editor import build_editor
from archipanel_agent.extract import extract_panel
from archipanel_agent.cli import _EditorHandler
from archipanel_agent.models import load_json, require_approved_fixture, validate_manifest
from archipanel_agent.story import build_storyboard
from archipanel_agent.validate import run_validation, validate_storyboard


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "examples" / "ArchitectureWide_approved_fixture.json"
SPEC = ROOT / "examples" / "ArchitectureWide_15min_16slides.json"
PPTX = ROOT / "output" / "ArchitectureWide_approved_15min_16slides.pptx"
RENDERS = ROOT / "output" / "architecture-rendered"


class AgentTests(unittest.TestCase):
    def require_private_fixture(self) -> None:
        if not FIXTURE.is_file():
            self.skipTest("approved local fixture is not included in the public repository")

    def test_schema_files_are_valid_json(self) -> None:
        for name in ["panel-manifest.schema.json", "presentation-spec.schema.json"]:
            payload = json.loads((ROOT / "schemas" / name).read_text(encoding="utf-8"))
            self.assertTrue(payload["$schema"].endswith("2020-12/schema"))

    def test_approved_fixture_and_story_contract(self) -> None:
        self.require_private_fixture()
        manifest = load_json(FIXTURE)
        self.assertEqual(validate_manifest(manifest), [])
        require_approved_fixture(manifest, allow_fixture=True)
        spec = build_storyboard(manifest)
        self.assertEqual(spec["slide_count"], 16)
        self.assertEqual(sum(slide["expected_seconds"] for slide in spec["slides"]), 900)
        self.assertEqual(validate_storyboard(manifest, spec), [])

    def test_pending_manifest_cannot_export(self) -> None:
        self.require_private_fixture()
        manifest = load_json(FIXTURE)
        manifest["approval"]["status"] = "pending"
        with self.assertRaises(PermissionError):
            require_approved_fixture(manifest, allow_fixture=True)

    def test_review_flags_are_retained_without_correction(self) -> None:
        self.require_private_fixture()
        manifest = load_json(FIXTURE)
        spec = build_storyboard(manifest)
        self.assertEqual(spec["review_flags"], manifest["review_flags"])

    def test_fixture_requires_explicit_cli_flag(self) -> None:
        self.require_private_fixture()
        manifest = load_json(FIXTURE)
        with self.assertRaises(PermissionError):
            require_approved_fixture(manifest, allow_fixture=False)

    def test_editor_contains_editable_contract(self) -> None:
        self.require_private_fixture()
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            manifest = load_json(FIXTURE)
            output = build_editor(manifest, Path(directory) / "editor.html")
            text = output.read_text(encoding="utf-8")
            for marker in ["document bbox", "reading_order", "confidence", "drawing_scale", "/api/manifest", "JSON 다운로드"]:
                self.assertIn(marker, text)

    def test_raster_fallback_keeps_low_confidence_for_review(self) -> None:
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            source = tmp_path / "blank.png"
            Image.new("RGB", (400, 300), "white").save(source)
            manifest = extract_panel(source, tmp_path / "manifest.json", tmp_path / "assets")
            self.assertEqual(manifest["schema_version"], "2.0")
            self.assertLess(manifest["blocks"][0]["confidence"], 0.65)
            self.assertIn("low_confidence_ocr", [flag["code"] for flag in manifest["review_flags"]])
            self.assertEqual(manifest["physical_layout"]["layout_mode"], "single_sheet")

    def test_editor_server_persists_valid_manifest(self) -> None:
        self.require_private_fixture()
        import tempfile
        from http.server import ThreadingHTTPServer
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            manifest_path = temp / "manifest.json"
            manifest = load_json(FIXTURE)
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            editor_path = build_editor(manifest, temp / "editor.html")
            handler = type("TestEditorHandler", (_EditorHandler,), {})
            handler.manifest_path = manifest_path
            handler.editor_path = editor_path
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                base = f"http://127.0.0.1:{server.server_port}"
                self.assertIn(b"ArchiPanel Agent", urllib.request.urlopen(base + "/", timeout=5).read())
                manifest["blocks"][0]["confidence"] = 0.88
                request = urllib.request.Request(
                    base + "/api/manifest",
                    data=json.dumps(manifest, ensure_ascii=False).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="PUT",
                )
                response = urllib.request.urlopen(request, timeout=5)
                self.assertEqual(response.status, 200)
                self.assertEqual(load_json(manifest_path)["blocks"][0]["confidence"], 0.88)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)

    def test_generated_artifacts_when_present(self) -> None:
        if not (PPTX.exists() and SPEC.exists() and RENDERS.exists()):
            self.skipTest("generated demo artifacts are not present")
        report = run_validation(load_json(FIXTURE), load_json(SPEC), PPTX, RENDERS)
        self.assertTrue(report["ok"], report["errors"])


if __name__ == "__main__":
    unittest.main()
