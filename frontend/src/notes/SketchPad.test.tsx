import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Stroke } from "../api/types";
import { SketchPad } from "./SketchPad";

/**
 * The pad (Epic 32). Pointer events are sent as a whole gesture inside one `act`, so React
 * renders **nothing** between them — which is what a fast finger does to a handler that
 * reads state: every event after the first sees the gesture as it was before it started.
 * Made red by reading the stroke from state instead of the ref: the stroke lost its points
 * and the eraser's lift committed nothing.
 */

function Pad({ initial = [] as Stroke[] }) {
  const [strokes, setStrokes] = useState<Stroke[]>(initial);
  return (
    <>
      <SketchPad strokes={strokes} onChange={setStrokes} />
      <output data-testid="strokes">{JSON.stringify(strokes)}</output>
    </>
  );
}

/** The surface is 375×500 at the origin, so a pixel is two logical units. */
function surface(): SVGSVGElement {
  const svg = screen.getByTestId("sketch-surface") as unknown as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 375, height: 500, right: 375, bottom: 500, x: 0, y: 0 }) as DOMRect;
  return svg;
}

function gesture(svg: SVGSVGElement, points: [number, number][]) {
  const fire = (type: string, [x, y]: [number, number]) =>
    svg.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
  act(() => {
    fire("pointerdown", points[0] ?? [0, 0]);
    for (const point of points.slice(1)) fire("pointermove", point);
    fire("pointerup", points[points.length - 1] ?? [0, 0]);
  });
}

const drawn = (): Stroke[] => JSON.parse(screen.getByTestId("strokes").textContent ?? "[]");

describe("SketchPad", () => {
  it("keeps every point of a stroke drawn faster than React renders", () => {
    render(<Pad />);
    gesture(surface(), [
      [10, 10],
      [20, 10],
      [30, 10],
    ]);
    expect(drawn()).toEqual([{ c: 0, w: 0, p: [20, 20, 40, 20, 60, 20] }]);
  });

  it("erases on a gesture faster than React renders, and undo brings it back", async () => {
    const line: Stroke = { c: 1, w: 0, p: [100, 100, 600, 100] };
    render(<Pad initial={[line]} />);
    await userEvent.click(screen.getByRole("button", { name: "Eraser" }));

    gesture(surface(), [
      [5, 5],
      [150, 50],
    ]);
    expect(drawn()).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(drawn()).toEqual([line]);
  });

  it("draws in the chosen ink and nib", async () => {
    render(<Pad />);
    await userEvent.click(screen.getByRole("button", { name: "Blue" }));
    await userEvent.click(screen.getByRole("button", { name: "Thick" }));
    gesture(surface(), [[50, 50]]);
    expect(drawn()).toEqual([{ c: 2, w: 1, p: [100, 100] }]);
  });
});
