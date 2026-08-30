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
        if actual_occupancy < 80:
            warnings.append(f"실제 객체 면적 {actual_occupancy:.0f}%: 빈 공간 검토 필요")
        digest = int(hashlib.sha256(f"{project.get('id')}:{board_id}:{strategy}".encode()).hexdigest()[:8], 16)
        scores = {"hardConstraints": 100, "readingOrder": 92 if strategy == "narrative" else 84, "visualHierarchy": 94 if strategy == "hero" else 86, "technicalComparison": 95 if strategy == "technical" else 80, "spaceUtilization": packing["occupancy"], "gridAlignment": packing["gridAlignment"], "referenceSimilarity": round(60 + similarity * 35, 2)}
        proposals.append({"id": str(uuid4()), "projectId": str(project.get("id")), "boardId": board_id, "strategy": strategy, "placements": placements, "scoreBreakdown": scores,
            "referenceLayoutIds": [str(item.get("id")) for item in nearest[:3]], "warnings": sorted(set(warnings)), "packingMetrics": packing, "createdAt": _now()})
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


def build_storyboard(project: dict[str, Any], duration_minutes: int, slide_count: int, audience: str) -> dict[str, Any]:
    if not 3 <= duration_minutes <= 60 or not 3 <= slide_count <= 60: raise ValueError("발표 시간과 장수 범위는 각각 3–60입니다.")
    blocks = sorted([item for item in project.get("contentBlocks", []) if item.get("status") == "approved"], key=lambda item: int(item.get("readingOrder", 999)))
    if not blocks: raise ValueError("승인된 콘텐츠 블록이 없습니다.")
    total = duration_minutes * 60; base, remainder = divmod(total, slide_count); slides = []
    for index in range(slide_count):
        block = blocks[min(len(blocks) - 1, index * len(blocks) // slide_count)]
        seconds = base + (1 if index < remainder else 0); title = str(block.get("title") or block.get("label") or f"슬라이드 {index + 1}")
        review = [] if block.get("summary") else ["핵심 문장 검토 필요"]
        key_sentence = str(block.get("summary") or "근거 문장을 입력하세요.")
        notes = f"발표 목적: {block.get('label')} 설명\n핵심 문장: {key_sentence}\n예상 시간: {seconds}초\n원본 블록: {block.get('id')}\n원본 요소: {', '.join(map(str, block.get('elementIds', [])))}"
        slides.append({"number": index + 1, "title": title, "purpose": f"{block.get('label')} 블록의 역할과 근거를 전달", "keySentence": key_sentence, "expectedSeconds": seconds,
            "sourceContentBlockIds": [str(block.get("id"))], "sourceElementIds": [str(item) for item in block.get("elementIds", [])], "speakerNotes": notes, "reviewFlags": review})
    now = _now()
    return {"id": str(uuid4()), "projectId": str(project.get("id")), "audience": audience, "durationMinutes": duration_minutes, "slideCount": slide_count, "slides": slides,
        "approvedContentBlockIds": [str(item.get("id")) for item in blocks], "approvalStatus": "draft", "createdAt": now, "updatedAt": now}
