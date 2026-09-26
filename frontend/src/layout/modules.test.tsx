import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App, navFor } from "../App";
import type { ModuleId, Preferences } from "../api/types";
import { AuthProvider } from "../auth/AuthContext";
import { ToastProvider } from "../components/Toast";
import { LanguageProvider } from "../i18n";
import { ThemeProvider } from "../theme";
import { DEFAULT_PREFERENCES, MODULES } from "./preferences";

/**
 * Turning a module off (Epic 33, story 33.3): its tab, its pages, and everything that
 * points at it elsewhere go, and so do the requests they would have made.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ALL_ON = DEFAULT_PREFERENCES.modules;
const off = (...ids: ModuleId[]): Record<ModuleId, boolean> =>
  Object.fromEntries(MODULES.map((id) => [id, !ids.includes(id)])) as Record<ModuleId, boolean>;

function withModules(modules: Record<ModuleId, boolean>): Preferences {
  return { ...DEFAULT_PREFERENCES, modules };
}

let requests: { url: string; method: string; body: unknown }[];

function renderAt(
  path: string,
  modules: Record<ModuleId, boolean>,
  patch: (body: unknown) => Response = () => json({}),
  prefs: Preferences = withModules(modules),
) {
  window.localStorage.setItem("everything-everywhere.token", "test-token");
  requests = [];
  const user = {
    id: "u1",
    email: "sam@example.com",
    currency: "USD",
    weight_unit: "kg",
    budget_start_day: 1,
    created_at: "",
    preferences: prefs,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });
      if (url.includes("/api/auth/me/preferences")) return patch(body);
      if (url.includes("/api/auth/me/recovery-codes")) return json({ unused: 0, total: 0 });
      if (url.includes("/api/auth/me")) return json(user);
      if (url.includes("/api/books/quotes/draw")) return json(null);
      if (url.includes("/api/dashboard") || url.includes("/api/summary")) return json(null);
      return json([]);
    }),
  );
  return render(
    <AuthProvider>
      <LanguageProvider>
        <ToastProvider>
          <ThemeProvider>
            <MemoryRouter initialEntries={[path]}>
              <App />
            </MemoryRouter>
          </ThemeProvider>
        </ToastProvider>
      </LanguageProvider>
    </AuthProvider>,
  );
}

const asked = (fragment: string) => requests.some((r) => r.url.includes(fragment));
const bottomBar = () => screen.getByRole("navigation", { name: "Sections" });
const topExtra = () => screen.getByRole("navigation", { name: "More" });
const tabs = () =>
  within(bottomBar())
    .getAllByRole("link")
    .map((link) => link.textContent?.replace(/^\W+/u, "").trim());

describe("navFor (modules)", () => {
  const visibleSections = (modules: Record<ModuleId, boolean>) =>
    navFor(DEFAULT_PREFERENCES.phone, modules).bar;
  const paths = (modules: Record<ModuleId, boolean>) => visibleSections(modules).map((s) => s.to);

  it("is today's five with everything on", () => {
    expect(paths(ALL_ON)).toEqual(["/", "/entries", "/habits", "/inventory", "/gym"]);
  });

  it("drops a section whose module is off", () => {
    expect(paths(off("gym"))).toEqual(["/", "/entries", "/habits", "/inventory"]);
    expect(paths(off("stock", "gym"))).toEqual(["/", "/entries", "/habits"]);
  });

  it("turns the Habits section into Books when only the books are on", () => {
    const books = visibleSections(off("habits")).find((s) => s.to === "/books");
    expect(books).toMatchObject({ label: "view.books", also: [] });
    expect(paths(off("habits", "books"))).toEqual(["/", "/entries", "/inventory", "/gym"]);
  });

  it("stops lighting a section for a view that is off", () => {
    expect(visibleSections(off("books")).find((s) => s.to === "/habits")?.also).toEqual([]);
    expect(visibleSections(off("notes"))[0]?.also).toEqual(["/calendar"]);
  });
});

describe("a module that is off", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("has no tab and no top-bar link", async () => {
    renderAt("/entries", off("gym", "recipes", "stock"));
    await waitFor(() => expect(bottomBar()).toBeInTheDocument());
    expect(tabs()).toEqual(["Dashboard", "Entries", "Habits"]);
    expect(within(topExtra()).queryByRole("link", { name: "Recipes" })).toBeNull();
    expect(within(topExtra()).getByRole("link", { name: "Plan" })).toBeInTheDocument();
  });

  it("answers its routes with a page that says so, not a redirect", async () => {
    renderAt("/gym", off("gym"));
    expect(await screen.findByRole("heading", { name: "Gym is turned off" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute(
      "href",
      "/settings#layout",
    );
    expect(asked("/api/gym")).toBe(false);
  });

  it("closes the notes routes too, deep links included", async () => {
    renderAt("/notes/abc", off("notes"));
    expect(await screen.findByRole("heading", { name: "Notes is turned off" })).toBeInTheDocument();
    expect(asked("/api/notes")).toBe(false);
  });

  it("leaves the Habits tab as Books, pointing at the shelf", async () => {
    renderAt("/books", off("habits"));
    await waitFor(() => expect(bottomBar()).toBeInTheDocument());
    const books = within(bottomBar()).getByRole("link", { name: /Books/ });
    expect(books).toHaveAttribute("href", "/books");
    // One view left is no choice, so there is no switch on the page.
    await waitFor(() => expect(asked("/api/books")).toBe(true));
    expect(screen.queryByRole("group", { name: "Habits view" })).toBeNull();
  });

  it("vanishes from the Dashboard and is not asked for", async () => {
    renderAt("/", off("books", "stock", "mood", "notes"));
    await waitFor(() => expect(asked("/api/recurring/pending")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(asked("/api/books")).toBe(false);
    expect(asked("/api/inventory")).toBe(false);
    expect(asked("/api/mood")).toBe(false);
    expect(screen.queryByRole("link", { name: /Notes/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Write a note" })).toBeNull();
    expect(screen.queryByRole("button", { name: /mood/i })).toBeNull();
  });

  it("is still asked for on the Dashboard when it is on", async () => {
    // The guard for the test above: the same page, everything on, does ask.
    renderAt("/", ALL_ON);
    await waitFor(() => expect(asked("/api/books")).toBe(true));
    expect(asked("/api/inventory")).toBe(true);
    expect(screen.getByRole("link", { name: /Notes/ })).toBeInTheDocument();
  });

  it("loses its calendar layer: no chip, no request", async () => {
    renderAt("/calendar", off("gym", "recipes", "mood", "stock", "habits"));
    const layers = await screen.findByRole("group", { name: "Layers" });
    await waitFor(() => expect(asked("/api/entries")).toBe(true));
    const chips = within(layers).getAllByRole("button").map((b) => b.textContent?.trim());
    expect(chips.join(" ")).not.toMatch(/Gym|Stock|Habits|Mood|Meals/);
    for (const path of ["/api/gym", "/api/inventory", "/api/habits", "/api/mood", "/api/meals"]) {
      expect(asked(path)).toBe(false);
    }
  });

  it("drops the mood card from the Habits page", async () => {
    renderAt("/habits", off("mood"));
    await waitFor(() => expect(asked("/api/habits")).toBe(true));
    expect(screen.queryByRole("heading", { name: "Mood" })).toBeNull();
    expect(asked("/api/mood")).toBe(false);
  });
});

describe("Settings → Layout", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("switches a module off at once and saves the whole set", async () => {
    renderAt("/settings", ALL_ON, (body) =>
      json({ id: "u1", email: "sam@example.com", currency: "USD", created_at: "",
        preferences: { ...DEFAULT_PREFERENCES, ...(body as object) } }),
    );
    const gym = await screen.findByRole("checkbox", { name: "Gym" });
    expect(gym).toBeChecked();
    expect(within(bottomBar()).getByRole("link", { name: /Gym/ })).toBeInTheDocument();

    await userEvent.click(gym);
    expect(within(bottomBar()).queryByRole("link", { name: /Gym/ })).toBeNull();
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ modules: off("gym") }),
    );
    expect(screen.getByRole("checkbox", { name: "Gym" })).not.toBeChecked();
  });

  it("undoes a switch the server refused, and says so", async () => {
    renderAt("/settings", ALL_ON, () => json({ detail: "boom", code: "error" }, 500));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Books" }));
    expect(await screen.findByText("Could not save, so the change was undone.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Books" })).toBeChecked();
  });
});

/**
 * Every caller of a module's API, outside `api/client.ts`, is either one of that module's
 * own pages or a place listed in `layout/modules.ts` and gated there. A new caller makes
 * this red until it is gated and added to the table below and to the one in modules.ts.
 */
describe("the module table is complete", () => {
  const sources = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.*"], {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const client = sources["../api/client.ts"] ?? "";
  const SEGMENT: Record<string, ModuleId> = {
    habits: "habits",
    books: "books",
    mood: "mood",
    inventory: "stock",
    gym: "gym",
    recipes: "recipes",
    foods: "recipes",
    meals: "recipes",
    notes: "notes",
  };
  const CALLERS: Record<ModuleId, string[]> = {
    habits: ["pages/CalendarPage.tsx", "pages/HabitsPage.tsx"],
    books: [
      "components/BookQuotes.tsx",
      "components/QuoteCard.tsx",
      "pages/BooksPage.tsx",
      "pages/DashboardPage.tsx",
    ],
    mood: ["components/MoodCheckin.tsx", "pages/CalendarPage.tsx", "pages/HabitsPage.tsx"],
    stock: [
      "components/ShoppingList.tsx",
      "pages/CalendarPage.tsx",
      "pages/DashboardPage.tsx",
      "pages/InventoryPage.tsx",
    ],
    gym: ["pages/CalendarPage.tsx", "pages/GymPage.tsx"],
    recipes: ["pages/CalendarPage.tsx", "pages/RecipePage.tsx", "pages/RecipesPage.tsx"],
    // drafts.ts sends notes already written, whatever the switch says: syncing is not UI.
    notes: ["notes/drafts.ts", "pages/NotePage.tsx", "pages/NotesPage.tsx"],
  };

  const functions: Record<ModuleId, string[]> = {
    habits: [], books: [], mood: [], stock: [], gym: [], recipes: [], notes: [],
  };
  for (const match of client.matchAll(/\n {2}(\w+): (?:async )?\([^)]*\)[^=]*=>[\s\S]*?["`]\/api\/([\w-]+)/g)) {
    const module = SEGMENT[match[2] ?? ""];
    if (module && match[1]) functions[module].push(match[1]);
  }

  it("found each module's functions in the client", () => {
    for (const id of MODULES) expect(functions[id].length).toBeGreaterThan(0);
  });

  for (const id of MODULES) {
    it(`lists every caller of ${id}`, () => {
      const pattern = new RegExp(`api\\.(${functions[id].join("|")})\\b`);
      const found = Object.entries(sources)
        .filter(([path, text]) => path !== "../api/client.ts" && pattern.test(text))
        .map(([path]) => path.replace(/^\.\.\//, ""))
        .sort();
      expect(found).toEqual(CALLERS[id]);
    });
  }
});

describe("Settings → Layout → tabs (story 33.4)", () => {
  /** A phone-sized screen: jsdom has no matchMedia, so the layout would be desktop. */
  function onAPhone() {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }
  const echo = (body: unknown) =>
    json({
      id: "u1",
      email: "sam@example.com",
      currency: "USD",
      created_at: "",
      preferences: { ...DEFAULT_PREFERENCES, ...(body as object) },
    });
  const firstPatch = () => requests.find((r) => r.method === "PATCH")?.body as Record<string, unknown>;

  beforeEach(() => {
    window.localStorage.clear();
    onAPhone();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens on the layout this screen uses", async () => {
    renderAt("/settings", ALL_ON, echo);
    expect(await screen.findByRole("button", { name: "Phone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Computer" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("swaps a tab into the top bar on a phone, and the bars follow at once", async () => {
    renderAt("/settings", ALL_ON, echo);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Move Gym to the top bar, and Recipes to the tab bar",
      }),
    );
    expect(tabs()).toEqual(["Dashboard", "Entries", "Habits", "Stock", "Recipes"]);
    expect(within(topExtra()).getByRole("link", { name: "Gym" })).toBeInTheDocument();

    await waitFor(() => expect(firstPatch()).toBeDefined());
    expect(Object.keys(firstPatch())).toEqual(["phone"]);
    expect((firstPatch().phone as { tabs: unknown }).tabs).toEqual([
      ...DEFAULT_PREFERENCES.phone.tabs.slice(0, 4),
      { id: "recipes", slot: "bar" },
      { id: "plan", slot: "top" },
      { id: "grow", slot: "top" },
      { id: "gym", slot: "top" },
    ]);
  });

  it("reorders with up and down, and cannot move past either end", async () => {
    renderAt("/settings", ALL_ON, echo);
    expect(await screen.findByRole("button", { name: "Move Dashboard up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Gym down" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move Habits up" }));
    expect(tabs()).toEqual(["Dashboard", "Habits", "Entries", "Stock", "Gym"]);
  });

  it("edits the computer layout from a phone without touching what the phone shows", async () => {
    // The two layouts differ, so the editor must show — and change — the one chosen.
    const desktopTabs = [
      { id: "plan", slot: "bar" },
      ...DEFAULT_PREFERENCES.desktop.tabs.filter((tab) => tab.id !== "plan"),
    ] as Preferences["desktop"]["tabs"];
    const prefs = { ...DEFAULT_PREFERENCES, desktop: { ...DEFAULT_PREFERENCES.desktop, tabs: desktopTabs } };
    renderAt("/settings", ALL_ON, echo, prefs);
    await userEvent.click(await screen.findByRole("button", { name: "Computer" }));
    const bar = screen.getByRole("list", { name: "Tab bar" });
    expect(within(bar).getAllByRole("listitem")[0]).toHaveTextContent("Plan");
    // A desktop has room: no swap is offered, the move is a move.
    await userEvent.click(screen.getByRole("button", { name: "Move Gym to the top bar" }));
    expect(tabs()).toEqual(["Dashboard", "Entries", "Habits", "Stock", "Gym"]);
    await waitFor(() => expect(firstPatch()).toBeDefined());
    expect(Object.keys(firstPatch())).toEqual(["desktop"]);
    expect((firstPatch().desktop as { tabs: { id: string }[] }).tabs.map((tab) => tab.id)).toEqual([
      "plan", "dashboard", "entries", "habits", "stock", "grow", "recipes", "gym",
    ]);
  });

  it("marks a section whose module is off, and still lets it be placed", async () => {
    renderAt("/settings", off("gym"), echo);
    const bar = await screen.findByRole("list", { name: "Tab bar" });
    expect(within(bar).getByText(/turned off/)).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /Move Gym to the top bar/ })).toBeEnabled();
  });

  it("resets a layout only after asking", async () => {
    const reversed = [...DEFAULT_PREFERENCES.phone.tabs]
      .reverse()
      .map((tab, i) => ({ id: tab.id, slot: i < 5 ? ("bar" as const) : ("top" as const) }));
    const moved = { ...DEFAULT_PREFERENCES, phone: { ...DEFAULT_PREFERENCES.phone, tabs: reversed } };
    renderAt("/settings", ALL_ON, echo, moved);
    await waitFor(() => expect(tabs()[0]).toBe("Recipes"));
    await userEvent.click(screen.getByRole("button", { name: "Reset these tabs" }));
    expect(
      screen.getByText("Put the phone tabs back in their original order?"),
    ).toBeInTheDocument();
    expect(firstPatch()).toBeUndefined();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(tabs()).toEqual(["Dashboard", "Entries", "Habits", "Stock", "Gym"]);
  });
});
