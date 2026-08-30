from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from .design_statement import build_design_statement, validate_design_statement

router = APIRouter()


@router.post("/api/presentation/design-statement/draft")
async def design_statement_draft(request: Request):
    payload = await request.json()
    try: spec = build_design_statement(payload["project"], str(payload.get("profile", "detailed")), str(payload.get("audience", "건축 설계 심사위원")), int(payload.get("targetPageCount", 24)), int(payload.get("seed", 1401)))
    except (KeyError, ValueError) as exc: raise HTTPException(422, str(exc)) from exc
    return {"spec": spec}


@router.post("/api/presentation/design-statement/validate")
async def design_statement_validate(request: Request):
    payload = await request.json()
    if not isinstance(payload.get("project"), dict) or not isinstance(payload.get("spec"), dict): raise HTTPException(400, "project와 spec이 필요합니다.")
    return validate_design_statement(payload["project"], payload["spec"])
