import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecipePage } from "./RecipePage";
import { AuthProvider } from "../auth/AuthContext";
import { ToastProvider } from "../components/Toast";

/**
 * One recipe (Epic 27, stories 27.1 and 27.2).
 *
 * The behaviour worth protecting is that **the page never computes a nutrition figure**.
 * Every total, per-serving figure and per-line share arrives derived, so the screen and the
 * calendar cannot disagree about what a meal was (AD-30). The fixture below deliberately
 * returns a total that is *not* the sum of its lines, which is the only way to tell a page
 * that renders the server's answer from one that quietly re-adds the numbers itself.
 */

function renderPage() {
  return rtlRender(
    <MemoryRouter initialEntries={["/recipes/r1"]}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/recipes/:recipeId" element={<RecipePage />} />
            <Route path="/recipes" element={<p>the book</p>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
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
  budget_start_day: 1,
  created_at: "",
};

const nutrition = (
  kcal: string | null,
  protein: string | null,
  carbs: string | null,
  fat: string | null,
  unknown = { kcal: 0, protein: 0, carbs: 0, fat: 0 },
) => ({ kcal, protein, carbs, fat, unknown });

const foods = [
  {
    id: "f1",
    name: "Rice",
    basis: "per_100g",
    unit: "g",
    kcal: "130.00",
    protein: "2.70",
    carbs: "28.00",
    fat: null,
  },
  {
    id: "f2",
    name: "Egg",
    basis: "per_unit",
    unit: "unit",
    kcal: "78.00",
    protein: "6.30",
    carbs: null,
    fat: null,
  },
];

/**
 * `total.kcal` is 999, which is **not** 260 + 234.
 *
 * A deliberate lie from the fake server, and the point of the fixture: a page that renders
 * what it was told shows 999, and a page that re-adds the lines shows 494. Only one of
 * those can be told apart from the other.
 */
const detail = {
  id: "r1",
  name: "Rice and eggs",
  servings: 2,
  note: null,
  ingredient_count: 2,
  step_count: 2,
  total: nutrition("999.0000", "24.3000", "56.0000", null, {
    kcal: 0,
    protein: 0,
    carbs: 1,
    fat: 2,
  }),
  per_serving: nutrition("499.5000", "12.1500", "28.0000", null, {
    kcal: 0,
    protein: 0,
    carbs: 1,
    fat: 2,
  }),
  ingredients: [
    {
      id: "i1",
      food_id: "f1",
      food_name: "Rice",
      basis: "per_100g",
      quantity: "200.000",
      unit: "g",
      position: 1,
      nutrition: nutrition("260.0000", "5.4000", "56.0000", null, {
        kcal: 0,
        protein: 0,
        carbs: 0,
        fat: 1,
      }),
    },
    {
      id: "i2",
      food_id: "f2",
      food_name: "Egg",
      basis: "per_unit",
      quantity: "3.000",
      unit: "unit",
      position: 2,
      nutrition: nutrition("234.0000", "18.9000", null, null, {
        kcal: 0,
        protein: 0,
        carbs: 1,
        fat: 1,
      }),
    },
  ],
  steps: [
    { id: "s1", position: 1, text: "Boil the water" },
    { id: "s2", position: 2, text: "Add the rice" },
  ],
};

function mockApi() {
  window.localStorage.setItem("minimalbudget.token", "test-token");
  const calls: { url: string; method: string; body: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: String(init?.body ?? "") });
    if (url.includes("/api/auth/me")) return json(me);
    if (url.includes("/api/foods")) return json({ items: foods });
    if (url.includes("/api/meals")) return json({ id: "m1" }, 201);
    if (url.includes("/steps/order")) return json({ items: detail.steps });
    if (url.includes("/ingredients")) return json(detail);
    if (url.includes("/api/recipes/r1")) return json(detail);
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

describe("RecipePage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the figures the server derived, not ones it worked out itself", async () => {
    mockApi();
    renderPage();

    // 999, the number the server sent — not 494, the sum of the two lines below it.
    expect(await screen.findByText("999 kcal")).toBeInTheDocument();
    // 499.5 rounds to 500: calories are shown whole, rounded half-up.
    expect(screen.getByText("500 kcal")).toBeInTheDocument();
    expect(screen.getByText("260 kcal", { exact: false })).toBeInTheDocument();
  });

  it("says a nutrient is not known rather than showing a zero", async () => {
    mockApi();
    renderPage();

    await screen.findByText("999 kcal");
    // Fat: nothing here carried a figure, so there is no number — and the count says how
    // many ingredients that was.
    expect(screen.getAllByText("not known").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("2 ingredients have no figure for this").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("1 ingredient has no figure for this").length).toBeGreaterThan(0);
  });

  it("writes a quantity in the unit the chosen food is measured in", async () => {
    mockApi();
    renderPage();
    await screen.findByText("999 kcal");

    // Rice is per 100 g, so the box asks for grams.
    expect(screen.getByLabelText("Quantity in g")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Food"), "f2");
    // An egg is counted, so it asks for a count — the unit is never a choice the person
    // makes, because the server would refuse a disagreement anyway.
    expect(screen.getByLabelText("Quantity in unit")).toBeInTheDocument();
  });

  it("shows an ingredient's quantity in an editable box, with its unit beside it", async () => {
    mockApi();
    renderPage();
    await screen.findByText("999 kcal");

    // The quantity is editable in place: correcting it is what moves the totals, and a
    // line you can only delete and retype loses why it was there. The unit is *not* a
    // field — it is obliged by the food's basis — so it sits beside the box as text, and a
    // count has none at all because the food's name is the noun.
    const list = screen.getByText("Ingredients").closest("section") as HTMLElement;
    expect((within(list).getByLabelText("Quantity of Rice") as HTMLInputElement).value).toBe("200");
    expect(within(list).getByText(/g\s*Rice/)).toBeInTheDocument();
    expect((within(list).getByLabelText("Quantity of Egg") as HTMLInputElement).value).toBe("3");
  });

  it("sends a corrected quantity and takes the recipe back from the server", async () => {
    const { calls } = mockApi();
    renderPage();
    await screen.findByText("999 kcal");

    const box = screen.getByLabelText("Quantity of Rice");
    await userEvent.clear(box);
    await userEvent.type(box, "100");
    await userEvent.tab();

    await waitFor(() => {
      const patch = calls.find((call) => call.url.includes("/ingredients/i1"));
      expect(patch?.method).toBe("PATCH");
      expect(JSON.parse(patch?.body ?? "{}")).toEqual({ quantity: "100" });
    });
  });

  it("changes the serving count without touching an ingredient", async () => {
    const { calls } = mockApi();
    renderPage();
    await screen.findByText("999 kcal");

    // AD-40: a serving count re-judges the same pot. Every figure over it moves; no row does.
    //
    // Cleared, retyped, then blurred. Written the obvious way first — a controlled input
    // and an onChange — and clearing it was impossible: React rewrote the value on every
    // keystroke, so emptying the box and typing 4 sent `servings: 24`.
    await userEvent.clear(screen.getByLabelText("Servings"));
    await userEvent.type(screen.getByLabelText("Servings"), "4");
    await userEvent.tab();

    await waitFor(() => {
      const patch = calls.find(
        (call) => call.method === "PATCH" && call.url.endsWith("/api/recipes/r1"),
      );
      expect(JSON.parse(patch?.body ?? "{}")).toEqual({ servings: 4 });
    });
  });

  it("sends the whole new order when a step is moved", async () => {
    const { calls } = mockApi();
    renderPage();
    await screen.findByText("999 kcal");

    await userEvent.click(screen.getByRole("button", { name: "Move step 1 down" }));

    await waitFor(() => {
      const reorder = calls.find((call) => call.url.includes("/steps/order"));
      expect(reorder?.method).toBe("PUT");
      // Every step, once each — a partial list is what the server refuses.
      expect(JSON.parse(reorder?.body ?? "{}")).toEqual({ ids: ["s2", "s1"] });
    });
  });

  it("records that the recipe was eaten, in servings", async () => {
    const { calls } = mockApi();
    renderPage();
    await screen.findByText("999 kcal");

    await userEvent.clear(screen.getByLabelText("How many servings"));
    await userEvent.type(screen.getByLabelText("How many servings"), "0.5");
    await userEvent.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() => {
      const meal = calls.find((call) => call.url.includes("/api/meals") && call.method === "POST");
      const body = JSON.parse(meal?.body ?? "{}") as Record<string, unknown>;
      expect(body["recipe_id"]).toBe("r1");
      expect(body["servings"]).toBe("0.5");
      // A recipe is eaten in servings; a quantity would be refused as a shape mismatch.
      expect(body["quantity"]).toBeUndefined();
    });
  });

  it("cannot record a meal in the future", async () => {
    mockApi();
    renderPage();
    await screen.findByText("999 kcal");

    // A record describes what happened. The server refuses tomorrow with `meal_in_future`;
    // the input says so before the round trip rather than only after it.
    const day = screen.getByLabelText("Day") as HTMLInputElement;
    // Built from the local parts, not `toISOString`. Written the obvious way first, and it
    // failed here: this machine is an hour ahead of UTC, so at 00:53 local `toISOString`
    // still says yesterday — and the box would refuse today as "the future".
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    expect(day.max).toBe(local);
  });
});
