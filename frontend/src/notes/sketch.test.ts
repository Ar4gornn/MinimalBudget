import { describe, expect, it } from "vitest";

import type { Stroke } from "../api/types";
import { erase, extend, MIN_STEP, pathOf, pointCount, toCanvas, touches } from "./sketch";

/**
 * The sketch model (Epic 32). Pure functions over a list of strokes: what reaches the server
 * is decided here, so these hold the canvas contract the API refuses to bend.
 */

const line = (p: number[], w = 0): Stroke => ({ c: 0, w, p });

describe("toCanvas", () => {
  const box = { left: 100, top: 50, width: 375, height: 500 };

  it("scales a pointer position onto the 750×1000 canvas, in integers", () => {
    expect(toCanvas(100, 50, box)).toEqual([0, 0]);
    expect(toCanvas(475, 550, box)).toEqual([750, 1000]);
    expect(toCanvas(287.6, 300.3, box)).toEqual([375, 501]);
  });

  it("clamps a stroke that leaves the box to its edge, which the server requires", () => {
    // A finger that carries on past the edge keeps sending events under pointer capture.
    expect(toCanvas(0, 0, box)).toEqual([0, 0]);
    expect(toCanvas(9999, 9999, box)).toEqual([750, 1000]);
  });
});

describe("extend", () => {
  it("drops a point closer than the minimum step to the last one", () => {
    const start = [10, 10];
    expect(extend(start, 10 + MIN_STEP - 1, 10)).toBe(start);
    expect(extend(start, 10 + MIN_STEP, 10)).toEqual([10, 10, 10 + MIN_STEP, 10]);
  });
});

describe("the eraser", () => {
  it("takes a fast straight line when it crosses the middle, far from both points", () => {
    // Two points 600 apart: a check against points alone would miss this entirely. Made red
    // by measuring only the points.
    const fast = line([50, 500, 650, 500]);
    expect(touches(fast, 350, 510)).toBe(true);
    expect(touches(fast, 350, 600)).toBe(false);
  });

  it("reaches further for a thick line than a thin one", () => {
    expect(touches(line([100, 100, 200, 100], 0), 150, 122)).toBe(false);
    expect(touches(line([100, 100, 200, 100], 1), 150, 122)).toBe(true);
  });

  it("takes a dot", () => {
    expect(touches(line([300, 300]), 305, 305)).toBe(true);
  });

  it("removes whole strokes and returns the same list when it took nothing", () => {
    const strokes = [line([0, 0, 10, 0]), line([500, 500, 510, 500])];
    expect(erase(strokes, 700, 900)).toBe(strokes);
    expect(erase(strokes, 505, 500)).toEqual([strokes[0]]);
  });
});

describe("pathOf and pointCount", () => {
  it("draws a single point as a zero-length segment so a round cap makes it a dot", () => {
    expect(pathOf(line([5, 6]))).toBe("M5 6l0 0");
    expect(pathOf(line([1, 2, 3, 4, 5, 6]))).toBe("M1 2L3 4L5 6");
  });

  it("counts points, not numbers", () => {
    expect(pointCount([line([1, 1, 2, 2]), line([3, 3])])).toBe(3);
  });
});
