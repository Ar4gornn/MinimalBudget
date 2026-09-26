import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACCENTS,
  ACCENT_KEY,
  ACCENT_SWATCH,
  MODES,
  MODE_KEY,
  THEME_COLOR,
  ThemeProvider,
  readPrefs,
  resolve,
  toggled,
  useTheme,
  type Accent,
  type Mode,
  type Resolved,
} from "./theme";

const root = document.documentElement;

/** A controllable `prefers-color-scheme: dark`. jsdom has no matchMedia at all. */
function stubSystem(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) =>
      listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", () => query);
  return (next: boolean) => {
    query.matches = next;
    for (const fn of listeners) fn({ matches: next } as MediaQueryListEvent);
  };
}

function withThemeColorMeta() {
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = "#123456";
  document.head.appendChild(meta);
  return meta;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete root.dataset.theme;
  delete root.dataset.accent;
  for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove();
});

describe("preferences", () => {
  it("defaults to the system mode and the blue accent", () => {
    expect(readPrefs()).toEqual({ mode: "system", accent: "blue" });
  });

  it("ignores a stored value it does not know", () => {
    window.localStorage.setItem(MODE_KEY, "solarized");
    // Green is refused on purpose: it means money in (Epic 33.6).
    window.localStorage.setItem(ACCENT_KEY, "green");
    expect(readPrefs()).toEqual({ mode: "system", accent: "blue" });
  });

  it("resolves system from the OS and leaves a chosen mode alone", () => {
    expect(resolve("system", true)).toBe("dark");
    expect(resolve("system", false)).toBe("light");
    expect(resolve("oled", false)).toBe("oled");
    expect(resolve("light", true)).toBe("light");
  });

  it("toggles to light from either dark, and to dark from anything else", () => {
    expect(toggled("dark")).toBe("light");
    expect(toggled("oled")).toBe("light");
    expect(toggled("light")).toBe("dark");
    expect(toggled("hc")).toBe("dark");
    expect(toggled("sepia")).toBe("dark");
  });
});

describe("public/theme.js, the pre-paint copy", () => {
  const script = readFileSync(join(__dirname, "..", "public", "theme.js"), "utf-8");

  const cases: [Mode | "junk" | null, Accent | "junk" | null, boolean, Resolved, Accent][] = [
    [null, null, false, "light", "blue"],
    [null, null, true, "dark", "blue"],
    ["system", "violet", true, "dark", "violet"],
    ["light", "teal", true, "light", "teal"],
    ["oled", "graphite", false, "oled", "graphite"],
    ["hc", "magenta", true, "hc", "magenta"],
    ["sepia", "plum", true, "sepia", "plum"],
    ["dark", "slate", false, "dark", "slate"],
    ["system", "cobalt", false, "light", "cobalt"],
    ["junk", "junk", true, "dark", "blue"],
  ];

  it.each(cases)("mode %s, accent %s, OS dark %s → %s / %s", (mode, accent, dark, want, wantAccent) => {
    if (mode) window.localStorage.setItem(MODE_KEY, mode);
    if (accent) window.localStorage.setItem(ACCENT_KEY, accent);
    stubSystem(dark);
    const meta = withThemeColorMeta();

    new Function(script)();

    expect(root.dataset.theme).toBe(want);
    expect(root.dataset.accent).toBe(wantAccent);
    expect(meta.content).toBe(THEME_COLOR[want]);
    // And it agrees with the bundle's own reading of the same storage.
    const prefs = readPrefs();
    expect(resolve(prefs.mode, dark)).toBe(want);
    expect(prefs.accent).toBe(wantAccent);
  });

  it("knows every mode and accent the bundle does", () => {
    for (const mode of MODES.filter((m) => m !== "system")) expect(script).toContain(`"${mode}"`);
    for (const accent of ACCENTS) expect(script).toContain(`"${accent}"`);
    for (const colour of Object.values(THEME_COLOR)) expect(script).toContain(colour);
  });

  it("is loaded by index.html with a version, because the worker caches it", () => {
    const html = readFileSync(join(__dirname, "..", "index.html"), "utf-8");
    expect(html).toMatch(/<script src="\/theme\.js\?v=\d+"><\/script>/);
  });
});

function Probe() {
  const theme = useTheme();
  return (
    <>
      <output>{`${theme.shown.mode}/${theme.resolved}/${theme.shown.accent}`}</output>
      <button type="button" onClick={theme.toggle}>
        toggle
      </button>
      <button type="button" onClick={() => theme.preview({ mode: "hc" })}>
        hc
      </button>
      <button type="button" onClick={() => theme.preview({ accent: "indigo" })}>
        indigo
      </button>
      <button type="button" onClick={theme.save}>
        save
      </button>
      <button type="button" onClick={theme.discard}>
        discard
      </button>
    </>
  );
}

describe("ThemeProvider", () => {
  it("shows a preview without storing it, and stores it on save", () => {
    stubSystem(false);
    const meta = withThemeColorMeta();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(root.dataset.theme).toBe("light");

    fireEvent.click(screen.getByText("hc"));
    fireEvent.click(screen.getByText("indigo"));

    expect(root.dataset.theme).toBe("hc");
    expect(root.dataset.accent).toBe("indigo");
    expect(meta.content).toBe(THEME_COLOR.hc);
    expect(window.localStorage.getItem(MODE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ACCENT_KEY)).toBeNull();

    fireEvent.click(screen.getByText("save"));
    expect(window.localStorage.getItem(MODE_KEY)).toBe("hc");
    expect(window.localStorage.getItem(ACCENT_KEY)).toBe("indigo");
    expect(root.dataset.theme).toBe("hc");
  });

  it("puts the saved theme back when a preview is discarded", () => {
    stubSystem(false);
    window.localStorage.setItem(ACCENT_KEY, "teal");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText("hc"));
    fireEvent.click(screen.getByText("indigo"));
    fireEvent.click(screen.getByText("discard"));

    expect(root.dataset.theme).toBe("light");
    expect(root.dataset.accent).toBe("teal");
    expect(window.localStorage.getItem(ACCENT_KEY)).toBe("teal");
  });

  it("toggles from what is showing, stores at once, and drops a preview", () => {
    stubSystem(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText("indigo"));
    fireEvent.click(screen.getByText("toggle"));

    expect(screen.getByRole("status")).toHaveTextContent("dark/dark/blue");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("dark");
    expect(window.localStorage.getItem(ACCENT_KEY)).toBe("blue");
  });

  it("follows the OS live while on system, and stops once a mode is chosen", () => {
    const setSystem = stubSystem(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => setSystem(true));
    expect(screen.getByRole("status")).toHaveTextContent("system/dark/blue");
    expect(root.dataset.theme).toBe("dark");

    // The toggle picks the opposite of what is showing and pins it.
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByRole("status")).toHaveTextContent("light/light/blue");
    act(() => setSystem(false));
    act(() => setSystem(true));
    expect(root.dataset.theme).toBe("light");
  });
});

// ------------------------------------------------------------------------------ contrast

/**
 * Every theme × accent, computed from styles.css itself: the declarations are collected
 * from the `:root[...]` blocks that match, in cascade order, `var()` is followed to a hex,
 * and each pair is held to WCAG — 4.5:1 for text, 3:1 for a focus ring or a stroke, and 7:1
 * for text in high contrast. A palette edit that breaks a pair fails here, not in a
 * screenshot someone happens to take.
 */
const css = readFileSync(join(__dirname, "styles.css"), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { conditions: [string, string][]; specificity: number; decls: [string, string][] };

const rules: Rule[] = [];
for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selectors = (match[1] ?? "").split(",").map((part) => part.trim());
  const decls = [...(match[2] ?? "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(
    (d) => [d[1] ?? "", (d[2] ?? "").trim()] as [string, string],
  );
  for (const selector of selectors) {
    if (!/^:root(\[data-(theme|accent)="[a-z]+"\])*$/.test(selector)) continue;
    const conditions = [...selector.matchAll(/\[data-(theme|accent)="([a-z]+)"\]/g)].map(
      (c) => [c[1] ?? "", c[2] ?? ""] as [string, string],
    );
    rules.push({ conditions, specificity: 1 + conditions.length, decls });
  }
}

function tokens(theme: Resolved, accent: Accent): Map<string, string> {
  const attrs: Record<string, string> = { theme, accent };
  const applied = rules
    .map((rule, order) => ({ rule, order }))
    .filter(({ rule }) => rule.conditions.every(([key, value]) => attrs[key] === value))
    .sort((a, b) => a.rule.specificity - b.rule.specificity || a.order - b.order);
  const vars = new Map<string, string>();
  for (const { rule } of applied) for (const [name, value] of rule.decls) vars.set(name, value);
  return vars;
}

function hex(vars: Map<string, string>, name: string): string {
  let value = vars.get(name);
  for (let hops = 0; value?.startsWith("var("); hops++) {
    if (hops > 10) throw new Error(`var() loop at --${name}`);
    value = vars.get(value.slice(6, -1));
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${name} is ${value}`);
  return value;
}

function luminance(colour: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(colour.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function ratio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ["text", "bg"],
  ["text", "surface"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["faint", "surface"],
  ["link", "surface"],
  ["link", "bg"],
  ["link", "primary-soft"],
  ["on-primary", "primary"],
  ["on-secondary", "secondary"],
  ["accent-ink", "surface"],
  ["spend-ink", "surface"],
  ["warning-ink", "surface"],
  ["accent-2-ink", "surface"],
  ["toast-fg", "toast-bg"],
  ["toast-error-fg", "toast-error-bg"],
];

const GRAPHIC_PAIRS: [string, string][] = [
  ["focus", "surface"],
  ["ink-red", "surface"],
  ["ink-blue", "surface"],
];

const THEMES = MODES.filter((m): m is Resolved => m !== "system");

describe("contrast, every theme × accent", () => {
  it("found the theme blocks", () => {
    // A selector rewrite that the parser silently skips would pass every check below.
    for (const theme of THEMES.filter((t) => t !== "light")) {
      expect(rules.some((r) => r.conditions.some(([k, v]) => k === "theme" && v === theme))).toBe(true);
    }
    for (const accent of ACCENTS.filter((a) => a !== "blue")) {
      expect(rules.filter((r) => r.conditions.some(([, v]) => v === accent))).toHaveLength(4);
    }
  });

  for (const theme of THEMES) {
    for (const accent of ACCENTS) {
      it(`${theme} / ${accent}`, () => {
        const vars = tokens(theme, accent);
        const textMin = theme === "hc" ? 7 : 4.5;
        const failures: string[] = [];
        for (const [fg, bg] of TEXT_PAIRS) {
          const r = ratio(hex(vars, fg), hex(vars, bg));
          if (r < textMin) failures.push(`--${fg} on --${bg}: ${r.toFixed(2)}`);
        }
        for (const [fg, bg] of GRAPHIC_PAIRS) {
          const r = ratio(hex(vars, fg), hex(vars, bg));
          if (r < 3) failures.push(`--${fg} on --${bg}: ${r.toFixed(2)}`);
        }
        expect(failures).toEqual([]);
      });
    }
  }

  it("gives sepia every colour token dark has, rather than inheriting light's", () => {
    // Dark is the full block: whatever it has to restate is what a theme must set.
    const declared = (theme: string) =>
      new Set(
        rules
          .filter((r) => r.conditions.length === 1 && r.conditions[0]?.[1] === theme)
          .flatMap((r) => r.decls.map(([name]) => name)),
      );
    const missing = [...declared("dark")].filter((name) => !declared("sepia").has(name));
    expect(missing).toEqual([]);
  });

  it("previews each accent in Settings with the fill the CSS actually uses", () => {
    for (const accent of ACCENTS) {
      expect(ACCENT_SWATCH.light[accent]).toBe(hex(tokens("light", accent), "primary"));
      expect(ACCENT_SWATCH.dark[accent]).toBe(hex(tokens("dark", accent), "primary"));
    }
  });

  it("keeps each accent distinct from its neighbours in the same theme", () => {
    // Otherwise a preset silently falls through to blue.
    for (const theme of THEMES) {
      const primaries = ACCENTS.map((accent) => hex(tokens(theme, accent), "primary"));
      expect(new Set(primaries).size).toBe(ACCENTS.length);
    }
  });
});
