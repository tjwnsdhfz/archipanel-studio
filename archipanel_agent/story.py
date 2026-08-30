from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .models import VISUAL_LABELS


STORY_SLOTS = [
    ("건축 프로젝트의 중심 장면", "대표 이미지와 제목으로 프로젝트의 정체성을 엽니다.", 45, ["title", "render", "project_info"]),
    ("문제의식이 설계의 출발점을 만듭니다", "패널의 서문과 맥락 블록에서 설계가 답하려는 질문을 확인합니다.", 55, ["prologue", "context"]),
    ("대지의 조건을 설계 근거로 읽습니다", "입지·주변 조직·접근 조건을 대지분석 도면으로 설명합니다.", 55, ["site_analysis", "context"]),
    ("개념은 공간 관계를 조직하는 규칙입니다", "개념 블록과 다이어그램을 연결해 핵심 공간 논리를 보여줍니다.", 60, ["concept", "diagram"]),
    ("형태는 단계적 설계 과정에서 도출됩니다", "디자인 프로세스와 매싱 변화의 순서를 원본 도해로 따라갑니다.", 55, ["design_process", "massing"]),
    ("프로그램의 배치가 관계를 만듭니다", "프로그램 구성과 연결 방식을 패널의 프로그램 블록에서 읽습니다.", 55, ["program", "diagram"]),
    ("전체 배치는 대지와 건축을 결합합니다", "마스터플랜과 배치도에서 진입·외부공간·건물 관계를 확인합니다.", 65, ["master_plan", "site_plan"]),
    ("동선은 공간 경험의 순서를 결정합니다", "보행·차량·수직 동선의 흐름을 동선 도해와 평면에서 추적합니다.", 60, ["circulation", "floor_plan"]),
    ("첫 평면이 주요 공간의 작동을 보여줍니다", "핵심 층 평면을 원본 비율로 확대해 프로그램과 연결을 설명합니다.", 65, ["floor_plan", "plan"]),
    ("상부 평면은 반복과 변화를 비교합니다", "층별 평면의 공통 구조와 달라지는 공간을 나란히 봅니다.", 65, ["floor_plan", "plan"]),
    ("단면은 높이와 공공공간의 관계를 드러냅니다", "단면을 통해 레벨·보이드·채광·수직 연결을 확인합니다.", 60, ["section"]),
    ("입면은 구조와 재료의 외부 표현입니다", "입면과 파사드 블록에서 리듬·개구부·외피 구성을 읽습니다.", 55, ["elevation", "facade"]),
    ("재료와 상세가 개념을 실제 접합으로 바꿉니다", "재료 팔레트와 상세 블록을 통해 설계 언어의 구현 범위를 확인합니다.", 55, ["materials", "detail"]),
    ("렌더는 사용자가 경험할 공간을 검증합니다", "외부와 내부 렌더를 비교해 이동·머묾·시선의 장면을 설명합니다.", 60, ["render", "detail"]),
    ("성능과 접근성은 별도 검토 항목으로 남깁니다", "친환경·안전·무장애 정보는 원문 근거만 제시하고 미확인 수치는 보정하지 않습니다.", 50, ["performance", "accessibility"]),
    ("도면과 장면이 하나의 설계 논리로 회수됩니다", "대지에서 공간 경험까지의 흐름을 원본 블록과 함께 정리합니다.", 40, ["concept", "master_plan", "section", "render"]),
]


def _pick(blocks: list[dict[str, Any]], labels: list[str], used: set[str], limit: int = 3) -> list[str]:
    chosen: list[str] = []
    for label in labels:
        candidates = [b for b in blocks if b["label"] == label]
        candidates.sort(key=lambda b: (b["id"] in used, -float(b.get("confidence", 0)), b["reading_order"]))
        if candidates and candidates[0]["id"] not in chosen:
            chosen.append(candidates[0]["id"])
            used.add(candidates[0]["id"])
        if len(chosen) >= limit:
            break
    if not chosen:
        fallback = sorted(blocks, key=lambda b: (b["id"] in used, -float(b.get("confidence", 0)), b["reading_order"]))[0]
        chosen = [fallback["id"]]
        used.add(fallback["id"])
    return chosen


def build_storyboard(manifest: dict[str, Any]) -> dict[str, Any]:
    if manifest.get("approval", {}).get("status") != "approved":
        raise PermissionError("Storyboarding requires an approved manifest")
    blocks = sorted(manifest["blocks"], key=lambda item: item["reading_order"])
    block_map = {block["id"]: block for block in blocks}
    used: set[str] = set()
    slides, notes_map = [], {}
    for number, (title, key_sentence, seconds, labels) in enumerate(STORY_SLOTS, 1):
        source_ids = _pick(blocks, labels, used)
        visual_ids = [block_id for block_id in source_ids if block_map[block_id]["label"] in VISUAL_LABELS]
        if not visual_ids:
            visuals = [block for block in blocks if block["label"] in VISUAL_LABELS]
            visual_ids = [min(visuals or blocks, key=lambda b: (b["id"] in used, b["reading_order"]))["id"]]
            if visual_ids[0] not in source_ids:
                source_ids.append(visual_ids[0])
        purpose = "건축 심사자가 패널의 원본 도면과 장면을 따라 설계 논리를 단계적으로 이해하도록 한다."
        if number == 1:
            purpose = "대표 장면과 프로젝트 정보를 통해 발표의 범위와 중심 질문을 소개한다."
        elif number == 16:
            purpose = "대지·개념·도면·경험의 관계를 원본 근거와 함께 회수한다."
        notes = (
            f"발표 목적: {purpose}\n핵심 문장: {key_sentence}\n예상 시간: {seconds}초\n"
            f"source_block_ids: {', '.join(source_ids)}\n[Sources]\n"
            f"- Local source panel: {manifest['source']['path']}\n- Source blocks: {', '.join(source_ids)}"
        )
        slides.append({"number": number, "title": title, "description": key_sentence, "purpose": purpose, "key_sentence": key_sentence, "expected_seconds": seconds, "source_block_ids": source_ids, "visual_block_ids": visual_ids, "speaker_notes": notes})
        notes_map[str(number)] = notes
    return {
        "schema_version": "2.0", "created_at": datetime.now(timezone.utc).isoformat(),
        "audience": "건축 스튜디오 크리틱·심사위원", "duration_minutes": 15, "slide_count": 16,
        "communication_job": "발표가 끝날 때 심사자는 대지 조건에서 개념, 배치, 평면, 단면, 재료와 공간 경험으로 이어지는 설계 논리를 원본 패널 블록을 통해 추적할 수 있어야 한다.",
        "slides": slides, "source_block_ids": sorted({bid for slide in slides for bid in slide["source_block_ids"]}),
        "speaker_notes": notes_map, "review_flags": list(manifest.get("review_flags", [])),
    }
