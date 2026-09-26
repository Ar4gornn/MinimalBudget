import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { PREFIX } from "./storage";

/**
 * Themes: a mode and an accent, both chosen per device.
 *
 * **The device, not the account.** Unlike the language, a theme is about the screen in
 * front of you: a phone in dark mode and a laptop in light is what most people want, and
 * storing it locally means `public/theme.js` can apply it before the first paint instead of
 * flashing the wrong background while `/me` answers.
 *
 * **`<html data-theme>` is always concrete.** "system" is resolved here and in theme.js,
 * never in CSS, so the stylesheet has one selector per mode and a chosen mode can disagree
 * with the OS. While "system" is chosen, a change of OS setting is followed live.
 *
 * `public/theme.js` repeats the resolution in plain ES5 because it runs before the bundle
 * and the CSP forbids inline script. `theme.test.ts` runs it and checks the two agree.
 */

export const MODES = ["system", "light", "dark", "oled", "hc", "sepia"] as const;
export type Mode = (typeof MODES)[number];
export type Resolved = Exclude<Mode, "system">;

export const ACCENTS = [
  "blue",
  "indigo",
  "violet",
  "magenta",
  "teal",
  "graphite",
  "slate",
  "cobalt",
  "plum",
] as const;
export type Accent = (typeof ACCENTS)[number];

export const MODE_KEY = `${PREFIX}theme`;
export const ACCENT_KEY = `${PREFIX}accent`;

/** The browser chrome colour: each mode's `--bg`. */
export const THEME_COLOR: Record<Resolved, string> = {
  light: "#f2f2f2",
  dark: "#001f2b",
  oled: "#000000",
  hc: "#ffffff",
  sepia: "#f1e7d3",
};

/**
 * What a swatch in Settings shows: each accent's button fill in the current family of
 * modes, so the picker previews what you will get. Graphite's light fill is invisible on a
 * dark card, which is how this came to be two tables rather than one.
 */
export const ACCENT_SWATCH: Record<"light" | "dark", Record<Accent, string>> = {
  light: {
    blue: "#00a1f1",
    indigo: "#4f46e5",
    violet: "#7c3aed",
    magenta: "#b5179e",
    teal: "#0f766e",
    graphite: "#404040",
    slate: "#475569",
    cobalt: "#1d4ed8",
    plum: "#86198f",
  },
  dark: {
    blue: "#4dc3ff",
    indigo: "#a5b0ff",
    violet: "#c9a7ff",
    magenta: "#f59ae6",
    teal: "#5fe0cc",
    graphite: "#d6d6d6",
    slate: "#b4c2d6",
    cobalt: "#8fb0ff",
    plum: "#dda6f0",
  },
};

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isMode(value: unknown): value is Mode {
  return MODES.includes(value as Mode);
}

function isAccent(value: unknown): value is Accent {
  return ACCENTS.includes(value as Accent);
}

export function readPrefs(storage?: Storage): { mode: Mode; accent: Accent } {
  let mode: Mode = "system";
  let accent: Accent = "blue";
  try {
    const store = storage ?? window.localStorage;
    const storedMode = store.getItem(MODE_KEY);
    const storedAccent = store.getItem(ACCENT_KEY);
    if (isMode(storedMode)) mode = storedMode;
    if (isAccent(storedAccent)) accent = storedAccent;
  } catch {
    // Storage blocked: the defaults, and nothing is remembered.
  }
  return { mode, accent };
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice holds for this page and is forgotten on reload.
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

export function resolve(mode: Mode, prefersDark: boolean): Resolved {
  if (mode !== "system") return mode;
  return prefersDark ? "dark" : "light";
}

export function applyTheme(resolved: Resolved, accent: Accent, doc: Document = document): void {
  const root = doc.documentElement;
  root.dataset.theme = resolved;
  root.dataset.accent = accent;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[resolved]);
}

/** The top bar's one-tap switch: to light from either dark, to dark from anything else. */
export function toggled(resolved: Resolved): Mode {
  return resolved === "dark" || resolved === "oled" ? "light" : "dark";
}

export type Prefs = { mode: Mode; accent: Accent };

type ThemeState = {
  /** What is stored on this device. */
  saved: Prefs;
  /** What is on screen: the saved choice with any unsaved preview laid over it. */
  shown: Prefs;
  resolved: Resolved;
  /** True while something on screen has not been saved. */
  previewing: boolean;
  /** Show a mode or accent without storing it. */
  preview: (next: Partial<Prefs>) => void;
  /** Store what is on screen. */
  save: () => void;
  /** Go back to what is stored. */
  discard: () => void;
  /** The top bar: store the opposite of what is showing at once, dropping any preview. */
  toggle: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

/**
 * Settings previews and the person decides: a swatch or a mode is shown the moment it is
 * picked, and only Save writes it. Leaving Settings without saving discards the preview
 * (the page calls `discard` on unmount), so a colour tried and not liked cannot stick by
 * accident. The top-bar toggle is the exception — one tap is the whole point of it.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Prefs>(readPrefs);
  const [draft, setDraft] = useState<Partial<Prefs>>({});
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query) return;
    const follow = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  const shown = useMemo<Prefs>(
    () => ({ mode: draft.mode ?? saved.mode, accent: draft.accent ?? saved.accent }),
    [draft, saved],
  );
  const resolved = resolve(shown.mode, prefersDark);
  const previewing = shown.mode !== saved.mode || shown.accent !== saved.accent;

  useEffect(() => {
    applyTheme(resolved, shown.accent);
  }, [resolved, shown.accent]);

  const store = useCallback((next: Prefs) => {
    setSaved(next);
    setDraft({});
    write(MODE_KEY, next.mode);
    write(ACCENT_KEY, next.accent);
  }, []);

  const preview = useCallback((next: Partial<Prefs>) => setDraft((d) => ({ ...d, ...next })), []);
  const save = useCallback(() => store(shown), [store, shown]);
  const discard = useCallback(() => setDraft({}), []);
  const toggle = useCallback(
    () => store({ mode: toggled(resolved), accent: saved.accent }),
    [store, resolved, saved.accent],
  );

  const value = useMemo(
    () => ({ saved, shown, resolved, previewing, preview, save, discard, toggle }),
    [saved, shown, resolved, previewing, preview, save, discard, toggle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (!state) throw new Error("useTheme outside ThemeProvider");
  return state;
}
