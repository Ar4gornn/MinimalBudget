import type { Stroke } from "../api/types";

/**
 * The sketch model (Epic 32): vector strokes on a fixed logical canvas.
 *
 * A stroke is stored, not a bitmap, because every tool the pad offers is an operation on a
 * list: drawing appends a stroke, undo drops back to the previous list, and the eraser
 * removes whole strokes it touches. None of that needs pixels, and a note stays a few
 * kilobytes of JSON rather than an image the database would have to carry (AD-48).
 *
 * These constants restate `models/notes.py`; the server refuses anything off them.
 */

export const SKETCH_WIDTH = 750;
export const SKETCH_HEIGHT = 1000;
export const MAX_POINTS = 20_000;

/**
 * Ink 0 is `currentColor` — the page's own text colour — so a sketch drawn on a light phone
 * is still visible on a dark one. The other two are theme tokens rather than literals: the
 * red that reads on white was 2.9:1 on the dark card, so each theme sets its own.
 */
export const INKS = ["currentColor", "var(--ink-red)", "var(--ink-blue)"] as const;

/** Logical units on the 750-wide canvas: about 2px and 6px on a 375px phone. */
export const NIBS = [4, 12] as const;

/**
 * Points closer than this to the last one kept are dropped as the pen moves. A finger
 * reports a pointer event every few milliseconds; most of them add nothing a reader could
 * see, and every one of them is JSON on every save.
 */
export const MIN_STEP = 3;

/** How close, in logical units, the eraser has to pass to take a stroke. */
export const ERASER_RADIUS = 18;

/** Map a pointer position to the logical canvas, clamped and rounded as the server wants. */
export function toCanvas(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
): [number, number] {
  const x = ((clientX - box.left) / box.width) * SKETCH_WIDTH;
  const y = ((clientY - box.top) / box.height) * SKETCH_HEIGHT;
  return [
    Math.round(Math.min(SKETCH_WIDTH, Math.max(0, x))),
    Math.round(Math.min(SKETCH_HEIGHT, Math.max(0, y))),
  ];
}

/** Append a point unless it is within `MIN_STEP` of the stroke's last one. */
export function extend(points: readonly number[], x: number, y: number): number[] {
  const n = points.length;
  if (n >= 2 && Math.hypot(x - (points[n - 2] ?? 0), y - (points[n - 1] ?? 0)) < MIN_STEP) {
    return points as number[];
  }
  return [...points, x, y];
}

/** Distance from a point to the segment a–b. */
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Whether the eraser at (x, y) touches a stroke.
 *
 * Measured against the stroke's **segments**, not only its points: a fast straight line is
 * two points far apart, and an eraser passing across its middle would otherwise miss it.
 * The stroke's own half-width counts too, so a thick line is as easy to hit as it looks.
 */
export function touches(stroke: Stroke, x: number, y: number): boolean {
  const reach = ERASER_RADIUS + (NIBS[stroke.w] ?? NIBS[0]) / 2;
  const p = stroke.p;
  const at = (i: number) => p[i] ?? 0;
  if (p.length === 2) return Math.hypot(x - at(0), y - at(1)) <= reach;
  for (let i = 0; i + 3 < p.length; i += 2) {
    if (toSegment(x, y, at(i), at(i + 1), at(i + 2), at(i + 3)) <= reach) return true;
  }
  return false;
}

/** The strokes the eraser at (x, y) leaves behind. The same array when it took nothing. */
export function erase(strokes: readonly Stroke[], x: number, y: number): Stroke[] {
  const kept = strokes.filter((stroke) => !touches(stroke, x, y));
  return kept.length === strokes.length ? (strokes as Stroke[]) : kept;
}

export function pointCount(strokes: readonly Stroke[]): number {
  return strokes.reduce((sum, stroke) => sum + stroke.p.length / 2, 0);
}

/**
 * An SVG path for a stroke. A single point is drawn as a zero-length segment, which a
 * round line cap turns into a dot — a tap on the pad leaves a mark, as it would on paper.
 */
export function pathOf(stroke: Stroke): string {
  const p = stroke.p;
  if (p.length === 2) return `M${p[0]} ${p[1]}l0 0`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i + 1 < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
  return d;
}
