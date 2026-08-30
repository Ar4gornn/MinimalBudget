import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntriesPage } from "./EntriesPage";

// The page links to category detail and reads ?add=1, so it needs a router.
function render(ui: React.ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

const categories = [
  { id: "c1", kind: "expense" as const, name: "Rent", created_at: "" },
  { id: "c2", kind: "income" as const, name: "Salary", created_at: "" },
];

const entries = [
  {
    id: "e1",
    kind: "expense" as const,
    category_id: "c1",
    amount: "800.00",
    occurred_on: "2026-08-01",
    note: "August rent",
    created_at: "",
  },
];

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockApi() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/categories")) return json({ items: categories });
    if (url.includes("/api/entries") && init?.method === "POST") {
      return json({ ...entries[0], id: "e2" }, 201);
    }
    if (url.includes("/api/entries") && init?.method === "DELETE") return json(null, 204);
    return json({ items: entries });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("EntriesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists entries with the category name rather than its id", async () => {
    mockApi();
    render(<EntriesPage />);

    const table = await screen.findByRole("table", { name: "Entries" });
    // Scoped to the table: "Rent" also appears in the category filter dropdown.
    expect(within(table).getByText("Rent")).toBeInTheDocument();
    expect(within(table).getByText("800.00")).toBeInTheDocument();
    expect(within(table).getByText("August rent")).toBeInTheDocument();
  });

  it("posts category_name so a new category is created as you type it", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<EntriesPage />);
    await screen.findByRole("table", { name: "Entries" });

    // Scoped to the form: the filter row has a "Category" control too.
    const form = screen.getByRole("form", { name: "Record an entry" });
    await user.type(within(form).getByLabelText("Amount"), "45.50");
    await user.type(within(form).getByLabelText("Category"), "Taxi");
    await user.click(within(form).getByRole("button", { name: "Add" }));

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(posted).toBeDefined();
      const body = JSON.parse(String(posted?.[1]?.body));
      // AD-12: exactly one of the two category fields.
      expect(body.category_name).toBe("Taxi");
      expect(body.category_id).toBeUndefined();
      expect(body.amount).toBe("45.50");
    });
  });

  it("refuses an amount with three decimal places before it reaches the server", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<EntriesPage />);
    await screen.findByRole("table", { name: "Entries" });

    const form = screen.getByRole("form", { name: "Record an entry" });
    await user.type(within(form).getByLabelText("Amount"), "10.001");
    await user.type(within(form).getByLabelText("Category"), "Taxi");
    await user.click(within(form).getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("two decimal places");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("shows the server's explanation when a delete is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/categories")) return json({ items: categories });
        if (init?.method === "DELETE") return json({ detail: "That category still has entries" }, 409);
        return json({ items: entries });
      }),
    );
    const user = userEvent.setup();
    render(<EntriesPage />);
    await screen.findByRole("table", { name: "Entries" });

    await user.click(screen.getByRole("button", { name: /Delete entry/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That category still has entries");
  });
});
