import { describe, expect, it } from "vitest";
import { contrastRatio, readabilityWarnings } from "./readability";
import { DEFAULT_TRANSFORM, derivedPixels, makeProject, migrateProject } from "./types";
import { useStudio } from "./store";

describe("Studio 1.2 document and readability", () => {
  it("migrates 1.0 without changing mm geometry", () => {
    const project = makeProject(); const old = { ...project, schemaVersion: "1.0", contentBlocks: undefined, typographyStyles: undefined, layoutProposals: undefined, presentationSpecs: undefined, boards: project.boards.map(({ printProfile: _ignored, ...board }) => board) };
    const migrated = migrateProject(old); expect(migrated.schemaVersion).toBe("1.4"); expect(migrated.boards[0].widthMm).toBe(841); expect(migrated.boards[0].printProfile.targetDpi).toBe(300);
  });
  it("changes DPI without changing physical size", () => {
    useStudio.getState().loadProject(makeProject()); const board = useStudio.getState().project!.boards[0]; useStudio.getState().resizeBoard(board.id, board.widthMm, board.heightMm, "keep", 150);
    const next = useStudio.getState().project!.boards[0]; expect(next.widthMm).toBe(841); expect(next.printProfile.derivedWidthPx).toBe(derivedPixels(841, 150));
  });
  it("reports low contrast and role minimum size", () => {
    const project = makeProject(); const element = { id: crypto.randomUUID(), boardId: project.boards[0].id, type: "text" as const, name: "본문", xMm: 0, yMm: 0, widthMm: 20, heightMm: 20, rotationDeg: 0, opacity: 1, visible: true, locked: false, transform: structuredClone(DEFAULT_TRANSFORM), text: "아주 긴 본문 문장입니다. ".repeat(10), fontFamily: "Malgun Gothic", fontSizePt: 8, lineHeight: 1, letterSpacingPt: 0, align: "left" as const, verticalAlign: "top" as const, color: "#777777", weight: 400, italic: false, underline: false, autoSize: false, styleRole: "body" as const };
    expect(contrastRatio("#777777", "#777777")).toBe(1); expect(readabilityWarnings(element, "#777777").length).toBeGreaterThan(2);
  });
});
