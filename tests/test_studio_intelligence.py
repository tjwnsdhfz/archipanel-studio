from __future__ import annotations

import unittest

from studio_server.intelligence import build_design_explanation_data, build_storyboard, recommend_layouts, suggest_content_blocks, validate_layout
from studio_server.demo import BOARD_ID, DEMO_SOURCE, REGIONS, build_demo_payload


def project_fixture() -> dict:
    board = {"id": "board", "name": "A0", "widthMm": 841, "heightMm": 1189, "safeMarginMm": 10, "grid": {"sizeMm": 5}, "elementIds": ["title", "render", "plan"]}
    elements = [
        {"id": "title", "boardId": "board", "type": "text", "name": "프로젝트 제목", "text": "도시의 틈", "fontSizePt": 64, "xMm": 10, "yMm": 10, "widthMm": 300, "heightMm": 50, "visible": True, "locked": False},
        {"id": "render", "boardId": "board", "type": "image", "name": "대표 렌더", "xMm": 10, "yMm": 80, "widthMm": 400, "heightMm": 300, "visible": True, "locked": False},
        {"id": "plan", "boardId": "board", "type": "pdf", "name": "1층 평면도", "xMm": 430, "yMm": 80, "widthMm": 380, "heightMm": 300, "visible": True, "locked": False},
    ]
    return {"id": "project", "boards": [board], "elements": elements, "contentBlocks": [], "presentationSpecs": []}


class StudioIntelligenceTests(unittest.TestCase):
    def test_attached_panel_demo_decomposes_into_traceable_regions_and_three_proposals(self) -> None:
        if not DEMO_SOURCE.is_file():
            self.skipTest("user-provided demo panel is not included in the public repository")
        payload = build_demo_payload(); project = payload["project"]
        self.assertEqual(payload["regionCount"], len(REGIONS))
        self.assertEqual(len(project["contentBlocks"]), len(REGIONS))
        self.assertTrue(all(block["status"] == "approved" and len(block["elementIds"]) == 1 for block in project["contentBlocks"]))
        self.assertEqual([proposal["strategy"] for proposal in project["layoutProposals"]], ["narrative", "hero", "technical"])
        self.assertTrue(all(validate_layout(project, proposal)["valid"] for proposal in project["layoutProposals"]))
        self.assertTrue(all(proposal["packingMetrics"]["occupancy"] >= 85 for proposal in project["layoutProposals"]))
        self.assertTrue(all(proposal["packingMetrics"]["gridAlignment"] == 100 for proposal in project["layoutProposals"]))
        decomposed = [element for element in project["elements"] if element["boardId"] == BOARD_ID]
        self.assertEqual(len(decomposed), len(REGIONS))
        for element in decomposed:
            crop = element["cropNormalized"]
            self.assertGreater(crop["w"], 0); self.assertGreater(crop["h"], 0)
            self.assertLessEqual(crop["x"] + crop["w"], 1.000001); self.assertLessEqual(crop["y"] + crop["h"], 1.000001)
        originals = {element["id"]: element for element in decomposed}
        for proposal in project["layoutProposals"]:
            for placement in proposal["placements"]:
                source = originals[placement["elementId"]]
                self.assertAlmostEqual(source["widthMm"] / source["heightMm"], placement["widthMm"] / placement["heightMm"], places=3)

    def test_label_suggestion_preserves_original_text(self) -> None:
        project = project_fixture(); before = project["elements"][0]["text"]
        blocks = suggest_content_blocks(project, "board")
        self.assertEqual(project["elements"][0]["text"], before)
        self.assertTrue(any(block["label"] == "title" for block in blocks))

    def test_three_recommendations_are_inside_board_and_locked_safe(self) -> None:
        project = project_fixture()
        project["contentBlocks"] = [
            {"id": "block-title", "boardId": "board", "elementIds": ["title"], "label": "title", "title": "도시의 틈", "summary": "프로젝트의 핵심", "readingOrder": 1, "importance": 5, "confidence": 1, "status": "approved"},
            {"id": "block-render", "boardId": "board", "elementIds": ["render"], "label": "render", "title": "경험", "summary": "공간 경험", "readingOrder": 2, "importance": 5, "confidence": 1, "status": "approved"},
            {"id": "block-plan", "boardId": "board", "elementIds": ["plan"], "label": "floor_plan", "title": "평면", "summary": "동선", "readingOrder": 3, "importance": 4, "confidence": 1, "status": "approved"},
        ]
        proposals = recommend_layouts(project, "board")
        self.assertEqual([item["strategy"] for item in proposals], ["narrative", "hero", "technical"])
        for proposal in proposals:
            self.assertTrue(validate_layout(project, proposal)["valid"])

    def test_storyboard_time_matches_exactly_and_keeps_trace_ids(self) -> None:
        project = project_fixture(); project["contentBlocks"] = [{"id": "block", "boardId": "board", "elementIds": ["title"], "label": "title", "title": "도시의 틈", "summary": "핵심 문장", "readingOrder": 1, "importance": 5, "confidence": 1, "status": "approved"}]
        spec = build_storyboard(project, 10, 12, "심사위원")
        self.assertEqual(sum(slide["expectedSeconds"] for slide in spec["slides"]), 600)
        self.assertTrue(all(slide["sourceContentBlockIds"] == ["block"] for slide in spec["slides"]))
        self.assertEqual(spec["approvalStatus"], "draft")

    def test_design_explanation_maps_only_approved_evidence_and_flags_missing_data(self) -> None:
        project = project_fixture()
        project["contentBlocks"] = [
            {"id": "concept", "boardId": "board", "elementIds": ["title"], "label": "concept", "title": "연결 개념", "summary": "", "readingOrder": 1, "importance": 5, "confidence": .9, "status": "approved"},
            {"id": "unapproved", "boardId": "board", "elementIds": ["render"], "label": "render", "title": "미승인 렌더", "summary": "", "readingOrder": 2, "importance": 5, "confidence": .9, "status": "suggested"},
        ]
        data = build_design_explanation_data(project, "심사위원")
        self.assertEqual(data["sourceContentBlockIds"], ["concept"])
        self.assertNotIn("unapproved", str(data))
        self.assertIn("identity", data["coverage"]["missingSectionIds"])
        self.assertTrue(data["reviewFlags"])

    def test_storyboard_uses_architectural_sequence_and_sources_notes(self) -> None:
        project = project_fixture()
        project["contentBlocks"] = [
            {"id": "concept", "boardId": "board", "elementIds": ["title"], "label": "concept", "title": "연결 개념", "summary": "", "readingOrder": 1, "importance": 5, "confidence": 1, "status": "approved"},
            {"id": "render", "boardId": "board", "elementIds": ["render"], "label": "render", "title": "공간 경험", "summary": "", "readingOrder": 2, "importance": 5, "confidence": 1, "status": "approved"},
        ]
        spec = build_storyboard(project, 15, 16, "심사위원")
        self.assertEqual([slide["layoutKind"] for slide in spec["slides"][:3]], ["cover", "evidence_map", "statement"])
        self.assertTrue(all("[Sources]" in slide["speakerNotes"] and "[/Sources]" in slide["speakerNotes"] for slide in spec["slides"]))
        self.assertEqual(sum(slide["expectedSeconds"] for slide in spec["slides"]), 900)


if __name__ == "__main__":
    unittest.main()
