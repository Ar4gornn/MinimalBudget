import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecipesPage } from "./RecipesPage";
import { AuthProvider } from "../auth/AuthContext";
import { ToastProvider } from "../components/Toast";

/**
 * The recipe book and its foods (Epic 27, story 27.1).
 *
 * The one behaviour here that is easy to get wrong and hard to notice: an **empty nutrient
 * box must not be sent as zero**. Zero is a claim that the food contains none of that
 * nutrient, and once stored it is indistinguishable from a figure somebody typed — every
 * total built on it is then quietly too low, with nothing to say so.
 */

function render() {
  return rtlRender(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <RecipesPage />
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

const blank = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

const recipes = [
  {
    id: "r1",
    name: "Rice and eggs",
    servings: 2,
    note: null,
    ingredient_count: 2,
    step_count: 1,
    total: { kcal: "494.0000", protein: "24.3000", carbs: "56.0000", fat: null, unknown: blank },
    per_serving: {
      kcal: "247.0000",
      protein: "12.1500",
      carbs: "28.0000",
      fat: null,
      unknown: blank,
    },
  },
  {
    id: "r2",
    name: "Mystery stew",
    servings: 4,
    note: null,
    ingredient_count: 1,
    step_count: 0,
    // Nothing in it carried a calorie figure.
    total: { kcal: null, protein: null, carbs: null, fat: null, unknown: { ...blank, kcal: 1 } },
    per_serving: {
      kcal: null,
      protein: null,
      carbs: null,
      fat: null,
      unknown: { ...blank, kcal: 1 },
    },
  },
];

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
    nutrition: { kcal: "123.5000", protein: null, carbs: null, fat: null, unknown: blank },
  },
];

const foods = [
  {
    id: "f1",
    name: "Rice",
    basis: "per_100g",
    unit: "g",
    kcal: "130.00",
    protein: "2.70",
    carbs: null,
    fat: null,
  },
];

function mockApi(pantry = foods) {
  window.localStorage.setItem("minimalbudget.token", "test-token");
  const calls: { url: string; method: string; body: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: String(init?.body ?? "") });
    if (url.includes("/api/auth/me")) return json(me);
    if (url.includes("/api/foods") && method === "POST") return json({ id: "f9" }, 201);
    if (url.includes("/api/foods/")) return json(pantry[0]);
    if (url.includes("/api/foods")) return json({ items: pantry });
    if (url.includes("/api/meals")) return json({ items: meals });
    if (url.includes("/api/recipes") && method === "POST") return json(recipes[0], 201);
    if (url.includes("/api/recipes")) return json({ items: recipes });
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

describe("RecipesPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("lists each recipe with the per-serving figure the server derived", async () => {
    mockApi();
    render();

    expect(await screen.findByRole("link", { name: "Open Rice and eggs" })).toBeInTheDocument();
    expect(screen.getByText("247 kcal")).toBeInTheDocument();
    expect(screen.getByText("2 servings")).toBeInTheDocument();
  });

  it("says a recipe's calories are not known rather than showing nothing or a zero", async () => {
    mockApi();
    render();

    await screen.findByRole("link", { name: "Open Mystery stew" });
    expect(screen.getByText("not known")).toBeInTheDocument();
  });

  it("omits an empty nutrient box rather than sending it as zero", async () => {
    const { calls } = mockApi([]);
    render();
    await screen.findByRole("link", { name: "Open Rice and eggs" });

    await userEvent.type(screen.getByLabelText("Food name"), "Rice");
    await userEvent.type(screen.getByLabelText("Calories"), "130");
    // Protein, carbs and fat are left blank on purpose.
    await userEvent.click(screen.getByRole("button", { name: "Add food" }));

    await waitFor(() => {
      const post = calls.find((call) => call.url.includes("/api/foods") && call.method === "POST");
      const body = JSON.parse(post?.body ?? "{}") as Record<string, unknown>;
      expect(body).toEqual({ name: "Rice", basis: "per_100g", kcal: "130" });
      expect("protein" in body).toBe(false);
    });
  });

  it("offers the three bases, not the ledger's units", async () => {
    mockApi([]);
    render();
    await screen.findByRole("link", { name: "Open Rice and eggs" });

    // `kg` and `l` belong to AD-29's entry units and are a different vocabulary; offering
    // them here would be the first step toward one shared list and a split price series.
    const options = Array.from(
      (screen.getByLabelText("Measured") as HTMLSelectElement).options,
    ).map((option) => option.textContent);
    expect(options).toEqual(["per 100 g", "per 100 ml", "each"]);
  });
  it("can take back a recorded meal, which is otherwise permanent", async () => {
    // The calendar shows meals and is deliberately a window; the recipe page records one
    // without listing it. Without this card a mis-tap would have no undo anywhere.
    const { calls } = mockApi();
    render();

    // Scoped to the card: the recipe's name is also a link in the list above, so an
    // unscoped match finds two.
    const card = (await screen.findByText("Recently eaten")).closest("section") as HTMLElement;
    expect(within(card).getByText(/Rice and eggs/)).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Remove this meal" }));

    await waitFor(() => {
      const gone = calls.find((call) => call.method === "DELETE" && call.url.includes("/api/meals/m1"));
      expect(gone).toBeTruthy();
    });
  });

  it("sends a cleared nutrient as an explicit null when editing, not as an omission", async () => {
    // An omitted key leaves the stored figure where it was, so a wrong number typed off the
    // wrong packet could never be removed — only replaced.
    const { calls } = mockApi();
    render();
    await screen.findByRole("link", { name: "Open Rice and eggs" });

    await userEvent.click(screen.getByRole("button", { name: "Edit Rice" }));
    // Scoped to the row being edited: the add-food form below carries the same four labels.
    const row = screen.getByRole("button", { name: "Save" }).closest("tr") as HTMLElement;
    await userEvent.clear(within(row).getByLabelText("Protein"));
    await userEvent.click(within(row).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const patch = calls.find((call) => call.method === "PATCH" && call.url.includes("/api/foods/f1"));
      const body = JSON.parse(patch?.body ?? "{}") as Record<string, unknown>;
      expect(body["protein"]).toBeNull();
      expect(body["kcal"]).toBe("130.00");
      expect(body["basis"]).toBe("per_100g");
    });
  });
});
