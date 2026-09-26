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

export const MODES = ["system", "light", "dark", "oled", "hc"] as const;
export type Mode = (typeof MODES)[number];
export type Resolved = Exclude<Mode, "system">;

export const ACCENTS = ["blue", "indigo", "violet", "magenta", "teal", "graphite"] as const;
export type Accent = (typeof ACCENTS)[number];

export const MODE_KEY = `${PREFIX}theme`;
export const ACCENT_KEY = `${PREFIX}accent`;

/** The browser chrome colour: each mode's `--bg`. */
export const THEME_COLOR: Record<Resolved, string> = {
  light: "#f2f2f2",
  dark: "#001f2b",
  oled: "#000000",
  hc: "#ffffff",
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
  },
  dark: {
    blue: "#4dc3ff",
    indigo: "#a5b0ff",
    violet: "#c9a7ff",
    magenta: "#f59ae6",
    teal: "#5fe0cc",
    graphite: "#d6d6d6",
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

type ThemeState = {
  mode: Mode;
  accent: Accent;
  resolved: Resolved;
  setMode: (mode: Mode) => void;
  setAccent: (accent: Accent) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs] = useState(readPrefs);
  const [mode, setModeState] = useState<Mode>(prefs.mode);
  const [accent, setAccentState] = useState<Accent>(prefs.accent);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query) return;
    const follow = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  const resolved = resolve(mode, prefersDark);

  useEffect(() => {
    applyTheme(resolved, accent);
  }, [resolved, accent]);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    write(MODE_KEY, next);
  }, []);

  const setAccent = useCallback((next: Accent) => {
    setAccentState(next);
    write(ACCENT_KEY, next);
  }, []);

  const toggle = useCallback(() => setMode(toggled(resolved)), [resolved, setMode]);

  const value = useMemo(
    () => ({ mode, accent, resolved, setMode, setAccent, toggle }),
    [mode, accent, resolved, setMode, setAccent, toggle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (!state) throw new Error("useTheme outside ThemeProvider");
  return state;
}
