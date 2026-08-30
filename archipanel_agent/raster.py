from __future__ import annotations

import struct
import os
import subprocess
import sys
import zlib
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image


def _target_size(width: int, height: int, max_edge: int) -> tuple[int, int]:
    scale = min(1.0, max_edge / max(width, height))
    return max(1, round(width * scale)), max(1, round(height * scale))


def render_pdf_preview(path: Path, output: Path, max_edge: int = 2400) -> tuple[int, int, tuple[float, float]]:
    document = pdfium.PdfDocument(str(path))
    if len(document) != 1:
        raise ValueError(f"MVP accepts a single-page PDF; received {len(document)} pages")
    page = document[0]
    width_pt, height_pt = page.get_size()
    target = _target_size(round(width_pt), round(height_pt), max_edge)
    image = page.render(scale=target[0] / width_pt).to_pil().convert("RGB")
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, quality=92)
    return image.width, image.height, (width_pt * 25.4 / 72, height_pt * 25.4 / 72)


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c


def stream_png_preview(path: Path, output: Path, max_edge: int = 2400) -> tuple[int, int, tuple[int, int], tuple[float, float] | None]:
    """Downsample a huge non-interlaced 8-bit RGB/RGBA PNG row-by-row."""
    with path.open("rb") as stream:
        if stream.read(8) != b"\x89PNG\r\n\x1a\n":
            raise ValueError("Invalid PNG signature")
        chunks: list[bytes] = []
        dpi = None
        width = height = bit_depth = color_type = interlace = 0
        while True:
            raw_len = stream.read(4)
            if not raw_len:
                break
            length = struct.unpack(">I", raw_len)[0]
            kind = stream.read(4)
            data = stream.read(length)
            stream.read(4)
            if kind == b"IHDR":
                width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", data)
            elif kind == b"pHYs" and len(data) == 9 and data[8] == 1:
                xppm, yppm = struct.unpack(">II", data[:8])
                if xppm and yppm:
                    dpi = (xppm * 0.0254, yppm * 0.0254)
            elif kind == b"IDAT":
                chunks.append(data)
            elif kind == b"IEND":
                break
    if bit_depth != 8 or color_type not in {2, 6} or interlace != 0:
        raise ValueError("Huge PNG preview supports non-interlaced 8-bit RGB/RGBA only")
    channels = 3 if color_type == 2 else 4
    out_w, out_h = _target_size(width, height, max_edge)
    x_idx = [min(width - 1, int(x * width / out_w)) for x in range(out_w)]
    y_idx = {min(height - 1, int(y * height / out_h)): y for y in range(out_h)}
    preview = Image.new("RGB", (out_w, out_h), "white")
    pixels = preview.load()
    decoder = zlib.decompressobj()
    pending = bytearray()
    prior = bytearray(width * channels)
    row_bytes = width * channels
    source_row = 0
    for chunk in chunks + [b""]:
        pending.extend(decoder.decompress(chunk) if chunk else decoder.flush())
        while len(pending) >= row_bytes + 1 and source_row < height:
            filter_type = pending[0]
            raw = bytearray(pending[1:row_bytes + 1])
            del pending[:row_bytes + 1]
            for i in range(row_bytes):
                left = raw[i - channels] if i >= channels else 0
                up = prior[i]
                upper_left = prior[i - channels] if i >= channels else 0
                if filter_type == 1:
                    raw[i] = (raw[i] + left) & 255
                elif filter_type == 2:
                    raw[i] = (raw[i] + up) & 255
                elif filter_type == 3:
                    raw[i] = (raw[i] + ((left + up) >> 1)) & 255
                elif filter_type == 4:
                    raw[i] = (raw[i] + _paeth(left, up, upper_left)) & 255
                elif filter_type != 0:
                    raise ValueError(f"Unsupported PNG filter {filter_type}")
            if source_row in y_idx:
                oy = y_idx[source_row]
                for ox, sx in enumerate(x_idx):
                    base = sx * channels
                    rgb = raw[base:base + 3]
                    if channels == 4:
                        alpha = raw[base + 3] / 255
                        pixels[ox, oy] = tuple(round(c * alpha + 255 * (1 - alpha)) for c in rgb)
                    else:
                        pixels[ox, oy] = tuple(rgb)
            prior = raw
            source_row += 1
    output.parent.mkdir(parents=True, exist_ok=True)
    preview.save(output, quality=92)
    physical = None if not dpi else (width / dpi[0] * 25.4, height / dpi[1] * 25.4)
    return out_w, out_h, (width, height), physical


def _png_metadata(path: Path) -> tuple[tuple[int, int], tuple[float, float] | None]:
    dpi = None
    with path.open("rb") as stream:
        stream.read(8)
        while True:
            raw_len = stream.read(4)
            if not raw_len:
                break
            length = struct.unpack(">I", raw_len)[0]
            kind = stream.read(4)
            data = stream.read(length)
            stream.read(4)
            if kind == b"IHDR":
                width, height = struct.unpack(">II", data[:8])
            elif kind == b"pHYs" and len(data) == 9 and data[8] == 1:
                xppm, yppm = struct.unpack(">II", data[:8])
                if xppm and yppm:
                    dpi = (xppm * 0.0254, yppm * 0.0254)
            elif kind == b"IEND":
                break
    physical = None if not dpi else (width / dpi[0] * 25.4, height / dpi[1] * 25.4)
    return (width, height), physical


def _wic_png_preview(path: Path, output: Path, max_edge: int) -> tuple[int, int]:
    script = r'''
Add-Type -AssemblyName PresentationCore
$source = [System.IO.File]::OpenRead($env:ARCHIPANEL_WIC_SOURCE)
try {
  $bmp = New-Object System.Windows.Media.Imaging.BitmapImage
  $bmp.BeginInit()
  $bmp.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
  $bmp.DecodePixelWidth = [int]$env:ARCHIPANEL_WIC_EDGE
  $bmp.StreamSource = $source
  $bmp.EndInit()
  $bmp.Freeze()
  $encoder = New-Object System.Windows.Media.Imaging.JpegBitmapEncoder
  $encoder.QualityLevel = 92
  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bmp))
  $target = [System.IO.File]::Create($env:ARCHIPANEL_WIC_TARGET)
  try { $encoder.Save($target) } finally { $target.Dispose() }
  Write-Output ($bmp.PixelWidth.ToString() + "x" + $bmp.PixelHeight.ToString())
} finally { $source.Dispose() }
'''
    output.parent.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment.update({"ARCHIPANEL_WIC_SOURCE": str(path), "ARCHIPANEL_WIC_TARGET": str(output), "ARCHIPANEL_WIC_EDGE": str(max_edge)})
    completed = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        env=environment,
        capture_output=True, text=True, encoding="utf-8", check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError("Windows WIC preview failed: " + completed.stderr.strip())
    match = completed.stdout.strip().splitlines()[-1].split("x")
    return int(match[0]), int(match[1])


def render_image_preview(path: Path, output: Path, max_edge: int = 2400) -> tuple[int, int, tuple[int, int], tuple[float, float] | None]:
    if path.suffix.lower() == ".png":
        if sys.platform == "win32":
            original, physical = _png_metadata(path)
            width, height = _wic_png_preview(path, output, max_edge)
            return width, height, original, physical
        return stream_png_preview(path, output, max_edge)
    previous_limit = Image.MAX_IMAGE_PIXELS
    try:
        Image.MAX_IMAGE_PIXELS = None
        source_handle = Image.open(path)
    finally:
        Image.MAX_IMAGE_PIXELS = previous_limit
    with source_handle as source:
        original = source.size
        dpi = source.info.get("dpi")
        target = _target_size(*original, max_edge)
        source.draft("RGB", target)
        image = source.convert("RGB")
        image.thumbnail(target, Image.Resampling.LANCZOS)
        physical = None
        if dpi and dpi[0] and dpi[1]:
            physical = (original[0] / dpi[0] * 25.4, original[1] / dpi[1] * 25.4)
        output.parent.mkdir(parents=True, exist_ok=True)
        image.save(output, quality=92)
        return image.width, image.height, original, physical
