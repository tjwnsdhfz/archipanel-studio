from __future__ import annotations

import json
from pathlib import Path
from typing import Any


LABELS = [
    "title", "project_info", "prologue", "context", "site_analysis", "concept",
    "design_process", "massing", "program", "master_plan", "site_plan",
    "floor_plan", "plan", "circulation", "section", "elevation", "facade",
    "diagram", "render", "detail", "materials", "accessibility", "performance",
    "caption", "source", "colophon",
]
VISUAL_LABELS = set(LABELS) - {"title", "project_info", "prologue", "context", "caption", "source", "colophon"}
LAYOUT_MODES = {"single_sheet", "continuous_board", "multi_sheet_board"}


def load_json(path: str | Path) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as stream:
        return json.load(stream)


def save_json(path: str | Path, payload: dict[str, Any]) -> Path:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def _bbox_errors(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or len(value) != 4:
        return [f"{field} must have four numbers"]
    try:
        x0, y0, x1, y1 = [float(item) for item in value]
    except (TypeError, ValueError):
        return [f"{field} must be numeric"]
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        return [f"{field} is out of range"]
    return []


def validate_manifest(manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    version = manifest.get("schema_version")
    if version not in {"1.0", "2.0"}:
        errors.append("schema_version must be 2.0 (1.0 accepted for legacy fixtures)")
    source = manifest.get("source", {})
    if source.get("page_count") != 1:
        errors.append("MVP accepts exactly one source page")
    sheet_ids = {"sheet-01"}
    if version == "2.0":
        physical = manifest.get("physical_layout", {})
        if physical.get("layout_mode") not in LAYOUT_MODES:
            errors.append("physical_layout.layout_mode is invalid")
        sheets = manifest.get("sheets")
        if not isinstance(sheets, list) or not sheets:
            errors.append("sheets must be a non-empty list")
        else:
            sheet_ids = set()
            for index, sheet in enumerate(sheets):
                sheet_id = sheet.get("id")
                if not sheet_id or sheet_id in sheet_ids:
                    errors.append(f"sheets[{index}].id is missing or duplicated")
                sheet_ids.add(sheet_id)
                errors.extend(_bbox_errors(sheet.get("bbox_document_normalized"), f"sheets[{index}].bbox_document_normalized"))
    blocks = manifest.get("blocks")
    if not isinstance(blocks, list) or not blocks:
        errors.append("blocks must be a non-empty list")
        return errors
    ids: set[str] = set()
    orders: set[int] = set()
    for index, block in enumerate(blocks):
        prefix = f"blocks[{index}]"
        block_id = block.get("id")
        if not isinstance(block_id, str) or not block_id:
            errors.append(f"{prefix}.id is required")
        elif block_id in ids:
            errors.append(f"duplicate block id: {block_id}")
        else:
            ids.add(block_id)
        if block.get("source_page") != 1:
            errors.append(f"{prefix}.source_page must be 1")
        errors.extend(_bbox_errors(block.get("bbox_normalized"), f"{prefix}.bbox_normalized"))
        if version == "2.0":
            errors.extend(_bbox_errors(block.get("bbox_sheet_normalized"), f"{prefix}.bbox_sheet_normalized"))
            if block.get("source_sheet_id") not in sheet_ids:
                errors.append(f"{prefix}.source_sheet_id is unknown")
        if block.get("label") not in LABELS:
            errors.append(f"{prefix}.label is not supported")
        order = block.get("reading_order")
        if not isinstance(order, int) or order < 1 or order in orders:
            errors.append(f"{prefix}.reading_order is invalid or duplicated")
        else:
            orders.add(order)
        confidence = block.get("confidence")
        if not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
            errors.append(f"{prefix}.confidence must be between 0 and 1")
        for key in ("text", "asset_ref"):
            if not isinstance(block.get(key, ""), str):
                errors.append(f"{prefix}.{key} must be a string")
    return errors


def require_approved_fixture(manifest: dict[str, Any], allow_fixture: bool) -> None:
    approval = manifest.get("approval", {})
    if approval.get("status") != "approved":
        raise PermissionError("PPTX export blocked: manifest is not approved")
    if approval.get("approved_fixture") and not allow_fixture:
        raise PermissionError("PPTX export blocked: approved fixtures require --approved-fixture")
    if not approval.get("approved_by"):
        raise PermissionError("PPTX export blocked: approved_by is missing")
