/**
 * Story 8.1 — the PWA's contract, checked against the real files.
 *
 * The service worker itself is hard to unit test without a worker environment, so these
 * assert the two things that would actually hurt: that the manifest an install depends on
 * is coherent, and that the worker never touches /api. A worker that cached API responses
 * would serve one family member stale balances, and would keep serving them after a sign-out
 * that was supposed to remove them.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PUBLIC = join(__dirname, "..", "public");
const manifest = JSON.parse(
  readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf-8"),
) as Record<string, unknown> & { icons: { src: string; sizes: string; purpose: string }[] };
const sw = readFileSync(join(PUBLIC, "sw.js"), "utf-8");

describe("web app manifest", () => {
  it("declares what an install needs", () => {
    expect(manifest.name).toBe("Everything Everywhere");
    // Truncated on a home screen beyond ~12 characters.
    expect(String(manifest.short_name).length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("runs without browser chrome, which is the whole point of installing", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("ships both a plain and a maskable icon", () => {
    // Android crops to a circle. Without dedicated maskable art it crops the plain icon and
    // the glyph loses its corners.
    const purposes = manifest.icons.map((icon) => icon.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
    expect(manifest.icons.map((i) => i.sizes)).toContain("512x512");
  });

  it("points only at icons that exist", () => {
    for (const icon of manifest.icons) {
      expect(() => readFileSync(join(PUBLIC, icon.src))).not.toThrow();
    }
  });

  it("uses colours from the app's own palette", () => {
    // A theme colour that does not match the app makes the status bar look like a bug.
    expect(manifest.theme_color).toBe("#2f6f5e");
    expect(manifest.background_color).toBe("#f7f7f5");
  });
});

describe("home-screen shortcuts (Epic 32)", () => {
  const app = readFileSync(join(__dirname, "App.tsx"), "utf-8");
  const shortcuts = (manifest.shortcuts ?? []) as { short_name: string; url: string }[];

  it("offers Note, Sketch, Expense and Mood, in that order", () => {
    expect(shortcuts.map((s) => s.short_name)).toEqual(["Note", "Sketch", "Expense", "Mood"]);
  });

  it("points each at a route the app actually has", () => {
    // A shortcut to a path the router does not know lands on the catch-all redirect to "/",
    // which looks like it worked and did nothing.
    for (const shortcut of shortcuts) {
      const path = shortcut.url.split("?")[0] ?? "";
      const route = path === "/notes/new" ? "/notes/:noteId" : path;
      expect(app, shortcut.url).toContain(`path="${route}"`);
    }
  });
});

describe("service worker", () => {
  it("never caches the API", () => {
    // The guard clause, verbatim. Financial data behind a bearer token must not outlive the
    // sign-out that was supposed to remove it.
    expect(sw).toMatch(/url\.pathname\.startsWith\(["']\/api\/["']\)/);
    expect(sw).toMatch(/return;/);
  });

  it("leaves the health endpoint to the server", () => {
    // Caching it would make an uptime probe report the last known good answer forever.
    expect(sw).toContain('url.pathname === "/health"');
  });

  it("only ever handles GET, and only same-origin", () => {
    expect(sw).toContain('request.method !== "GET"');
    expect(sw).toContain("url.origin !== self.location.origin");
  });

  it("falls back to the cached shell for navigations", () => {
    expect(sw).toContain('request.mode === "navigate"');
    expect(sw).toContain("SHELL_URL");
  });

  it("drops caches from previous versions on activate", () => {
    // Otherwise every deploy leaves another copy of the app behind on every device.
    expect(sw).toContain("caches.delete");
    expect(sw).toContain("self.clients.claim()");
  });

  it("only caches our own successful responses", () => {
    // Caching an opaque cross-origin response or an error page poisons the cache.
    expect(sw).toContain("response.ok");
    expect(sw).toContain('response.type === "basic"');
  });
});
