import type { PanelBoard, PanelElement } from "./types";
import { roundMm } from "./units";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeMode = "h-left" | "h-center" | "h-right" | "v-top" | "v-center" | "v-bottom" | "h-gap" | "v-gap";
export type AlignReference = "selection" | "board" | "safe" | "key";

type Bounds = { left: number; top: number; right: number; bottom: number; cx: number; cy: number };
const bounds = (items: PanelElement[]): Bounds => ({
  left: Math.min(...items.map((e) => e.xMm)), top: Math.min(...items.map((e) => e.yMm)),
  right: Math.max(...items.map((e) => e.xMm + e.widthMm)), bottom: Math.max(...items.map((e) => e.yMm + e.heightMm)),
  cx: 0, cy: 0,
});
const complete = (value: Bounds) => ({ ...value, cx: (value.left + value.right) / 2, cy: (value.top + value.bottom) / 2 });
function referenceBounds(items: PanelElement[], board: PanelBoard, reference: AlignReference, keyId?: string) {
  if (reference === "board") return complete({ left: 0, top: 0, right: board.widthMm, bottom: board.heightMm, cx: 0, cy: 0 });
  if (reference === "safe") return complete({ left: board.safeMarginMm, top: board.safeMarginMm, right: board.widthMm - board.safeMarginMm, bottom: board.heightMm - board.safeMarginMm, cx: 0, cy: 0 });
  if (reference === "key") { const key = items.find((e) => e.id === keyId) ?? items.at(-1)!; return complete(bounds([key])); }
  return complete(bounds(items));
}
export function alignElements(items: PanelElement[], board: PanelBoard, mode: AlignMode, reference: AlignReference, keyId?: string) {
  const editable = items.filter((e) => !e.locked); if (!editable.length) return {};
  const ref = referenceBounds(items, board, reference, keyId); const result: Record<string, { xMm?: number; yMm?: number }> = {};
  for (const el of editable) {
    if (reference === "key" && el.id === keyId) continue;
    if (mode === "left") result[el.id] = { xMm: ref.left };
    if (mode === "hcenter") result[el.id] = { xMm: ref.cx - el.widthMm / 2 };
    if (mode === "right") result[el.id] = { xMm: ref.right - el.widthMm };
    if (mode === "top") result[el.id] = { yMm: ref.top };
    if (mode === "vcenter") result[el.id] = { yMm: ref.cy - el.heightMm / 2 };
    if (mode === "bottom") result[el.id] = { yMm: ref.bottom - el.heightMm };
  }
  return result;
}
export function distributeElements(items: PanelElement[], mode: DistributeMode) {
  const editable = items.filter((e) => !e.locked); if (editable.length < 3) return {};
  const horizontal = mode.startsWith("h-");
  const sorted = [...editable].sort((a, b) => horizontal ? a.xMm - b.xMm : a.yMm - b.yMm);
  const first = sorted[0], last = sorted.at(-1)!; const result: Record<string, { xMm?: number; yMm?: number }> = {};
  if (mode === "h-gap" || mode === "v-gap") {
    const start = horizontal ? first.xMm : first.yMm; const end = horizontal ? last.xMm + last.widthMm : last.yMm + last.heightMm;
    const total = sorted.reduce((sum, e) => sum + (horizontal ? e.widthMm : e.heightMm), 0); const gap = (end - start - total) / (sorted.length - 1); let cursor = start;
    sorted.forEach((el, i) => { if (i && i < sorted.length - 1) result[el.id] = horizontal ? { xMm: roundMm(cursor) } : { yMm: roundMm(cursor) }; cursor += (horizontal ? el.widthMm : el.heightMm) + gap; });
    return result;
  }
  const coordinate = (el: PanelElement) => horizontal ? (mode === "h-left" ? el.xMm : mode === "h-center" ? el.xMm + el.widthMm / 2 : el.xMm + el.widthMm) : (mode === "v-top" ? el.yMm : mode === "v-center" ? el.yMm + el.heightMm / 2 : el.yMm + el.heightMm);
  const from = coordinate(first), to = coordinate(last), step = (to - from) / (sorted.length - 1);
  sorted.slice(1, -1).forEach((el, index) => { const target = from + step * (index + 1); result[el.id] = horizontal ? { xMm: roundMm(target - (mode === "h-center" ? el.widthMm / 2 : mode === "h-right" ? el.widthMm : 0)) } : { yMm: roundMm(target - (mode === "v-center" ? el.heightMm / 2 : mode === "v-bottom" ? el.heightMm : 0)) }; });
  return result;
}
export function tidyGrid(items: PanelElement[], board: PanelBoard, gapMm: number) {
  const editable = items.filter((e) => !e.locked); if (!editable.length) return {};
  const columns = Math.max(1, Math.ceil(Math.sqrt(editable.length * board.widthMm / board.heightMm)));
  const safeW = board.widthMm - board.safeMarginMm * 2; const cellW = (safeW - gapMm * (columns - 1)) / columns;
  const result: Record<string, { xMm: number; yMm: number; widthMm: number }> = {}; let y = board.safeMarginMm;
  for (let row = 0; row * columns < editable.length; row++) { const rowItems = editable.slice(row * columns, (row + 1) * columns); const rowHeight = Math.max(...rowItems.map((e) => e.heightMm * Math.min(1, cellW / e.widthMm)));
    rowItems.forEach((el, col) => { const width = Math.min(el.widthMm, cellW); result[el.id] = { xMm: roundMm(board.safeMarginMm + col * (cellW + gapMm)), yMm: roundMm(y), widthMm: roundMm(width) }; }); y += rowHeight + gapMm; }
  return result;
}
