from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import pymupdf as fitz
from PIL import Image, ImageOps

MM = 72 / 25.4
PAPER = (0.965, 0.953, 0.922); INK = (0.075, 0.078, 0.073); MUTED = (0.40, 0.40, 0.37); RUST = (0.73, 0.29, 0.15); LINE = (0.78, 0.77, 0.72)


def _font() -> str | None:
    path = Path("C:/Windows/Fonts/malgun.ttf")
    return str(path) if path.is_file() else None


def _text(page: fitz.Page, text: str, rect: fitz.Rect, size: float, color=INK, bold: bool = False, align: int = 0) -> None:
    fontfile = _font(); name = "APMalgun"
    if fontfile: page.insert_font(fontname=name, fontfile=fontfile)
    page.insert_textbox(rect, str(text or ""), fontname=name if fontfile else "helv", fontsize=size, color=color, align=align, lineheight=1.15)


def _position(kind: str, index: int, count: int, width: float, height: float) -> fitz.Rect:
    if kind == "cover": return fitz.Rect(width * .52, 0, width, height)
    if kind in {"hero_render", "final_synthesis"}: return fitz.Rect(36 * MM, 55 * MM, width - 18 * MM, height - 25 * MM)
    if kind in {"full_plan", "context_map", "section_elevation"}: return fitz.Rect(28 * MM, 58 * MM, width - 20 * MM, height - 30 * MM)
    if count > 1:
        gap = 5 * MM; available = width - 50 * MM - gap * (count - 1); cell = available / count
        return fitz.Rect(28 * MM + index * (cell + gap), 72 * MM, 28 * MM + index * (cell + gap) + cell, height - 33 * MM)
    return fitz.Rect(width * .48, 58 * MM, width - 20 * MM, height - 30 * MM)


def _image_stream(path: Path, rect: fitz.Rect, fit: str) -> bytes:
    with Image.open(path) as source:
        image = source.convert("RGB"); target = (max(1, round(rect.width * 2)), max(1, round(rect.height * 2)))
        if fit == "cover": image = ImageOps.fit(image, target, Image.Resampling.LANCZOS)
        else: image.thumbnail(target, Image.Resampling.LANCZOS)
        buffer = io.BytesIO(); image.save(buffer, "JPEG", quality=92); return buffer.getvalue()


def export_design_statement_pdf(spec: dict[str, Any], project: dict[str, Any], asset_map: dict[str, dict[str, str]], output: Path) -> Path:
    size = spec.get("pageSize", {}); width = float(size.get("widthMm", 420)) * MM; height = float(size.get("heightMm", 297)) * MM
    doc = fitz.open()
    for item in spec.get("pages", []):
        page = doc.new_page(width=width, height=height); page.draw_rect(page.rect, fill=PAPER, color=None)
        kind = str(item.get("pageType", "gallery")); number = int(item.get("number", len(doc)))
        if kind == "cover":
            _text(page, "ARCHITECTURE DESIGN STATEMENT", fitz.Rect(22*MM,20*MM,width*.47,30*MM), 9, MUTED)
            _text(page, item.get("title", ""), fitz.Rect(22*MM,60*MM,width*.46,120*MM), 36, INK)
            page.draw_line((22*MM,132*MM),(82*MM,132*MM),color=RUST,width=2)
            _text(page, item.get("claim", ""), fitz.Rect(22*MM,145*MM,width*.45,205*MM), 16, INK)
        else:
            _text(page, f"{number:02d}", fitz.Rect(12*MM,16*MM,25*MM,28*MM), 9, RUST)
            _text(page, item.get("sectionTitle", ""), fitz.Rect(28*MM,16*MM,width-20*MM,28*MM), 8, MUTED)
            page.draw_line((28*MM,31*MM),(width-20*MM,31*MM),color=LINE,width=.6)
            _text(page, item.get("title", ""), fitz.Rect(28*MM,38*MM,width-20*MM,56*MM), 22, INK)
            if kind not in {"hero_render", "full_plan", "context_map", "section_elevation"}:
                _text(page, item.get("claim", ""), fitz.Rect(28*MM,66*MM,width*.43,height-54*MM), 14, INK)
                _text(page, item.get("supportingText", ""), fitz.Rect(28*MM,126*MM,width*.43,height-40*MM), 9, MUTED)
        slots = item.get("visualSlots", [])[:4]
        for index, slot in enumerate(slots):
            asset = asset_map.get(str(slot.get("elementId"))); path = Path(asset["path"]) if asset else None
            if not path or not path.is_file(): continue
            rect = _position(kind, index, len(slots), width, height)
            try: page.insert_image(rect, stream=_image_stream(path, rect, str(slot.get("fit", "contain"))), keep_proportion=str(slot.get("fit")) != "cover", overlay=True)
            except Exception: continue
        page.draw_line((28*MM,height-18*MM),(width-20*MM,height-18*MM),color=LINE,width=.5)
        _text(page, project.get("name", "ArchiPanel Studio"), fitz.Rect(28*MM,height-15*MM,width*.55,height-7*MM), 7, MUTED)
        _text(page, f"{number:02d} / {len(spec.get('pages', [])):02d}", fitz.Rect(width-55*MM,height-15*MM,width-20*MM,height-7*MM), 7, MUTED, align=2)
    output.parent.mkdir(parents=True, exist_ok=True); doc.set_metadata({"title": f"{project.get('name','Project')} Design Statement", "producer": "ArchiPanel Studio 1.4", "subject": "A3 RGB design statement"}); doc.save(output, garbage=4, deflate=True); doc.close(); return output


def render_pdf_pages(pdf: Path, directory: Path) -> int:
    directory.mkdir(parents=True, exist_ok=True); doc = fitz.open(pdf)
    thumbs: list[Image.Image] = []
    for index, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(1.2,1.2), alpha=False); path = directory / f"page-{index+1:02d}.png"; pix.save(path)
        with Image.open(path) as image: copy = image.copy(); copy.thumbnail((320,226)); thumbs.append(copy)
    if thumbs:
        cols=4; rows=(len(thumbs)+cols-1)//cols; montage=Image.new("RGB",(cols*320,rows*226),(35,35,33))
        for index,image in enumerate(thumbs): montage.paste(image,((index%cols)*320,(index//cols)*226))
        montage.save(directory/"montage.webp","WEBP",quality=84)
    count=len(doc); doc.close(); return count
