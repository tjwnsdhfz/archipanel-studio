export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;
export const mmToPt = (mm: number) => (mm / MM_PER_INCH) * PT_PER_INCH;
export const ptToMm = (pt: number) => (pt / PT_PER_INCH) * MM_PER_INCH;
export const mmToPx = (mm: number, dpi: number) => Math.round((mm / MM_PER_INCH) * dpi);
export const effectiveDpi = (pixels: number, mm: number) => mm > 0 ? pixels / (mm / MM_PER_INCH) : 0;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const roundMm = (value: number) => Math.round(value * 100) / 100;
