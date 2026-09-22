import { describe, expect, it } from "vitest";
import { exportBoardPng, registerBoardExporter, shareMultiplier } from "./boardExport";

describe("share output", () => {
  it("keeps mobile and desktop exports at the same bounded resolution", () => {
    for (const [w,h] of [[233,330],[840,1188],[4000,2000]]) {
      const factor=shareMultiplier(w,h);
      expect(Math.max(w,h)*factor).toBe(2400);
      expect(w*h*factor*factor).toBeLessThanOrEqual(5_760_000);
    }
  });
  it("rejects unusable board dimensions", () => {
    for (const width of [0,-1,NaN,Infinity]) expect(()=>shareMultiplier(width,10)).toThrow();
  });
  it("keeps a newly mounted board when the old board cleans up", async () => {
    const old=registerBoardExporter(async()=>new Blob(["old"]));
    const active=registerBoardExporter(async()=>new Blob(["new"]));
    old();
    expect(await (await exportBoardPng()).text()).toBe("new");
    active();
    await expect(exportBoardPng()).rejects.toThrow("패널");
  });
});
