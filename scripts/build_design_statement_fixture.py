from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from studio_server.app import Workspace, _prepare_studio_slide_assets
from studio_server.demo import DEMO_SOURCE, build_demo_payload
from studio_server.design_statement import build_design_statement, validate_design_statement
from studio_server.design_statement_pdf import export_design_statement_pdf, render_pdf_pages

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "design-statement-1.4"


def main() -> None:
    project = build_demo_payload()["project"]
    project["schemaVersion"] = "1.3"
    project["psdSources"] = []; project["designStatementSpecs"] = []; project["htmlSources"] = []
    project["designStatement"] = {"projectInfo": {"name": project["name"], "type": "건축 설계", "author": "사용자 검토 필요", "year": "사용자 검토 필요"}}
    spec = build_design_statement(project, "detailed", "건축 설계 교수·심사위원", 24, 1401)
    spec["approvalStatus"] = "approved"
    validation = validate_design_statement(project, spec)
    if not validation["valid"]: raise RuntimeError(validation)
    project["designStatementSpecs"] = [spec]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="archipanel-design-statement-") as directory:
        workspace = Workspace(Path(directory), project, {"demo-panel-source": DEMO_SOURCE}, {}, {}, {})
        asset_map = _prepare_studio_slide_assets(workspace)
        spec_path = Path(directory) / "spec.json"; project_path = Path(directory) / "project.json"; map_path = Path(directory) / "assets.json"
        spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
        project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8")
        map_path.write_text(json.dumps(asset_map, ensure_ascii=False, indent=2), encoding="utf-8")
        node_root = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "node"
        env = os.environ.copy(); env["NODE_PATH"] = str(node_root / "node_modules"); env["ARTIFACT_TOOL_PATH"] = str(node_root / "node_modules" / "@oai" / "artifact-tool" / "dist" / "artifact_tool.mjs")
        pptx = OUTPUT / "ArchiPanel_Studio_1.4_설계설명서_A3_24p.pptx"; pptx_renders = OUTPUT / "pptx-renders"
        result = subprocess.run([str(node_root/"bin"/"node.exe"), str(ROOT/"templates"/"build_design_statement.mjs"), str(spec_path), str(project_path), str(map_path), str(pptx), str(pptx_renders)], cwd=ROOT, env=env, text=True, encoding="utf-8", capture_output=True, timeout=300)
        if result.returncode: raise RuntimeError(result.stderr or result.stdout)
        pdf = OUTPUT / "ArchiPanel_Studio_1.4_설계설명서_A3_24p.pdf"; export_design_statement_pdf(spec, project, asset_map, pdf); pdf_count = render_pdf_pages(pdf, OUTPUT/"pdf-renders")
        if len(list(pptx_renders.glob("slide-*.png"))) != 24 or len(list(pptx_renders.glob("slide-*.layout.json"))) != 24 or pdf_count != 24: raise RuntimeError("render count mismatch")
        shutil.copy2(spec_path, OUTPUT/"approved-design-statement-spec.json")
    print(json.dumps({"pptx": str(pptx), "pdf": str(pdf), "pages": 24, "validation": validation}, ensure_ascii=False))


if __name__ == "__main__": main()
