from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .editor import build_editor
from .extract import extract_panel
from .models import load_json, save_json, validate_manifest
from .pptx import export_pptx
from .story import build_storyboard
from .validate import run_validation


class _EditorHandler(SimpleHTTPRequestHandler):
    manifest_path: Path
    editor_path: Path

    def do_GET(self) -> None:
        if self.path in {"/", "/editor.html"}:
            payload = self.editor_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if self.path == "/api/manifest":
            payload = self.manifest_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_error(404)

    def do_PUT(self) -> None:
        if self.path != "/api/manifest":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload: dict[str, Any] = json.loads(self.rfile.read(length).decode("utf-8"))
            errors = validate_manifest(payload)
            if errors:
                raise ValueError("; ".join(errors))
            save_json(self.manifest_path, payload)
            build_editor(payload, self.editor_path)
            response = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
        except Exception as error:
            response = str(error).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

    def log_message(self, format: str, *args: object) -> None:
        print(f"editor: {format % args}")


def _runtime_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--runtime-node", required=True)
    parser.add_argument("--runtime-node-modules", required=True)
    parser.add_argument("--runtime-bin-dir", required=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="archipanel", description="Large-format single-page architecture board to editable HTML and approved PPTX"
    )
    sub = parser.add_subparsers(dest="command", required=True)
    extract = sub.add_parser("extract", help="extract PanelBlock manifest and crops")
    extract.add_argument("input")
    extract.add_argument("--manifest", required=True)
    extract.add_argument("--assets-dir", required=True)
    editor = sub.add_parser("editor", help="build a self-contained label editor")
    editor.add_argument("manifest")
    editor.add_argument("--output", required=True)
    serve = sub.add_parser("serve", help="serve the editor with persistent local save")
    serve.add_argument("manifest")
    serve.add_argument("editor")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    approve = sub.add_parser("approve", help="create an explicit approved manifest/fixture")
    approve.add_argument("manifest")
    approve.add_argument("--output", required=True)
    approve.add_argument("--approved-by", required=True)
    approve.add_argument("--fixture", action="store_true")
    story = sub.add_parser("storyboard", help="convert approved blocks to a 15-minute, 16-slide spec")
    story.add_argument("manifest")
    story.add_argument("--output", required=True)
    export = sub.add_parser("export-pptx", help="export an approved PresentationSpec")
    export.add_argument("manifest")
    export.add_argument("spec")
    export.add_argument("--output", required=True)
    export.add_argument("--render-dir", required=True)
    export.add_argument("--build-dir", required=True)
    export.add_argument("--approved-fixture", action="store_true")
    _runtime_args(export)
    validate = sub.add_parser("validate", help="validate schema, traceability, notes, and renders")
    validate.add_argument("manifest")
    validate.add_argument("spec")
    validate.add_argument("--pptx")
    validate.add_argument("--render-dir")
    validate.add_argument("--report")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "extract":
        manifest = extract_panel(args.input, args.manifest, args.assets_dir)
        errors = validate_manifest(manifest)
        if errors:
            raise ValueError("; ".join(errors))
        print(f"extracted {len(manifest['blocks'])} blocks -> {args.manifest}")
    elif args.command == "editor":
        output = build_editor(load_json(args.manifest), args.output)
        print(output)
    elif args.command == "serve":
        handler = type("EditorHandler", (_EditorHandler,), {})
        handler.manifest_path = Path(args.manifest).resolve()
        handler.editor_path = Path(args.editor).resolve()
        server = ThreadingHTTPServer((args.host, args.port), handler)
        print(f"editor available at http://{args.host}:{args.port}/")
        server.serve_forever()
    elif args.command == "approve":
        manifest = load_json(args.manifest)
        manifest["approval"] = {
            "status": "approved",
            "approved_by": args.approved_by,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "approved_fixture": bool(args.fixture),
        }
        save_json(args.output, manifest)
        print(args.output)
    elif args.command == "storyboard":
        save_json(args.output, build_storyboard(load_json(args.manifest)))
        print(args.output)
    elif args.command == "export-pptx":
        output = export_pptx(
            load_json(args.manifest),
            load_json(args.spec),
            args.output,
            args.render_dir,
            args.build_dir,
            args.runtime_node,
            args.runtime_node_modules,
            args.runtime_bin_dir,
            args.approved_fixture,
        )
        print(output)
    elif args.command == "validate":
        report = run_validation(
            load_json(args.manifest),
            load_json(args.spec),
            args.pptx,
            args.render_dir,
            args.report,
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["ok"] else 1
    return 0
