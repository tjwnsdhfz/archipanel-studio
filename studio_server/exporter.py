from __future__ import annotations

import io
import math
import os
from pathlib import Path
from typing import Any

import pymupdf as fitz
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

MM_TO_PT = 72 / 25.4
MAX_RASTER_PIXELS = 300_000_000


def mm_to_pt(value: float) -> float:
    return float(value) * MM_TO_PT


def export_pdf(
    project: dict[str, Any],
    assets: dict[str, Path],
    fonts: dict[str, Path],
    output: Path,
    options: dict[str, Any] | None = None,
) -> Path:
    options = options or {}
    include_bleed = bool(options.get("includeBleed", True))
    selected = set(options.get("boardIds") or [board["id"] for board in project["boards"]])
    document = fitz.open()
    element_map = {element["id"]: element for element in project.get("elements", [])}
    for board in project["boards"]:
        if board["id"] not in selected:
            continue
        bleed_mm = float(board.get("bleedMm", 0)) if include_bleed else 0.0
        page_width = mm_to_pt(float(board["widthMm"]) + bleed_mm * 2)
        page_height = mm_to_pt(float(board["heightMm"]) + bleed_mm * 2)
        page = document.new_page(width=page_width, height=page_height)
        if include_bleed and bleed_mm:
            trim = fitz.Rect(mm_to_pt(bleed_mm), mm_to_pt(bleed_mm), page_width - mm_to_pt(bleed_mm), page_height - mm_to_pt(bleed_mm))
            page.set_trimbox(trim)
            page.set_bleedbox(page.rect)
        page.draw_rect(page.rect, color=None, fill=_rgb(board.get("backgroundColor", "#ffffff")), overlay=False)
        offset = mm_to_pt(bleed_mm)
        board_elements = [element_map.get(element_id) for element_id in board.get("elementIds", [])]
        board_elements = [element for element in board_elements if element and element.get("visible", True) and element.get("type") != "group"]
        if any(str(element.get("blendMode", "normal")) != "normal" for element in board_elements):
            page.insert_image(page.rect, stream=_render_blended_board_png(board, board_elements, assets, fonts, include_bleed), keep_proportion=False, overlay=True)
            continue
        for element_id in board.get("elementIds", []):
            element = element_map.get(element_id)
            if not element or not element.get("visible", True) or element.get("type") == "group":
                continue
            rect = fitz.Rect(
                offset + mm_to_pt(element["xMm"]), offset + mm_to_pt(element["yMm"]),
                offset + mm_to_pt(element["xMm"] + element["widthMm"]),
                offset + mm_to_pt(element["yMm"] + element["heightMm"]),
            )
            _draw_element(page, rect, element, assets, fonts)
    output.parent.mkdir(parents=True, exist_ok=True)
    document.set_metadata({"title": project.get("name", "ArchiPanel Studio"), "producer": "ArchiPanel Studio 0.1", "subject": "RGB architecture panel"})
    document.save(output, garbage=4, deflate=True)
    document.close()
    return output


def _render_blended_board_png(board: dict[str, Any], elements: list[dict[str, Any]], assets: dict[str, Path], fonts: dict[str, Path], include_bleed: bool) -> bytes:
    """Rasterize only boards that use a Photoshop-style layer blend mode."""
    bleed_mm = float(board.get("bleedMm", 0)) if include_bleed else 0.0
    dpi = max(72, min(600, int((board.get("printProfile") or {}).get("targetDpi", 300))))
    width = round((float(board["widthMm"]) + bleed_mm * 2) / 25.4 * dpi)
    height = round((float(board["heightMm"]) + bleed_mm * 2) / 25.4 * dpi)
    if width * height > MAX_RASTER_PIXELS:
        raise ValueError(f"혼합 모드 보드가 {width}x{height}px로 안전 한도 3억 픽셀을 넘습니다. 보드 또는 DPI를 나누세요.")
    color = tuple(round(value * 255) for value in _rgb(board.get("backgroundColor", "#ffffff")))
    base = Image.new("RGB", (width, height), color)
    for element in elements:
        layer_w = max(1, round(float(element.get("widthMm", 1)) / 25.4 * dpi))
        layer_h = max(1, round(float(element.get("heightMm", 1)) / 25.4 * dpi))
        layer_doc = fitz.open(); layer_page = layer_doc.new_page(width=mm_to_pt(float(element.get("widthMm", 1))), height=mm_to_pt(float(element.get("heightMm", 1))))
        _draw_element(layer_page, layer_page.rect, element, assets, fonts)
        pixmap = layer_page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=True)
        layer = Image.frombytes("RGBA", (pixmap.width, pixmap.height), pixmap.samples)
        layer_doc.close()
        if layer.size != (layer_w, layer_h):
            layer = layer.resize((layer_w, layer_h), Image.Resampling.LANCZOS)
        x = round((bleed_mm + float(element.get("xMm", 0))) / 25.4 * dpi)
        y = round((bleed_mm + float(element.get("yMm", 0))) / 25.4 * dpi)
        _composite_blend(base, layer, x, y, str(element.get("blendMode", "normal")))
    buffer = io.BytesIO(); base.save(buffer, "PNG", optimize=True); return buffer.getvalue()


def _composite_blend(base: Image.Image, layer: Image.Image, x: int, y: int, mode: str) -> None:
    right = min(base.width, x + layer.width); bottom = min(base.height, y + layer.height)
    left = max(0, x); top = max(0, y)
    if right <= left or bottom <= top: return
    layer = layer.crop((left - x, top - y, right - x, bottom - y))
    background = base.crop((left, top, right, bottom)).convert("RGB")
    foreground = layer.convert("RGB")
    operations = {
        "multiply": ImageChops.multiply,
        "screen": ImageChops.screen,
        "overlay": ImageChops.overlay,
        "darken": ImageChops.darker,
        "lighten": ImageChops.lighter,
    }
    blended = operations.get(mode, lambda _background, top_image: top_image)(background, foreground)
    base.paste(blended, (left, top), layer.getchannel("A"))


def export_raster(pdf_path: Path, output: Path, dpi: int, quality: int = 92, target_size: tuple[int, int] | None = None) -> Path:
    document = fitz.open(pdf_path)
    page = document[0]
    width, height = target_size or (round(page.rect.width / 72 * dpi), round(page.rect.height / 72 * dpi))
    if width * height > MAX_RASTER_PIXELS:
        document.close()
        raise ValueError(f"요청 이미지가 {width}x{height}px로 안전 한도 3억 픽셀을 넘습니다. 보드 또는 DPI를 나누세요.")
    pixmap = page.get_pixmap(dpi=dpi, alpha=output.suffix.lower() == ".png")
    output.parent.mkdir(parents=True, exist_ok=True)
    mode = "RGB" if pixmap.n < 4 else "RGBA"
    image = Image.frombytes(mode, (pixmap.width, pixmap.height), pixmap.samples)
    if image.size != (width, height):
        image = image.resize((width, height), Image.Resampling.LANCZOS)
    if output.suffix.lower() in {".jpg", ".jpeg"}:
        if image.mode == "RGBA":
            background = Image.new("RGB", image.size, "white")
            background.paste(image, mask=image.getchannel("A"))
            image = background
        image.save(output, "JPEG", quality=max(1, min(100, quality)), optimize=True)
    else:
        image.save(output, "PNG", optimize=True)
    document.close()
    return output


def _draw_element(page: fitz.Page, rect: fitz.Rect, element: dict[str, Any], assets: dict[str, Path], fonts: dict[str, Path]) -> None:
    kind = element.get("type")
    opacity = max(0.0, min(1.0, float(element.get("opacity", 1))))
    if kind == "text":
        _draw_text(page, rect, element, fonts, opacity)
    elif kind == "shape":
        _draw_shape(page, rect, element, opacity)
    elif kind in {"image", "psd_layer"}:
        path = assets.get(str(element.get("previewAssetId") if kind == "psd_layer" else element.get("assetId")))
        if path:
            _draw_image(page, rect, element, path, opacity)
    elif kind == "pdf":
        path = assets.get(str(element.get("assetId")))
        if path:
            source = fitz.open(path)
            page_index = min(max(0, int(element.get("pageIndex", 0))), len(source) - 1)
            clip_data = element.get("clipNormalized") or {"x": 0, "y": 0, "w": 1, "h": 1}
            source_rect = source[page_index].rect
            clip = fitz.Rect(
                source_rect.x0 + source_rect.width * float(clip_data.get("x", 0)),
                source_rect.y0 + source_rect.height * float(clip_data.get("y", 0)),
                source_rect.x0 + source_rect.width * float(clip_data.get("x", 0) + clip_data.get("w", 1)),
                source_rect.y0 + source_rect.height * float(clip_data.get("y", 0) + clip_data.get("h", 1)),
            )
            if _requires_layer_raster(element):
                pixmap = source[page_index].get_pixmap(matrix=fitz.Matrix(4, 4), clip=clip, alpha=True)
                image = Image.frombytes("RGBA", (pixmap.width, pixmap.height), pixmap.samples)
                page.insert_image(rect, stream=_prepared_png(image, element, opacity), keep_proportion=True, overlay=True)
            else:
                page.show_pdf_page(rect, source, page_index, clip=clip, keep_proportion=True, overlay=True)
            source.close()


def _draw_text(page: fitz.Page, rect: fitz.Rect, element: dict[str, Any], fonts: dict[str, Path], opacity: float) -> None:
    font_path = fonts.get(str(element.get("fontAssetId", "")))
    if not font_path and os.name == "nt":
        candidate = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "malgun.ttf"
        font_path = candidate if candidate.exists() else None
    font_name = f"AP{abs(hash(str(font_path))) % 10_000_000}" if font_path else "helv"
    transform = element.get("transform") or {}
    rotation_value = float(element.get("rotationDeg", 0))
    if transform.get("skewXDeg") or transform.get("skewYDeg") or int(round(rotation_value)) % 90:
        _draw_text_raster(page, rect, element, font_path, opacity)
        return
    if font_path:
        page.insert_font(fontname=font_name, fontfile=str(font_path))
    align = {"left": 0, "center": 1, "right": 2, "justify": 3}.get(element.get("align"), 0)
    rotation = int(round(float(element.get("rotationDeg", 0)))) % 360
    if rotation not in {0, 90, 180, 270}:
        rotation = 0
    page.insert_textbox(
        rect, str(element.get("text", "")), fontsize=float(element.get("fontSizePt", 12)),
        fontname=font_name, color=_rgb(element.get("color", "#111111")), align=align,
        lineheight=float(element.get("lineHeight", 1.2)), rotate=rotation,
        fill_opacity=opacity, overlay=True,
    )


def _draw_text_raster(page: fitz.Page, rect: fitz.Rect, element: dict[str, Any], font_path: Path | None, opacity: float) -> None:
    dpi = 600
    width = max(2, round(rect.width / 72 * dpi)); height = max(2, round(rect.height / 72 * dpi))
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    size = max(1, round(float(element.get("fontSizePt", 12)) / 72 * dpi))
    try: font = ImageFont.truetype(str(font_path), size) if font_path else ImageFont.load_default(size=size)
    except Exception: font = ImageFont.load_default(size=size)
    color = tuple(round(value * 255) for value in _rgb(element.get("color", "#111111"))) + (255,)
    spacing = max(0, round(size * (float(element.get("lineHeight", 1.2)) - 1)))
    ImageDraw.Draw(image).multiline_text((0, 0), str(element.get("text", "")), font=font, fill=color, spacing=spacing, align=str(element.get("align", "left")))
    page.insert_image(rect, stream=_prepared_png(image, element, opacity), keep_proportion=False, overlay=True)


def _draw_shape(page: fitz.Page, rect: fitz.Rect, element: dict[str, Any], opacity: float) -> None:
    stroke = _rgb(element.get("stroke", "#000000"))
    fill_value = element.get("fill", "transparent")
    fill = None if fill_value == "transparent" else _rgb(fill_value)
    width = mm_to_pt(float(element.get("strokeWidthMm", 0.5)))
    dashes = " ".join(str(mm_to_pt(float(value))) for value in element.get("dash", [])) or None
    kind = element.get("shape")
    if kind == "ellipse":
        page.draw_oval(rect, color=stroke, fill=fill, width=width, dashes=dashes, stroke_opacity=opacity, fill_opacity=opacity, overlay=True)
    elif kind == "line":
        page.draw_line(rect.top_left, rect.bottom_right, color=stroke, width=width, dashes=dashes, stroke_opacity=opacity, overlay=True)
    elif float(element.get("rotationDeg", 0)):
        points = _rotated_rect(rect, math.radians(float(element["rotationDeg"])))
        page.draw_polyline(points + [points[0]], color=stroke, fill=fill, width=width, dashes=dashes, stroke_opacity=opacity, fill_opacity=opacity, overlay=True, closePath=True)
    else:
        page.draw_rect(rect, color=stroke, fill=fill, width=width, dashes=dashes, stroke_opacity=opacity, fill_opacity=opacity, overlay=True)


def _draw_image(page: fitz.Page, rect: fitz.Rect, element: dict[str, Any], path: Path, opacity: float) -> None:
    crop = element.get("cropNormalized") or {"x": 0, "y": 0, "w": 1, "h": 1}
    is_full = all(abs(float(crop.get(key, default)) - default) < 0.0001 for key, default in (("x", 0), ("y", 0), ("w", 1), ("h", 1)))
    if not is_full or _requires_layer_raster(element) or opacity < .999:
        with Image.open(path) as image:
            box = (
                round(image.width * float(crop.get("x", 0))), round(image.height * float(crop.get("y", 0))),
                round(image.width * float(crop.get("x", 0) + crop.get("w", 1))), round(image.height * float(crop.get("y", 0) + crop.get("h", 1))),
            )
            cropped = image.convert("RGBA").crop(box)
            if element.get("fit") == "cover":
                cropped = _cover_to_ratio(cropped, rect.width / max(rect.height, .001))
            page.insert_image(rect, stream=_prepared_png(cropped, element, opacity), keep_proportion=element.get("fit") != "stretch", overlay=True)
        return
    with Image.open(path) as image:
        image_ratio = image.width / image.height
    fit = element.get("fit", "contain")
    target = rect
    if fit == "cover":
        target_ratio = rect.width / rect.height
        if image_ratio > target_ratio:
            width = rect.height * image_ratio
            target = fitz.Rect(rect.x0 - (width - rect.width) / 2, rect.y0, rect.x1 + (width - rect.width) / 2, rect.y1)
        else:
            height = rect.width / image_ratio
            target = fitz.Rect(rect.x0, rect.y0 - (height - rect.height) / 2, rect.x1, rect.y1 + (height - rect.height) / 2)
    page.insert_image(target, filename=str(path), keep_proportion=fit != "stretch", overlay=True)


def _cover_to_ratio(image: Image.Image, target_ratio: float) -> Image.Image:
    source_ratio = image.width / max(image.height, 1)
    if source_ratio > target_ratio:
        width = max(1, round(image.height * target_ratio)); left = (image.width - width) // 2
        return image.crop((left, 0, left + width, image.height))
    height = max(1, round(image.width / max(target_ratio, .001))); top = (image.height - height) // 2
    return image.crop((0, top, image.width, top + height))


def _requires_layer_raster(element: dict[str, Any]) -> bool:
    transform = element.get("transform") or {}
    mask = element.get("mask") or {}
    adjustments = element.get("adjustments") or {}
    return bool(mask.get("enabled") and mask.get("operations")) or any(abs(float(value or 0)) > .0001 for value in adjustments.values()) or bool(transform.get("flipX") or transform.get("flipY") or transform.get("skewXDeg") or transform.get("skewYDeg")) or abs(float(element.get("rotationDeg", 0))) > .0001


def _prepared_png(image: Image.Image, element: dict[str, Any], opacity: float) -> bytes:
    result = image.convert("RGBA")
    adjustments = element.get("adjustments") or {}
    exposure = max(-5.0, min(5.0, float(adjustments.get("exposureEv", 0))))
    brightness = max(-100.0, min(100.0, float(adjustments.get("brightness", 0))))
    contrast = max(-100.0, min(100.0, float(adjustments.get("contrast", 0))))
    saturation = max(-100.0, min(100.0, float(adjustments.get("saturation", 0))))
    result = ImageEnhance.Brightness(result).enhance((2 ** exposure) * (1 + brightness / 100))
    result = ImageEnhance.Contrast(result).enhance(max(0, 1 + contrast / 100))
    result = ImageEnhance.Color(result).enhance(max(0, 1 + saturation / 100))
    temperature = max(-100.0, min(100.0, float(adjustments.get("temperature", 0)))) / 100
    if temperature:
        r, g, b, a = result.split()
        r = r.point(lambda value: max(0, min(255, round(value * (1 + .18 * temperature)))))
        b = b.point(lambda value: max(0, min(255, round(value * (1 - .18 * temperature)))))
        result = Image.merge("RGBA", (r, g, b, a))
    grayscale = max(0.0, min(1.0, float(adjustments.get("grayscale", 0))))
    if grayscale:
        gray = ImageOps.grayscale(result).convert("RGBA"); gray.putalpha(result.getchannel("A")); result = Image.blend(result, gray, grayscale)
    transform = element.get("transform") or {}
    if transform.get("flipX"): result = ImageOps.mirror(result)
    if transform.get("flipY"): result = ImageOps.flip(result)
    skew_x = math.tan(math.radians(max(-60, min(60, float(transform.get("skewXDeg", 0))))))
    skew_y = math.tan(math.radians(max(-60, min(60, float(transform.get("skewYDeg", 0))))))
    if skew_x or skew_y:
        result = result.transform(result.size, Image.Transform.AFFINE, (1, -skew_x, skew_x * result.height / 2, -skew_y, 1, skew_y * result.width / 2), resample=Image.Resampling.BICUBIC)
    rotation = float(element.get("rotationDeg", 0))
    if rotation: result = result.rotate(-rotation, Image.Resampling.BICUBIC, expand=False)
    mask_data = element.get("mask") or {}
    if mask_data.get("enabled") and mask_data.get("operations"):
        alpha = _layer_mask(result.size, mask_data); base_alpha = result.getchannel("A"); result.putalpha(ImageChops.multiply(base_alpha, alpha))
    if opacity < .999:
        result.putalpha(result.getchannel("A").point(lambda value: round(value * opacity)))
    buffer = io.BytesIO(); result.save(buffer, "PNG", optimize=True); return buffer.getvalue()


def _layer_mask(size: tuple[int, int], data: dict[str, Any]) -> Image.Image:
    width, height = size; mask = Image.new("L", size, 0); draw = ImageDraw.Draw(mask)
    for operation in data.get("operations", []):
        value = 255 if operation.get("op", "add") == "add" else 0; kind = operation.get("kind")
        rect = operation.get("rect") or {}
        box = (round(float(rect.get("x", 0)) * width), round(float(rect.get("y", 0)) * height), round(float(rect.get("x", 0) + rect.get("w", 0)) * width), round(float(rect.get("y", 0) + rect.get("h", 0)) * height))
        if kind == "rect": draw.rectangle(box, fill=value)
        elif kind == "ellipse": draw.ellipse(box, fill=value)
        else:
            points = [(round(float(point.get("x", 0)) * width), round(float(point.get("y", 0)) * height)) for point in operation.get("points", [])]
            if kind == "polygon" and len(points) > 2: draw.polygon(points, fill=value)
            elif kind == "brush" and len(points) > 1: draw.line(points, fill=value, width=max(1, round(float(operation.get("radiusNormalized", .02)) * min(size) * 2)), joint="curve")
    feather = max(0.0, min(20.0, float(data.get("featherMm", 0))))
    if feather: mask = mask.filter(ImageFilter.GaussianBlur(radius=max(1, feather * min(size) / 250)))
    return ImageOps.invert(mask) if data.get("invert") else mask


def _rotated_rect(rect: fitz.Rect, angle: float) -> list[fitz.Point]:
    center = fitz.Point((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)
    result = []
    for point in (rect.top_left, rect.top_right, rect.bottom_right, rect.bottom_left):
        x, y = point.x - center.x, point.y - center.y
        result.append(fitz.Point(center.x + x * math.cos(angle) - y * math.sin(angle), center.y + x * math.sin(angle) + y * math.cos(angle)))
    return result


def _rgb(value: str) -> tuple[float, float, float]:
    value = str(value).lstrip("#")
    if len(value) == 3:
        value = "".join(character * 2 for character in value)
    try:
        return tuple(int(value[index:index + 2], 16) / 255 for index in (0, 2, 4))  # type: ignore[return-value]
    except (ValueError, IndexError):
        return (0.0, 0.0, 0.0)
