from __future__ import annotations

import unittest

from studio_server.ai_storyboard import build_messages, normalize_ai_storyboard


def fixture() -> dict:
    return {
        "id": "html-project", "name": "HTML 패널", "elements": [
            {"id": "title-element", "type": "text"}, {"id": "render-element", "type": "image"},
        ],
        "contentBlocks": [
            {"id": "title-block", "elementIds": ["title-element"], "label": "title", "title": "프로젝트", "summary": "승인 제목", "readingOrder": 1, "confidence": 1, "status": "approved"},
            {"id": "render-block", "elementIds": ["render-element"], "label": "render", "title": "대표 장면", "summary": "승인 렌더", "readingOrder": 2, "confidence": 1, "status": "approved"},
            {"id": "unapproved", "elementIds": ["render-element"], "label": "render", "title": "미승인", "summary": "무시", "readingOrder": 3, "confidence": .3, "status": "suggested"},
        ],
    }


class AiStoryboardTests(unittest.TestCase):
    def test_prompt_marks_panel_as_untrusted_and_excludes_unapproved(self) -> None:
        messages = build_messages(fixture(), "설명 구성", 5, 3, "심사위원")
        self.assertIn("UNTRUSTED", messages[1]["content"])
        self.assertIn("title-block", messages[1]["content"])
        self.assertNotIn("unapproved", messages[1]["content"])

    def test_normalizer_rejects_invented_ids_and_derives_element_ids(self) -> None:
        completion = {"slides": [
            {"title": "AI 표지", "purpose": "근거 소개", "keySentence": "승인 근거를 설명합니다.", "designSectionId": "identity", "layoutKind": "cover", "sourceContentBlockIds": ["invented"]},
            {"title": "장면", "purpose": "장면 설명", "keySentence": "대표 장면을 봅니다.", "designSectionId": "experience", "layoutKind": "hero", "sourceContentBlockIds": ["render-block"]},
            {"title": "마무리", "purpose": "정리", "keySentence": "근거를 정리합니다.", "designSectionId": "identity", "layoutKind": "closing", "sourceContentBlockIds": ["title-block"]},
        ]}
        spec = normalize_ai_storyboard(fixture(), completion, "프롬프트", 5, 3, "심사위원", "test-model", "http://127.0.0.1:11434")
        self.assertEqual(spec["approvalStatus"], "draft")
        self.assertNotIn("invented", str(spec))
        self.assertEqual(spec["slides"][1]["sourceElementIds"], ["render-element"])
        self.assertTrue(all("AI 생성 문장 사용자 검토 필요" in slide["reviewFlags"] for slide in spec["slides"]))
        self.assertTrue(all("[Sources]" in slide["speakerNotes"] for slide in spec["slides"]))
        self.assertEqual(sum(slide["expectedSeconds"] for slide in spec["slides"]), 300)


if __name__ == "__main__":
    unittest.main()
