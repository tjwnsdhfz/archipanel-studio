import type { PanelElement, TransformOptions } from "./types";
import { roundMm } from "./units";

export function clampSkew(value: number) { return Math.max(-60, Math.min(60, value)); }
export function applyTransformPatch(element: PanelElement, patch: Partial<TransformOptions> & { xMm?: number; yMm?: number; widthMm?: number; heightMm?: number; rotationDeg?: number }) {
  const next = { ...element, transform: { ...element.transform } } as PanelElement;
  if (patch.xMm !== undefined) next.xMm = roundMm(patch.xMm);
  if (patch.yMm !== undefined) next.yMm = roundMm(patch.yMm);
  const ratio = next.widthMm / Math.max(next.heightMm, .001);
  if (patch.widthMm !== undefined) { next.widthMm = Math.max(.1, roundMm(patch.widthMm)); if (next.transform.lockAspect && patch.heightMm === undefined) next.heightMm = roundMm(next.widthMm / ratio); }
  if (patch.heightMm !== undefined) { next.heightMm = Math.max(.1, roundMm(patch.heightMm)); if (next.transform.lockAspect && patch.widthMm === undefined) next.widthMm = roundMm(next.heightMm * ratio); }
  if (patch.rotationDeg !== undefined) next.rotationDeg = roundMm(((patch.rotationDeg % 360) + 360) % 360);
  next.transform = { ...next.transform, ...patch, skewXDeg: clampSkew(patch.skewXDeg ?? next.transform.skewXDeg), skewYDeg: clampSkew(patch.skewYDeg ?? next.transform.skewYDeg) };
  return next;
}
