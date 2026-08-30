from __future__ import annotations

import base64
import io
import os
import tempfile
from pathlib import Path
from typing import Any
from uuid import uuid4

import pymupdf as fitz
from PIL import Image

from archipanel_agent.raster import render_image_preview


def analyze_asset(path: Path, mime: str, max_regions: int = 20) -> dict[str, Any]:
    if mime == "application/pdf" or path.suffix.lower() == ".pdf":
        return _analyze_pdf(path, max_regions)
    return _analyze_image(path, mime, max_regions)


def _data_url(image: Image.Image, mime: str = "image/jpeg") -> str:
    stream = io.BytesIO()
    image.convert("RGB").save(stream, "JPEG", quality=84, optimize=True)
    return f"data:{mime};base64,{base64.b64encode(stream.getvalue()).decode('ascii')}"


def _bbox(x0: float, y0: float, x1: float, y1: float, width: float, height: float) -> dict[str, float]:
    return {"x": round(max(0.0, x0 / width), 6), "y": round(max(0.0, y0 / height), 6),
            "w": round(min(1.0, max(0.001, (x1 - x0) / width)), 6), "h": round(min(1.0, max(0.001, (y1 - y0) / height)), 6)}


def _label_for_bbox(box: dict[str, float], kind: str, text: str = "") -> tuple[str, float, str]:
    haystack = text.lower()
    rules = [("title", ("title", "제목")), ("concept", ("concept", "컨셉", "개념")),
             ("master_plan", ("master plan", "배치도")), ("floor_plan", ("floor plan", "평면")),
             ("section", ("section", "단면")), ("elevation", ("elevation", "입면")),
             ("program", ("program", "프로그램")), ("render", ("render", "perspective", "투시"))]
    for label, words in rules:
        if any(word in haystack for word in words):
            return label, .86, f"원문 키워드에서 {label} 후보를 찾았습니다."
    aspect = box["w"] / max(.001, box["h"]); area = box["w"] * box["h"]
    if kind == "text":
        if aspect > 5 and box["h"] < .1: return "title", .64, "넓고 낮은 텍스트 영역입니다."
        return "project_info", .48, "PDF 텍스트 원문이지만 의미 분류는 확인이 필요합니다."
    if area > .22 and aspect > 1.25: return "render", .56, "면적이 큰 가로형 시각 영역입니다."
    if aspect > 2.8 and area < .12: return "diagram", .43, "가로로 긴 시각 영역입니다."
    return "diagram", .4, "시각 영역의 정확한 건축 라벨은 확인이 필요합니다."


def _candidate(page_index: int, kind: str, box: dict[str, float], title: str, text: str = "") -> dict[str, Any]:
    label, confidence, rationale = _label_for_bbox(box, kind, text or title)
    return {"id": str(uuid4()), "pageIndex": page_index, "kind": kind, "bboxNormalized": box,
            "label": label, "title": title[:100], "text": text, "confidence": confidence,
            "status": "suggested" if confidence >= .55 else "needs_review", "rationale": rationale}


def _analyze_pdf(path: Path, max_regions: int) -> dict[str, Any]:
    document = fitz.open(path)
    pages: list[dict[str, Any]] = []
    total = 0
    try:
        for page_index, page in enumerate(document):
            width, height = float(page.rect.width), float(page.rect.height)
            scale = min(2.0, 1400 / max(width, height, 1))
            pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            preview = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            text_regions: list[tuple[float, float, float, float, str]] = []
            visual_regions: list[dict[str, float]] = []
            for block in page.get_text("blocks", sort=True):
                x0, y0, x1, y1 = map(float, block[:4]); text = str(block[4] or "").strip()
                block_type = int(block[6]) if len(block) > 6 else 0
                if x1 <= x0 or y1 <= y0: continue
                box = _bbox(x0, y0, x1, y1, width, height)
                if box["w"] * box["h"] < .00035: continue
                if block_type == 0 and text:
                    text_regions.append((x0, y0, x1, y1, text))
                elif block_type == 1:
                    visual_regions.append(box)
            for info in page.get_image_info(xrefs=True):
                raw = info.get("bbox")
                if not raw: continue
                box = _bbox(float(raw[0]), float(raw[1]), float(raw[2]), float(raw[3]), width, height)
                if box["w"] * box["h"] < .002: continue
                if any(_overlap(item, box) > .8 for item in visual_regions): continue
                visual_regions.append(box)
            merged_text = _merge_text_regions(text_regions, width, height)
            visual_candidates = [_candidate(page_index, "pdf_region", box, f"PDF 시각 객체 · p.{page_index + 1}") for box in visual_regions]
            text_candidates = [_candidate(page_index, "text", _bbox(x0, y0, x1, y1, width, height), text.splitlines()[0], text) for x0, y0, x1, y1, text in merged_text]
            visual_limit = min(len(visual_candidates), max(1, max_regions // 2)); candidates = visual_candidates[:visual_limit]
            candidates.extend(text_candidates[:max_regions - len(candidates)])
            if not candidates:
                candidates.append(_candidate(page_index, "pdf_region", {"x": 0, "y": 0, "w": 1, "h": 1}, f"PDF 전체 페이지 · p.{page_index + 1}"))
            _assign_groups(candidates, width, height)
            pages.append({"pageIndex": page_index, "widthPt": width, "heightPt": height,
                          "widthPx": pix.width, "heightPx": pix.height, "thumbnailDataUrl": _data_url(preview),
                          "candidates": candidates})
            total += len(candidates)
    finally:
        document.close()
    return {"mime": "application/pdf", "pageCount": len(pages), "pages": pages, "candidateCount": total,
            "review": ["PDF 텍스트는 원문 그대로 추출했습니다.", "도면 종류와 낮은 확신도 라벨은 사용자 확인이 필요합니다."]}


def _assign_groups(candidates: list[dict[str, Any]], width: float, height: float) -> None:
    """Link only genuinely adjacent objects.

    Coarse page bins made distant captions share one enormous bounding box.  The
    recommender then counted that empty bounding-box area as occupied.  This
    proximity pass keeps a heading with the object immediately below it, while
    distant objects remain independently packable.
    """
    groups: list[list[dict[str, Any]]] = []
    ordered = sorted(candidates, key=lambda item: (item["bboxNormalized"]["y"], item["bboxNormalized"]["x"]))
    for candidate in ordered:
        box = candidate["bboxNormalized"]
        if box["w"] * box["h"] >= .65:
            groups.append([candidate])
            continue
        target: list[dict[str, Any]] | None = None
        for group in reversed(groups[-8:]):
            if any(item["bboxNormalized"]["w"] * item["bboxNormalized"]["h"] >= .65 for item in group):
                continue
            gx0 = min(item["bboxNormalized"]["x"] for item in group)
            gy0 = min(item["bboxNormalized"]["y"] for item in group)
            gx1 = max(item["bboxNormalized"]["x"] + item["bboxNormalized"]["w"] for item in group)
            gy1 = max(item["bboxNormalized"]["y"] + item["bboxNormalized"]["h"] for item in group)
            x_overlap = min(gx1, box["x"] + box["w"]) - max(gx0, box["x"])
            overlap_ratio = x_overlap / max(.001, min(gx1 - gx0, box["w"]))
            vertical_gap = box["y"] - gy1
            combined_area = (max(gx1, box["x"] + box["w"]) - min(gx0, box["x"])) * (max(gy1, box["y"] + box["h"]) - min(gy0, box["y"]))
            filled_area = sum(item["bboxNormalized"]["w"] * item["bboxNormalized"]["h"] for item in group) + box["w"] * box["h"]
            dense_pair = filled_area / max(.000001, combined_area) >= .46
            if overlap_ratio >= .58 and -.006 <= vertical_gap <= .022 and dense_pair:
                target = group
                break
        if target is None:
            groups.append([candidate])
        else:
            target.append(candidate)
    for index, group in enumerate(groups):
        key = f"page-{group[0]['pageIndex']}-linked-{index}"
        for candidate in group:
            candidate["groupKey"] = key


def _merge_text_regions(regions: list[tuple[float, float, float, float, str]], width: float, height: float) -> list[tuple[float, float, float, float, str]]:
    merged: list[list[Any]] = []
    for x0, y0, x1, y1, text in sorted(regions, key=lambda item: (item[1], item[0])):
        target = None
        for item in reversed(merged[-8:]):
            overlap = min(item[2], x1) - max(item[0], x0); minimum_width = max(1.0, min(item[2] - item[0], x1 - x0))
            vertical_gap = y0 - item[3]
            same_column = overlap / minimum_width >= .55 and -.005 * height <= vertical_gap <= .018 * height
            same_line = abs(y0 - item[1]) <= .006 * height and 0 <= x0 - item[2] <= .012 * width
            if same_column or same_line: target = item; break
        if target is None: merged.append([x0, y0, x1, y1, text])
        else:
            target[0] = min(target[0], x0); target[1] = min(target[1], y0); target[2] = max(target[2], x1); target[3] = max(target[3], y1); target[4] = f"{target[4]}\n{text}"
    return [tuple(item) for item in merged]


def _overlap(a: dict[str, float], b: dict[str, float]) -> float:
    w = max(0.0, min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]))
    h = max(0.0, min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"]))
    return w * h / max(.000001, min(a["w"] * a["h"], b["w"] * b["h"]))


def _analyze_image(path: Path, mime: str, max_regions: int) -> dict[str, Any]:
    handle, preview_name = tempfile.mkstemp(prefix="archipanel-analysis-", suffix=".jpg"); os.close(handle)
    preview_path = Path(preview_name)
    try:
        _, _, original_size, _ = render_image_preview(path, preview_path, max_edge=1400)
        width, height = original_size
        with Image.open(preview_path) as source:
            preview = source.convert("RGB")
            analysis = preview.copy(); analysis.thumbnail((720, 720), Image.Resampling.BILINEAR)
    finally:
        preview_path.unlink(missing_ok=True)
    regions = _split_whitespace(analysis, max_regions)
    candidates = []
    for index, (x0, y0, x1, y1) in enumerate(regions):
        box = _bbox(x0, y0, x1, y1, analysis.width, analysis.height)
        candidates.append(_candidate(0, "image_region", box, f"이미지 영역 {index + 1:02d}"))
    _assign_groups(candidates, width, height)
    return {"mime": mime, "pageCount": 1, "widthPx": width, "heightPx": height, "candidateCount": len(candidates),
            "pages": [{"pageIndex": 0, "widthPx": width, "heightPx": height, "thumbnailDataUrl": _data_url(preview), "candidates": candidates}],
            "review": ["여백과 시각 밀도를 기준으로 분해한 후보입니다.", "의미 라벨과 영역 경계는 적용 전에 확인하세요."]}


def _split_whitespace(image: Image.Image, max_regions: int) -> list[tuple[int, int, int, int]]:
    rgb = image.convert("RGB"); source = rgb.load(); width, height = rgb.size
    active = [[False] * width for _ in range(height)]
    for y in range(height):
        for x in range(width):
            red, green, blue = source[x, y]
            active[y][x] = min(red, green, blue) < 242 or max(red, green, blue) - min(red, green, blue) > 18

    def gaps(box: tuple[int, int, int, int], axis: str) -> list[tuple[int, int]]:
        x0, y0, x1, y1 = box; start, end = (x0, x1) if axis == "x" else (y0, y1)
        positions = list(range(start + 2, end - 2)); values: list[float] = []
        for pos in positions:
            if axis == "x": value = sum(1 for y in range(y0, y1) if active[y][pos]) / max(1, y1 - y0)
            else: value = sum(1 for x in range(x0, x1) if active[pos][x]) / max(1, x1 - x0)
            values.append(value)
        if not values: return []
        ordered = sorted(values); threshold = min(.68, ordered[max(0, len(ordered) // 10)] + .035)
        minimum = max(4, int((end - start) * .01)); found: list[tuple[int, int]] = []; run = -1
        for pos, value in zip(positions, values):
            if value <= threshold and run < 0: run = pos
            if (value > threshold or pos == end - 3) and run >= 0:
                stop = pos if value > threshold else pos + 1
                if stop - run >= minimum and run - start > (end - start) * .08 and end - stop > (end - start) * .08: found.append((run, stop))
                run = -1
        return found

    boxes = [(0, 0, width, height)]
    while len(boxes) < max_regions:
        best: tuple[float, int, str, tuple[int, int]] | None = None
        for index, (x0, y0, x1, y1) in enumerate(boxes):
            box = (x0, y0, x1, y1)
            for axis, found in (("x", gaps(box, "x")), ("y", gaps(box, "y"))):
                for gap in found:
                    score = (gap[1] - gap[0]) / max(1, (x1 - x0) if axis == "x" else (y1 - y0))
                    if best is None or score > best[0]: best = (score, index, axis, gap)
        if best is None: break
        _, index, axis, (start, stop) = best; x0, y0, x1, y1 = boxes.pop(index)
        boxes.extend([(x0, y0, start, y1), (stop, y0, x1, y1)] if axis == "x" else [(x0, y0, x1, start), (x0, stop, x1, y1)])
    def trim(box: tuple[int, int, int, int]) -> tuple[int, int, int, int] | None:
        x0, y0, x1, y1 = box; xs: list[int] = []; ys: list[int] = []
        for y in range(y0, y1):
            for x in range(x0, x1):
                if active[y][x]: xs.append(x); ys.append(y)
        if not xs: return None
        padding = 2
        return max(0, min(xs) - padding), max(0, min(ys) - padding), min(width, max(xs) + padding + 1), min(height, max(ys) + padding + 1)

    minimum_area = width * height * .008
    boxes = [trimmed for box in boxes if (trimmed := trim(box)) and (trimmed[2] - trimmed[0]) * (trimmed[3] - trimmed[1]) >= minimum_area and (trimmed[2] - trimmed[0]) >= width * .06 and (trimmed[3] - trimmed[1]) >= height * .04]
    boxes.sort(key=lambda box: (box[1], box[0]))
    return boxes or [(0, 0, width, height)]
