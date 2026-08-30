from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageStat

from .models import save_json, validate_manifest


def validate_storyboard(manifest: dict[str, Any], spec: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    block_ids = {block["id"] for block in manifest.get("blocks", [])}
    slides = spec.get("slides", [])
    if spec.get("slide_count") != 16 or len(slides) != 16:
        errors.append("presentation must contain exactly 16 slides")
    if spec.get("duration_minutes") != 15:
        errors.append("presentation duration must be 15 minutes")
    if sum(int(slide.get("expected_seconds", 0)) for slide in slides) != 900:
        errors.append("slide timings must total 900 seconds")
    for index, slide in enumerate(slides, 1):
        source_ids = slide.get("source_block_ids", [])
        if not source_ids:
            errors.append(f"slide {index} has no source_block_ids")
        missing = sorted(set(source_ids) - block_ids)
        if missing:
            errors.append(f"slide {index} references missing blocks: {missing}")
        visual_ids = set(slide.get("visual_block_ids", []))
        if not visual_ids:
            errors.append(f"slide {index} has no visual_block_ids")
        if not visual_ids.issubset(set(source_ids)):
            errors.append(f"slide {index} visual_block_ids are not a subset of source_block_ids")
        notes = slide.get("speaker_notes", "")
        for marker in ["발표 목적:", "핵심 문장:", "예상 시간:", "source_block_ids:", "[Sources]"]:
            if marker not in notes:
                errors.append(f"slide {index} notes missing marker: {marker}")
        if spec.get("speaker_notes", {}).get(str(index)) != notes:
            errors.append(f"slide {index} top-level speaker_notes entry does not match")
    declared = set(spec.get("source_block_ids", []))
    used = {block_id for slide in slides for block_id in slide.get("source_block_ids", [])}
    if declared != used:
        errors.append("PresentationSpec.source_block_ids does not equal the slide traceability union")
    return errors


def _validate_pptx(pptx_path: Path, spec: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not pptx_path.exists() or pptx_path.stat().st_size < 10000:
        return ["PPTX is missing or unexpectedly small"]
    with zipfile.ZipFile(pptx_path) as archive:
        names = archive.namelist()
        slide_xml = sorted(
            name for name in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)
        )
        notes_xml = sorted(
            name for name in names if re.fullmatch(r"ppt/notesSlides/notesSlide\d+\.xml", name)
        )
        if len(slide_xml) != 16:
            errors.append(f"PPTX has {len(slide_xml)} slides, expected 16")
        if len(notes_xml) != 16:
            errors.append(f"PPTX has {len(notes_xml)} notes slides, expected 16")
        for slide in spec["slides"]:
            slide_name = f"ppt/slides/slide{slide['number']}.xml"
            if slide_name not in names:
                continue
            xml = archive.read(slide_name).decode("utf-8", errors="ignore")
            if slide["title"] not in xml:
                errors.append(f"slide {slide['number']} title is not editable slide text")
            if slide["description"] not in xml:
                errors.append(f"slide {slide['number']} description is not editable slide text")
        combined_notes = "\n".join(
            archive.read(name).decode("utf-8", errors="ignore") for name in notes_xml
        )
        for slide in spec["slides"]:
            for block_id in slide["source_block_ids"]:
                if block_id not in combined_notes:
                    errors.append(
                        f"PPTX notes do not contain traceability id {block_id} from slide {slide['number']}"
                    )
    return errors


def _validate_renders(render_dir: Path) -> tuple[list[str], dict[str, Any]]:
    errors: list[str] = []
    images = sorted(render_dir.glob("slide-*.png"))
    details: dict[str, Any] = {"count": len(images), "slides": []}
    if len(images) != 16:
        errors.append(f"render directory contains {len(images)} slide PNGs, expected 16")
    for image_path in images:
        with Image.open(image_path).convert("RGB") as image:
            stat = ImageStat.Stat(image)
            extrema = image.getextrema()
            if image.size != (1280, 720):
                errors.append(f"{image_path.name} has unexpected dimensions {image.size}")
            if all(low == high for low, high in extrema):
                errors.append(f"{image_path.name} appears blank")
            details["slides"].append(
                {
                    "file": image_path.name,
                    "size": list(image.size),
                    "mean_rgb": [round(value, 2) for value in stat.mean],
                    "non_blank": not all(low == high for low, high in extrema),
                }
            )
    return errors, details


def run_validation(
    manifest: dict[str, Any],
    spec: dict[str, Any],
    pptx_path: str | Path | None = None,
    render_dir: str | Path | None = None,
    report_path: str | Path | None = None,
) -> dict[str, Any]:
    errors = validate_manifest(manifest) + validate_storyboard(manifest, spec)
    render_details: dict[str, Any] | None = None
    if pptx_path:
        errors.extend(_validate_pptx(Path(pptx_path), spec))
    if render_dir:
        render_errors, render_details = _validate_renders(Path(render_dir))
        errors.extend(render_errors)
    report = {
        "ok": not errors,
        "errors": errors,
        "checks": {
            "manifest_blocks": len(manifest.get("blocks", [])),
            "slide_count": len(spec.get("slides", [])),
            "timing_seconds": sum(int(slide.get("expected_seconds", 0)) for slide in spec.get("slides", [])),
            "traceable_slides": sum(bool(slide.get("source_block_ids")) for slide in spec.get("slides", [])),
            "review_flags_retained": len(spec.get("review_flags", [])),
            "renders": render_details,
        },
    }
    if report_path:
        save_json(report_path, report)
    return report
