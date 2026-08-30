from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from .asset_store import asset_metadata, complete_session, create_session, put_chunk, resolve_asset, store_root
from .psd_support import compare_layers, inspect_psd, render_layer

router = APIRouter()


@router.post("/api/uploads")
async def uploads(request: Request):
    payload = await request.json()
    try: session = create_session(str(payload.get("name", "")), int(payload.get("sizeBytes", 0)), payload.get("sha256"))
    except ValueError as exc: raise HTTPException(422, str(exc)) from exc
    return {"sessionId": session.id, "chunkSize": 32 * 1024 * 1024, "chunkCount": session.chunk_count, "expiresInSeconds": 86400}


@router.put("/api/uploads/{session_id}/chunks/{index}")
async def upload_chunk(session_id: str, index: int, request: Request):
    body = await request.body()
    try: return put_chunk(session_id, index, body, request.headers.get("x-chunk-sha256"))
    except (ValueError, FileNotFoundError) as exc: raise HTTPException(422, str(exc)) from exc


@router.post("/api/uploads/{session_id}/complete")
def upload_complete(session_id: str):
    try: return complete_session(session_id)
    except (ValueError, FileNotFoundError) as exc: raise HTTPException(422, str(exc)) from exc


def _inspection(asset_id: str):
    try: source = resolve_asset(asset_id)
    except FileNotFoundError as exc: raise HTTPException(404, str(exc)) from exc
    directory = source.parent / "inspection"
    try: result = inspect_psd(source, directory)
    except ValueError as exc: raise HTTPException(422, str(exc)) from exc
    result["source"] = {**asset_metadata(asset_id), "assetId": asset_id}; result["compositePreviewUrl"] = f"/api/psd/assets/{asset_id}/composite"
    result.pop("compositePreview", None)
    return result


@router.post("/api/psd/inspect")
async def psd_inspect(request: Request):
    payload = await request.json(); return _inspection(str(payload.get("assetId", "")))


@router.get("/api/psd/assets/{asset_id}/composite")
def psd_composite(asset_id: str):
    result = _inspection(asset_id); path = resolve_asset(asset_id).parent / "inspection" / "composite.webp"
    return FileResponse(path, media_type="image/webp", filename="composite.webp")


@router.get("/api/psd/assets/{asset_id}/layers/{layer_id}/preview")
def psd_layer_preview(asset_id: str, layer_id: str):
    try: source = resolve_asset(asset_id); output = source.parent / "layers" / f"{layer_id}.png"; render_layer(source, layer_id, output)
    except (ValueError, FileNotFoundError) as exc: raise HTTPException(422, str(exc)) from exc
    return FileResponse(output, media_type="image/png", filename=f"{layer_id}.png")


@router.post("/api/psd/materialize")
async def psd_materialize(request: Request):
    payload = await request.json(); inspection = _inspection(str(payload.get("assetId", "")))
    selected = set(str(value) for value in payload.get("layerIds", [])); layers = [layer for layer in inspection["layers"] if layer["id"] in selected]
    return {"source": inspection["source"], "document": {key: inspection[key] for key in ("format", "widthPx", "heightPx", "dpi", "bitDepth", "colorMode", "layerCount", "reviewStatus")}, "layers": layers, "compositePreviewUrl": inspection["compositePreviewUrl"]}


@router.post("/api/psd/relink/compare")
async def psd_relink_compare(request: Request):
    payload = await request.json(); old = payload.get("oldLayers", []); new = _inspection(str(payload.get("newAssetId", "")))
    return {"matches": compare_layers(old, new["layers"]), "newSource": new["source"], "newLayers": new["layers"], "reviewStatus": "manual_verification_required"}


@router.post("/api/psd/relink/apply")
async def psd_relink_apply(request: Request):
    payload = await request.json()
    if not payload.get("approved"): raise HTTPException(409, "재연결 대응 관계를 사용자 승인해야 합니다.")
    return {"applied": True, "matches": payload.get("matches", []), "preserveStudioTransforms": True, "deleteMissingLayers": False}
