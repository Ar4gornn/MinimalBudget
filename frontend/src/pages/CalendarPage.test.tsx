import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarPage } from "./CalendarPage";
import { AuthProvider } from "../auth/AuthContext";

/**
 * The calendar grid (Epic 22, stories 22.2 and 22.3).
 *
 * The assertion that matters most is the ragged one: for an account whose month starts on
 * the 26th, the grid must cover 26 August to 25 September, because every total in the app
 * does. A calendar month here would be the one view that disagrees with the figure above it.
 */

function render(ui: React.ReactElement) {
  return rtlRender(
    <AuthProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthProvider>,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const me = {
  id: "u1",
  email: "sam@example.com",
  currency: "USD",
  weight_unit: "kg",
  budget_start_day: 26,
  created_at: "",
};

const entries = [
  {
    id: "e1",
    kind: "expense",
    category_id: "c1",
    vendor_id: null,
    amount: "40.00",
    occurred_on: "2026-09-02",
    note: "Petrol",
    quantity: null,
    unit: null,
    unit_price: null,
    created_at: "",
  },
  {
    id: "e2",
    kind: "income",
    category_id: "c2",
    vendor_id: null,
    amount: "1200.00",
    occurred_on: "2026-08-26",
    note: null,
    quantity: null,
    unit: null,
    unit_price: null,
    created_at: "",
  },
];

/**
 * Two meals on the 2nd (Epic 27): a recipe eaten in servings, and a bare food in grams.
 *
 * Their calorie figures are already derived — the layer renders what it was told and only
 * *sums* the day, which is the same thing the money line does with cents.
 */
const meals = [
  {
    id: "m1",
    eaten_on: "2026-09-02",
    recipe_id: "r1",
    recipe_name: "Rice and eggs",
    servings: "0.500",
    food_id: null,
    food_name: null,
    quantity: null,
    unit: null,
    note: null,
    nutrition: {
      kcal: "123.5000",
      protein: "6.0750",
      carbs: null,
      fat: null,
      unknown: { kcal: 0, protein: 0, carbs: 1, fat: 2 },
    },
  },
  {
    id: "m2",
    eaten_on: "2026-09-02",
    recipe_id: null,
    recipe_name: null,
    servings: null,
    food_id: "f1",
    food_name: "Rice",
    quantity: "150.000",
    unit: "g",
    note: null,
    nutrition: {
      kcal: "195.0000",
      protein: "4.0500",
      carbs: null,
      fat: null,
      unknown: { kcal: 0, protein: 0, carbs: 1, fat: 1 },
    },
  },
];

interface Options {
  startDay?: number;
  failStock?: boolean;
}

function mockApi(options: Options = {}) {
  window.localStorage.setItem("minimalbudget.token", "test-token");
  const seen: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    seen.push(url);
    if (url.includes("/api/auth/me")) {
      return json({ ...me, budget_start_day: options.startDay ?? 26 });
    }
    if (url.includes("/api/inventory/changes")) {
      if (options.failStock) return json({ detail: "boom" }, 500);
      return json({
        items: [
          {
            item_id: "i1",
            item_name: "Milk",
            quantity_before: 4,
            quantity_after: 1,
            changed_at: "2026-09-02T09:00:00+00:00",
          },
        ],
      });
    }
    if (url.includes("/api/entries")) return json({ items: entries });
    if (url.includes("/api/categories")) {
      return json({
        items: [
          { id: "c1", name: "Fuel", kind: "expense", created_at: "" },
          { id: "c2", name: "Salary", kind: "income", created_at: "" },
        ],
      });
    }
    if (url.includes("/api/savings/types")) return json({ items: [] });
    if (url.includes("/api/savings/contributions")) return json({ items: [] });
    if (url.includes("/api/gym/workouts")) return json({ items: [] });
    if (url.includes("/api/habits/checkins")) {
      return json({
        items: [
          {
            id: "h1",
            habit_id: "hb1",
            habit_name: "Run",
            done_on: "2026-09-02",
            times: 2,
            note: null,
          },
        ],
      });
    }
    if (url.includes("/api/recurring/expected")) {
      return json({
        items: [
          {
            template_id: "t1",
            due_on: "2026-09-20",
            kind: "expense",
            category_id: "c1",
            category_name: "Rent",
            amount: "900.00",
            note: null,
            cadence: "monthly",
            auto: false,
          },
        ],
      });
    }
    if (url.includes("/api/recurring/pending")) return json({ items: [] });
    if (url.includes("/api/meals")) return json({ items: meals });
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, seen };
}

/** The month input is the one control that names the period being shown. */
async function setMonth(value: string) {
  const input = await screen.findByLabelText("Month");
  await userEvent.clear(input);
  await userEvent.type(input, value);
}

describe("CalendarPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("draws the account's period, not the calendar month", async () => {
    mockApi({ startDay: 26 });
    render(<CalendarPage />);

    await setMonth("2026-09");

    // 26 August is inside the period labelled September for this account, and 25 August is
    // not. Both are on the grid; only the first is a day of this period.
    await waitFor(() => {
      expect(screen.getByRole("gridcell", { name: /^2026-08-26/ })).toBeInTheDocument();
    });
    expect(screen.getByRole("gridcell", { name: /^2026-08-25.*outside this period/ }))
      .toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: /^2026-09-25/ }).className).not.toContain(
      "outside",
    );
    expect(screen.getByRole("gridcell", { name: /^2026-09-26.*outside this period/ }))
      .toBeInTheDocument();
    // Spelled out, so nobody has to infer what "September" covers.
    expect(screen.getByText("26 Aug – 25 Sep")).toBeInTheDocument();
  });

  it("is the plain calendar month for an account that never moved the boundary", async () => {
    mockApi({ startDay: 1 });
    render(<CalendarPage />);

    await setMonth("2026-09");

    await waitFor(() => {
      expect(screen.getByRole("gridcell", { name: /^2026-09-01/ }).className).not.toContain(
        "outside",
      );
    });
    expect(screen.getByRole("gridcell", { name: /^2026-08-31.*outside/ })).toBeInTheDocument();
  });

  it("asks every module for the same window", async () => {
    const { seen } = mockApi({ startDay: 26 });
    render(<CalendarPage />);
    await setMonth("2026-09");

    await waitFor(() => {
      expect(seen.some((url) => url.includes("/api/entries?month=2026-09"))).toBe(true);
    });
    for (const path of [
      "/api/savings/contributions?month=2026-09",
      "/api/inventory/changes?month=2026-09",
      "/api/habits/checkins?month=2026-09",
      "/api/recurring/expected?month=2026-09",
      "/api/meals?month=2026-09",
    ]) {
      expect(seen.some((url) => url.includes(path))).toBe(true);
    }
  });

  it("draws the day's meals and adds up what they came to", async () => {
    mockApi({ startDay: 26 });
    render(<CalendarPage />);
    await setMonth("2026-09");

    await userEvent.click(await screen.findByRole("gridcell", { name: /^2026-09-02/ }));
    const card = (await screen.findByText("Wed 2 September")).closest("section") as HTMLElement;

    // A recipe reads as a portion of itself; a bare food reads as a quantity in its unit.
    expect(within(card).getByRole("link", { name: "Rice and eggs" })).toBeInTheDocument();
    expect(within(card).getByText("× 0.5")).toBeInTheDocument();
    expect(within(card).getByText("150 g")).toBeInTheDocument();

    // 123.5 + 195 = 318.5, rounded to a whole calorie. Summed here, exactly as the money
    // line is summed, because each meal already carries its own derived figure.
    expect(within(card).getByText("319 kcal eaten")).toBeInTheDocument();
  });

  it("shows a day's records, and says a forecast is a forecast", async () => {
    mockApi({ startDay: 26 });
    render(<CalendarPage />);
    await setMonth("2026-09");

    const day = await screen.findByRole("gridcell", { name: /^2026-09-02/ });
    await userEvent.click(day);

    const panel = await screen.findByText("Wed 2 September");
    const card = panel.closest("section") as HTMLElement;
    expect(within(card).getByText("Fuel")).toBeInTheDocument();
    expect(within(card).getByText("$40.00")).toBeInTheDocument();
    expect(within(card).getByText(/Milk/)).toBeInTheDocument();
    expect(within(card).getByText("Run")).toBeInTheDocument();

    // The 20th carries a projected charge. It must read as something that has not happened.
    // Scoped to the day panel: since the wide layout also prints the day's labels inside the
    // cell, an unscoped getByText("Rent") now matches the grid as well as the panel.
    await userEvent.click(screen.getByRole("gridcell", { name: /^2026-09-20/ }));
    const forecastCard = (await screen.findByText("Sun 20 September")).closest(
      "section",
    ) as HTMLElement;
    const forecast = within(forecastCard).getByText("Rent").closest("li") as HTMLElement;
    expect(within(forecast).getByText("expected")).toBeInTheDocument();
    expect(forecast.textContent).toContain("will be proposed");
    expect(within(forecast).queryByRole("button")).toBeNull();
  });

  it("keeps the rest of the month when one module fails", async () => {
    mockApi({ startDay: 26, failStock: true });
    render(<CalendarPage />);
    await setMonth("2026-09");

    await waitFor(() => {
      expect(screen.getByText(/could not be loaded: Stock/)).toBeInTheDocument();
    });
    await userEvent.click(await screen.findByRole("gridcell", { name: /^2026-09-02/ }));
    const card = (await screen.findByText("Wed 2 September")).closest("section") as HTMLElement;
    expect(within(card).getByText("Fuel")).toBeInTheDocument();
    expect(within(card).queryByText(/Milk/)).toBeNull();
  });

  it("turning a layer off hides it and is remembered", async () => {
    mockApi({ startDay: 26 });
    const { unmount } = render(<CalendarPage />);
    await setMonth("2026-09");

    await userEvent.click(await screen.findByRole("button", { name: /Habits/ }));
    await userEvent.click(await screen.findByRole("gridcell", { name: /^2026-09-02/ }));
    let card = (await screen.findByText("Wed 2 September")).closest("section") as HTMLElement;
    expect(within(card).queryByText("Run")).toBeNull();
    expect(within(card).getByText("Fuel")).toBeInTheDocument();

    unmount();
    render(<CalendarPage />);
    await setMonth("2026-09");
    await userEvent.click(await screen.findByRole("gridcell", { name: /^2026-09-02/ }));
    card = (await screen.findByText("Wed 2 September")).closest("section") as HTMLElement;
    expect(within(card).queryByText("Run")).toBeNull();
  });

  it("a day outside the period moves to the period it belongs to", async () => {
    mockApi({ startDay: 26 });
    render(<CalendarPage />);
    await setMonth("2026-09");

    await userEvent.click(
      await screen.findByRole("gridcell", { name: /^2026-08-25.*outside this period/ }),
    );
    // 25 August belongs to the period labelled August for this account.
    await waitFor(() => {
      expect(screen.getByLabelText("Month")).toHaveValue("2026-08");
    });
  });
});
