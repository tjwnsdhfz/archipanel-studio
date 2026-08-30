import { create } from "zustand";
import { produce } from "immer";
import type { AlignMode, AlignReference, DistributeMode } from "./alignment";
import { alignElements, distributeElements, tidyGrid } from "./alignment";
import type { AssetRef, LayoutProposalV1, PanelBoard, PanelContentBlock, PanelElement, PanelProjectV1, Tool } from "./types";
import { makeBoard, makeProject, migrateProject, newId, syncBoardPrintProfile } from "./types";

type StudioClipboard = { elements: PanelElement[]; contentBlocks: PanelContentBlock[]; pasteSerial: number };

type StudioState = {
  project: PanelProjectV1 | null;
  activeBoardId: string | null;
  selectedIds: string[];
  tool: Tool;
  zoom: number;
  savedAt: string | null;
  dirty: boolean;
  past: PanelProjectV1[];
  future: PanelProjectV1[];
  transformMode: boolean;
  transformBaseline: PanelProjectV1 | null;
  alignmentReference: AlignReference;
  keyObjectId: string | null;
  clipboard: StudioClipboard | null;
  loadProject: (project: PanelProjectV1) => void;
  createProject: (name?: string) => void;
  closeProject: () => void;
  setTool: (tool: Tool) => void;
  setZoom: (zoom: number) => void;
  setSelection: (ids: string[]) => void;
  setActiveBoard: (id: string) => void;
  commit: (recipe: (draft: PanelProjectV1) => void) => void;
  mutate: (recipe: (draft: PanelProjectV1) => void) => void;
  addElement: (element: PanelElement) => void;
  updateElement: (id: string, patch: Partial<PanelElement>, history?: boolean) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  pasteClipboard: (inPlace?: boolean) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  addBoard: (board?: PanelBoard) => void;
  duplicateBoard: (id: string) => void;
  moveBoard: (id: string, delta: number) => void;
  addAsset: (asset: AssetRef) => void;
  resizeBoard: (id: string, widthMm: number, heightMm: number, mode: "scale" | "keep" | "duplicate", targetDpi: number) => void;
  applyLayoutProposal: (proposal: LayoutProposalV1) => void;
  beginTransform: () => void;
  completeTransform: () => void;
  cancelTransform: () => void;
  setAlignmentReference: (reference: AlignReference) => void;
  alignSelected: (mode: AlignMode) => void;
  distributeSelected: (mode: DistributeMode) => void;
  tidySelected: (gapMm: number) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (at: string) => void;
};

const clone = <T,>(value: T): T => structuredClone(value);

export const useStudio = create<StudioState>((set, get) => ({
  project: null, activeBoardId: null, selectedIds: [], tool: "select", zoom: 1,
  savedAt: null, dirty: false, past: [], future: [], transformMode: false, transformBaseline: null, alignmentReference: "selection", keyObjectId: null, clipboard: null,
  loadProject: (input) => { const project = migrateProject(input); set({ project: clone(project), activeBoardId: project.boards[0]?.id ?? null, selectedIds: [], past: [], future: [], dirty: false, savedAt: project.updatedAt, clipboard: null }); },
  createProject: (name) => {
    const project = makeProject(name);
    set({ project, activeBoardId: project.boards[0].id, selectedIds: [], past: [], future: [], dirty: true, savedAt: null, clipboard: null });
  },
  closeProject: () => set({ project: null, activeBoardId: null, selectedIds: [], past: [], future: [], dirty: false, clipboard: null }),
  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.2, zoom)) }),
  setSelection: (selectedIds) => set({ selectedIds, keyObjectId: selectedIds.at(-1) ?? null }),
  setActiveBoard: (activeBoardId) => set({ activeBoardId, selectedIds: [] }),
  commit: (recipe) => {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      recipe(draft);
      draft.updatedAt = new Date().toISOString();
    });
    if (next === current) return;
    set((state) => ({ project: next, past: [...state.past.slice(-99), clone(current)], future: [], dirty: true }));
  },
  mutate: (recipe) => {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      recipe(draft);
      draft.updatedAt = new Date().toISOString();
    });
    set({ project: next, dirty: true });
  },
  addElement: (element) => get().commit((draft) => {
    draft.elements.push(element);
    draft.boards.find((b) => b.id === element.boardId)?.elementIds.push(element.id);
  }),
  updateElement: (id, patch, history = true) => {
    const edit = (draft: PanelProjectV1) => {
      const index = draft.elements.findIndex((el) => el.id === id);
      if (index >= 0) draft.elements[index] = { ...draft.elements[index], ...patch } as PanelElement;
    };
    history ? get().commit(edit) : get().mutate(edit);
  },
  deleteSelected: () => {
    const ids = new Set(get().selectedIds);
    if (!ids.size) return;
    get().commit((draft) => {
      draft.elements = draft.elements.filter((el) => !ids.has(el.id));
      draft.elements.forEach((el) => { if (el.type === "group") el.childIds = el.childIds.filter((id) => !ids.has(id)); });
      const emptyGroups = new Set(draft.elements.filter((el) => el.type === "group" && el.childIds.length < 2).map((el) => el.id));
      draft.elements = draft.elements.filter((el) => !emptyGroups.has(el.id));
      draft.boards.forEach((board) => { board.elementIds = board.elementIds.filter((id) => !ids.has(id)); });
      draft.boards.forEach((board) => { board.elementIds = board.elementIds.filter((id) => !emptyGroups.has(id)); });
    });
    set({ selectedIds: [] });
  },
  duplicateSelected: () => {
    const state = get();
    if (!state.project || !state.selectedIds.length) return;
    const newIds: string[] = [];
    const sources = state.project.elements.filter((element) => state.selectedIds.includes(element.id) && element.type !== "group").map((element) => clone(element));
    state.commit((draft) => {
      for (const source of sources) {
        const copy = { ...clone(source), id: newId(), name: `${source.name} 복사`, xMm: source.xMm + 5, yMm: source.yMm + 5 } as PanelElement;
        draft.elements.push(copy);
        draft.boards.find((b) => b.id === copy.boardId)?.elementIds.push(copy.id);
        newIds.push(copy.id);
      }
    });
    set({ selectedIds: newIds });
  },
  copySelected: () => {
    const state = get();
    if (!state.project || !state.selectedIds.length) return;
    const selectedIds = new Set(state.selectedIds);
    const selected = state.project.elements.filter((element) => selectedIds.has(element.id) && element.type !== "group");
    if (!selected.length || new Set(selected.map((element) => element.boardId)).size !== 1) return;
    const groups = state.project.elements.filter((element) => element.type === "group" && element.childIds.length > 1 && element.childIds.every((id) => selectedIds.has(id)));
    const contentBlocks = state.project.contentBlocks.filter((block) => block.elementIds.length > 0 && block.elementIds.every((id) => selectedIds.has(id)));
    set({ clipboard: { elements: clone([...selected, ...groups]), contentBlocks: clone(contentBlocks), pasteSerial: 0 } });
  },
  pasteClipboard: (inPlace = false) => {
    const state = get(); const clipboard = state.clipboard; const boardId = state.activeBoardId;
    const board = state.project?.boards.find((item) => item.id === boardId);
    if (!state.project || !clipboard || !board || !clipboard.elements.length) return;
    const targetBoardId = board.id;
    const sourceElements = clipboard.elements.filter((element) => element.type !== "group");
    if (!sourceElements.length) return;
    const idMap = new Map(clipboard.elements.map((element) => [element.id, newId()]));
    const minX = Math.min(...sourceElements.map((element) => element.xMm)); const minY = Math.min(...sourceElements.map((element) => element.yMm));
    const maxX = Math.max(...sourceElements.map((element) => element.xMm + element.widthMm)); const maxY = Math.max(...sourceElements.map((element) => element.yMm + element.heightMm));
    const step = inPlace ? 0 : 5 * (clipboard.pasteSerial + 1); let dx = step; let dy = step;
    const safe = Math.max(0, board.safeMarginMm); const availableWidth = board.widthMm - safe * 2; const availableHeight = board.heightMm - safe * 2;
    if (maxX - minX <= availableWidth) { if (minX + dx < safe) dx = safe - minX; if (maxX + dx > board.widthMm - safe) dx = board.widthMm - safe - maxX; }
    if (maxY - minY <= availableHeight) { if (minY + dy < safe) dy = safe - minY; if (maxY + dy > board.heightMm - safe) dy = board.heightMm - safe - maxY; }
    const newSelection = sourceElements.map((element) => idMap.get(element.id)!);
    state.commit((draft) => {
      const targetBoard = draft.boards.find((item) => item.id === targetBoardId); if (!targetBoard) return;
      for (const source of clipboard.elements) {
        const copy = { ...clone(source), id: idMap.get(source.id)!, boardId: targetBoardId, name: `${source.name} 복사`, xMm: source.xMm + dx, yMm: source.yMm + dy } as PanelElement;
        if (copy.type === "group") copy.childIds = copy.childIds.map((id) => idMap.get(id)).filter(Boolean) as string[];
        draft.elements.push(copy); targetBoard.elementIds.push(copy.id);
      }
      const readingStart = Math.max(0, ...draft.contentBlocks.filter((block) => block.boardId === targetBoardId).map((block) => block.readingOrder));
      clipboard.contentBlocks.forEach((source, index) => draft.contentBlocks.push({ ...clone(source), id: newId(), boardId: targetBoardId, elementIds: source.elementIds.map((id) => idMap.get(id)).filter(Boolean) as string[], readingOrder: readingStart + index + 1 }));
    });
    set({ selectedIds: newSelection, clipboard: { ...clipboard, pasteSerial: clipboard.pasteSerial + 1 } });
  },
  groupSelected: () => {
    const state = get();
    const selected = state.project?.elements.filter((element) => state.selectedIds.includes(element.id) && element.type !== "group") ?? [];
    if (selected.length < 2 || new Set(selected.map((element) => element.boardId)).size !== 1) return;
    const x = Math.min(...selected.map((element) => element.xMm));
    const y = Math.min(...selected.map((element) => element.yMm));
    const right = Math.max(...selected.map((element) => element.xMm + element.widthMm));
    const bottom = Math.max(...selected.map((element) => element.yMm + element.heightMm));
    get().commit((draft) => {
      const group: PanelElement = { id: newId(), boardId: selected[0].boardId, type: "group", name: `그룹 ${selected.length}`, xMm: x, yMm: y, widthMm: right - x, heightMm: bottom - y, rotationDeg: 0, opacity: 1, visible: true, locked: false, transform: { originX: .5, originY: .5, skewXDeg: 0, skewYDeg: 0, flipX: false, flipY: false, lockAspect: true }, childIds: selected.map((element) => element.id) };
      draft.elements.push(group);
      draft.boards.find((board) => board.id === group.boardId)?.elementIds.push(group.id);
    });
  },
  ungroupSelected: () => {
    const ids = new Set(get().selectedIds);
    const groups = get().project?.elements.filter((element) => element.type === "group" && element.childIds.some((id) => ids.has(id))) ?? [];
    if (!groups.length) return;
    const groupIds = new Set(groups.map((group) => group.id));
    get().commit((draft) => {
      draft.elements = draft.elements.filter((element) => !groupIds.has(element.id));
      draft.boards.forEach((board) => { board.elementIds = board.elementIds.filter((id) => !groupIds.has(id)); });
    });
  },
  addBoard: (board) => {
    const next = board ?? makeBoard(`보드 ${String((get().project?.boards.length ?? 0) + 1).padStart(2, "0")}`);
    get().commit((draft) => { draft.boards.push(next); });
    set({ activeBoardId: next.id, selectedIds: [] });
  },
  duplicateBoard: (id) => {
    const project = get().project;
    const source = project?.boards.find((board) => board.id === id);
    if (!source) return;
    const boardId = newId();
    const elementIdMap = new Map(source.elementIds.map((elementId) => [elementId, newId()]));
    const sourceElements = source.elementIds
      .map((elementId) => project?.elements.find((element) => element.id === elementId))
      .filter(Boolean)
      .map((element) => clone(element!));
    get().commit((draft) => {
      const board = { ...clone(source), id: boardId, name: `${source.name} 복사`, elementIds: source.elementIds.map((elementId) => elementIdMap.get(elementId)!) };
      draft.boards.push(board);
      for (const element of sourceElements) {
        const copy = { ...element, id: elementIdMap.get(element.id)!, boardId } as PanelElement;
        if (copy.type === "group") copy.childIds = copy.childIds.map((childId) => elementIdMap.get(childId) ?? childId);
        draft.elements.push(copy);
      }
    });
    set({ activeBoardId: boardId, selectedIds: [] });
  },
  moveBoard: (id, delta) => get().commit((draft) => {
    const index = draft.boards.findIndex((board) => board.id === id);
    const target = Math.min(draft.boards.length - 1, Math.max(0, index + delta));
    if (index >= 0 && target !== index) draft.boards.splice(target, 0, draft.boards.splice(index, 1)[0]);
  }),
  addAsset: (asset) => get().commit((draft) => { draft.assets.push(asset); }),
  resizeBoard: (id, widthMm, heightMm, mode, targetDpi) => {
    const project = get().project; const source = project?.boards.find((board) => board.id === id);
    if (!project || !source || widthMm <= 0 || heightMm <= 0) return;
    if (mode === "duplicate") {
      get().duplicateBoard(id);
      const copyId = get().activeBoardId;
      if (copyId) get().resizeBoard(copyId, widthMm, heightMm, "scale", targetDpi);
      return;
    }
    get().commit((draft) => {
      const board = draft.boards.find((item) => item.id === id); if (!board) return;
      const scaleX = widthMm / board.widthMm; const scaleY = heightMm / board.heightMm;
      if (mode === "scale") draft.elements.forEach((element) => { if (element.boardId === id) { element.xMm *= scaleX; element.yMm *= scaleY; element.widthMm *= scaleX; element.heightMm *= scaleY; if (element.type === "text") element.fontSizePt *= Math.min(scaleX, scaleY); } });
      board.widthMm = widthMm; board.heightMm = heightMm; board.printProfile.targetDpi = targetDpi; syncBoardPrintProfile(board);
    });
  },
  applyLayoutProposal: (proposal) => get().commit((draft) => {
    for (const placement of proposal.placements) {
      const element = draft.elements.find((item) => item.id === placement.elementId);
      if (!element || element.locked) continue;
      Object.assign(element, placement);
    }
  }),
  beginTransform: () => { const state = get(); if (!state.project || !state.selectedIds.length || state.transformMode) return; set({ transformMode: true, transformBaseline: clone(state.project) }); },
  completeTransform: () => { const state = get(); if (!state.project || !state.transformBaseline) return; set({ transformMode: false, transformBaseline: null, past: [...state.past.slice(-99), state.transformBaseline], future: [], dirty: true }); },
  cancelTransform: () => { const baseline = get().transformBaseline; if (!baseline) return; set({ project: clone(baseline), transformMode: false, transformBaseline: null, dirty: true }); },
  setAlignmentReference: (alignmentReference) => set({ alignmentReference }),
  alignSelected: (mode) => { const state = get(); const board = state.project?.boards.find((item) => item.id === state.activeBoardId); const selected = state.project?.elements.filter((item) => state.selectedIds.includes(item.id)) ?? []; if (!board || !selected.length) return; const patches = alignElements(selected, board, mode, state.alignmentReference, state.keyObjectId ?? undefined); state.commit((draft) => draft.elements.forEach((item) => { if (patches[item.id]) Object.assign(item, patches[item.id]); })); },
  distributeSelected: (mode) => { const state = get(); const selected = state.project?.elements.filter((item) => state.selectedIds.includes(item.id)) ?? []; const patches = distributeElements(selected, mode); state.commit((draft) => draft.elements.forEach((item) => { if (patches[item.id]) Object.assign(item, patches[item.id]); })); },
  tidySelected: (gapMm) => { const state = get(); const board = state.project?.boards.find((item) => item.id === state.activeBoardId); const selected = state.project?.elements.filter((item) => state.selectedIds.includes(item.id)) ?? []; if (!board) return; const patches = tidyGrid(selected, board, Math.max(0, gapMm)); state.commit((draft) => draft.elements.forEach((item) => { if (patches[item.id]) Object.assign(item, patches[item.id]); })); },
  undo: () => {
    const state = get();
    const previous = state.past.at(-1);
    if (!state.project || !previous) return;
    set({ project: clone(previous), past: state.past.slice(0, -1), future: [clone(state.project), ...state.future].slice(0, 100), dirty: true, selectedIds: [] });
  },
  redo: () => {
    const state = get();
    const next = state.future[0];
    if (!state.project || !next) return;
    set({ project: clone(next), past: [...state.past, clone(state.project)].slice(-100), future: state.future.slice(1), dirty: true, selectedIds: [] });
  },
  markSaved: (savedAt) => set({ savedAt, dirty: false }),
}));
