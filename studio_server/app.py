from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
import ipaddress
import os
import shutil
import socket
import subprocess
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

import pymupdf as fitz
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from starlette.background import BackgroundTask

from archipanel_agent.raster import render_image_preview
from studio_server import __version__
from studio_server.exporter import export_pdf, export_raster
from studio_server.font_catalog import font_path, inspect_font, legacy_kopub_aliases, public_fonts, refresh_catalog
from studio_server.import_analysis import analyze_asset
from studio_server.demo import DEMO_SOURCE, build_demo_payload
from studio_server.intelligence import build_storyboard, recommend_layouts, suggest_content_blocks, validate_layout
from studio_server.validation import validate_project

ROOT = Path(__file__).resolve().parents[1]
WEB_DIST = ROOT / "web" / "dist"
MAX_FILE_BYTES = 700 * 1024 * 1024
MAX_PROJECT_BYTES = 1500 * 1024 * 1024
SYSTEM_FONTS = {alias: {"file": font_path(alias)} for alias in legacy_kopub_aliases()}
app = FastAPI(title="ArchiPanel Studio Local Service", version=__version__)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5174", "http://localhost:5174"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "version": __version__, "capabilities": ["package", "validate", "pdf", "png", "jpg", "preview", "system-fonts", "font-inspection", "free-transform", "non-destructive-mask", "image-adjustments", "smart-alignment", "content-labels", "layout-recommendation", "import-object-analysis", "multi-page-pdf-import", "studio-storyboard", "reference-layouts", "decomposed-demo"]}


@app.get("/api/demo/decomposed-panel")
def decomposed_panel_demo() -> dict[str, Any]:
    try:
        return build_demo_payload()
    except FileNotFoundError as exc:
        raise HTTPException(404, "첨부 패널 데모 원본을 찾을 수 없습니다.") from exc


@app.get("/api/demo/decomposed-panel/asset")
def decomposed_panel_asset() -> FileResponse:
    if not DEMO_SOURCE.is_file():
        raise HTTPException(404, "첨부 패널 데모 원본을 찾을 수 없습니다.")
    return FileResponse(DEMO_SOURCE, media_type="image/jpeg", filename=DEMO_SOURCE.name)


@app.get("/api/demo/decomposed-panel/preview")
def decomposed_panel_preview() -> FileResponse:
    if not DEMO_SOURCE.is_file():
        raise HTTPException(404, "첨부 패널 데모 원본을 찾을 수 없습니다.")
    directory = Path(tempfile.mkdtemp(prefix="archipanel-demo-preview-")); output = directory / "preview.jpg"
    with Image.open(DEMO_SOURCE) as image:
        image.thumbnail((1400, 700)); image.convert("RGB").save(output, "JPEG", quality=84, optimize=True)
    return FileResponse(output, media_type="image/jpeg", background=BackgroundTask(lambda: shutil.rmtree(directory, ignore_errors=True)))


@app.post("/api/content/suggest-labels")
async def content_suggest_labels(request: Request) -> dict[str, Any]:
    payload = await request.json()
    project = payload.get("project") if isinstance(payload, dict) else None
    board_id = str(payload.get("boardId", "")) if isinstance(payload, dict) else ""
    if not isinstance(project, dict) or not board_id:
        raise HTTPException(400, "project와 boardId가 필요합니다.")
    return {"blocks": suggest_content_blocks(project, board_id)}


@app.post("/api/layout/recommend")
async def layout_recommend(request: Request) -> dict[str, Any]:
    payload = await request.json()
    try:
        proposals = recommend_layouts(payload["project"], str(payload["boardId"]), payload.get("referenceLayouts", []))
    except (KeyError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"proposals": proposals}


@app.post("/api/layout/validate")
async def layout_validate(request: Request) -> dict[str, Any]:
    payload = await request.json()
    if not isinstance(payload.get("project"), dict) or not isinstance(payload.get("proposal"), dict):
        raise HTTPException(400, "project와 proposal이 필요합니다.")
    return validate_layout(payload["project"], payload["proposal"])


@app.post("/api/presentation/storyboard")
async def presentation_storyboard(request: Request) -> dict[str, Any]:
    payload = await request.json()
    try:
        return {"spec": build_storyboard(payload["project"], int(payload.get("durationMinutes", 15)), int(payload.get("slideCount", 16)), str(payload.get("audience", "건축 설계 심사위원")))}
    except (KeyError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/references/inspect")
async def reference_inspect(request: Request) -> dict[str, Any]:
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("application/json"):
        payload = await request.json(); url = str(payload.get("url", ""))
        return _inspect_reference_url(url)
    form = await request.form(); upload = form.get("file")
    if not upload or not hasattr(upload, "filename"):
        raise HTTPException(400, "참고 파일 또는 HTTPS URL이 필요합니다.")
    filename = _safe_filename(getattr(upload, "filename", "reference.bin") or "reference.bin")
    mime = getattr(upload, "content_type", "") or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    if mime not in {"image/jpeg", "image/png", "image/webp", "application/pdf"}:
        raise HTTPException(415, "참고 레이아웃은 JPG, PNG, WebP, PDF만 허용합니다.")
    return {"safe": True, "sourceType": "file", "filename": filename, "mime": mime, "approvalStatus": "review"}


@app.post("/api/references/analyze")
async def reference_analyze(request: Request) -> dict[str, Any]:
    payload = await request.json()
    width = max(1.0, float(payload.get("width", 1))); height = max(1.0, float(payload.get("height", 1)))
    columns = max(1, min(12, int(payload.get("columnCount", 3))))
    return {"boardAspectRatio": width / height, "columnCount": columns, "whitespaceRatio": float(payload.get("whitespaceRatio", .2)),
        "blocks": payload.get("blocks", []), "featureVector": [round(width / height, 4), columns / 12, float(payload.get("whitespaceRatio", .2))]}


@app.get("/api/fonts/system")
def system_fonts(query: str = "", korean: bool | None = None, embeddable: bool | None = None) -> dict[str, Any]:
    return {"fonts": public_fonts(query, korean, embeddable)}


@app.post("/api/fonts/system/rescan")
def system_fonts_rescan() -> dict[str, Any]:
    return {"count": refresh_catalog(), "fonts": public_fonts()}


@app.post("/api/fonts/inspect")
async def font_inspect(file: UploadFile = File(...)) -> dict[str, Any]:
    directory = Path(tempfile.mkdtemp(prefix="archipanel-font-"))
    try:
        path = directory / _safe_filename(file.filename or "font.ttf")
        await _copy_upload(file, path)
        if path.suffix.lower() not in {".ttf", ".otf", ".ttc", ".woff", ".woff2"}:
            raise HTTPException(415, "글꼴 검사는 TTF, OTF, TTC, WOFF, WOFF2만 지원합니다.")
        try:
            return inspect_font(path)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    finally:
        shutil.rmtree(directory, ignore_errors=True)


@app.get("/api/fonts/system/{font_id}")
def system_font_file(font_id: str) -> FileResponse:
    path = font_path(font_id)
    if not path or not path.is_file():
        raise HTTPException(404, "요청한 로컬 글꼴을 찾을 수 없습니다.")
    media_types = {".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2"}
    media_type = media_types.get(path.suffix.lower(), "font/ttf")
    return FileResponse(path, media_type=media_type, filename=path.name)


@app.post("/api/import/inspect")
async def inspect_import(file: UploadFile = File(...)) -> dict[str, Any]:
    directory = Path(tempfile.mkdtemp(prefix="archipanel-inspect-"))
    try:
        path = directory / _safe_filename(file.filename or "asset.bin")
        await _copy_upload(file, path)
        mime = file.content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        preview = directory / "preview.jpg"
        review: list[str] = []
        if mime == "application/pdf" or path.suffix.lower() == ".pdf":
            document = fitz.open(path)
            page_count = len(document)
            page = document[0]
            matrix = fitz.Matrix(min(1.5, 1600 / max(page.rect.width, 1)), min(1.5, 1600 / max(page.rect.width, 1)))
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            pixmap.save(preview)
            width, height = pixmap.width, pixmap.height
            document.close()
            return {"mime": "application/pdf", "pageCount": page_count, "widthPx": width, "heightPx": height, "thumbnailDataUrl": _data_url(preview, "image/jpeg"), "review": review}
        try:
            _, _, original, _ = render_image_preview(path, preview, max_edge=1600)
            width, height = original
        except Exception as exc:
            review.append(f"축소 미리보기 실패: {type(exc).__name__}")
            with Image.open(path) as image:
                width, height = image.size
                image.thumbnail((1600, 1600))
                image.convert("RGB").save(preview, "JPEG", quality=88)
        return {"mime": mime, "widthPx": width, "heightPx": height, "thumbnailDataUrl": _data_url(preview, "image/jpeg"), "review": review}
    finally:
        shutil.rmtree(directory, ignore_errors=True)


@app.post("/api/import/analyze")
async def analyze_import(file: UploadFile = File(...), max_regions: int = 20) -> dict[str, Any]:
    directory = Path(tempfile.mkdtemp(prefix="archipanel-analyze-"))
    try:
        path = directory / _safe_filename(file.filename or "asset.bin")
        await _copy_upload(file, path)
        mime = file.content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if mime not in {"application/pdf", "image/png", "image/jpeg", "image/webp"} and path.suffix.lower() not in {".pdf", ".png", ".jpg", ".jpeg", ".webp"}:
            raise HTTPException(415, "자동 객체 연결은 PDF, PNG, JPG, WebP만 지원합니다.")
        try:
            result = analyze_asset(path, mime, max(1, min(40, max_regions)))
        except (fitz.FileDataError, OSError, ValueError) as exc:
            raise HTTPException(422, f"파일 분석 실패: {type(exc).__name__}") from exc
        result.update({"name": file.filename or path.name, "sizeBytes": path.stat().st_size, "sha256": _sha256(path)})
        return result
    finally:
        shutil.rmtree(directory, ignore_errors=True)


@app.post("/api/project/validate")
async def validate(request: Request) -> dict[str, Any]:
    workspace = await _workspace_from_request(request)
    try:
        issues = validate_project(workspace.project, set(workspace.assets), set(workspace.fonts))
        return {"valid": not any(issue["severity"] == "error" for issue in issues), "issues": issues}
    finally:
        workspace.cleanup()


@app.post("/api/project/package")
async def package(request: Request) -> FileResponse:
    workspace = await _workspace_from_request(request)
    output = workspace.root / f"{_safe_filename(workspace.project.get('name', 'project'))}.archipanel"
    manifest = json.loads(json.dumps(workspace.project))
    assets_by_id = {str(asset.get("id")): asset for asset in manifest.get("assets", [])}
    fonts_by_asset = {str(font.get("assetId")): font for font in manifest.get("fonts", [])}
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        for asset_id, path in workspace.assets.items():
            suffix = path.suffix.lower() or ".bin"
            archive_path = f"assets/{asset_id}{suffix}"
            archive.write(path, archive_path)
            if asset_id in assets_by_id:
                assets_by_id[asset_id]["archivePath"] = archive_path
                assets_by_id[asset_id]["sha256"] = _sha256(path)
        for font_id, path in workspace.fonts.items():
            archive.write(path, f"fonts/{font_id}{path.suffix.lower() or '.bin'}")
            if font_id in fonts_by_asset:
                fonts_by_asset[font_id]["fingerprintSha256"] = _sha256(path)
        for asset_id, previews in workspace.previews.items():
            for index, path in sorted(previews.items()):
                archive.write(path, f"previews/assets/{asset_id}/{index}.jpg")
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return FileResponse(output, media_type="application/vnd.archipanel+zip", filename=output.name, background=BackgroundTask(workspace.cleanup))


@app.post("/api/export/pdf")
async def pdf(request: Request) -> FileResponse:
    workspace = await _workspace_from_request(request)
    issues = validate_project(workspace.project, set(workspace.assets), set(workspace.fonts))
    if any(issue["severity"] == "error" for issue in issues):
        workspace.cleanup()
        raise HTTPException(422, detail={"message": "인쇄 차단 오류가 있습니다.", "issues": issues})
    output = workspace.root / f"{_safe_filename(workspace.project.get('name', 'panel'))}.pdf"
    try:
        export_pdf(workspace.project, workspace.assets, workspace.fonts, output, workspace.options)
    except Exception:
        workspace.cleanup()
        raise
    return FileResponse(output, media_type="application/pdf", filename=output.name, background=BackgroundTask(workspace.cleanup))


@app.post("/api/export/raster")
async def raster(request: Request) -> FileResponse:
    workspace = await _workspace_from_request(request)
    options = workspace.options
    board_id = str(options.get("boardId", ""))
    format_name = str(options.get("format", "png")).lower()
    if format_name not in {"png", "jpg", "jpeg"}:
        workspace.cleanup()
        raise HTTPException(400, "지원하는 래스터 형식은 PNG와 JPG입니다.")
    pdf_path = workspace.root / "raster-source.pdf"
    output = workspace.root / f"{_safe_filename(workspace.project.get('name', 'panel'))}.{format_name}"
    try:
        export_pdf(workspace.project, workspace.assets, workspace.fonts, pdf_path, {"boardIds": [board_id], "includeBleed": options.get("includeBleed", False)})
        dpi = int(options.get("dpi", 300))
        board = next((item for item in workspace.project.get("boards", []) if str(item.get("id")) == board_id), None)
        if not board:
            raise ValueError("출력할 보드를 찾을 수 없습니다.")
        bleed = float(board.get("bleedMm", 0)) if options.get("includeBleed", False) else 0.0
        target_size = (
            round((float(board["widthMm"]) + bleed * 2) / 25.4 * dpi),
            round((float(board["heightMm"]) + bleed * 2) / 25.4 * dpi),
        )
        export_raster(pdf_path, output, dpi, int(options.get("quality", 92)), target_size)
    except ValueError as exc:
        workspace.cleanup()
        raise HTTPException(422, str(exc)) from exc
    media = "image/png" if format_name == "png" else "image/jpeg"
    return FileResponse(output, media_type=media, filename=output.name, background=BackgroundTask(workspace.cleanup))


@app.post("/api/presentation/export-pptx")
async def presentation_export_pptx(request: Request) -> FileResponse:
    workspace = await _workspace_from_request(request)
    spec_id = str(workspace.options.get("presentationSpecId", ""))
    spec = next((item for item in workspace.project.get("presentationSpecs", []) if str(item.get("id")) == spec_id), None)
    if not spec or spec.get("approvalStatus") != "approved":
        workspace.cleanup(); raise HTTPException(403, "사용자가 승인한 Studio 스토리보드만 PPTX로 출력할 수 있습니다.")
    if sum(int(item.get("expectedSeconds", 0)) for item in spec.get("slides", [])) != int(spec.get("durationMinutes", 0)) * 60:
        workspace.cleanup(); raise HTTPException(422, "슬라이드 예상 시간의 합이 발표 시간과 일치하지 않습니다.")
    known_blocks = {str(item.get("id")) for item in workspace.project.get("contentBlocks", []) if item.get("status") == "approved"}
    known_elements = {str(item.get("id")) for item in workspace.project.get("elements", [])}
    for slide in spec.get("slides", []):
        if not set(map(str, slide.get("sourceContentBlockIds", []))).issubset(known_blocks) or not set(map(str, slide.get("sourceElementIds", []))).issubset(known_elements):
            workspace.cleanup(); raise HTTPException(422, "슬라이드의 원본 역추적 ID가 프로젝트와 일치하지 않습니다.")
    output = workspace.root / f"{_safe_filename(workspace.project.get('name', 'presentation'))}-presentation.pptx"
    try:
        asset_map = _prepare_studio_slide_assets(workspace)
        spec_path = workspace.root / "studio-presentation.json"; project_path = workspace.root / "studio-project.json"; map_path = workspace.root / "studio-assets.json"; render_dir = workspace.root / "rendered-slides"
        spec_path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8"); project_path.write_text(json.dumps(workspace.project, ensure_ascii=False), encoding="utf-8"); map_path.write_text(json.dumps(asset_map, ensure_ascii=False), encoding="utf-8")
        dependencies = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "node"
        node = dependencies / "bin" / "node.exe"; module_path = dependencies / "node_modules"
        if not node.is_file(): raise RuntimeError("번들 Node 런타임을 찾을 수 없습니다.")
        environment = os.environ.copy(); environment["NODE_PATH"] = str(module_path); environment["ARTIFACT_TOOL_PATH"] = str(module_path / "@oai" / "artifact-tool" / "dist" / "artifact_tool.mjs")
        result = subprocess.run([str(node), str(ROOT / "templates" / "build_studio_deck.mjs"), str(spec_path), str(project_path), str(map_path), str(output), str(render_dir)], cwd=ROOT, env=environment, capture_output=True, text=True, encoding="utf-8", timeout=180, check=False)
        if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip()[-3000:])
        renders = sorted(render_dir.glob("slide-*.png")); layouts = sorted(render_dir.glob("slide-*.layout.json"))
        if len(renders) != int(spec.get("slideCount", 0)) or len(layouts) != len(renders) or not output.is_file(): raise RuntimeError("PPTX 렌더 검증 산출물이 완전하지 않습니다.")
    except Exception as exc:
        workspace.cleanup(); raise HTTPException(500, f"PPTX 생성 또는 렌더 검증 실패: {exc}") from exc
    return FileResponse(output, media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation", filename=output.name, background=BackgroundTask(workspace.cleanup))


class Workspace:
    def __init__(self, root: Path, project: dict[str, Any], assets: dict[str, Path], fonts: dict[str, Path], previews: dict[str, dict[int, Path]], options: dict[str, Any]) -> None:
        self.root, self.project, self.assets, self.fonts, self.previews, self.options = root, project, assets, fonts, previews, options

    def cleanup(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)


async def _workspace_from_request(request: Request) -> Workspace:
    form = await request.form()
    try:
        project = json.loads(str(form.get("manifest", "")))
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "manifest가 유효한 JSON이 아닙니다.") from exc
    if not isinstance(project, dict):
        raise HTTPException(400, "manifest는 JSON 객체여야 합니다.")
    try:
        options = json.loads(str(form.get("options") or "{}"))
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "options가 유효한 JSON이 아닙니다.") from exc
    root = Path(tempfile.mkdtemp(prefix="archipanel-job-"))
    assets: dict[str, Path] = {}
    fonts: dict[str, Path] = {}
    previews: dict[str, dict[int, Path]] = {}
    total = 0
    try:
        for key, value in form.multi_items():
            if not isinstance(value, UploadFile) and not hasattr(value, "filename"):
                continue
            if key.startswith("asset__"):
                target = assets
                identifier = key.removeprefix("asset__")
            elif key.startswith("font__"):
                target = fonts
                identifier = key.removeprefix("font__")
            elif key.startswith("preview__"):
                parts = key.split("__")
                if len(parts) != 3 or not parts[1] or not parts[2].isdigit():
                    raise HTTPException(400, "잘못된 미리보기 ID입니다.")
                identifier = parts[1]
                if any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for character in identifier):
                    raise HTTPException(400, "잘못된 자산 ID입니다.")
                filename = _safe_filename(getattr(value, "filename", "preview.jpg") or "preview.jpg")
                path = root / f"preview-{identifier}-{parts[2]}{Path(filename).suffix.lower() or '.jpg'}"
                total += await _copy_upload(value, path)
                previews.setdefault(identifier, {})[int(parts[2])] = path
                continue
            else:
                continue
            if not identifier or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for character in identifier):
                raise HTTPException(400, "잘못된 자산 ID입니다.")
            filename = _safe_filename(getattr(value, "filename", "file.bin") or "file.bin")
            path = root / f"{identifier}{Path(filename).suffix.lower()}"
            total += await _copy_upload(value, path)
            if total > MAX_PROJECT_BYTES:
                raise HTTPException(413, "프로젝트 업로드가 1.5GB 한도를 넘습니다.")
            target[identifier] = path
        return Workspace(root, project, assets, fonts, previews, options)
    except Exception:
        shutil.rmtree(root, ignore_errors=True)
        raise


async def _copy_upload(upload: UploadFile, target: Path) -> int:
    total = 0
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as stream:
        while chunk := await upload.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_FILE_BYTES:
                raise HTTPException(413, "단일 파일이 700MB 한도를 넘습니다.")
            stream.write(chunk)
    return total


def _safe_filename(value: str) -> str:
    clean = "".join("_" if character in '\\/:*?\"<>|' else character for character in Path(value).name).strip(" .")
    return clean or "archipanel"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _data_url(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def _inspect_reference_url(value: str) -> dict[str, Any]:
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(400, "참고 URL은 인증정보가 없는 HTTPS 주소여야 합니다.")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as exc:
        raise HTTPException(400, "URL 호스트를 확인할 수 없습니다.") from exc
    if any(ipaddress.ip_address(address).is_private or ipaddress.ip_address(address).is_loopback or ipaddress.ip_address(address).is_link_local or ipaddress.ip_address(address).is_reserved for address in addresses):
        raise HTTPException(400, "사설·로컬 주소는 참고 URL로 사용할 수 없습니다.")

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> Any:
            raise HTTPException(400, "리디렉션 URL은 자동으로 가져오지 않습니다.")

    request = urllib.request.Request(value, method="HEAD", headers={"User-Agent": "ArchiPanel-Studio/1.1"})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=8) as response:
            mime = response.headers.get_content_type(); length = int(response.headers.get("Content-Length", "0") or 0)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"URL을 안전하게 검사하지 못했습니다: {type(exc).__name__}") from exc
    if mime not in {"image/jpeg", "image/png", "image/webp", "application/pdf"}:
        raise HTTPException(415, "URL의 MIME 형식이 허용되지 않습니다.")
    if length > 100 * 1024 * 1024:
        raise HTTPException(413, "참고 레이아웃은 100MB를 넘을 수 없습니다.")
    return {"safe": True, "sourceType": "url", "url": value, "mime": mime, "sizeBytes": length, "approvalStatus": "review"}


def _prepare_studio_slide_assets(workspace: Workspace) -> dict[str, dict[str, str]]:
    prepared = workspace.root / "studio-slide-assets"; prepared.mkdir(parents=True, exist_ok=True)
    asset_map: dict[str, dict[str, str]] = {}
    for element in workspace.project.get("elements", []):
        if element.get("type") not in {"image", "pdf"}: continue
        source = workspace.assets.get(str(element.get("assetId")))
        if not source or not source.is_file(): continue
        output = prepared / f"{element.get('id')}.png"
        crop = element.get("cropNormalized") if element.get("type") == "image" else element.get("clipNormalized")
        crop = crop if isinstance(crop, dict) else {"x": 0, "y": 0, "w": 1, "h": 1}
        if element.get("type") == "pdf":
            document = fitz.open(source); page_index = max(0, min(len(document) - 1, int(element.get("pageIndex", 0)))); page = document[page_index]
            rect = page.rect; clip = fitz.Rect(rect.x0 + rect.width * float(crop.get("x", 0)), rect.y0 + rect.height * float(crop.get("y", 0)), rect.x0 + rect.width * (float(crop.get("x", 0)) + float(crop.get("w", 1))), rect.y0 + rect.height * (float(crop.get("y", 0)) + float(crop.get("h", 1))))
            page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip, alpha=False).save(output); document.close()
        else:
            with Image.open(source) as image:
                x0 = round(image.width * float(crop.get("x", 0))); y0 = round(image.height * float(crop.get("y", 0))); x1 = round(image.width * (float(crop.get("x", 0)) + float(crop.get("w", 1)))); y1 = round(image.height * (float(crop.get("y", 0)) + float(crop.get("h", 1))))
                image.crop((max(0, x0), max(0, y0), min(image.width, x1), min(image.height, y1))).convert("RGB").save(output, "PNG")
        asset_map[str(element.get("id"))] = {"path": str(output), "contentType": "image/png"}
    return asset_map


if WEB_DIST.exists():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="studio")
