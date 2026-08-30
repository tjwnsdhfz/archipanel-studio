from __future__ import annotations

import hashlib
import math
import uuid
from datetime import datetime, timezone
from typing import Any

SECTION_ORDER = [
    ("identity", "프로젝트 개요", {"title", "project_info", "prologue"}),
    ("experience", "대표 장면", {"render"}),
    ("context", "대지와 맥락", {"context", "site_analysis", "master_plan", "site_plan"}),
    ("problem", "문제와 근거", {"performance", "accessibility", "source"}),
    ("concept", "핵심 개념", {"concept", "diagram"}),
    ("process", "형태와 프로그램", {"design_process", "massing", "program", "circulation"}),
    ("drawings", "공간 구성", {"floor_plan", "plan"}),
    ("technical", "단면과 구축", {"section", "elevation", "facade", "materials", "detail"}),
    ("synthesis", "최종 종합", {"render", "model"}),
]

PAGE_TYPE_BY_LABEL = {
    "title": "cover", "project_info": "summary_axon", "prologue": "summary_axon",
    "render": "hero_render", "context": "context_map", "site_analysis": "context_map",
    "master_plan": "full_plan", "site_plan": "full_plan", "performance": "problem_evidence",
    "accessibility": "problem_evidence", "concept": "concept_statement", "diagram": "concept_statement",
    "design_process": "process_sequence", "massing": "process_sequence", "program": "program_mapping",
    "circulation": "program_mapping", "floor_plan": "full_plan", "plan": "plan_callout",
    "section": "section_elevation", "elevation": "section_elevation", "facade": "section_elevation",
    "materials": "material_detail", "detail": "material_detail", "caption": "gallery", "source": "problem_evidence",
}


def _id(prefix: str, seed: str) -> str:
    return f"{prefix}-{hashlib.sha256(seed.encode()).hexdigest()[:16]}"


def _section(label: str) -> tuple[str, str]:
    for key, title, labels in SECTION_ORDER:
        if label in labels: return key, title
    return "evidence", "설계 근거"


def _notes(page: dict[str, Any], project_id: str) -> str:
    sources = "\n".join(f"- local-project://{project_id}/content-block/{item}" for item in page["sourceContentBlockIds"])
    originals = "\n".join(page.get("originalEvidence", [])) or "원문 근거 없음"
    return (f"페이지 목적: {page['purpose']}\n핵심 문장: {page['claim']}\n예상 시간: {page['expectedSeconds']}초\n"
            f"원본 블록: {', '.join(page['sourceContentBlockIds'])}\n원본 요소: {', '.join(page['sourceElementIds'])}\n"
            f"검토 필요: {'; '.join(page['reviewFlags']) or '없음'}\n원문 근거:\n{originals}\n\n[Sources]\n{sources}\n[/Sources]")


def build_design_statement(project: dict[str, Any], profile: str = "detailed", audience: str = "건축 설계 심사위원", target_pages: int = 24, seed: int = 1401) -> dict[str, Any]:
    if profile not in {"detailed", "live"}: raise ValueError("설명서 프로필은 detailed 또는 live여야 합니다.")
    approved = sorted((b for b in project.get("contentBlocks", []) if b.get("status") == "approved"), key=lambda b: (int(b.get("readingOrder", 0)), str(b.get("id"))))
    if not approved: raise ValueError("승인된 콘텐츠 블록이 없습니다.")
    element_ids = {str(e.get("id")) for e in project.get("elements", [])}
    for block in approved:
        if not set(map(str, block.get("elementIds", []))).issubset(element_ids): raise ValueError(f"블록 {block.get('id')}에 존재하지 않는 요소가 있습니다.")
    target_pages = max(18, min(30, int(target_pages))) if profile == "detailed" else max(14, min(18, int(target_pages)))
    project_info = project.get("designStatement", {}).get("projectInfo", {})
    identity = str(project_info.get("name") or project.get("name") or "프로젝트")
    pages: list[dict[str, Any]] = []

    def add(page_type: str, title: str, claim: str, blocks: list[dict], purpose: str, section_key: str, section_title: str, review: list[str] | None = None):
        ids = [str(b["id"]) for b in blocks]; elements = list(dict.fromkeys(str(e) for b in blocks for e in b.get("elementIds", [])))
        page = {"id": _id("page", f"{project.get('id')}:{seed}:{len(pages)}:{','.join(ids)}"), "number": len(pages) + 1, "section": section_key,
            "sectionTitle": section_title, "pageType": page_type, "title": title, "claim": claim, "supportingText": "\n".join(str(b.get("summary") or "") for b in blocks if b.get("summary"))[:700],
            "caption": "", "purpose": purpose, "expectedSeconds": 0, "visualSlots": [{"elementId": eid, "fit": "contain" if page_type in {"full_plan", "plan_callout", "section_elevation", "context_map"} else "cover", "crop": None} for eid in elements[:4]],
            "sourceContentBlockIds": ids, "sourceElementIds": elements, "originalEvidence": [str(b.get("title") or b.get("label")) for b in blocks],
            "reviewFlags": list(review or []), "approvalStatus": "draft"}
        page["notes"] = _notes(page, str(project.get("id", "project"))); pages.append(page)

    title_block = next((b for b in approved if b.get("label") == "title"), approved[0])
    hero = next((b for b in approved if b.get("label") == "render"), title_block)
    add("cover", identity, str(title_block.get("summary") or title_block.get("title") or identity), [title_block, hero] if hero is not title_block else [title_block], "프로젝트의 정체성과 대표 공간을 제시한다.", "identity", "프로젝트 개요")
    add("contents", "설계 논리의 흐름", "승인된 패널 근거를 맥락·개념·공간·구축 순으로 읽는다.", approved[: min(8, len(approved))], "설명서의 근거 범위와 읽기 순서를 안내한다.", "identity", "프로젝트 개요")
    # One grounded page per approved block. Dense related evidence receives a paired page before any repeated visual.
    for block in approved:
        label = str(block.get("label", "evidence")); section_key, section_title = _section(label)
        title = str(block.get("title") or label.replace("_", " "))
        claim = str(block.get("summary") or title)
        review = [] if block.get("summary") else ["설명 문장 검토 필요"]
        if float(block.get("confidence", 1)) < .75: review.append("낮은 분류 확신도")
        add(PAGE_TYPE_BY_LABEL.get(label, "gallery"), title, claim, [block], f"{section_title}의 승인 근거를 설명한다.", section_key, section_title, review)
    # Pair adjacent evidence to reach a useful detailed explanation without inventing content.
    index = 0
    while len(pages) < target_pages - 1 and len(approved) > 1:
        left = approved[index % len(approved)]; right = approved[(index + 1) % len(approved)]; index += 1
        if left["id"] == right["id"]: break
        section_key, section_title = _section(str(left.get("label", "evidence")))
        add("gallery" if any(b.get("label") == "render" for b in (left, right)) else "plan_callout", f"{left.get('title')} · {right.get('title')}",
            " — ".join(filter(None, [str(left.get("summary") or left.get("title") or ""), str(right.get("summary") or right.get("title") or "")])),
            [left, right], "두 승인 근거의 관계를 비교해 설계 논리를 연결한다.", section_key, section_title, ["서로 다른 근거 조합 페이지"])
    closing_sources = approved[-min(3, len(approved)):]
    add("final_synthesis", "공간 논리의 종합", " · ".join(str(b.get("summary") or b.get("title") or b.get("label")) for b in closing_sources), closing_sources, "프로젝트의 핵심 공간 논리를 승인 근거로 종합한다.", "synthesis", "최종 종합")
    pages = pages[:target_pages]
    total_seconds = 15 * 60 if profile == "live" else max(18 * 60, len(pages) * 55)
    per = total_seconds // len(pages); remainder = total_seconds % len(pages)
    for index, page in enumerate(pages):
        page["number"] = index + 1; page["expectedSeconds"] = per + (1 if index < remainder else 0); page["notes"] = _notes(page, str(project.get("id", "project")))
    now = datetime.now(timezone.utc).isoformat()
    return {"schemaVersion": "1.0", "id": str(uuid.uuid4()), "projectId": str(project.get("id")), "profile": profile, "audience": audience,
        "pageSize": {"widthMm": 420, "heightMm": 297} if profile == "detailed" else {"widthMm": 338.667, "heightMm": 190.5},
        "projectInfo": project_info, "pages": pages, "pageCount": len(pages), "targetPageCount": target_pages,
        "approvedContentBlockIds": [str(b["id"]) for b in approved], "approvalStatus": "draft", "aiMetadata": {"mode": "deterministic-evidence", "seed": seed, "sourcePolicy": "approved-blocks-only"},
        "createdAt": now, "updatedAt": now}


def validate_design_statement(project: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
    blocks = {str(b.get("id")): b for b in project.get("contentBlocks", []) if b.get("status") == "approved"}
    elements = {str(e.get("id")) for e in project.get("elements", [])}
    errors: list[str] = []; warnings: list[str] = []; seen_visuals: dict[str, int] = {}
    pages = spec.get("pages", [])
    if int(spec.get("pageCount", -1)) != len(pages): errors.append("pageCount가 페이지 배열과 일치하지 않습니다.")
    for index, page in enumerate(pages, 1):
        source_blocks = list(map(str, page.get("sourceContentBlockIds", []))); source_elements = list(map(str, page.get("sourceElementIds", [])))
        if not source_blocks or any(value not in blocks for value in source_blocks): errors.append(f"{index}쪽에 승인되지 않은 source block이 있습니다.")
        allowed = {str(e) for block_id in source_blocks for e in blocks.get(block_id, {}).get("elementIds", [])}
        if not source_elements or not set(source_elements).issubset(allowed & elements): errors.append(f"{index}쪽 source element가 승인 근거와 일치하지 않습니다.")
        if not str(page.get("claim", "")).strip(): errors.append(f"{index}쪽 핵심 주장이 비어 있습니다.")
        for slot in page.get("visualSlots", []): seen_visuals[str(slot.get("elementId"))] = seen_visuals.get(str(slot.get("elementId")), 0) + 1
    repeated = [key for key, count in seen_visuals.items() if count > 2]
    if repeated: warnings.append(f"반복 사용 시각 요소 {len(repeated)}개: 서로 다른 crop 근거를 확인하세요.")
    return {"valid": not errors, "errors": errors, "warnings": warnings, "pageCount": len(pages), "traceCoverage": 1 if pages and not errors else 0}
