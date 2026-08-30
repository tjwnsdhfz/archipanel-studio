import { describe, expect, it } from "vitest";
import { runPreflight } from "./preflight";
import { DEFAULT_ADJUSTMENTS, DEFAULT_MASK, DEFAULT_TRANSFORM, makeProject, newId, type ImageElement, type TextElement } from "./types";

describe("preflight", () => {
  it("reports missing assets, low DPI, overflow and outside elements without changing content", () => {
    const project = makeProject("검사");
    const board = project.boards[0];
    const assetId = newId();
    project.assets.push({ id: assetId, name: "low.png", mime: "image/png", sizeBytes: 1, widthPx: 300, heightPx: 300 });
    const image: ImageElement = { id: newId(), boardId: board.id, name: "저해상도", type: "image", xMm: 0, yMm: 0, widthMm: 100, heightMm: 100, rotationDeg: 0, opacity: 1, visible: true, locked: false, transform: structuredClone(DEFAULT_TRANSFORM), assetId, cropNormalized: { x: 0, y: 0, w: 1, h: 1 }, fit: "contain", mask: structuredClone(DEFAULT_MASK), adjustments: structuredClone(DEFAULT_ADJUSTMENTS) };
    const text: TextElement = { id: newId(), boardId: board.id, name: "넘친 글", type: "text", xMm: 800, yMm: 1180, widthMm: 80, heightMm: 5, rotationDeg: 0, opacity: 1, visible: true, locked: false, transform: structuredClone(DEFAULT_TRANSFORM), text: "자동으로 고치지 않는 긴 한글 문장입니다.", fontFamily: "Malgun Gothic", fontSizePt: 24, lineHeight: 1.3, letterSpacingPt: 0, align: "left", verticalAlign: "top", color: "#000000", weight: 400, italic: false, underline: false, autoSize: false, styleRole: "body" };
    project.elements.push(image, text); board.elementIds.push(image.id, text.id);
    const before = text.text;
    const codes = runPreflight(project).map((issue) => issue.code);
    expect(codes).toContain("dpi-critical");
    expect(codes).toContain("text-overflow");
    expect(codes).toContain("outside-board");
    expect(text.text).toBe(before);
  });
  it("marks a non-normal blend as board rasterization", () => {
    const project = makeProject("혼합"); const board = project.boards[0];
    const image: ImageElement = { id: newId(), boardId: board.id, name: "도면 Multiply", type: "image", xMm: 20, yMm: 20, widthMm: 100, heightMm: 100, rotationDeg: 0, opacity: 1, visible: true, locked: false, blendMode: "multiply", transform: structuredClone(DEFAULT_TRANSFORM), assetId: "asset", cropNormalized: { x: 0, y: 0, w: 1, h: 1 }, fit: "contain", mask: structuredClone(DEFAULT_MASK), adjustments: structuredClone(DEFAULT_ADJUSTMENTS) };
    project.assets.push({ id: "asset", name: "plan.png", mime: "image/png", sizeBytes: 1, widthPx: 2000, heightPx: 2000 }); project.elements.push(image); board.elementIds.push(image.id);
    expect(runPreflight(project).map((issue) => issue.code)).toContain("blend-board-rasterized");
  });
});
