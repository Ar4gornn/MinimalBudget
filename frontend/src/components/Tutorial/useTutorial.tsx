import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useCurrentLayout } from "../../layout/useLayout";

/**
 * The guided tour on first sign-in (Epic 30).
 *
 * Five steps and a closing screen, walking a new account from "record an entry" to "read
 * the dashboard" in about two minutes. The shape worth explaining is that it is **not one
 * modal**. The welcome and the closing screen dim the page, because there is nothing to do
 * behind them. The four steps between do not: each one takes the person to a real page and
 * asks them to use the real control — record an entry, set a budget — so a backdrop that
 * blocked clicks would block the very thing the step is for. Those steps are a small panel
 * in a corner, with the control they point at ringed (see `data-tour` in styles.css).
 *
 * **Whether it opens is decided by the account, not the browser.** `tutorial_completed`
 * and `tutorial_skipped_at` are columns (migration 0022), so a phone and a laptop agree,
 * and a cleared browser does not welcome the same person a second time. Older servers
 * send neither field; "absent" is read as "seen" rather than as "new", so a client ahead
 * of its server never welcomes an account that has been recording entries for a year.
 *
 * **No focus trap.** Escape leaves, Tab moves on, and a step that asks for typing in a
 * form must not pull focus back to its own buttons. The two dimmed screens focus their
 * primary button once, so Enter and Escape work without a click; the panel steps leave
 * focus where the page put it — the amount field, on the entry step.
 */

export type TourStep = "welcome" | "entry" | "history" | "budget" | "progress" | "done";

interface StepSpec {
  /** Where the step takes place. Navigated to on entering the step, if not already there. */
  path?: string;
  /** Which `data-tour` element is ringed and scrolled into view. */
  target?: string;
  /**
   * A smaller `data-tour` element inside the target to scroll to instead, when there is
   * one. The entries card is taller than a phone screen once its filters are counted, so
   * centring it leaves the one row the step is about under the panel; centring the table
   * shows the row. Falls back to `target` when the element is absent (an empty list).
   */
  scrollTo?: string;
  /** Dim the page behind. Only where there is nothing to do behind it. */
  modal: boolean;
}

export const STEPS: Record<TourStep, StepSpec> = {
  welcome: { modal: true },
  // `?add=1` is the quick-add arrival: EntriesPage focuses the amount field and drops the
  // parameter, so the keyboard opens straight onto the first thing to type.
  entry: { path: "/entries?add=1", target: "record-form", modal: false },
  history: { path: "/entries", target: "entries-list", scrollTo: "entries-rows", modal: false },
  budget: { path: "/plan", target: "budgets", modal: false },
  progress: { path: "/", target: "budget-progress", modal: false },
  done: { modal: true },
};

/** The numbered ones, in order. The closing screen is not a step. */
export const NUMBERED: readonly TourStep[] = ["welcome", "entry", "history", "budget", "progress"];

/**
 * The steps this account will actually see (Epic 33). The progress step points at the
 * Dashboard's budget card; with that card hidden in the current layout there is nothing to
 * point at, so the step is skipped — and counted out of "2 of 5", which must not promise a
 * step that will not come.
 */
function numberedFor(budgetsShown: boolean): readonly TourStep[] {
  return budgetsShown ? NUMBERED : NUMBERED.filter((step) => step !== "progress");
}

export type TourEvent = "entry-created";

export interface TutorialApi {
  /** The current step, or null while the tour is not running. */
  step: TourStep | null;
  /** The numbered steps this account will see, in order — what "n of N" counts. */
  numbered: readonly TourStep[];
  /** Open the tour from the start — the auto-open on first sign-in, and Settings' replay. */
  start: () => void;
  next: () => void;
  /** Leave without finishing. Recorded as skipped, so it is not offered again. */
  skip: () => void;
  /** The closing screen's Done. Recorded as completed. */
  finish: () => void;
  /** Something a step waits on has happened. Ignored when the tour is not on that step. */
  notify: (event: TourEvent) => void;
}

const noop = () => undefined;

/**
 * What a consumer gets outside the provider: a tour that is never running and buttons
 * that do nothing. Pages call `notify` from inside their own tests, where mounting the
 * whole router and provider tree to satisfy one no-op would be ceremony for nothing.
 */
const INERT: TutorialApi = {
  step: null,
  numbered: NUMBERED,
  start: noop,
  next: noop,
  skip: noop,
  finish: noop,
  notify: noop,
};

const TutorialContext = createContext<TutorialApi | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [step, setStep] = useState<TourStep | null>(null);
  const budgetsShown =
    useCurrentLayout().cards.find((card) => card.id === "budgets")?.on ?? true;
  const numbered = useMemo(() => numberedFor(budgetsShown), [budgetsShown]);
  // Which account has already been offered the tour this session. The guard is a ref and
  // not the server flags, because the flags in `user` are not re-read after the PATCH —
  // and a later profile refresh (changing the currency, say) must not reopen it.
  const offered = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      offered.current = null;
      return;
    }
    if (offered.current === user.id) return;
    offered.current = user.id;
    // Strict: an absent field is an older server, and "seen" is the safe reading.
    if (user.tutorial_completed === false && user.tutorial_skipped_at === null) {
      setStep("welcome");
    }
  }, [user]);

  // Take the person to the step's page. Not re-run when the path changes: wandering off
  // mid-step is allowed, and the next step brings them back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: not pathname or navigate — see above
  useEffect(() => {
    if (!step) return;
    const path = STEPS[step].path;
    if (!path) return;
    // The entry step always navigates, even from /entries, so `?add=1` focuses the amount.
    if (path.includes("?") || path !== pathname) navigate(path);
  }, [step]);

  // Ring the step's control and bring it into view once the page has drawn it. The ring
  // itself is CSS keyed off this attribute, so it survives the page mounting late; only
  // the scroll has to wait for the element.
  useEffect(() => {
    const target = step ? STEPS[step].target : undefined;
    if (!step || !target) return;
    document.body.dataset.tourStep = step;
    const inner = STEPS[step].scrollTo;
    let tries = 0;
    let frame = 0;
    const look = () => {
      const element =
        (inner && document.querySelector(`[data-tour="${inner}"]`)) ||
        document.querySelector(`[data-tour="${target}"]`);
      if (element) {
        // jsdom has no scrollIntoView; a missing scroll is not a missing feature.
        if (typeof element.scrollIntoView === "function") {
          // Top of the viewport, not the centre: the panel owns the bottom of a phone
          // screen, and a target centred in the full viewport ends up behind it.
          element.scrollIntoView({ block: "start", behavior: "smooth" });
        }
        return;
      }
      // About a second at 60Hz — enough for a page to load its list, not forever.
      if (++tries < 60) frame = window.requestAnimationFrame(look);
    };
    frame = window.requestAnimationFrame(look);
    return () => {
      window.cancelAnimationFrame(frame);
      delete document.body.dataset.tourStep;
    };
  }, [step]);

  const start = useCallback(() => setStep("welcome"), []);

  const next = useCallback(() => {
    const order: readonly TourStep[] = [...numbered, "done"];
    setStep((current) => {
      if (current === null) return null;
      const index = order.indexOf(current);
      return order[Math.min(index + 1, order.length - 1)] ?? null;
    });
  }, [numbered]);

  // The worst a failed write can do is offer the tour once more next sign-in, and this
  // session's `offered` guard already holds. Not worth an error banner on a screen that
  // has nothing to do with the tour.
  const skip = useCallback(() => {
    setStep(null);
    void api.setTutorial("skipped").catch(noop);
  }, []);

  const finish = useCallback(() => {
    setStep(null);
    void api.setTutorial("completed").catch(noop);
  }, []);

  const notify = useCallback((event: TourEvent) => {
    if (event === "entry-created") {
      setStep((current) => (current === "entry" ? "history" : current));
    }
  }, []);

  const value = useMemo(
    () => ({ step, numbered, start, next, skip, finish, notify }),
    [step, numbered, start, next, skip, finish, notify],
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial(): TutorialApi {
  return useContext(TutorialContext) ?? INERT;
}
