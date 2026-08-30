import { describe, expect, it } from "vitest";
import { alignElements, distributeElements, tidyGrid } from "./alignment";
import { DEFAULT_TRANSFORM, makeBoard, newId, type ShapeElement } from "./types";

const shape = (boardId: string, xMm: number, yMm = 10, locked = false): ShapeElement => ({ id: newId(), boardId, type: "shape", name: "도형", xMm, yMm, widthMm: 20, heightMm: 10, rotationDeg: 0, opacity: 1, visible: true, locked, transform: structuredClone(DEFAULT_TRANSFORM), shape: "rect", fill: "#fff", stroke: "#000", strokeWidthMm: .2, dash: [] });

describe("architecture panel alignment", () => {
  it("aligns against safe area and preserves locked elements", () => { const board = makeBoard("테스트", 200, 100); const a = shape(board.id, 30), locked = shape(board.id, 80, 20, true); const patches = alignElements([a, locked], board, "left", "safe"); expect(patches[a.id].xMm).toBe(10); expect(patches[locked.id]).toBeUndefined(); });
  it("distributes equal gaps deterministically", () => { const board = makeBoard(); const items = [shape(board.id, 0), shape(board.id, 80), shape(board.id, 180)]; const patches = distributeElements(items, "h-gap"); expect(patches[items[1].id].xMm).toBe(90); });
  it("tidies into board safe grid", () => { const board = makeBoard("테스트", 200, 100); const items = [0, 1, 2, 3].map((n) => shape(board.id, n * 20)); const patches = tidyGrid(items, board, 5); expect(Object.keys(patches)).toHaveLength(4); expect(patches[items[0].id].xMm).toBe(board.safeMarginMm); });
});
