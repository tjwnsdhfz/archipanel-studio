import { clamp, roundMm } from "./units";

export type NormalizedRect = { x: number; y: number; w: number; h: number };
const normalized = (value: number) => Math.round(value * 1_000_000_000) / 1_000_000_000;

export function normalizedDrag(start: { x: number; y: number }, end: { x: number; y: number }): NormalizedRect {
  const x0 = clamp(Math.min(start.x, end.x), 0, 1);
  const y0 = clamp(Math.min(start.y, end.y), 0, 1);
  const x1 = clamp(Math.max(start.x, end.x), 0, 1);
  const y1 = clamp(Math.max(start.y, end.y), 0, 1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function composeCrop(current: NormalizedRect, selection: NormalizedRect): NormalizedRect {
  return {
    x: normalized(clamp(current.x + selection.x * current.w, 0, 1)),
    y: normalized(clamp(current.y + selection.y * current.h, 0, 1)),
    w: normalized(clamp(selection.w * current.w, 0.001, 1)),
    h: normalized(clamp(selection.h * current.h, 0.001, 1)),
  };
}

export function cropFrame<T extends { xMm: number; yMm: number; widthMm: number; heightMm: number }>(element: T, selection: NormalizedRect) {
  return {
    xMm: roundMm(element.xMm + element.widthMm * selection.x),
    yMm: roundMm(element.yMm + element.heightMm * selection.y),
    widthMm: roundMm(element.widthMm * selection.w),
    heightMm: roundMm(element.heightMm * selection.h),
  };
}

export const FULL_CROP: NormalizedRect = { x: 0, y: 0, w: 1, h: 1 };
