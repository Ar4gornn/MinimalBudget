import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";
import type { Layout, Summary, Trends } from "../api/types";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { DEFAULT_PREFERENCES } from "../layout/preferences";

// Category names link to their detail page, so the component needs a router.
function render(ui: React.ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

const summary: Summary = {
  month: "2026-08",
  period: "month",
  label: "2026-08",
  start: "2026-08-01",
  end: "2026-08-31",
  income: "3000.00",
  expense: "845.50",
  net: "2154.50",
  saved: "400.00",
  budgets: [
    // Budgeted, unspent — must still appear (AD-22).
    { category_id: "g", category_name: "Gym", budget: "40.00", actual: "0.00" },
    { category_id: "r", category_name: "Rent", budget: "900.00", actual: "800.00" },
    // Spent, unbudgeted — must still appear.
    { category_id: "t", category_name: "Taxi", budget: null, actual: "45.50" },
  ],
  savings: [
    { savings_type_id: "s", savings_type_name: "startup", target: "1000.00", actual: "400.00" },
  ],
};

const trends: Trends = {
  months: ["2026-07", "2026-08"],
  income: ["2900.00", "3000.00"],
  expense: ["790.00", "845.50"],
  saved: ["150.00", "400.00"],
  expense_by_category: [{ category_id: "r", category_name: "Rent", values: ["790.00", "800.00"] }],
};

function mockApi(
  overrides: {
    summary?: Summary;
    trends?: Trends;
    lowItems?: unknown[];
    pending?: unknown[];
    reading?: unknown[];
    quote?: unknown;
  } = {},
) {
  const fetchMock = vi.fn(async (url: string) => {
      const body = url.includes("/api/recurring/pending")
        ? { items: overrides.pending ?? [] }
        : url.includes("/api/books/quotes/draw")
          ? (overrides.quote ?? null)
        : url.includes("/api/books")
          ? { items: overrides.reading ?? [] }
        : url.includes("/api/inventory/items")
        ? { items: overrides.lowItems ?? [] }
        : url.includes("/api/inventory/spaces")
          ? { items: [{ id: "sp1", name: "Fridge", created_at: "" }] }
          : url.includes("/summary")
            ? (overrides.summary ?? summary)
            : (overrides.trends ?? trends);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Read one headline figure by its label, rather than by hunting for a number on the page. */
function stat(label: string): string {
  const card = document.querySelector(`[data-stat="${label}"] .value`);
  return card?.textContent ?? "";
}

/** The cells of one row of a named table. */
function rowOf(tableName: string, first: string): string[] {
  const table = screen.getByRole("table", { name: tableName });
  const row = within(table).getByText(first).closest("tr") as HTMLElement;
  return [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? "");
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("shows the month's totals, numbers first", async () => {
    mockApi();
    render(<DashboardPage />);

    await screen.findByRole("table", { name: "Budget vs actual" });
    // Headline figures carry the account's currency symbol; table cells do not, because
    // the symbol sits in those column headers instead.
    expect(stat("Income")).toBe("$3,000.00");
    expect(stat("Expense")).toBe("$845.50");
    expect(stat("Net")).toBe("$2,154.50");
    expect(stat("Saved")).toBe("$400.00");
  });

  it("links to the notes from the heading line (Epic 32)", async () => {
    mockApi();
    render(<DashboardPage />);

    const link = await screen.findByRole("link", { name: /Notes/ });
    expect(link).toHaveAttribute("href", "/notes");
  });

  it("keeps a budgeted category with no spending on screen", async () => {
    mockApi();
    render(<DashboardPage />);
    await screen.findByRole("table", { name: "Budget vs actual" });

    // category, spent, budget, left, progress
    expect(rowOf("Budget vs actual", "Gym").slice(0, 4)).toEqual([
      "Gym",
      "0.00",
      "40.00",
      "40.00",
    ]);
  });

  it("shows a spent category that has no budget, marked as unset", async () => {
    mockApi();
    render(<DashboardPage />);
    await screen.findByRole("table", { name: "Budget vs actual" });

    expect(rowOf("Budget vs actual", "Taxi").slice(0, 4)).toEqual([
      "Taxi",
      "45.50",
      "not set",
      "—",
    ]);
  });

  it("labels the savings column Saved, not Spent", async () => {
    // On a phone these tables become labelled cards, and the two share almost identical
    // markup — which is how a bulk edit once put "Spent" on the savings figure.
    mockApi();
    render(<DashboardPage />);
    const table = await screen.findByRole("table", { name: "Savings progress" });
    const cells = [...table.querySelectorAll("td[data-label]")].map((td) =>
      td.getAttribute("data-label"),
    );
    expect(cells).toContain("Saved");
    expect(cells).not.toContain("Spent");
  });

  it("shows savings progress against the target", async () => {
    mockApi();
    render(<DashboardPage />);
    await screen.findByRole("table", { name: "Savings progress" });

    expect(rowOf("Savings progress", "startup").slice(0, 3)).toEqual([
      "startup",
      "400.00",
      "1,000.00",
    ]);
  });

  it("renders a month with no data as zeroes rather than an empty screen", async () => {
    mockApi({
      summary: {
        month: "2020-01",
        period: "month",
        label: "2020-01",
        start: "2020-01-01",
        end: "2020-01-31",
        income: "0.00",
        expense: "0.00",
        net: "0.00",
        saved: "0.00",
        budgets: [],
        savings: [],
      },
      trends: { months: [], income: [], expense: [], saved: [], expense_by_category: [] },
    });
    render(<DashboardPage />);

    expect(
      await screen.findByText("No budgets set and nothing spent this month."),
    ).toBeInTheDocument();
    expect([stat("Income"), stat("Expense"), stat("Net"), stat("Saved")]).toEqual([
      "$0.00",
      "$0.00",
      "$0.00",
      "$0.00",
    ]);
  });

  it("draws the trend chart as inline SVG, with no chart library involved", async () => {
    mockApi();
    const { container } = render(<DashboardPage />);
    await screen.findByRole("table", { name: "Budget vs actual" });

    const chart = container.querySelector("svg[role='img']");
    expect(chart).not.toBeNull();
    // Two months, three series each.
    expect(chart?.querySelectorAll("rect").length).toBe(6);
  });

  it("reports a failure instead of showing a blank page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "month must be formatted YYYY-MM" }), {
            status: 422,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    render(<DashboardPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("month must be formatted YYYY-MM");
  });
});


describe("collapsible sections", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("folds a section away and keeps its headline in the header", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<DashboardPage />);
    await screen.findByRole("table", { name: "Budget vs actual" });

    const toggle = screen.getByRole("button", { name: /Budget vs actual/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);

    // The rows go; the count that tells you something stays.
    expect(screen.queryByRole("table", { name: "Budget vs actual" })).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("3 categories");
    // Nothing in this fixture is over budget — Rent is 800 of 900, Gym 0 of 40 — so the
    // warning must not appear. Asserting its absence is the half that catches a summary
    // that always says "over".
    expect(toggle).not.toHaveTextContent("over");
  });

  it("counts overspent categories in the collapsed summary", async () => {
    mockApi({
      summary: {
        ...summary,
        budgets: [
          { category_id: "r", category_name: "Rent", budget: "900.00", actual: "950.00" },
          { category_id: "g", category_name: "Gym", budget: "40.00", actual: "0.00" },
        ],
      },
    });
    const user = userEvent.setup();
    render(<DashboardPage />);
    await screen.findByRole("table", { name: "Budget vs actual" });

    const toggle = screen.getByRole("button", { name: /Budget vs actual/ });
    await user.click(toggle);

    expect(toggle).toHaveTextContent("2 categories");
    expect(toggle).toHaveTextContent("1 over");
  });

  it("remembers the choice, so it is not re-collapsed on every visit", async () => {
    mockApi();
    const user = userEvent.setup();
    const first = render(<DashboardPage />);
    await screen.findByRole("table", { name: "Budget vs actual" });
    await user.click(screen.getByRole("button", { name: /Budget vs actual/ }));
    first.unmount();

    render(<DashboardPage />);
    await screen.findByRole("table", { name: "Savings progress" });
    expect(screen.queryByRole("table", { name: "Budget vs actual" })).toBeNull();
  });

  it("survives localStorage being unavailable", async () => {
    // Private windows throw on access. A section that cannot remember its state is fine;
    // a dashboard that will not render is not.
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mockApi();
    render(<DashboardPage />);
    expect(await screen.findByRole("table", { name: "Budget vs actual" })).toBeInTheDocument();
    getItem.mockRestore();
  });
});

describe("restock reminders on the dashboard (AD-30, AD-31)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  const low = (name: string) => ({
    id: name,
    space_id: "sp1",
    name,
    quantity: 0,
    restock_below: 1,
    cost: null,
    note: null,
    needs_restock: true,
    restocked_at: null,
    created_at: "",
    updated_at: "",
  });

  it("says how many items need restocking, with the first few named", async () => {
    mockApi({ lowItems: [low("Milk"), low("Eggs"), low("Butter"), low("Rice")] });
    render(<DashboardPage />);

    const link = await screen.findByRole("link", { name: /4 items need restocking/ });
    expect(link).toHaveAttribute("href", "/inventory?filter=restock");
    expect(screen.getByText(/Milk · Fridge, Eggs · Fridge, Butter · Fridge, …/)).toBeInTheDocument();
  });

  it("shows no card at all when nothing is low", async () => {
    mockApi();
    render(<DashboardPage />);
    await screen.findByText("Budget vs actual");
    expect(screen.queryByText(/need restocking/)).toBeNull();
  });

  it("still renders the ledger when the inventory request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/inventory")) {
          return new Response(JSON.stringify({ detail: "down" }), { status: 500 });
        }
        const body = url.includes("/summary") ? summary : trends;
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    render(<DashboardPage />);
    await screen.findByText("Budget vs actual");
    expect(stat("Income")).toContain("3,000.00");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says how many recurring entries are waiting, and links to where they are decided", async () => {
    mockApi({
      pending: [
        { id: "o1", category_name: "Electricity", due_on: "2026-09-05" },
        { id: "o2", category_name: "Rent", due_on: "2026-09-01" },
      ],
    });
    render(<DashboardPage />);

    const link = await screen.findByRole("link", { name: /2 recurring entries are waiting/ });
    expect(link).toHaveAttribute("href", "/plan");
    expect(screen.getByText(/Electricity · 2026-09-05/)).toBeInTheDocument();
  });

  it("shows no confirmation card when nothing is waiting", async () => {
    mockApi();
    render(<DashboardPage />);
    await screen.findByText("Budget vs actual");
    expect(screen.queryByText(/recurring/i)).toBeNull();
  });

  it("switches the trend window to a year and remembers it", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    const { unmount } = render(<DashboardPage />);
    await screen.findByText("Budget vs actual");

    await user.click(screen.getByRole("button", { name: "12 months" }));
    await waitFor(() => {
      const asked = fetchMock.mock.calls
        .map((call) => String(call[0]))
        .filter((url: string) => url.includes("/trends"));
      expect(asked.at(-1)).toContain("months=12");
    });
    unmount();

    // Remembered per device, like the collapsed sections.
    render(<DashboardPage />);
    expect(await screen.findByRole("button", { name: "12 months" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("asks the server for a year, and names the window from what it answers", async () => {
    const fetchMock = mockApi({
      summary: {
        month: "2026-08",
        period: "year",
        label: "2026",
        start: "2025-12-26",
        end: "2026-12-25",
        income: "36000.00",
        expense: "12000.00",
        net: "24000.00",
        saved: "4800.00",
        budgets: [],
        savings: [],
      },
    });
    const user = userEvent.setup();
    render(<DashboardPage />);
    await screen.findByText("Budget vs actual");

    await user.click(screen.getByRole("button", { name: "Year" }));

    await waitFor(() => {
      const asked = fetchMock.mock.calls
        .map((call) => String(call[0]))
        .filter((url: string) => url.includes("/summary"));
      expect(asked.at(-1)).toContain("period=year");
    });
    // The heading and the range come from the server, not reconstructed on the client.
    expect(await screen.findByRole("heading", { name: "2026" })).toBeInTheDocument();
    expect(screen.getByText(/2025-12-26 to 2026-12-25/)).toBeInTheDocument();
    expect(stat("Income")).toBe("$36,000.00");
  });

  it("hides the monthly comparisons for a wider period, and says why", async () => {
    mockApi({
      summary: {
        month: "2026-08",
        period: "all",
        label: "All time",
        start: null,
        end: null,
        income: "1.00",
        expense: "0.00",
        net: "1.00",
        saved: "0.00",
        budgets: [],
        savings: [],
      },
    });
    const user = userEvent.setup();
    render(<DashboardPage />);
    await screen.findByText("Budget vs actual");

    await user.click(screen.getByRole("button", { name: "All time" }));

    // AD-11: a budget is a standing monthly amount, so it has no meaning over all time.
    expect(await screen.findByText(/Budgets and savings targets are monthly amounts/)).toBeInTheDocument();
    // And the month picker is gone, because picking one would change nothing.
    expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
  });
});

describe("reading now on the dashboard (Epic 28, AD-37)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  const open = (title: string, page: number | null, count: number | null) => ({
    id: title,
    title,
    author: "Someone",
    series_id: null,
    series_name: null,
    series_order: null,
    status: "reading",
    rating: null,
    page_count: count,
    current_page: page,
    tags: "",
    note: null,
    added_on: "2026-09-01",
    started_on: "2026-09-02",
    finished_on: null,
    created_at: "",
    updated_at: "",
  });

  it("names what is open, with the page as a fraction only when both halves are known", async () => {
    mockApi({
      reading: [
        open("Dune", 150, 600),
        open("Emma", null, 400),
        open("Mort", 10, null),
        open("Ulysses", 0, 700),
      ],
    });
    render(<DashboardPage />);

    // The read is the books module's own list with its own filter — not a dashboard query.
    const link = await screen.findByRole("link", { name: "4 books open" });
    expect(link).toHaveAttribute("href", "/books?status=reading");
    expect(screen.getByText(/Dune · 25%, Emma, Mort, …/)).toBeInTheDocument();
  });

  it("shows no card at all when nothing is open", async () => {
    mockApi();
    render(<DashboardPage />);
    await screen.findByText("Budget vs actual");
    expect(screen.queryByText(/Reading now/)).toBeNull();
  });

  it("asks the books module for the reading list rather than filtering it here", async () => {
    const fetchMock = mockApi({ reading: [open("Dune", 150, 600)] });
    render(<DashboardPage />);
    await screen.findByRole("link", { name: "1 book open" });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.endsWith("/api/books?status=reading"))).toBe(true);
  });
});


/**
 * Epic 33, story 33.5: the default card order is the dashboard as it was before cards became
 * configurable. Written against the page before the refactor and kept green through it.
 */
describe("the default card order", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  /** Each card on the page, in document order, by its title — "stats" for the totals row. */
  function cardOrder(): string[] {
    const found: string[] = [];
    for (const el of document.querySelectorAll(".grid, section.card")) {
      if (el.classList.contains("grid")) found.push("stats");
      else found.push(el.querySelector("h2")?.textContent ?? "?");
    }
    return found;
  }

  it("is totals, to confirm, reading, quote, restock, budgets, savings, trends, categories", async () => {
    mockApi({
      pending: [{ id: "o1", category_name: "Rent", due_on: "2026-09-01" }],
      reading: [
        {
          id: "b1", title: "Dune", author: "Herbert", series_id: null, series_name: null,
          series_order: null, status: "reading", rating: null, page_count: null,
          current_page: null, tags: "", note: null, added_on: "2026-09-01",
          started_on: "2026-09-01", finished_on: null, created_at: "", updated_at: "",
        },
      ],
      quote: { id: "q1", book_id: "b1", text: "Fear is the mind-killer.", page: 8,
        title: "Dune", author: "Herbert" },
      lowItems: [
        {
          id: "i1", space_id: "sp1", name: "Milk", quantity: 0, restock_below: 1, cost: null,
          note: null, needs_restock: true, restocked_at: null, created_at: "", updated_at: "",
        },
      ],
    });
    render(<DashboardPage />);
    await screen.findByText("A line from the shelf");
    await screen.findByText("Restock");
    await screen.findByText("Reading now");
    await screen.findByText("To confirm");
    expect(cardOrder()).toEqual([
      "stats",
      "To confirm",
      "Reading now",
      "A line from the shelf",
      "Restock",
      "Budget vs actual",
      "Savings progress",
      "Last 6 months",
      "Expense by category",
    ]);
  });
});

describe("cards chosen by the account (Epic 33, story 33.5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  /** The dashboard for an account whose desktop layout has these cards. */
  function withCards(cards: Layout["cards"], data: Parameters<typeof mockApi>[0] = {}) {
    const inner = mockApi(data);
    const preferences = { ...DEFAULT_PREFERENCES, desktop: { ...DEFAULT_PREFERENCES.desktop, cards } };
    const wrapped = vi.fn(async (url: string) =>
      url.includes("/api/auth/me")
        ? new Response(
            JSON.stringify({ id: "u1", email: "sam@example.com", currency: "USD", created_at: "",
              preferences }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        : inner(url),
    );
    vi.stubGlobal("fetch", wrapped);
    window.localStorage.setItem("everything-everywhere.token", "test-token");
    render(
      <AuthProvider>
        <SignedIn>
          <DashboardPage />
        </SignedIn>
      </AuthProvider>,
    );
    return () => wrapped.mock.calls.map(([url]) => String(url));
  }

  /** As App does: nothing is drawn until the profile, and so the layout, is known. */
  function SignedIn({ children }: { children: React.ReactNode }) {
    return useAuth().user ? children : null;
  }

  const all = DEFAULT_PREFERENCES.desktop.cards;
  const only = (...ids: string[]) => all.map((card) => ({ ...card, on: ids.includes(card.id) }));

  function cardOrder(): string[] {
    const found: string[] = [];
    for (const el of document.querySelectorAll(".grid, section.card")) {
      if (el.classList.contains("grid")) found.push("stats");
      else found.push(el.querySelector("h2")?.textContent ?? "?");
    }
    return found;
  }

  it("draws the cards in the account's order", async () => {
    const reordered: Layout["cards"] = [
      { id: "categories", on: true },
      { id: "savings", on: true },
      { id: "stats", on: true },
      ...all.filter((c) => !["categories", "savings", "stats"].includes(c.id)),
    ];
    withCards(reordered);
    await screen.findByText("Expense by category");
    await waitFor(() => expect(cardOrder()[0]).toBe("Expense by category"));
    expect(cardOrder()).toEqual([
      "Expense by category",
      "Savings progress",
      "stats",
      "Budget vs actual",
      "Last 6 months",
    ]);
  });

  it("does not ask for a hidden card's own data", async () => {
    const asked = withCards(only("stats", "budgets"), {
      pending: [{ id: "o1", category_name: "Rent", due_on: "2026-09-01" }],
    });
    await screen.findByText("Budget vs actual");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const urls = asked();
    for (const path of ["/api/recurring/pending", "/api/books", "/api/inventory", "/api/dashboard/trends"]) {
      expect(urls.some((url) => url.includes(path)), path).toBe(false);
    }
    expect(urls.some((url) => url.includes("/api/dashboard/summary"))).toBe(true);
    expect(screen.queryByText("To confirm")).toBeNull();
  });

  it("skips the summary when every card that reads it is hidden", async () => {
    const asked = withCards(only("trends", "categories"));
    await screen.findByText("Expense by category");
    const urls = asked();
    expect(urls.some((url) => url.includes("/api/dashboard/summary"))).toBe(false);
    expect(urls.some((url) => url.includes("/api/dashboard/trends"))).toBe(true);
    expect(document.querySelector(".grid")).toBeNull();
  });

  it("asks for every card's data with everything shown", async () => {
    // The guard for the two tests above: same harness, all on, every request made.
    const asked = withCards(all);
    await screen.findByText("Budget vs actual");
    await waitFor(() => {
      const urls = asked();
      for (const path of ["/api/recurring/pending", "/api/books", "/api/inventory",
        "/api/dashboard/summary", "/api/dashboard/trends"]) {
        expect(urls.some((url) => url.includes(path)), path).toBe(true);
      }
    });
  });
});
