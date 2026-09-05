import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";
import type { Summary, Trends } from "../api/types";

// Category names link to their detail page, so the component needs a router.
function render(ui: React.ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

const summary: Summary = {
  month: "2026-08",
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
  overrides: { summary?: Summary; trends?: Trends; lowItems?: unknown[] } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url.includes("/api/inventory/items")
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
    }),
  );
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
});
