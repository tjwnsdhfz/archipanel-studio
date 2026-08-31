from __future__ import annotations

import hashlib
import itertools
import math
import statistics
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

LABEL_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("title", ("title", "제목", "프로젝트명")), ("project_info", ("info", "개요", "정보")),
    ("context", ("context", "맥락", "배경", "서론")), ("site_analysis", ("site", "대지", "입지")),
    ("concept", ("concept", "개념", "컨셉")), ("design_process", ("process", "프로세스")),
    ("massing", ("mass", "매싱")), ("program", ("program", "프로그램")),
    ("master_plan", ("master", "배치도")), ("floor_plan", ("floor plan", "평면", "plan")),
    ("section", ("section", "단면")), ("elevation", ("elevation", "입면")),
    ("diagram", ("diagram", "다이어그램")), ("render", ("render", "렌더", "투시")),
    ("materials", ("material", "재료")), ("performance", ("performance", "성능", "환경")),
    ("caption", ("caption", "캡션")), ("source", ("source", "출처")), ("colophon", ("colophon", "콜로폰")),
]

DESIGN_SECTIONS: list[dict[str, Any]] = [
    {"id": "identity", "title": "프로젝트 정체성", "labels": ("title", "project_info"), "required": True},
    {"id": "challenge", "title": "문제의식과 목표", "labels": ("prologue", "context"), "required": True},
    {"id": "site_context", "title": "대지와 맥락", "labels": ("site_analysis", "context", "source"), "required": True},
    {"id": "concept", "title": "핵심 개념", "labels": ("concept",), "required": True},
    {"id": "process", "title": "설계 과정과 매싱", "labels": ("design_process", "massing", "diagram"), "required": False},
    {"id": "program", "title": "프로그램", "labels": ("program",), "required": True},
    {"id": "organization", "title": "공간 조직과 동선", "labels": ("diagram", "program"), "required": True},
    {"id": "master_plan", "title": "배치 계획", "labels": ("master_plan",), "required": True},
    {"id": "floor_plan", "title": "평면 계획", "labels": ("floor_plan",), "required": True},
    {"id": "section_elevation", "title": "단면과 입면", "labels": ("section", "elevation"), "required": True},
    {"id": "material_performance", "title": "재료와 성능", "labels": ("materials", "performance"), "required": False},
    {"id": "experience", "title": "공간 경험", "labels": ("render", "detail"), "required": True},
]

STORY_BLUEPRINT: list[dict[str, Any]] = [
    {"section": "identity", "title": "패널 기반 설계설명", "layout": "cover"},
    {"section": "identity", "title": "설계 근거 지도", "layout": "evidence_map"},
    {"section": "challenge", "title": "문제의식과 설계 목표", "layout": "statement"},
    {"section": "site_context", "title": "대지와 맥락", "layout": "image_text"},
    {"section": "concept", "title": "핵심 개념", "layout": "hero"},
    {"section": "process", "title": "개념에서 형태로", "layout": "process"},
    {"section": "program", "title": "프로그램 구성", "layout": "matrix"},
    {"section": "organization", "title": "공간 조직과 연결", "layout": "image_text"},
    {"section": "master_plan", "title": "배치 계획", "layout": "technical"},
    {"section": "floor_plan", "title": "층별 평면 체계", "layout": "technical"},
    {"section": "section_elevation", "title": "단면·입면의 공간 논리", "layout": "technical"},
    {"section": "material_performance", "title": "재료·안전·환경 전략", "layout": "matrix"},
    {"section": "experience", "title": "대표 공간 경험", "layout": "hero"},
    {"section": "experience", "title": "장면과 디테일", "layout": "gallery"},
    {"section": "concept", "title": "개념에서 경험까지", "layout": "synthesis"},
    {"section": "identity", "title": "확인된 근거와 검토 과제", "layout": "closing"},
]


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _label_for(element: dict[str, Any]) -> tuple[str, float, str]:
    haystack = f"{element.get('name', '')} {element.get('text', '')}".lower()
    for label, words in LABEL_RULES:
        if any(word in haystack for word in words):
            return label, 0.84, f"레이어 이름 또는 원문에서 {label} 키워드를 찾았습니다."
    if element.get("type") == "text":
        size = float(element.get("fontSizePt", 0))
        if size >= 42:
            return "title", 0.72, "큰 글자 크기를 제목 후보로 판단했습니다."
        if size <= 13:
            return "caption", 0.61, "작은 글자 크기를 캡션 후보로 판단했습니다."
        return "project_info", 0.46, "일반 텍스트이며 의미 분류 근거가 부족합니다."
    if element.get("type") == "pdf":
        return "floor_plan", 0.48, "PDF 도면 자산이지만 도면 종류는 확인이 필요합니다."
    if element.get("type") == "image":
        return "render", 0.44, "이미지 자산이며 렌더 여부는 확인이 필요합니다."
    return "diagram", 0.36, "도형 요소이며 의미 분류 근거가 부족합니다."


def suggest_content_blocks(project: dict[str, Any], board_id: str) -> list[dict[str, Any]]:
    elements = [item for item in project.get("elements", []) if str(item.get("boardId")) == board_id and item.get("visible", True) and item.get("type") != "group"]
    elements.sort(key=lambda item: (float(item.get("yMm", 0)), float(item.get("xMm", 0))))
    groups: list[list[dict[str, Any]]] = []
    for element in elements:
        if element.get("type") == "text" and groups:
            groups.append([element]); continue
        joined = False
        for group in reversed(groups[-3:]):
            text = next((item for item in group if item.get("type") == "text"), None)
            if not text or element.get("type") == "text": continue
            x_overlap = min(float(text.get("xMm", 0)) + float(text.get("widthMm", 0)), float(element.get("xMm", 0)) + float(element.get("widthMm", 0))) - max(float(text.get("xMm", 0)), float(element.get("xMm", 0)))
            vertical_gap = float(element.get("yMm", 0)) - (float(text.get("yMm", 0)) + float(text.get("heightMm", 0)))
            if x_overlap > 0 and -5 <= vertical_gap <= 35:
                group.append(element); joined = True; break
        if not joined: groups.append([element])
    blocks: list[dict[str, Any]] = []
    for order, group in enumerate(groups, 1):
        seed = next((item for item in group if item.get("type") == "text"), group[0])
        label, confidence, rationale = _label_for(seed)
        title = str(seed.get("text") or seed.get("name") or label).splitlines()[0][:80]
        blocks.append({"id": str(uuid4()), "boardId": board_id, "elementIds": [str(item["id"]) for item in group], "label": label, "title": title,
            "summary": "", "readingOrder": order, "importance": 5 if label == "title" else 4 if label in {"concept", "render", "master_plan"} else 3,
            "confidence": confidence, "status": "suggested" if confidence >= .55 else "needs_review", "rationale": rationale})
    return blocks


def _block_bounds(block: dict[str, Any], by_id: dict[str, dict[str, Any]]) -> tuple[float, float, float, float]:
    items = [by_id[item] for item in block.get("elementIds", []) if item in by_id]
    if not items: return 0, 0, 1, 1
    x = min(float(item.get("xMm", 0)) for item in items); y = min(float(item.get("yMm", 0)) for item in items)
    right = max(float(item.get("xMm", 0)) + float(item.get("widthMm", 1)) for item in items)
    bottom = max(float(item.get("yMm", 0)) + float(item.get("heightMm", 1)) for item in items)
    return x, y, max(1, right - x), max(1, bottom - y)


def _justified_slots(strategy: str, aspects: list[float], width: float, height: float, margin: float, gutter: float) -> tuple[list[tuple[float, float, float, float]], dict[str, float]]:
    """Pack aspect-preserving blocks into full-width rows with consistent gutters.

    The search is deterministic and intentionally small: for every sensible row
    count it evaluates each contiguous partition, then chooses the arrangement
    that fills the safe rectangle most densely without distorting a block.
    """
    count = len(aspects); inner_w, inner_h = width - margin * 2, height - margin * 2
    if count <= 0: return [], {"occupancy": 0, "whitespaceRatio": 1, "gridAlignment": 100, "rowCount": 0}
    safe_aspects = [max(.08, min(12.0, float(value))) for value in aspects]
    best: tuple[float, list[tuple[int, int]], list[float], float] | None = None
    # Thin captions and plans need more rows than image-led boards.  Capping at
    # eight left a large unused lower band for 15–25 imported objects.
    max_rows = min(count, 12)
    for row_count in range(1, max_rows + 1):
        target_height = (inner_h - gutter * (row_count - 1)) / row_count
        if target_height <= 0: continue
        combination_count = math.comb(count - 1, row_count - 1)
        if combination_count <= 1800:
            cut_sets = itertools.combinations(range(1, count), row_count - 1)
        else:
            balanced = tuple(max(1, min(count - 1, round(index * count / row_count))) for index in range(1, row_count))
            cut_sets = [tuple(sorted(set(balanced)))] if len(set(balanced)) == row_count - 1 else []
        for cuts in cut_sets:
            bounds = (0, *cuts, count); ranges = [(bounds[index], bounds[index + 1]) for index in range(row_count)]
            heights = [(inner_w - gutter * (end - start - 1)) / sum(safe_aspects[start:end]) for start, end in ranges]
            total_h = sum(heights) + gutter * (row_count - 1)
            if total_h <= 0: continue
            overflow = max(0.0, total_h - inner_h)
            empty = abs(inner_h - min(inner_h, total_h))
            variance = statistics.pstdev(heights) if len(heights) > 1 else 0.0
            counts = [end - start for start, end in ranges]
            minimum_row_height = inner_h * (.12 if strategy == "hero" else .09)
            legibility_penalty = sum(max(0.0, minimum_row_height - value) for value in heights) * 18
            strategy_penalty = 0.0
            if strategy == "hero":
                strategy_penalty += max(0, counts[0] - 3) * target_height * .55
                strategy_penalty += max(0, heights[0] - target_height * 1.65) * .15
            elif strategy == "technical":
                strategy_penalty += sum(abs(value - 3) for value in counts) * gutter * .8
            else:
                strategy_penalty += sum(abs(value - (count / row_count)) for value in counts) * gutter * .3
            score = overflow * 12 + empty * 4 + variance * .3 + legibility_penalty + strategy_penalty
            if best is None or score < best[0]: best = (score, ranges, heights, total_h)
    if best is None: raise ValueError("레이아웃 행을 계산하지 못했습니다.")
    _, ranges, heights, total_h = best
    scale = min(1.0, inner_h / total_h)
    scaled_gutter = gutter * scale
    scaled_heights = [value * scale for value in heights]
    packed_h = sum(scaled_heights) + scaled_gutter * (len(ranges) - 1)
    y = margin + max(0.0, (inner_h - packed_h) / 2)
    slots: list[tuple[float, float, float, float]] = []
    used_area = 0.0
    for (start, end), row_h in zip(ranges, scaled_heights):
        row_widths = [row_h * safe_aspects[index] for index in range(start, end)]
        packed_w = sum(row_widths) + scaled_gutter * (len(row_widths) - 1)
        x = margin + max(0.0, (inner_w - packed_w) / 2)
        for block_w in row_widths:
            slots.append((x, y, block_w, row_h)); used_area += block_w * row_h
            x += block_w + scaled_gutter
        y += row_h + scaled_gutter
    occupancy = max(0.0, min(1.0, used_area / max(1.0, inner_w * inner_h)))
    return slots, {
        "occupancy": round(occupancy * 100, 2),
        "whitespaceRatio": round((1 - occupancy) * 100, 2),
        "gridAlignment": 100.0,
        "rowCount": float(len(ranges)),
    }


def recommend_layouts(project: dict[str, Any], board_id: str, reference_layouts: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    board = next((item for item in project.get("boards", []) if str(item.get("id")) == board_id), None)
    if not board: raise ValueError("추천할 보드를 찾을 수 없습니다.")
    blocks = sorted([item for item in project.get("contentBlocks", []) if str(item.get("boardId")) == board_id and item.get("status") == "approved"], key=lambda item: int(item.get("readingOrder", 999)))
    if not blocks: raise ValueError("승인된 콘텐츠 블록이 없습니다.")
    by_id = {str(item.get("id")): item for item in project.get("elements", [])}
    references = [item for item in (reference_layouts or []) if item.get("approvalStatus") == "approved"]
    target_vector = [float(board["widthMm"]) / max(1, float(board["heightMm"])), min(1.0, len(blocks) / 24), 0.25]
    def distance(reference: dict[str, Any]) -> float:
        vector = [float(value) for value in reference.get("featureVector", [])[:3]]
        vector += [0.0] * (3 - len(vector))
        return math.sqrt(sum((left - right) ** 2 for left, right in zip(target_vector, vector)))
    nearest = sorted(references, key=lambda item: (distance(item), str(item.get("id"))))[:5]
    similarity = 0 if not nearest else sum(1 / (1 + distance(item)) for item in nearest) / len(nearest)
    proposals: list[dict[str, Any]] = []
    for strategy in ("narrative", "hero", "technical"):
        ordered = list(blocks)
        if strategy == "hero": ordered.sort(key=lambda item: (-int(item.get("importance", 3)), int(item.get("readingOrder", 999))))
        elif strategy == "technical": ordered.sort(key=lambda item: (item.get("label") not in {"master_plan", "floor_plan", "plan", "section", "elevation", "facade"}, int(item.get("readingOrder", 999))))
        layout_units: list[tuple[dict[str, Any], list[str], tuple[float, float, float, float]]] = []
        for block in ordered:
            block_bounds = _block_bounds(block, by_id)
            bx, by, bw, bh = block_bounds
            element_ids = [str(item) for item in block.get("elementIds", []) if str(item) in by_id]
            filled = sum(float(by_id[item].get("widthMm", 1)) * float(by_id[item].get("heightMm", 1)) for item in element_ids)
            density = filled / max(1.0, bw * bh)
            # Keep semantic linkage, but do not make a sparse linked block reserve
            # its large empty bounding rectangle in the physical packing pass.
            if len(element_ids) > 1 and density < .72:
                for element_id in element_ids:
                    element = by_id[element_id]
                    layout_units.append((block, [element_id], (float(element.get("xMm", 0)), float(element.get("yMm", 0)), max(1.0, float(element.get("widthMm", 1))), max(1.0, float(element.get("heightMm", 1))))))
            else:
                layout_units.append((block, element_ids, block_bounds))
        bounds = [unit[2] for unit in layout_units]
        slots, packing = _justified_slots(strategy, [bw / max(1, bh) for _, _, bw, bh in bounds], float(board["widthMm"]), float(board["heightMm"]), float(board.get("safeMarginMm", 10)), max(6, float(board.get("grid", {}).get("sizeMm", 5)) * 2))
        placements: list[dict[str, Any]] = []
        warnings: list[str] = []
        for (block, element_ids, block_bounds), slot in zip(layout_units, slots):
            bx, by, bw, bh = block_bounds; sx, sy, sw, sh = slot
            factor = min(sw / bw, sh / bh)
            for element_id in element_ids:
                element = by_id.get(str(element_id));
                if not element or element.get("locked"): continue
                placements.append({"elementId": str(element_id), "xMm": round(sx + (float(element.get("xMm", 0)) - bx) * factor, 3), "yMm": round(sy + (float(element.get("yMm", 0)) - by) * factor, 3),
                    "widthMm": round(float(element.get("widthMm", 1)) * factor, 3), "heightMm": round(float(element.get("heightMm", 1)) * factor, 3)})
                if element.get("type") == "text" and float(element.get("fontSizePt", 18)) * factor < 11: warnings.append(f"{element.get('name', element_id)}: 배치 후 글자 크기 검토 필요")
        actual_area = sum(float(item["widthMm"]) * float(item["heightMm"]) for item in placements)
        safe_area = max(1.0, (float(board["widthMm"]) - float(board.get("safeMarginMm", 10)) * 2) * (float(board["heightMm"]) - float(board.get("safeMarginMm", 10)) * 2))
        actual_occupancy = max(0.0, min(100.0, actual_area / safe_area * 100))
        packing["occupancy"] = round(actual_occupancy, 2)
        packing["whitespaceRatio"] = round(100 - actual_occupancy, 2)
        if actual_occupancy > 96:
            warnings.append(f"실제 객체 면적 {actual_occupancy:.0f}%: 거터와 백색 공간 검토 필요")
        digest = int(hashlib.sha256(f"{project.get('id')}:{board_id}:{strategy}".encode()).hexdigest()[:8], 16)
        whitespace_continuity = max(55.0, 96.0 - abs(actual_occupancy - 78.0) * 1.1)
        density_balance = max(50.0, 96.0 - max(0.0, actual_occupancy - 90.0) * 3.2)
        scores = {"hardConstraints": 100, "readingOrder": 92 if strategy == "narrative" else 84, "visualHierarchy": 94 if strategy == "hero" else 86, "technicalComparison": 95 if strategy == "technical" else 80, "whitespaceContinuity": round(whitespace_continuity, 2), "densityBalance": round(density_balance, 2), "gutterConsistency": 100.0, "safeMargin": 100.0, "gridAlignment": packing["gridAlignment"], "referenceSimilarity": round(60 + similarity * 35, 2)}
        reasons = ["승인된 콘텐츠 순서와 원본 비율을 유지했습니다.", f"{int(packing['rowCount'])}개 행에 일정한 거터와 정렬 축을 적용했습니다."]
        if strategy == "hero": reasons.append("중요도가 높은 대표 증거를 먼저 배치했습니다.")
        elif strategy == "technical": reasons.append("도면 비교 블록을 우선해 기술 검토 흐름을 만들었습니다.")
        else: reasons.append("맥락에서 경험으로 이어지는 읽기 순서를 유지했습니다.")
        proposals.append({"id": str(uuid4()), "projectId": str(project.get("id")), "boardId": board_id, "strategy": strategy, "placements": placements, "scoreBreakdown": scores,
            "referenceLayoutIds": [str(item.get("id")) for item in nearest[:3]], "recommendationReasons": reasons, "warnings": sorted(set(warnings)), "packingMetrics": packing, "createdAt": _now()})
    return proposals


def validate_layout(project: dict[str, Any], proposal: dict[str, Any]) -> dict[str, Any]:
    board = next((item for item in project.get("boards", []) if str(item.get("id")) == str(proposal.get("boardId"))), None)
    if not board: return {"valid": False, "errors": ["보드 누락"]}
    errors: list[str] = []
    locked = {str(item.get("id")) for item in project.get("elements", []) if item.get("locked")}
    element_to_block = {str(element_id): str(block.get("id")) for block in project.get("contentBlocks", []) for element_id in block.get("elementIds", [])}
    rectangles: list[tuple[str, float, float, float, float]] = []
    for placement in proposal.get("placements", []):
        element_id = str(placement.get("elementId")); x, y, w, h = (float(placement.get(key, 0)) for key in ("xMm", "yMm", "widthMm", "heightMm"))
        if element_id in locked: errors.append(f"잠금 요소 이동: {element_id}")
        if x < 0 or y < 0 or x + w > float(board["widthMm"]) + .01 or y + h > float(board["heightMm"]) + .01: errors.append(f"보드 밖 배치: {element_id}")
        rectangles.append((element_id, x, y, w, h))
    for index, left in enumerate(rectangles):
        for right in rectangles[index + 1:]:
            if element_to_block.get(left[0]) == element_to_block.get(right[0]): continue
            overlap_w = min(left[1] + left[3], right[1] + right[3]) - max(left[1], right[1])
            overlap_h = min(left[2] + left[4], right[2] + right[4]) - max(left[2], right[2])
            if overlap_w > .01 and overlap_h > .01: errors.append(f"요소 겹침: {left[0]} / {right[0]}")
    return {"valid": not errors, "errors": errors, "placementCount": len(rectangles)}


def build_design_explanation_data(project: dict[str, Any], audience: str) -> dict[str, Any]:
    """Map approved panel evidence into a design-explanation contract.

    This deliberately classifies existing evidence only. Missing narrative is
    surfaced as a review flag and is never completed with generated claims.
    """
    blocks = sorted(
        [item for item in project.get("contentBlocks", []) if item.get("status") == "approved"],
        key=lambda item: int(item.get("readingOrder", 999)),
    )
    if not blocks:
        raise ValueError("승인된 콘텐츠 블록이 없습니다.")
    sections: list[dict[str, Any]] = []
    missing: list[str] = []
    for definition in DESIGN_SECTIONS:
        evidence = [
            {
                "contentBlockId": str(block.get("id")),
                "elementIds": [str(item) for item in block.get("elementIds", [])],
                "label": str(block.get("label", "")),
                "title": str(block.get("title") or block.get("label") or "근거 블록"),
                "summary": str(block.get("summary") or ""),
                "confidence": float(block.get("confidence", 0)),
            }
            for block in blocks if str(block.get("label")) in definition["labels"]
        ]
        status = "confirmed" if evidence else "needs_review"
        review_flags = [] if evidence else [f"{definition['title']}을 뒷받침하는 승인 블록이 없습니다."]
        if not evidence:
            missing.append(str(definition["id"]))
        sections.append({**definition, "labels": list(definition["labels"]), "status": status, "evidence": evidence, "reviewFlags": review_flags})
    covered = sum(1 for section in sections if section["status"] == "confirmed")
    return {
        "schemaVersion": "1.0",
        "projectId": str(project.get("id")),
        "projectName": str(project.get("name") or "패널 기반 설계설명"),
        "audience": audience,
        "sections": sections,
        "coverage": {
            "approvedBlockCount": len(blocks),
            "coveredSectionCount": covered,
            "totalSectionCount": len(sections),
            "missingSectionIds": missing,
        },
        "sourceContentBlockIds": [str(item.get("id")) for item in blocks],
        "sourceElementIds": list(dict.fromkeys(str(element_id) for block in blocks for element_id in block.get("elementIds", []))),
        "reviewFlags": [f"필수 데이터 누락: {section['title']}" for section in sections if section["required"] and section["status"] != "confirmed"],
        "generatedAt": _now(),
    }


def _story_items(slide_count: int) -> list[dict[str, Any]]:
    if slide_count == len(STORY_BLUEPRINT):
        return STORY_BLUEPRINT
    return [STORY_BLUEPRINT[min(len(STORY_BLUEPRINT) - 1, round(index * (len(STORY_BLUEPRINT) - 1) / max(1, slide_count - 1)))] for index in range(slide_count)]


def _section_evidence(design_data: dict[str, Any], section_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    sections = {str(item["id"]): item for item in design_data["sections"]}
    section = sections[section_id]
    evidence = list(section["evidence"])
    if not evidence:
        evidence = [item for candidate in design_data["sections"] for item in candidate["evidence"][:1]][:1]
    return section, evidence


def build_storyboard(project: dict[str, Any], duration_minutes: int, slide_count: int, audience: str) -> dict[str, Any]:
    if not 3 <= duration_minutes <= 60 or not 3 <= slide_count <= 60:
        raise ValueError("발표 시간과 장수 범위는 각각 3–60입니다.")
    design_data = build_design_explanation_data(project, audience)
    total = duration_minutes * 60
    base, remainder = divmod(total, slide_count)
    slides: list[dict[str, Any]] = []
    for index, blueprint in enumerate(_story_items(slide_count)):
        section, evidence = _section_evidence(design_data, str(blueprint["section"]))
        if blueprint["layout"] == "cover" and section["status"] != "confirmed":
            experience = next(item for item in design_data["sections"] if item["id"] == "experience")
            if experience["evidence"]:
                evidence = list(experience["evidence"])
        if blueprint["layout"] in {"evidence_map", "closing"}:
            evidence = [item for candidate in design_data["sections"] for item in candidate["evidence"]]
        block_ids = list(dict.fromkeys(str(item["contentBlockId"]) for item in evidence))
        element_ids = list(dict.fromkeys(str(element_id) for item in evidence for element_id in item["elementIds"]))
        source_titles = [str(item["title"]) for item in evidence]
        summaries = [str(item["summary"]).strip() for item in evidence if str(item["summary"]).strip()]
        seconds = base + (1 if index < remainder else 0)
        review = list(section["reviewFlags"])
        generic_summary = not summaries or all("자동 재작성하지 않았" in value or "근거 문장을 입력" in value for value in summaries)
        if generic_summary:
            key_sentence = f"승인된 ‘{source_titles[0]}’ 블록을 통해 {section['title']}의 시각 근거를 확인합니다."
            review.append("설계자가 작성한 핵심 설명 문장 검토 필요")
        else:
            key_sentence = summaries[0]
        if blueprint["layout"] == "evidence_map":
            key_sentence = f"승인 블록 {design_data['coverage']['approvedBlockCount']}개가 설계설명의 {design_data['coverage']['coveredSectionCount']}개 데이터 영역을 뒷받침합니다."
        elif blueprint["layout"] == "cover":
            key_sentence = "승인된 패널 블록을 통해 프로젝트의 공간 구성과 시각 근거를 확인합니다."
        elif blueprint["layout"] == "closing":
            missing = design_data["coverage"]["missingSectionIds"]
            key_sentence = "패널에서 확인된 근거와 추가 확인이 필요한 정보를 분리해 발표를 마무리합니다."
            if missing:
                review.append("누락 설계 데이터: " + ", ".join(missing))
        purpose = f"{section['title']}에 해당하는 승인 패널 근거를 {audience}에게 전달"
        source_lines = [f"- local-project://{project.get('id')}/content-block/{block_id}" for block_id in block_ids]
        notes = (
            f"발표 목적: {purpose}\n핵심 문장: {key_sentence}\n예상 시간: {seconds}초\n"
            f"설계 데이터 영역: {section['id']} · {section['status']}\n"
            f"원본 블록: {', '.join(block_ids)}\n원본 요소: {', '.join(element_ids)}\n"
            f"검토 필요: {'; '.join(review) if review else '없음'}\n\n[Sources]\n" + "\n".join(source_lines) + "\n[/Sources]"
        )
        slides.append({
            "number": index + 1,
            "title": str(blueprint["title"]),
            "purpose": purpose,
            "keySentence": key_sentence,
            "expectedSeconds": seconds,
            "designSectionId": str(section["id"]),
            "layoutKind": str(blueprint["layout"]),
            "evidenceTitles": source_titles,
            "sourceContentBlockIds": block_ids,
            "sourceElementIds": element_ids,
            "speakerNotes": notes,
            "reviewFlags": sorted(set(review)),
        })
    now = _now()
    return {
        "id": str(uuid4()), "projectId": str(project.get("id")), "audience": audience,
        "durationMinutes": duration_minutes, "slideCount": slide_count, "slides": slides,
        "designExplanationData": design_data,
        "approvedContentBlockIds": [str(item) for item in design_data["sourceContentBlockIds"]],
        "approvalStatus": "draft", "createdAt": now, "updatedAt": now,
    }
