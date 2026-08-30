from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path
from typing import Any

from PIL import Image

MAX_DOCUMENT_PIXELS = 600_000_000
MAX_LAYERS = 20_000
SUPPORTED_BLEND = {"normal", "multiply", "screen", "overlay", "darken", "lighten"}


def inspect_header(path: Path) -> dict[str, Any]:
    with path.open("rb") as stream:
        header = stream.read(26)
    if len(header) != 26 or header[:4] != b"8BPS":
        raise ValueError("Adobe PSD/PSB 헤더가 아닙니다.")
    version = int.from_bytes(header[4:6], "big")
    if version not in {1, 2}:
        raise ValueError("지원하지 않는 PSD/PSB 버전입니다.")
    channels = int.from_bytes(header[12:14], "big")
    height = int.from_bytes(header[14:18], "big"); width = int.from_bytes(header[18:22], "big")
    depth = int.from_bytes(header[22:24], "big"); color_mode = int.from_bytes(header[24:26], "big")
    if width <= 0 or height <= 0 or width * height > MAX_DOCUMENT_PIXELS:
        raise ValueError("PSD 문서가 허용된 압축 해제 픽셀 예산을 넘습니다.")
    if depth not in {8, 16} or color_mode != 3:
        raise ValueError("MVP는 8/16bit RGB PSD/PSB만 지원합니다.")
    return {"format": "PSB" if version == 2 else "PSD", "version": version, "widthPx": width, "heightPx": height, "channels": channels, "bitDepth": depth, "colorMode": "RGB"}


def _fingerprint(path: str, kind: str, bbox: list[int]) -> str:
    return hashlib.sha256(json.dumps([path, kind, bbox], ensure_ascii=False).encode()).hexdigest()[:20]


def _kind(layer: Any) -> str:
    name = type(layer).__name__.lower()
    if getattr(layer, "is_group", lambda: False)(): return "group"
    if "type" in name: return "text"
    if "smart" in name: return "smart_object"
    if "adjust" in name: return "adjustment"
    return "pixel"


def _text_metadata(layer: Any) -> dict[str, Any] | None:
    text = getattr(layer, "text", None)
    if text is None: return None
    return {"value": str(text), "editableCandidate": False, "reason": "글꼴·warp·다중 스타일을 안전하게 확인할 수 없어 래스터 유지"}


def inspect_psd(path: Path, output_dir: Path) -> dict[str, Any]:
    header = inspect_header(path)
    try:
        from psd_tools import PSDImage
    except ImportError as exc:
        raise ValueError("psd-tools가 설치되지 않았습니다.") from exc
    psd = PSDImage.open(path)
    output_dir.mkdir(parents=True, exist_ok=True)
    composite_path = output_dir / "composite.webp"
    composite = psd.composite()
    if composite is None: raise ValueError("PSD 합성 미리보기를 만들 수 없습니다.")
    composite.thumbnail((2500, 2500), Image.Resampling.LANCZOS)
    composite.convert("RGBA").save(composite_path, "WEBP", quality=90)
    layers: list[dict[str, Any]] = []

    def walk(items: Any, parent_id: str | None = None, parent_path: str = "") -> None:
        for order, layer in enumerate(items):
            if len(layers) >= MAX_LAYERS: raise ValueError("PSD 레이어 수가 20,000개 한도를 넘습니다.")
            internal = str(getattr(layer, "layer_id", "") or getattr(layer, "_index", "") or uuid.uuid4())
            name = str(getattr(layer, "name", "Layer")); full_path = f"{parent_path}/{name}" if parent_path else name
            bbox = [int(getattr(layer, key, 0) or 0) for key in ("left", "top", "right", "bottom")]
            kind = _kind(layer); blend = str(getattr(layer, "blend_mode", "normal")).split(".")[-1].lower()
            text = _text_metadata(layer)
            reasons: list[str] = []
            if kind in {"adjustment", "smart_object"}: reasons.append("원본 합성 결과를 보존하기 위해 래스터 render unit 사용")
            if text: reasons.append(text["reason"])
            if blend not in SUPPORTED_BLEND: reasons.append(f"지원하지 않는 blend mode: {blend}")
            record = {"id": internal, "parentId": parent_id, "path": full_path, "name": name, "kind": kind, "order": order,
                "bboxPx": bbox, "visible": bool(getattr(layer, "visible", True)), "locked": bool(getattr(layer, "is_locked", lambda: False)()),
                "opacity": round(float(getattr(layer, "opacity", 255) or 255) / 255, 4), "blendMode": blend, "text": text,
                "compatibility": "editable_text" if text and text.get("editableCandidate") else "group" if kind == "group" else "raster_render_unit",
                "renderUnitId": internal, "fingerprint": _fingerprint(full_path, kind, bbox), "reviewFlags": reasons}
            layers.append(record)
            if kind == "group": walk(layer, internal, full_path)
    walk(psd)
    return {**header, "dpi": 300, "layerCount": len(layers), "layers": layers, "compositePreview": str(composite_path), "reviewStatus": "manual_verification_required"}


def render_layer(path: Path, layer_id: str, output: Path, max_edge: int = 2500) -> Path:
    from psd_tools import PSDImage
    psd = PSDImage.open(path); target = None
    stack = list(psd)
    while stack:
        layer = stack.pop(0)
        if str(getattr(layer, "layer_id", "") or getattr(layer, "_index", "")) == layer_id: target = layer; break
        if getattr(layer, "is_group", lambda: False)(): stack[0:0] = list(layer)
    if target is None: raise ValueError("PSD 레이어를 찾을 수 없습니다.")
    image = target.composite()
    if image is None: image = Image.new("RGBA", (max(1, target.width), max(1, target.height)), (0, 0, 0, 0))
    image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS); output.parent.mkdir(parents=True, exist_ok=True); image.save(output, "PNG")
    return output


def compare_layers(old_layers: list[dict], new_layers: list[dict]) -> list[dict]:
    by_id = {str(item["id"]): item for item in new_layers}; by_fp = {str(item["fingerprint"]): item for item in new_layers}
    used: set[str] = set(); result: list[dict] = []
    for old in old_layers:
        match = by_id.get(str(old["id"])) or by_fp.get(str(old.get("fingerprint", "")))
        if match:
            used.add(str(match["id"])); changed = any(old.get(key) != match.get(key) for key in ("bboxPx", "visible", "opacity", "blendMode", "text"))
            result.append({"oldLayerId": old["id"], "newLayerId": match["id"], "status": "modified" if changed else "same", "confidence": 1.0 if str(old["id"]) == str(match["id"]) else .86})
        else: result.append({"oldLayerId": old["id"], "newLayerId": None, "status": "missing", "confidence": 0})
    for item in new_layers:
        if str(item["id"]) not in used: result.append({"oldLayerId": None, "newLayerId": item["id"], "status": "added", "confidence": 1})
    return result
