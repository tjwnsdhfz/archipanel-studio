from __future__ import annotations

import base64

from studio_server.deployment import DeploymentSettings, credentials_valid, settings


def _config(**overrides):
    values = {
        "public_mode": True,
        "auth_username": "archipanel",
        "auth_password": "correct horse battery staple",
        "max_file_bytes": 1,
        "max_project_bytes": 2,
        "max_source_bytes": 3,
    }
    values.update(overrides)
    return DeploymentSettings(**values)


def _basic(username: str, password: str) -> str:
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return f"Basic {token}"


def test_public_deployment_requires_valid_basic_credentials():
    config = _config()
    assert not credentials_valid(None, config)
    assert not credentials_valid("Bearer nope", config)
    assert not credentials_valid(_basic("archipanel", "wrong"), config)
    assert credentials_valid(_basic("archipanel", "correct horse battery staple"), config)


def test_local_deployment_without_password_does_not_require_authentication():
    assert credentials_valid(None, _config(public_mode=False, auth_password=""))


def test_public_defaults_reduce_upload_limits(monkeypatch):
    monkeypatch.setenv("ARCHIPANEL_PUBLIC_MODE", "1")
    monkeypatch.delenv("ARCHIPANEL_MAX_FILE_BYTES", raising=False)
    monkeypatch.delenv("ARCHIPANEL_MAX_PROJECT_BYTES", raising=False)
    monkeypatch.delenv("ARCHIPANEL_MAX_SOURCE_BYTES", raising=False)
    config = settings()
    assert config.max_file_bytes == 256 * 1024 * 1024
    assert config.max_project_bytes == 768 * 1024 * 1024
    assert config.max_source_bytes == 512 * 1024 * 1024
