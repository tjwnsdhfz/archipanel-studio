import { describe, expect, it } from "vitest";
import { applyTransformPatch, clampSkew } from "./transform";
import { DEFAULT_TRANSFORM, makeProject, type ShapeElement } from "./types";

describe("free transform", () => {
  it("keeps aspect ratio and clamps skew", () => { const project = makeProject(); const element: ShapeElement = { id: crypto.randomUUID(), boardId: project.boards[0].id, type: "shape", name: "x", xMm: 0, yMm: 0, widthMm: 100, heightMm: 50, rotationDeg: 0, opacity: 1, visible: true, locked: false, transform: structuredClone(DEFAULT_TRANSFORM), shape: "rect", fill: "#fff", stroke: "#000", strokeWidthMm: .2, dash: [] }; const next = applyTransformPatch(element, { widthMm: 50, skewXDeg: 90 }); expect(next.heightMm).toBe(25); expect(next.transform.skewXDeg).toBe(60); expect(clampSkew(-80)).toBe(-60); });
});
