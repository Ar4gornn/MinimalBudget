import { useEffect, useRef, type KeyboardEvent } from "react";

import { useT } from "../../i18n";
import { NUMBERED, STEPS, useTutorial, type TourStep } from "./useTutorial";

/**
 * The tour's one dialog, drawn two ways: dimmed and centred for the welcome and the
 * closing screen, a corner panel for the four steps that point at a real control. Why
 * two, and why no focus trap, is explained on the provider.
 */
export function TutorialModal() {
  const tour = useTutorial();
  const t = useT();
  const primary = useRef<HTMLButtonElement>(null);
  const step = tour.step;
  const modal = step !== null && STEPS[step].modal;

  // The dimmed screens take focus so Enter and Escape work without a click. The panel
  // steps do not: on the entry step the page has just put focus in the amount field.
  useEffect(() => {
    if (step !== null && STEPS[step].modal) primary.current?.focus();
  }, [step]);

  if (step === null) return null;

  const advance = step === "done" ? tour.finish : tour.next;
  const number = NUMBERED.indexOf(step) + 1;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      tour.skip();
    } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
      // A focused button already acts on Enter; this is for focus resting on the panel.
      event.preventDefault();
      advance();
    }
  }

  return (
    <>
      {modal && <div className="tour-backdrop" aria-hidden="true" />}
      <div
        className={`tour ${modal ? "tour-modal" : "tour-coach"}`}
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-step={step}
      >
        {number > 0 && (
          <p className="tour-step">{t("tour.stepOf", { n: number, total: NUMBERED.length })}</p>
        )}
        <h2 id="tour-title">{t(`tour.${step}.title`)}</h2>
        {/* Polite: a step change is announced after whatever the reader is on, not over it. */}
        <p id="tour-body" aria-live="polite">
          {body(step, t)}
        </p>
        <div className="tour-actions">
          <button ref={primary} type="button" onClick={advance}>
            {step === "welcome" ? t("tour.begin") : step === "done" ? t("tour.finish") : t("tour.next")}
          </button>
          {step !== "done" && (
            <button type="button" className="quiet" onClick={tour.skip}>
              {t("tour.skip")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function body(step: TourStep, t: ReturnType<typeof useT>): string {
  // The entry step names the form's own submit button, so the two cannot drift apart.
  if (step === "entry") return t("tour.entry.body", { add: t("action.add") });
  return t(`tour.${step}.body`);
}
