import { describe, expect, it } from "vitest";
import { effectiveDpi, mmToPt, mmToPx, ptToMm } from "./units";

describe("physical units", () => {
  it("keeps exact print conversions", () => {
    expect(mmToPx(25.4, 300)).toBe(300);
    expect(mmToPt(25.4)).toBeCloseTo(72, 8);
    expect(ptToMm(72)).toBeCloseTo(25.4, 8);
    expect(effectiveDpi(3000, 254)).toBeCloseTo(300, 8);
  });
});
