import { beforeEach, describe, expect, it } from "vitest";
import { useStudio } from "./store";
import { DEFAULT_TRANSFORM, newId, type ShapeElement } from "./types";

function shape(boardId: string, xMm: number): ShapeElement {
  return { id: newId(), boardId, type: "shape", name: "도형", xMm, yMm: 10, widthMm: 20, heightMm: 20, rotationDeg: 0, opacity: 1, visible: true, locked: false, transform: structuredClone(DEFAULT_TRANSFORM), shape: "rect", fill: "#ffffff", stroke: "#000000", strokeWidthMm: 0.2, dash: [] };
}

describe("studio history and groups", () => {
  beforeEach(() => { useStudio.getState().closeProject(); useStudio.getState().createProject("테스트"); });

  it("groups selected layers and remaps group children when duplicating a board", () => {
    const boardId = useStudio.getState().activeBoardId!;
    const first = shape(boardId, 10); const second = shape(boardId, 40);
    useStudio.getState().addElement(first); useStudio.getState().addElement(second);
    useStudio.getState().setSelection([first.id, second.id]); useStudio.getState().groupSelected();
    const group = useStudio.getState().project!.elements.find((element) => element.type === "group");
    expect(group?.type).toBe("group");
    if (!group || group.type !== "group") return;
    expect(group.childIds).toEqual([first.id, second.id]);
    useStudio.getState().duplicateBoard(boardId);
    const duplicatedBoard = useStudio.getState().project!.boards[1];
    const duplicatedGroup = useStudio.getState().project!.elements.find((element) => element.type === "group" && element.boardId === duplicatedBoard.id);
    expect(duplicatedGroup?.type).toBe("group");
    if (duplicatedGroup?.type === "group") expect(duplicatedGroup.childIds.every((id) => duplicatedBoard.elementIds.includes(id))).toBe(true);
  });

  it("undoes and redoes a committed element addition", () => {
    const boardId = useStudio.getState().activeBoardId!;
    useStudio.getState().addElement(shape(boardId, 10));
    expect(useStudio.getState().project!.elements).toHaveLength(1);
    useStudio.getState().undo(); expect(useStudio.getState().project!.elements).toHaveLength(0);
    useStudio.getState().redo(); expect(useStudio.getState().project!.elements).toHaveLength(1);
  });
  it("commits free transform as one history entry", () => { const state = useStudio.getState(); const boardId = state.activeBoardId!; const item = shape(boardId, 10); state.addElement(item); const history = useStudio.getState().past.length; state.setSelection([item.id]); state.beginTransform(); state.mutate((draft) => { draft.elements[0].xMm = 55; }); state.completeTransform(); expect(useStudio.getState().past.length).toBe(history + 1); useStudio.getState().undo(); expect(useStudio.getState().project!.elements[0].xMm).toBe(10); });
  it("cancels free transform exactly", () => { const state = useStudio.getState(); const boardId = state.activeBoardId!; const item = shape(boardId, 10); state.addElement(item); state.setSelection([item.id]); state.beginTransform(); state.mutate((draft) => { draft.elements[0].xMm = 75; }); state.cancelTransform(); expect(useStudio.getState().project!.elements[0].xMm).toBe(10); expect(useStudio.getState().transformMode).toBe(false); });
});
