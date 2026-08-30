import { describe, expect, it } from "vitest";
import { composeCrop, cropFrame, normalizedDrag } from "./crop";

describe("non-destructive crop math", () => {
  it("normalizes a reverse drag and clamps it to the layer", () => {
    expect(normalizedDrag({ x: .8, y: .9 }, { x: -.2, y: .25 })).toEqual({ x: 0, y: .25, w: .8, h: .65 });
  });

  it("composes a new selection inside an existing source crop", () => {
    expect(composeCrop({ x: .1, y: .2, w: .8, h: .6 }, { x: .25, y: .25, w: .5, h: .5 })).toEqual({ x: .3, y: .35, w: .4, h: .3 });
  });

  it("can trim the visible frame to the selected region", () => {
    expect(cropFrame({ xMm: 10, yMm: 20, widthMm: 200, heightMm: 100 }, { x: .25, y: .1, w: .5, h: .8 })).toEqual({ xMm: 60, yMm: 30, widthMm: 100, heightMm: 80 });
  });
});
