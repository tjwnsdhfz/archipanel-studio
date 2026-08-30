from __future__ import annotations

import json
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from studio_server.demo import ASSET_ID, DEMO_SOURCE, REGIONS, build_demo_payload
from studio_server.intelligence import build_storyboard


OUTPUT = ROOT / "output" / "design-explanation"


def main() -> None:
    payload = build_demo_payload()
    project = payload["project"]
    project["schemaVersion"] = "1.2"
    spec = build_storyboard(project, 15, 16, "건축 설계 심사위원")
    spec["approvalStatus"] = "approved"
    spec["approvalFixture"] = {
        "kind": "automated-demo",
        "source": "user-provided-panel-example",
        "notice": "자동 테스트 전용 명시적 승인 fixture이며 실제 사용자 승인으로 간주하지 않습니다.",
    }
    project["presentationSpecs"] = [spec]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    assets_dir = OUTPUT / "assets"
    assets_dir.mkdir(exist_ok=True)
    asset_map: dict[str, dict[str, str]] = {}
    with Image.open(DEMO_SOURCE) as image:
        for region in REGIONS:
            x, y, width, height = region["crop"]
            box = (
                round(image.width * x), round(image.height * y),
                round(image.width * (x + width)), round(image.height * (y + height)),
            )
            element_id = f"demo-region-{region['id']}"
            target = assets_dir / f"{element_id}.png"
            image.crop(box).convert("RGB").save(target, "PNG", optimize=True)
            asset_map[element_id] = {"path": str(target.resolve()), "contentType": "image/png"}
    (OUTPUT / "studio-project.json").write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUTPUT / "studio-presentation.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUTPUT / "studio-assets.json").write_text(json.dumps(asset_map, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUTPUT / "design-explanation-data.json").write_text(json.dumps(spec["designExplanationData"], ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "slideCount": spec["slideCount"], "assetCount": len(asset_map), "assetId": ASSET_ID}, ensure_ascii=False))


if __name__ == "__main__":
    main()
