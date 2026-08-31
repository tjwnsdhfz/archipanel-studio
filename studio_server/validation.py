from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class Issue:
    severity: str
    code: str
    message: str
    board_id: str | None = None
    element_id: str | None = None

    def json(self) -> dict[str, Any]:
        return {key: value for key, value in asdict(self).items() if value is not None}


def validate_project(project: dict[str, Any], available_assets: set[str], available_fonts: set[str]) -> list[dict[str, Any]]:
    issues: list[Issue] = []
    if project.get("schemaVersion") not in {"1.0", "1.1", "1.2", "1.3", "1.4"}:
        issues.append(Issue("error", "schema-version", "지원하는 프로젝트 스키마는 1.0–1.4입니다."))
    boards = project.get("boards")
    elements = project.get("elements")
    if not isinstance(boards, list) or not boards:
        issues.append(Issue("error", "boards-empty", "보드가 하나 이상 필요합니다."))
        boards = []
    if not isinstance(elements, list):
        issues.append(Issue("error", "elements-invalid", "elements는 배열이어야 합니다."))
        elements = []
    board_map = {board.get("id"): board for board in boards if isinstance(board, dict)}
    element_ids: set[str] = set()
    for element in elements:
        if not isinstance(element, dict):
            issues.append(Issue("error", "element-invalid", "잘못된 요소 데이터가 있습니다."))
            continue
        element_id = str(element.get("id", ""))
        if not element_id or element_id in element_ids:
            issues.append(Issue("error", "element-id", "요소 ID가 없거나 중복됩니다.", element_id=element_id or None))
        element_ids.add(element_id)
        board = board_map.get(element.get("boardId"))
        if not board:
            issues.append(Issue("error", "missing-board", f"{element.get('name', element_id)}: 보드를 찾을 수 없습니다.", element_id=element_id))
            continue
        x, y = _number(element.get("xMm")), _number(element.get("yMm"))
        width, height = _number(element.get("widthMm")), _number(element.get("heightMm"))
        if min(width, height) < 0 or x < 0 or y < 0 or x + width > _number(board.get("widthMm")) or y + height > _number(board.get("heightMm")):
            issues.append(Issue("error", "outside-board", f"{element.get('name', element_id)}: 보드 경계를 벗어났습니다.", str(board.get("id")), element_id))
        if element.get("type") in {"image", "pdf"} and str(element.get("assetId")) not in available_assets:
            issues.append(Issue("error", "missing-asset", f"{element.get('name', element_id)}: 원본 자산이 없습니다.", str(board.get("id")), element_id))
        if element.get("type") == "psd_layer" and str(element.get("previewAssetId")) not in available_assets:
            issues.append(Issue("error", "missing-psd-preview", f"{element.get('name', element_id)}: PSD 레이어 미리보기가 없습니다.", str(board.get("id")), element_id))
        font_id = element.get("fontAssetId") if element.get("type") == "text" else None
        if font_id and str(font_id) not in available_fonts:
            issues.append(Issue("error", "missing-font", f"{element.get('name', element_id)}: 글꼴 파일이 없습니다.", str(board.get("id")), element_id))
        transform = element.get("transform") or {}
        blend_mode = str(element.get("blendMode", "normal"))
        if blend_mode not in {"normal", "multiply", "screen", "overlay", "darken", "lighten"}:
            issues.append(Issue("error", "blend-mode", f"{element.get('name', element_id)}: 지원하지 않는 혼합 모드입니다.", str(board.get("id")), element_id))
        elif blend_mode != "normal":
            issues.append(Issue("info", "blend-board-rasterized", f"{element.get('name', element_id)}: {blend_mode} 혼합 때문에 보드가 목표 DPI에서 합성됩니다.", str(board.get("id")), element_id))
        if abs(_number(transform.get("skewXDeg"))) > 60 or abs(_number(transform.get("skewYDeg"))) > 60:
            issues.append(Issue("error", "transform-skew", f"{element.get('name', element_id)}: 기울기 범위는 -60°~60°입니다.", str(board.get("id")), element_id))
        if element.get("type") in {"image", "pdf", "psd_layer"}:
            mask = element.get("mask") or {}
            adjustments = element.get("adjustments") or {}
            if mask.get("enabled") and mask.get("operations"):
                issues.append(Issue("info", "layer-rasterized", f"{element.get('name', element_id)}: 마스크 적용으로 해당 레이어가 목표 DPI에서 합성됩니다.", str(board.get("id")), element_id))
            if any(abs(_number(value)) > 0.0001 for value in adjustments.values()):
                issues.append(Issue("info", "layer-adjusted", f"{element.get('name', element_id)}: 비파괴 이미지 보정이 출력에 적용됩니다.", str(board.get("id")), element_id))
    issues.append(Issue("info", "rgb-output", "이 프로젝트는 RGB PDF/래스터로 출력됩니다."))
    return [issue.json() for issue in issues]


def _number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0
