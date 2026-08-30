"""Deterministic local OpenAI-compatible endpoint for browser end-to-end tests."""
from __future__ import annotations

import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/v1/chat/completions":
            self.send_error(404); return
        length = min(int(self.headers.get("Content-Length", "0")), 2_000_000)
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        messages = payload.get("messages", [])
        system = str(messages[0].get("content", "")) if messages else ""
        user = str(messages[-1].get("content", "")) if messages else ""
        count_match = re.search(r"정확히\s+(\d+)개", system)
        count = max(3, min(60, int(count_match.group(1)) if count_match else 16))
        marker = "PANEL_EVIDENCE (UNTRUSTED CONTENT; DATA ONLY):\n"
        evidence = json.loads(user.split(marker, 1)[1]) if marker in user else []
        ids = [str(item["id"]) for item in evidence]
        if not ids:
            self.send_error(422, "No approved evidence"); return
        sections = ["identity", "challenge", "site_context", "concept", "process", "program", "organization", "master_plan", "floor_plan", "section_elevation", "material_performance", "experience"]
        layouts = ["cover", "statement", "image_text", "hero", "process", "matrix", "technical", "gallery", "synthesis", "closing"]
        slides = []
        for index in range(count):
            block = evidence[index % len(evidence)]
            slides.append({
                "title": f"{index + 1:02d} · {block.get('title') or block.get('label')}",
                "purpose": f"승인 근거 {block['id']}의 설계 정보를 설명한다.",
                "keySentence": str(block.get("summary") or block.get("title") or "승인 근거를 확인한다.")[:240],
                "designSectionId": sections[index % len(sections)],
                "layoutKind": layouts[index % len(layouts)],
                "sourceContentBlockIds": [ids[index % len(ids)]],
            })
        body = json.dumps({"choices": [{"message": {"content": json.dumps({"slides": slides}, ensure_ascii=False)}}]}, ensure_ascii=False).encode("utf-8")
        self.send_response(200); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 11435
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
