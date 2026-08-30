from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path

import pytest
from psd_tools import PSDImage

from studio_server.asset_store import complete_session, create_session, put_chunk, resolve_asset
from studio_server.design_statement import build_design_statement, validate_design_statement
from studio_server.psd_support import compare_layers, inspect_psd


def evidence_project(count: int = 18) -> dict:
    labels = ["title", "render", "context", "site_analysis", "concept", "diagram", "design_process", "massing", "program", "master_plan", "floor_plan", "plan", "section", "elevation", "materials", "detail", "accessibility", "performance"]
    elements = [{"id": f"e-{i}", "type": "image", "name": label} for i, label in enumerate(labels[:count])]
    blocks = [{"id": f"b-{i}", "elementIds": [f"e-{i}"], "label": label, "title": f"근거 {i}", "summary": f"승인된 설명 {i}", "readingOrder": i, "confidence": .95, "status": "approved"} for i, label in enumerate(labels[:count])]
    return {"id": "p", "name": "근거 프로젝트", "elements": elements, "contentBlocks": blocks}


def test_chunk_upload_hash_and_immutable_asset(monkeypatch: pytest.MonkeyPatch) -> None:
    with tempfile.TemporaryDirectory() as directory:
        monkeypatch.setenv("LOCALAPPDATA", directory)
        body = b"8BPS" + b"fixture"
        digest = hashlib.sha256(body).hexdigest(); session = create_session("fixture.psd", len(body), digest)
        result = put_chunk(session.id, 0, body, digest); assert result["receivedBytes"] == len(body)
        complete = complete_session(session.id); assert complete["sha256"] == digest and resolve_asset(complete["assetId"]).read_bytes() == body


def test_chunk_rejects_wrong_hash(monkeypatch: pytest.MonkeyPatch) -> None:
    with tempfile.TemporaryDirectory() as directory:
        monkeypatch.setenv("LOCALAPPDATA", directory); session = create_session("fixture.psd", 4)
        with pytest.raises(ValueError, match="SHA-256"): put_chunk(session.id, 0, b"8BPS", "0" * 64)


def test_psd_fixture_inspection_and_preview() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory); source = root / "fixture.psd"; PSDImage.new("RGB", (64, 32), (240, 230, 210)).save(source)
        result = inspect_psd(source, root / "inspection")
        assert result["format"] == "PSD" and result["widthPx"] == 64 and result["heightPx"] == 32
        assert (root / "inspection" / "composite.webp").is_file() and result["reviewStatus"] == "manual_verification_required"


def test_relink_preserves_missing_and_added_states() -> None:
    old = [{"id": "1", "fingerprint": "a", "bboxPx": [0, 0, 10, 10], "visible": True, "opacity": 1, "blendMode": "normal", "text": None}]
    new = [{"id": "2", "fingerprint": "b", "bboxPx": [0, 0, 10, 10], "visible": True, "opacity": 1, "blendMode": "normal", "text": None}]
    statuses = [item["status"] for item in compare_layers(old, new)]
    assert statuses == ["missing", "added"]


def test_design_statement_is_deterministic_traceable_and_a3_adaptive() -> None:
    project = evidence_project(); left = build_design_statement(project, "detailed", target_pages=24, seed=42); right = build_design_statement(project, "detailed", target_pages=24, seed=42)
    assert [page["id"] for page in left["pages"]] == [page["id"] for page in right["pages"]]
    assert left["pageCount"] == 24 and left["pageSize"] == {"widthMm": 420, "heightMm": 297}
    assert all(page["sourceContentBlockIds"] and page["sourceElementIds"] and "[Sources]" in page["notes"] for page in left["pages"])
    left["approvalStatus"] = "approved"; result = validate_design_statement(project, left); assert result["valid"] and result["traceCoverage"] == 1


def test_design_statement_rejects_invented_source_id() -> None:
    project = evidence_project(3); spec = build_design_statement(project, "live", target_pages=14); spec["pages"][0]["sourceContentBlockIds"] = ["invented"]
    assert not validate_design_statement(project, spec)["valid"]
