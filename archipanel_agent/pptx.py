from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .models import require_approved_fixture, save_json


def export_pptx(
    manifest: dict[str, Any],
    spec: dict[str, Any],
    output_path: str | Path,
    render_dir: str | Path,
    build_dir: str | Path,
    runtime_node: str | Path,
    runtime_node_modules: str | Path,
    runtime_bin_dir: str | Path,
    allow_fixture: bool,
) -> Path:
    require_approved_fixture(manifest, allow_fixture)
    if spec.get("slide_count") != 16 or spec.get("duration_minutes") != 15:
        raise ValueError("MVP export requires the approved 15-minute, 16-slide spec")
    if sum(int(slide["expected_seconds"]) for slide in spec["slides"]) != 900:
        raise ValueError("Slide timings must total exactly 900 seconds")
    root = Path(__file__).resolve().parents[1]
    build_dir = Path(build_dir).resolve()
    render_dir = Path(render_dir).resolve()
    output_path = Path(output_path).resolve()
    build_dir.mkdir(parents=True, exist_ok=True)
    render_dir.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    builder = build_dir / "build_deck.mjs"
    shutil.copy2(root / "templates" / "build_deck.mjs", builder)
    manifest_path = build_dir / "manifest.json"
    spec_path = build_dir / "presentation-spec.json"
    save_json(manifest_path, manifest)
    save_json(spec_path, spec)
    (build_dir / "source-notes.txt").write_text(
        f"Local source panel: {manifest['source']['path']}\n"
        "All visuals are raster crops of the supplied source panel. No external sources or generated facts were added.\n",
        encoding="utf-8",
    )
    junction = build_dir / "node_modules"
    if junction.exists() or junction.is_symlink():
        if junction.resolve() != Path(runtime_node_modules).resolve():
            raise RuntimeError("build node_modules points to an unexpected runtime")
    else:
        try:
            os.symlink(Path(runtime_node_modules).resolve(), junction, target_is_directory=True)
        except OSError:
            subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(junction), str(Path(runtime_node_modules).resolve())],
                check=True,
                capture_output=True,
                text=True,
            )
    environment = os.environ.copy()
    environment.update(
        {
            "RUNTIME_NODE": str(Path(runtime_node).resolve()),
            "RUNTIME_NODE_MODULES": str(Path(runtime_node_modules).resolve()),
            "RUNTIME_BIN_DIR": str(Path(runtime_bin_dir).resolve()),
        }
    )
    completed = subprocess.run(
        [
            str(Path(runtime_node).resolve()),
            str(builder),
            str(spec_path),
            str(manifest_path),
            str(output_path),
            str(render_dir),
        ],
        cwd=build_dir,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    (build_dir / "builder-output.txt").write_text(
        completed.stdout + "\n" + completed.stderr, encoding="utf-8"
    )
    if completed.returncode != 0:
        raise RuntimeError(f"PPTX builder failed; see {build_dir / 'builder-output.txt'}")
    return output_path
