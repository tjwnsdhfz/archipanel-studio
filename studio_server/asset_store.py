from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from .deployment import settings as deployment_settings

CHUNK_BYTES = 32 * 1024 * 1024
MAX_SOURCE_BYTES = deployment_settings().max_source_bytes
SESSION_TTL_SECONDS = 24 * 60 * 60


def store_root() -> Path:
    configured = os.environ.get("ARCHIPANEL_DATA_DIR", "").strip()
    if configured:
        root = Path(configured).expanduser().resolve()
        (root / "assets").mkdir(parents=True, exist_ok=True)
        (root / "uploads").mkdir(parents=True, exist_ok=True)
        return root
    base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    root = base / "ArchiPanel Studio"
    (root / "assets").mkdir(parents=True, exist_ok=True)
    (root / "uploads").mkdir(parents=True, exist_ok=True)
    return root


def _safe_id(value: str) -> str:
    if not value or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for ch in value):
        raise ValueError("잘못된 로컬 자산 식별자입니다.")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cleanup_expired_sessions(now: float | None = None) -> int:
    now = now or time.time(); removed = 0
    for entry in (store_root() / "uploads").iterdir():
        if entry.is_dir() and now - entry.stat().st_mtime > SESSION_TTL_SECONDS:
            shutil.rmtree(entry, ignore_errors=True); removed += 1
    return removed


@dataclass(frozen=True)
class UploadSession:
    id: str
    name: str
    size: int
    chunk_count: int
    file_sha256: str | None

    @property
    def directory(self) -> Path:
        return store_root() / "uploads" / self.id


def create_session(name: str, size: int, file_sha256: str | None = None) -> UploadSession:
    cleanup_expired_sessions()
    if size <= 0 or size > MAX_SOURCE_BYTES:
        raise ValueError(f"PSD/PSB 원본은 0바이트보다 크고 {MAX_SOURCE_BYTES // (1024 * 1024)}MB 이하여야 합니다.")
    suffix = Path(name).suffix.lower()
    if suffix not in {".psd", ".psb"}:
        raise ValueError("청크 원본은 PSD 또는 PSB만 지원합니다.")
    session = UploadSession(str(uuid.uuid4()), Path(name).name, size, (size + CHUNK_BYTES - 1) // CHUNK_BYTES, file_sha256.lower() if file_sha256 else None)
    session.directory.mkdir(parents=True)
    (session.directory / "session.json").write_text(json.dumps(session.__dict__, ensure_ascii=False), encoding="utf-8")
    return session


def load_session(session_id: str) -> UploadSession:
    path = store_root() / "uploads" / _safe_id(session_id) / "session.json"
    if not path.is_file():
        raise FileNotFoundError("업로드 세션을 찾을 수 없습니다.")
    data = json.loads(path.read_text(encoding="utf-8"))
    return UploadSession(**data)


def put_chunk(session_id: str, index: int, body: bytes, expected_sha256: str | None) -> dict:
    session = load_session(session_id)
    if index < 0 or index >= session.chunk_count:
        raise ValueError("청크 번호가 범위를 벗어났습니다.")
    expected_size = CHUNK_BYTES if index < session.chunk_count - 1 else session.size - CHUNK_BYTES * (session.chunk_count - 1)
    if len(body) != expected_size:
        raise ValueError(f"청크 크기가 일치하지 않습니다. expected={expected_size} actual={len(body)}")
    digest = hashlib.sha256(body).hexdigest()
    if expected_sha256 and digest != expected_sha256.lower():
        raise ValueError("청크 SHA-256이 일치하지 않습니다.")
    target = session.directory / f"{index:08d}.chunk"
    if target.exists() and _sha256(target) != digest:
        raise ValueError("같은 번호의 다른 청크가 이미 있습니다.")
    if not target.exists():
        target.write_bytes(body)
    return {"index": index, "sha256": digest, "receivedBytes": len(body)}


def complete_session(session_id: str) -> dict:
    session = load_session(session_id)
    chunks = [session.directory / f"{index:08d}.chunk" for index in range(session.chunk_count)]
    missing = [index for index, path in enumerate(chunks) if not path.is_file()]
    if missing:
        raise ValueError(f"누락 청크가 있습니다: {missing[:12]}")
    assembled = session.directory / "assembled.bin"
    digest = hashlib.sha256(); total = 0
    with assembled.open("wb") as output:
        for path in chunks:
            data = path.read_bytes(); output.write(data); digest.update(data); total += len(data)
    actual = digest.hexdigest()
    if total != session.size or (session.file_sha256 and actual != session.file_sha256):
        assembled.unlink(missing_ok=True)
        raise ValueError("최종 파일 크기 또는 SHA-256이 일치하지 않습니다.")
    asset_dir = store_root() / "assets" / actual
    asset_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(session.name).suffix.lower()
    source = asset_dir / f"source{suffix}"
    if not source.exists():
        os.replace(assembled, source)
    metadata_path = asset_dir / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.is_file() else {"assetId": str(uuid.uuid4()), "sha256": actual, "name": session.name, "sizeBytes": total, "sourcePath": str(source)}
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
    shutil.rmtree(session.directory, ignore_errors=True)
    return {key: value for key, value in metadata.items() if key != "sourcePath"}


def resolve_asset(asset_id: str) -> Path:
    _safe_id(asset_id)
    for metadata_path in (store_root() / "assets").glob("*/metadata.json"):
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
        if data.get("assetId") == asset_id:
            path = Path(data["sourcePath"])
            if path.is_file(): return path
    raise FileNotFoundError("로컬 원본 자산을 찾을 수 없습니다.")


def asset_metadata(asset_id: str) -> dict:
    path = resolve_asset(asset_id)
    data = json.loads((path.parent / "metadata.json").read_text(encoding="utf-8"))
    return {key: value for key, value in data.items() if key != "sourcePath"}
