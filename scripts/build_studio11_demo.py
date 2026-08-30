from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

from studio_server.intelligence import build_storyboard

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output"


def main() -> None:
    asset_paths = [ROOT / "assets" / "architecture-wide" / f"block-{index:03d}.png" for index in (1, 2, 3, 5)]
    if not all(path.is_file() for path in asset_paths):
        raise SystemExit("demo source assets are missing")
    board_id = "studio11-demo-board"
    labels = ["title", "concept", "floor_plan", "render"]
    titles = ["ARCHIPANEL STUDIO 1.1", "공간 개념과 설계 전략", "도면으로 읽는 공간 체계", "경험 장면과 결론"]
    elements = []
    blocks = []
    asset_map = {}
    for index, (path, label, title) in enumerate(zip(asset_paths, labels, titles), 1):
        element_id = f"demo-element-{index:02d}"; block_id = f"demo-block-{index:02d}"
        elements.append({"id": element_id, "boardId": board_id, "type": "image", "name": title, "xMm": 20 + (index - 1) % 2 * 400, "yMm": 80 + (index - 1) // 2 * 480, "widthMm": 380, "heightMm": 420, "rotationDeg": 0, "opacity": 1, "visible": True, "locked": False, "assetId": f"asset-{index}", "cropNormalized": {"x": 0, "y": 0, "w": 1, "h": 1}, "fit": "contain", "flipX": False, "flipY": False})
        blocks.append({"id": block_id, "boardId": board_id, "elementIds": [element_id], "label": label, "title": title, "summary": ["콘텐츠 근거와 발표 목적을 한 흐름으로 연결합니다.", "승인된 개념 블록의 원본 시각 자료를 중심으로 설명합니다.", "평면·단면 계열 자료의 비교 관계를 명확히 전달합니다.", "원본 렌더의 비율을 유지하며 공간 경험을 종합합니다."][index - 1], "readingOrder": index, "importance": 6 - index, "confidence": 1, "status": "approved"})
        asset_map[element_id] = {"path": str(path), "contentType": "image/png"}
    project = {"schemaVersion": "1.1", "id": "studio11-demo", "name": "ArchiPanel Studio 1.1 Demo", "defaultDpi": 300, "colorMode": "RGB", "boards": [{"id": board_id, "name": "A0", "widthMm": 841, "heightMm": 1189, "bleedMm": 3, "safeMarginMm": 10, "backgroundColor": "#F4F0E7", "grid": {"enabled": True, "sizeMm": 5, "subdivisions": 1}, "guides": [], "elementIds": [item["id"] for item in elements], "printProfile": {"targetDpi": 300, "viewingDistanceMm": 1200, "derivedWidthPx": 9933, "derivedHeightPx": 14043}}], "elements": elements, "assets": [], "fonts": [], "contentBlocks": blocks, "typographyStyles": [], "layoutProposals": [], "presentationSpecs": [], "createdAt": "2026-08-26T00:00:00Z", "updatedAt": "2026-08-26T00:00:00Z"}
    spec = build_storyboard(project, 15, 16, "건축 설계 심사위원"); spec["approvalStatus"] = "approved"; project["presentationSpecs"] = [spec]
    OUTPUT.mkdir(exist_ok=True); render_dir = OUTPUT / "studio11-rendered"
    if render_dir.exists(): shutil.rmtree(render_dir)
    spec_path = OUTPUT / "studio11-demo-spec.json"; project_path = OUTPUT / "studio11-demo-project.json"; map_path = OUTPUT / "studio11-demo-assets.json"
    spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8"); project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8"); map_path.write_text(json.dumps(asset_map, ensure_ascii=False, indent=2), encoding="utf-8")
    dependencies = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "node"
    env = os.environ.copy(); env["NODE_PATH"] = str(dependencies / "node_modules"); env["ARTIFACT_TOOL_PATH"] = str(dependencies / "node_modules" / "@oai" / "artifact-tool" / "dist" / "artifact_tool.mjs")
    command = [str(dependencies / "bin" / "node.exe"), str(ROOT / "templates" / "build_studio_deck.mjs"), str(spec_path), str(project_path), str(map_path), str(OUTPUT / "ArchiPanel_Studio_1_1_Demo.pptx"), str(render_dir)]
    subprocess.run(command, cwd=ROOT, env=env, check=True)


if __name__ == "__main__":
    main()
