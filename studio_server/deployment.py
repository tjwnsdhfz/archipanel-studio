from __future__ import annotations

import base64
import binascii
import hmac
import os
from dataclasses import dataclass


TRUE_VALUES = {"1", "true", "yes", "on"}


def _positive_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


@dataclass(frozen=True)
class DeploymentSettings:
    public_mode: bool
    auth_username: str
    auth_password: str
    max_file_bytes: int
    max_project_bytes: int
    max_source_bytes: int

    @property
    def auth_enabled(self) -> bool:
        return self.public_mode or bool(self.auth_password)


def settings() -> DeploymentSettings:
    public_mode = os.environ.get("ARCHIPANEL_PUBLIC_MODE", "").strip().lower() in TRUE_VALUES
    local_file_limit = 700 * 1024 * 1024
    local_project_limit = 1500 * 1024 * 1024
    local_source_limit = 2 * 1024 * 1024 * 1024
    return DeploymentSettings(
        public_mode=public_mode,
        auth_username=os.environ.get("ARCHIPANEL_AUTH_USERNAME", "archipanel").strip() or "archipanel",
        auth_password=os.environ.get("ARCHIPANEL_AUTH_PASSWORD", ""),
        max_file_bytes=_positive_int("ARCHIPANEL_MAX_FILE_BYTES", 256 * 1024 * 1024 if public_mode else local_file_limit),
        max_project_bytes=_positive_int("ARCHIPANEL_MAX_PROJECT_BYTES", 768 * 1024 * 1024 if public_mode else local_project_limit),
        max_source_bytes=_positive_int("ARCHIPANEL_MAX_SOURCE_BYTES", 512 * 1024 * 1024 if public_mode else local_source_limit),
    )


def credentials_valid(authorization: str | None, config: DeploymentSettings | None = None) -> bool:
    config = config or settings()
    if not config.auth_enabled:
        return True
    if not config.auth_password or not authorization or not authorization.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(authorization.removeprefix("Basic "), validate=True).decode("utf-8")
        username, password = decoded.split(":", 1)
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return False
    return hmac.compare_digest(username, config.auth_username) and hmac.compare_digest(password, config.auth_password)
