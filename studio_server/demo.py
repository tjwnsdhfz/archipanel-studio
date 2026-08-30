from __future__ import annotations

from datetime import UTC, datetime
import os
from pathlib import Path
from typing import Any

from studio_server.intelligence import recommend_layouts

ROOT = Path(__file__).resolve().parents[1]
DEMO_SOURCE = Path(os.environ["ARCHIPANEL_DEMO_SOURCE"]).expanduser() if os.environ.get("ARCHIPANEL_DEMO_SOURCE") else ROOT / "demo-assets" / "panel-example.jpg"
ASSET_ID = "demo-panel-source"
BOARD_ID = "demo-decomposed-board"
ORIGINAL_BOARD_ID = "demo-original-board"

REGIONS: list[dict[str, Any]] = [
    {"id": "hero-a", "name": "대표 렌더 · 조감", "label": "render", "title": "전체 배치와 매스", "crop": (0.000, 0.000, 0.332, 0.335), "importance": 5},
    {"id": "hero-b", "name": "대표 렌더 · 중정", "label": "render", "title": "중정과 연결 공간", "crop": (0.000, 0.335, 0.332, 0.333), "importance": 5},
    {"id": "hero-c", "name": "대표 렌더 · 내부", "label": "render", "title": "내부 학습 공간", "crop": (0.000, 0.668, 0.332, 0.332), "importance": 5},
    {"id": "prologue", "name": "프롤로그", "label": "prologue", "title": "프로젝트 문제의식", "crop": (0.333, 0.000, 0.150, 0.180), "importance": 4},
    {"id": "context", "name": "맥락과 아이디어", "label": "context", "title": "맥락과 핵심 아이디어", "crop": (0.483, 0.000, 0.205, 0.180), "importance": 4},
    {"id": "concept", "name": "개념 다이어그램", "label": "concept", "title": "연결 개념", "crop": (0.688, 0.000, 0.180, 0.180), "importance": 5},
    {"id": "history", "name": "역사적 관점", "label": "site_analysis", "title": "장소와 역사", "crop": (0.868, 0.000, 0.132, 0.180), "importance": 3},
    {"id": "program", "name": "프로그램과 배치 과정", "label": "program", "title": "프로그램 구성", "crop": (0.333, 0.180, 0.205, 0.185), "importance": 4},
    {"id": "diagram", "name": "공간·접근성 다이어그램", "label": "diagram", "title": "연결과 특화 공간", "crop": (0.538, 0.180, 0.205, 0.185), "importance": 4},
    {"id": "detail-renders", "name": "상세 렌더 묶음", "label": "detail", "title": "경험 장면", "crop": (0.743, 0.180, 0.257, 0.320), "importance": 5},
    {"id": "technical", "name": "안전·재료·색채", "label": "materials", "title": "안전과 재료 전략", "crop": (0.333, 0.365, 0.410, 0.135), "importance": 3},
    {"id": "master-plan", "name": "마스터플랜", "label": "master_plan", "title": "배치도", "crop": (0.333, 0.500, 0.189, 0.500), "importance": 5},
    {"id": "floor-plans", "name": "층별 평면도", "label": "floor_plan", "title": "평면 체계", "crop": (0.522, 0.500, 0.478, 0.340), "importance": 5},
    {"id": "section-elevation", "name": "단면과 입면", "label": "section", "title": "단면·입면과 환경", "crop": (0.522, 0.840, 0.478, 0.160), "importance": 4},
]


def build_demo_payload() -> dict[str, Any]:
    if not DEMO_SOURCE.is_file():
        raise FileNotFoundError(DEMO_SOURCE)
    now = datetime.now(UTC).isoformat()
    elements: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []
    for order, region in enumerate(REGIONS, 1):
        x, y, width, height = region["crop"]
        element_id = f"demo-region-{region['id']}"
        elements.append({"id": element_id, "boardId": BOARD_ID, "type": "image", "name": region["name"], "xMm": round(x * 1800, 3), "yMm": round(y * 900, 3), "widthMm": round(width * 1800, 3), "heightMm": round(height * 900, 3), "rotationDeg": 0, "opacity": 1, "visible": True, "locked": False, "assetId": ASSET_ID, "cropNormalized": {"x": x, "y": y, "w": width, "h": height}, "fit": "contain", "flipX": False, "flipY": False})
        blocks.append({"id": f"demo-block-{region['id']}", "boardId": BOARD_ID, "elementIds": [element_id], "label": region["label"], "title": region["title"], "summary": "원본 패널의 해당 영역입니다. 문구를 자동 재작성하지 않았습니다.", "readingOrder": order, "importance": region["importance"], "confidence": 1, "status": "approved", "rationale": "첨부 패널의 시각적 구획을 기준으로 만든 검증용 수동 fixture"})
    original_id = "demo-original-full-panel"
    elements.append({"id": original_id, "boardId": ORIGINAL_BOARD_ID, "type": "image", "name": "원본 패널 · 잠금", "xMm": 0, "yMm": 0, "widthMm": 1800, "heightMm": 900, "rotationDeg": 0, "opacity": 1, "visible": True, "locked": True, "assetId": ASSET_ID, "cropNormalized": {"x": 0, "y": 0, "w": 1, "h": 1}, "fit": "contain", "flipX": False, "flipY": False})
    profile = {"targetDpi": 150, "viewingDistanceMm": 1600, "derivedWidthPx": 10630, "derivedHeightPx": 5315}
    project: dict[str, Any] = {"schemaVersion": "1.1", "id": "archipanel-decomposed-demo", "name": "첨부 패널 분해 · 자동 배치 예시", "defaultDpi": 150, "colorMode": "RGB",
        "boards": [
            {"id": BOARD_ID, "name": "01 · 14개 영역 분해", "widthMm": 1800, "heightMm": 900, "bleedMm": 3, "safeMarginMm": 15, "backgroundColor": "#F4F0E7", "grid": {"enabled": True, "sizeMm": 10, "subdivisions": 2}, "guides": [], "elementIds": [item["id"] for item in elements if item["boardId"] == BOARD_ID], "printProfile": profile.copy()},
            {"id": ORIGINAL_BOARD_ID, "name": "02 · 원본 비교", "widthMm": 1800, "heightMm": 900, "bleedMm": 3, "safeMarginMm": 15, "backgroundColor": "#F4F0E7", "grid": {"enabled": False, "sizeMm": 10, "subdivisions": 2}, "guides": [], "elementIds": [original_id], "printProfile": profile.copy()},
        ], "elements": elements, "assets": [{"id": ASSET_ID, "name": DEMO_SOURCE.name, "mime": "image/jpeg", "sizeBytes": DEMO_SOURCE.stat().st_size, "widthPx": 10630, "heightPx": 5315, "review": ["사용자 제공 예시 패널 · 데모 전용"]}], "fonts": [], "contentBlocks": blocks,
        "typographyStyles": [
            {"role": "title", "label": "제목", "fontFamily": "KoPubWorld Dotum_Pro", "fontSizePt": 64, "lineHeight": 1.1, "letterSpacingPt": -.6, "weight": 700, "color": "#191A18"},
            {"role": "section", "label": "섹션", "fontFamily": "KoPubWorld Dotum_Pro", "fontSizePt": 32, "lineHeight": 1.18, "letterSpacingPt": -.2, "weight": 700, "color": "#191A18"},
            {"role": "body", "label": "본문", "fontFamily": "KoPubWorld Dotum_Pro", "fontSizePt": 18, "lineHeight": 1.35, "letterSpacingPt": 0, "weight": 400, "color": "#282925"},
            {"role": "caption", "label": "캡션", "fontFamily": "KoPubWorld Dotum_Pro", "fontSizePt": 11, "lineHeight": 1.25, "letterSpacingPt": 0, "weight": 400, "color": "#5E605A"},
        ], "layoutProposals": [], "presentationSpecs": [], "createdAt": now, "updatedAt": now}
    reference = {"id": "demo-reference-original-layout", "provenance": {"title": "사용자 제공 건축 패널", "creator": "사용자 제공", "format": "1800×900mm 상당 2:1", "sourceUrl": "local-user-attachment", "license": "사용자 제공 · 데모 검증용", "projectType": "교육시설 건축 패널", "collectedAt": now}, "boardAspectRatio": 2, "columnCount": 5, "whitespaceRatio": .18,
        "blocks": [{"id": block["id"], "bbox": {"x": region["crop"][0], "y": region["crop"][1], "w": region["crop"][2], "h": region["crop"][3]}, "label": block["label"], "readingOrder": block["readingOrder"]} for block, region in zip(blocks, REGIONS)], "featureVector": [2, len(blocks) / 24, .18], "approvalStatus": "approved", "createdAt": now}
    project["layoutProposals"] = recommend_layouts(project, BOARD_ID, [reference])
    return {"project": project, "assetId": ASSET_ID, "assetUrl": "/api/demo/decomposed-panel/asset", "referenceLayout": reference, "regionCount": len(REGIONS), "sourceNotice": "첨부 패널은 데모용으로만 분해했으며 원문을 생성·수정하지 않았습니다."}
