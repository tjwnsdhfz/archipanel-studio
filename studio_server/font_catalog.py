from __future__ import annotations

import hashlib
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from fontTools.ttLib import TTFont, TTCollection

FONT_EXTENSIONS = {".ttf", ".otf", ".ttc"}


def _font_dirs() -> list[Path]:
    paths = [Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"]
    local = os.environ.get("LOCALAPPDATA")
    if local:
        paths.append(Path(local) / "Microsoft" / "Windows" / "Fonts")
    return [path for path in paths if path.is_dir()]


def _name(font: TTFont, name_id: int, fallback: str) -> str:
    table = font.get("name")
    if not table:
        return fallback
    preferred = []
    for record in table.names:
        if record.nameID != name_id:
            continue
        try:
            value = record.toUnicode().strip()
        except Exception:
            continue
        if value:
            preferred.append((record.langID not in {0x409, 0x412}, value))
    return sorted(preferred)[0][1] if preferred else fallback


def _embedding_policy(font: TTFont) -> str:
    fs_type = int(getattr(font.get("OS/2"), "fsType", 0) or 0)
    if fs_type & 0x0002:
        return "restricted"
    if fs_type & 0x0008:
        return "editable"
    if fs_type & 0x0004:
        return "preview_print"
    return "installable"


def _metadata(path: Path, face_index: int = 0) -> dict[str, Any] | None:
    try:
        font = TTFont(path, fontNumber=face_index, lazy=True)
        family = _name(font, 16, _name(font, 1, path.stem))
        style = _name(font, 17, _name(font, 2, "Regular"))
        postscript = _name(font, 6, f"{family}-{style}")
        os2 = font.get("OS/2")
        weight = max(100, min(900, int(getattr(os2, "usWeightClass", 400) or 400)))
        cmap = font.getBestCmap() or {}
        identifier = hashlib.sha256(f"{path.resolve()}::{face_index}".encode("utf-8")).hexdigest()[:24]
        result = {"id": identifier, "family": family, "style": style, "subfamily": style, "postscriptName": postscript,
            "weight": weight, "italic": "italic" in style.lower() or "oblique" in style.lower(), "format": path.suffix.lower().lstrip("."),
            "supportsKorean": 0xAC00 in cmap or 0x3131 in cmap, "embeddingPolicy": _embedding_policy(font), "faceIndex": face_index,
            "_path": path}
        font.close()
        return result
    except Exception:
        return None


@lru_cache(maxsize=1)
def scan_system_fonts() -> dict[str, dict[str, Any]]:
    catalog: dict[str, dict[str, Any]] = {}
    seen: set[Path] = set()
    for directory in _font_dirs():
        for path in directory.iterdir():
            if path.suffix.lower() not in FONT_EXTENSIONS or path in seen:
                continue
            seen.add(path)
            face_count = 1
            if path.suffix.lower() == ".ttc":
                try:
                    collection = TTCollection(path, lazy=True); face_count = len(collection.fonts); collection.close()
                except Exception:
                    face_count = 1
            for face_index in range(face_count):
                data = _metadata(path, face_index)
                if data:
                    catalog[data["id"]] = data
    return catalog


def public_fonts(query: str = "", korean: bool | None = None, embeddable: bool | None = None) -> list[dict[str, Any]]:
    needle = query.casefold().strip(); results = []
    for data in scan_system_fonts().values():
        if needle and needle not in f"{data['family']} {data['style']} {data['postscriptName']}".casefold():
            continue
        if korean is not None and bool(data["supportsKorean"]) != korean:
            continue
        if embeddable is not None and (data["embeddingPolicy"] != "restricted") != embeddable:
            continue
        results.append({key: value for key, value in data.items() if not key.startswith("_")})
    aliases = legacy_kopub_aliases()
    for alias, opaque_id in aliases.items():
        source = next((item for item in results if item["id"] == opaque_id), None)
        if source:
            source["id"] = alias
    return sorted(results, key=lambda item: (not item["supportsKorean"], item["family"].casefold(), item["weight"], item["style"]))


def font_path(font_id: str) -> Path | None:
    data = scan_system_fonts().get(legacy_kopub_aliases().get(font_id, font_id))
    return Path(data["_path"]) if data else None


def inspect_font(path: Path) -> dict[str, Any]:
    data = _metadata(path)
    if not data:
        raise ValueError("지원하거나 읽을 수 있는 글꼴이 아닙니다.")
    result = {key: value for key, value in data.items() if not key.startswith("_")}
    result["fingerprintSha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def refresh_catalog() -> int:
    scan_system_fonts.cache_clear()
    return len(scan_system_fonts())


def legacy_kopub_aliases() -> dict[str, str]:
    result: dict[str, str] = {}
    for identifier, data in scan_system_fonts().items():
        family = str(data["family"]).casefold(); weight = int(data["weight"])
        family_key = "dotum" if "kopub" in family and ("dotum" in family or "돋움" in family) else "batang" if "kopub" in family and ("batang" in family or "바탕" in family) else ""
        if not family_key:
            continue
        weight_key = "light" if weight <= 350 else "bold" if weight >= 650 else "medium"
        result[f"kopub-{family_key}-{weight_key}"] = identifier
    return result
