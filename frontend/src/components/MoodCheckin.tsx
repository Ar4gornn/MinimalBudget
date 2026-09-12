import { useCallback, useEffect, useId, useRef, useState } from "react";

import { api } from "../api/client";
import type { MoodDay, MoodPoint } from "../api/types";
import { MOOD_SCALE, MoodFace, MoodFaceUnanswered, moodWord } from "./MoodFace";
import { todayIso } from "../months";

/**
 * The day's two answers, from the dashboard (Epic 24).
 *
 * ## Why this is a disclosure and not a modal
 *
 * The request asked for a popup. There is **no modal anywhere in this application** —
 * verified rather than assumed: no `role="dialog"`, no `<dialog>`, no `showModal`, one
 * `window.confirm`, and one overlay, the toast, which is `role="status"` and never takes
 * focus. `EntriesPage` says why it edits inline "rather than a modal: the rows already
 * become cards on a phone, so the same markup turns into a sensible form without needing
 * focus trapping, escape handling and scroll locking to be got right."
 *
 * So a popup here would be *new machinery* — a focus trap, scroll locking, `aria-modal`,
 * an inert background, and a fork between a centred dialog on a desktop and a bottom sheet
 * at 375px, which are two different designs with two different sets of gestures. That is a
 * lot to introduce and then keep right for a control whose whole job is two taps.
 *
 * What this is instead: an **anchored popover** — the disclosure the codebase already uses
 * (`Card`'s collapse toggle: a real button carrying `aria-expanded` and `aria-controls`),
 * positioned under its trigger rather than in the flow beneath it. It sits immediately
 * after the button in document order, so a keyboard or screen-reader user reaches it by
 * carrying on rather than by being moved into it. Escape closes it, a tap outside closes
 * it, and focus returns to the button either way. None of that needs a trap, and there is
 * no backdrop to make the rest of the page inert.
 *
 * **What it costs, honestly.** The page behind stays scrollable and clickable, which is a
 * choice and not an omission — but it does mean the panel can be scrolled off-screen while
 * open. It is not announced as a dialog, so nothing tells a screen-reader user "you are
 * now in a thing you must leave"; the Close button and Escape are the way out and the
 * panel is labelled, which is what a disclosure offers instead. And at 375px it is the
 * same panel as on a desktop rather than a bottom sheet, so it wins no thumb-reach that a
 * sheet would — the trade for having one behaviour at every width instead of a breakpoint
 * between two.
 */

/**
 * The hour after which the day is old enough to have a verdict, local to the device.
 *
 * At nine in the morning "how do you feel" has an answer and "was today any good" does
 * not, so asking both would make every stored verdict ambiguous — some would be judgements
 * of a finished day and some would be forecasts, with nothing in the row to tell them
 * apart. The question simply is not rendered before this hour; no control means no early
 * answer.
 *
 * This is a rule of the **interface**, not of the API, and deliberately so: an hour rule in
 * the service would need a per-account time zone that this system does not have (AD-38
 * states that limitation and picks UTC for the one place it matters), and it would refuse a
 * legitimate late-night answer from a family member in another country. So the server
 * accepts a verdict for any past day, and the interface is what makes it consistently an
 * evening answer. Yesterday and earlier are always askable — a finished day is finished at
 * any hour.
 */
const VERDICT_FROM_HOUR = 18;

export function MoodCheckin({ onSaved }: { onSaved?: () => void }) {
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<MoodDay | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = todayIso();
  const evening = new Date().getHours() >= VERDICT_FROM_HOUR;

  const load = useCallback(async () => {
    try {
      const row = await api.moodDay(today);
      setDay(row);
      setNote(row.note ?? "");
    } catch {
      // The button falls back to its unanswered state. A dashboard must not fail to render
      // because one small control could not read its own row.
      setDay(null);
    }
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // A tap outside dismisses, which is what a popover is expected to do. Not a backdrop:
    // nothing is covered and nothing is made inert, so the page keeps working behind it.
    const onDown = (event: MouseEvent | TouchEvent) => {
      const root = wrapRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown as EventListener);
    };
  }, [open, close]);

  async function write(next: {
    mood: MoodPoint | null;
    day_ok: boolean | null;
    note: string | null;
  }) {
    setBusy(true);
    setError(null);
    try {
      // Always the whole day: absent and null are the same answer on this resource, so
      // there is nothing to merge and nothing to guess.
      const saved = await api.setMoodDay(today, next);
      setDay(saved);
      setNote(saved.note ?? "");
      onSaved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  const mood = day?.mood ?? null;
  const dayOk = day?.day_ok ?? null;
  const answered = mood !== null || dayOk !== null;

  // Tapping the face that is already chosen takes it back, which is the only way to undo a
  // mis-tap without a separate control for each question.
  const pick = (point: MoodPoint) =>
    void write({ mood: mood === point ? null : point, day_ok: dayOk, note: note || null });

  const verdict = (value: boolean) =>
    void write({ mood, day_ok: dayOk === value ? null : value, note: note || null });

  return (
    <div className="mood-checkin" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`mood-button ${answered ? "answered" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        // The name says what the control does *and* what it currently holds, because the
        // face alone is aria-hidden and would otherwise leave the button unnamed.
        aria-label={
          mood === null ? "How do you feel today?" : `How do you feel today? — ${moodWord(mood)}`
        }
        onClick={() => setOpen((was) => !was)}
      >
        {mood === null ? <MoodFaceUnanswered size={26} /> : <MoodFace point={mood} size={26} />}
      </button>

      {open && (
        <section id={panelId} className="card mood-panel" aria-label="Today">
          <div className="card-head">
            <h2 style={{ margin: 0 }}>Today</h2>
            <button type="button" className="quiet" onClick={close}>
              Close
            </button>
          </div>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <fieldset className="mood-field">
            <legend>How do you feel?</legend>
            <div className="mood-scale">
              {MOOD_SCALE.map((step) => (
                <button
                  key={step.point}
                  type="button"
                  className={`mood-pick ${mood === step.point ? "on" : ""}`}
                  aria-pressed={mood === step.point}
                  disabled={busy}
                  onClick={() => pick(step.point)}
                >
                  <MoodFace point={step.point} size={30} />
                  <span className="mood-word">{step.word}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mood-field">
            <legend>Was today any good?</legend>
            {evening ? (
              <div className="mood-verdict">
                <button
                  type="button"
                  className={`chip ${dayOk === true ? "on" : ""}`}
                  aria-pressed={dayOk === true}
                  disabled={busy}
                  onClick={() => verdict(true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`chip ${dayOk === false ? "on" : ""}`}
                  aria-pressed={dayOk === false}
                  disabled={busy}
                  onClick={() => verdict(false)}
                >
                  No
                </button>
              </div>
            ) : (
              // No control at all rather than a disabled one: a disabled Yes still tells
              // you the question exists and invites a guess at what it will mean later.
              <p className="hint" style={{ margin: 0 }}>
                Ask again this evening — a verdict on the day needs the day.
              </p>
            )}
          </fieldset>

          <label className="mood-note">
            A note, if you want one
            <input
              aria-label="A note about today"
              placeholder="Why?"
              maxLength={500}
              value={note}
              disabled={busy || !answered}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => {
                if (!answered) return;
                if ((day?.note ?? "") === note) return;
                void write({ mood, day_ok: dayOk, note: note || null });
              }}
            />
          </label>

          <p className="hint" style={{ marginTop: 8 }}>
            {answered ? (
              <>
                Answered for today. Tap the same face again to take it back, and you can
                change it whenever you like.{" "}
                <button
                  type="button"
                  className="linkish"
                  disabled={busy}
                  onClick={() => void write({ mood: null, day_ok: null, note: null })}
                >
                  Clear the day
                </button>
              </>
            ) : (
              // A note with nothing to annotate is not an answer, and the server refuses
              // it — so the input above is disabled until one of the questions is answered.
              <>Nothing recorded for today. Pick a face to start.</>
            )}
          </p>
        </section>
      )}
    </div>
  );
}
