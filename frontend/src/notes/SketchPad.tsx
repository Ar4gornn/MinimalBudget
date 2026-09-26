import { type PointerEvent, useRef, useState } from "react";

import type { Stroke } from "../api/types";
import { useT } from "../i18n";
import {
  erase,
  extend,
  INKS,
  MAX_POINTS,
  NIBS,
  pathOf,
  pointCount,
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
  toCanvas,
} from "./sketch";

/** How many steps back undo can go. Each step is a list of strokes, not a bitmap. */
const UNDO_DEPTH = 100;

/** Each stroke as a path. Shared by the pad and the list's thumbnails. */
function StrokePaths({ strokes }: { strokes: readonly Stroke[] }) {
  return (
    <>
      {strokes.map((stroke, index) => (
        <path
          // Strokes have no identity beyond their place in the list, and the list is only
          // ever appended to or filtered — never reordered — so the index is stable enough.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={index}
          d={pathOf(stroke)}
          fill="none"
          stroke={INKS[stroke.c] ?? INKS[0]}
          strokeWidth={NIBS[stroke.w] ?? NIBS[0]}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </>
  );
}

/** The strokes, drawn small and decorative — the note list's thumbnail. */
export function SketchView({ strokes, className }: { strokes: readonly Stroke[]; className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`} aria-hidden="true">
      <StrokePaths strokes={strokes} />
    </svg>
  );
}

type Tool = "pen" | "eraser";

/**
 * The drawing surface (Epic 32): pen, eraser, undo, three inks, two nibs.
 *
 * SVG rather than `<canvas>`, because the model is a list of strokes and SVG draws a list of
 * paths as it is — no redraw loop, the same component renders the list's thumbnails, and it
 * can be inspected in a test. `touch-action: none` on the surface is what stops a finger
 * stroke scrolling the page instead of drawing.
 *
 * `onChange` is called when a stroke ends or the eraser lifts — once per gesture, not per
 * pointer event, so the editor's save debounce sees one change per mark.
 */
export function SketchPad({
  strokes,
  onChange,
}: {
  strokes: readonly Stroke[];
  onChange: (strokes: Stroke[]) => void;
}) {
  const t = useT();
  const surface = useRef<SVGSVGElement | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [ink, setInk] = useState(0);
  const [nib, setNib] = useState(0);
  // The gesture in progress lives in refs as well as state. Two pointer events can arrive
  // before React renders between them, and a handler reading state would then see the
  // previous event's value — the stroke loses points, or the eraser's lift commits nothing.
  // The refs are the truth; the state only draws it.
  const [live, setLiveState] = useState<Stroke | null>(null);
  const liveRef = useRef<Stroke | null>(null);
  const setLive = (next: Stroke | null) => {
    liveRef.current = next;
    setLiveState(next);
  };
  // What the eraser has left so far in this gesture; committed on lift.
  const [erasing, setErasingState] = useState<Stroke[] | null>(null);
  const erasingRef = useRef<Stroke[] | null>(null);
  const setErasing = (next: Stroke[] | null) => {
    erasingRef.current = next;
    setErasingState(next);
  };
  const [past, setPast] = useState<Stroke[][]>([]);

  const full = pointCount(strokes) >= MAX_POINTS;

  const at = (event: PointerEvent<SVGSVGElement>) => {
    const box = surface.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return toCanvas(event.clientX, event.clientY, box);
  };

  const commit = (next: Stroke[]) => {
    setPast((was) => [...was.slice(-(UNDO_DEPTH - 1)), [...strokes]]);
    onChange(next);
  };

  const down = (event: PointerEvent<SVGSVGElement>) => {
    const point = at(event);
    if (!point) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (tool === "eraser") {
      setErasing(erase(strokes, point[0], point[1]));
      return;
    }
    if (full) return;
    setLive({ c: ink, w: nib, p: point });
  };

  const move = (event: PointerEvent<SVGSVGElement>) => {
    const point = at(event);
    if (!point) return;
    const kept = erasingRef.current;
    if (kept) {
      setErasing(erase(kept, point[0], point[1]));
      return;
    }
    const stroke = liveRef.current;
    if (stroke) setLive({ ...stroke, p: extend(stroke.p, point[0], point[1]) });
  };

  const up = () => {
    const kept = erasingRef.current;
    if (kept) {
      if (kept.length !== strokes.length) commit(kept);
      setErasing(null);
      return;
    }
    const stroke = liveRef.current;
    if (stroke) {
      commit([...strokes, stroke]);
      setLive(null);
    }
  };

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast(past.slice(0, -1));
    onChange(previous);
  };

  return (
    <div className="sketchpad">
      <div className="sketch-tools" role="toolbar" aria-label={t("notes.tools")}>
        <div className="chips" role="group" aria-label={t("notes.tool")}>
          {(["pen", "eraser"] as const).map((name) => (
            <button
              key={name}
              type="button"
              className={`chip ${tool === name ? "on" : ""}`}
              aria-pressed={tool === name}
              onClick={() => setTool(name)}
            >
              {t(name === "pen" ? "notes.pen" : "notes.eraser")}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label={t("notes.ink")}>
          {INKS.map((colour, index) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: the palette is fixed
              key={index}
              type="button"
              className={`swatch ${ink === index ? "on" : ""}`}
              aria-pressed={ink === index}
              aria-label={t(index === 0 ? "notes.inkDefault" : index === 1 ? "notes.inkRed" : "notes.inkBlue")}
              style={{ color: colour }}
              onClick={() => {
                setInk(index);
                setTool("pen");
              }}
            >
              <span aria-hidden="true">●</span>
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label={t("notes.nib")}>
          {NIBS.map((_, index) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: the nibs are fixed
              key={index}
              type="button"
              className={`chip ${nib === index ? "on" : ""}`}
              aria-pressed={nib === index}
              onClick={() => {
                setNib(index);
                setTool("pen");
              }}
            >
              {t(index === 0 ? "notes.thin" : "notes.thick")}
            </button>
          ))}
        </div>
        <button type="button" className="quiet" onClick={undo} disabled={past.length === 0}>
          {t("notes.undo")}
        </button>
      </div>
      <svg
        ref={surface}
        className={`sketch-surface ${tool === "eraser" ? "erasing" : ""}`}
        viewBox={`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`}
        role="img"
        aria-label={t("notes.canvas")}
        data-testid="sketch-surface"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <StrokePaths strokes={live ? [...(erasing ?? strokes), live] : (erasing ?? strokes)} />
      </svg>
      {full && <p className="hint">{t("notes.sketchFull")}</p>}
    </div>
  );
}
