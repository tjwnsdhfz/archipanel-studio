import { beforeEach, describe, expect, it } from "vitest";
import { useStudio } from "./store";
import { DEFAULT_TRANSFORM, makeBoard, newId, type ShapeElement } from "./types";

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
  it("pastes selected layers with a 5mm offset as one undo command", () => {
    const state = useStudio.getState(); const boardId = state.activeBoardId!; const item = shape(boardId, 10);
    state.addElement(item); state.setSelection([item.id]); state.copySelected(); const history = useStudio.getState().past.length; state.pasteClipboard();
    const pasted = useStudio.getState().project!.elements.find((element) => element.id === useStudio.getState().selectedIds[0]);
    expect(pasted?.xMm).toBe(15); expect(pasted?.yMm).toBe(15); expect(useStudio.getState().past.length).toBe(history + 1);
    useStudio.getState().undo(); expect(useStudio.getState().project!.elements).toHaveLength(1);
  });
  it("copies groups and approved content links across boards at exact mm coordinates", () => {
    const state = useStudio.getState(); const sourceBoardId = state.activeBoardId!; const first = shape(sourceBoardId, 10); const second = shape(sourceBoardId, 40);
    state.addElement(first); state.addElement(second); state.setSelection([first.id, second.id]); state.groupSelected();
    state.commit((draft) => draft.contentBlocks.push({ id: newId(), boardId: sourceBoardId, elementIds: [first.id, second.id], label: "diagram", title: "연결 블록", summary: "", readingOrder: 1, importance: 3, confidence: 1, status: "approved" }));
    state.copySelected(); const target = makeBoard("대안 보드", 841, 1189); state.addBoard(target); state.pasteClipboard(true);
    const targetElements = useStudio.getState().project!.elements.filter((element) => element.boardId === target.id); const targetGroup = targetElements.find((element) => element.type === "group");
    expect(targetElements.filter((element) => element.type !== "group").map((element) => element.xMm)).toEqual([10, 40]);
    expect(targetGroup?.type).toBe("group"); if (targetGroup?.type === "group") expect(targetGroup.childIds.every((id) => targetElements.some((element) => element.id === id))).toBe(true);
    const copiedBlock = useStudio.getState().project!.contentBlocks.find((block) => block.boardId === target.id);
    expect(copiedBlock?.status).toBe("approved"); expect(copiedBlock?.elementIds.every((id) => targetElements.some((element) => element.id === id))).toBe(true);
  });
});
