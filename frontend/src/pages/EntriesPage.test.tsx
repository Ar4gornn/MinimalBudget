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
    if (url.includes("/api/entries") && init?.method === "PATCH") {
      return json({ ...entries[0], ...JSON.parse(String(init.body)) });
    }
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


describe("editing an entry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function patchesFrom(mock: ReturnType<typeof vi.fn>) {
    return mock.mock.calls
      .filter(([, init]) => init?.method === "PATCH")
      .map(([, init]) => JSON.parse(String(init?.body)));
  }

  it("sends only the fields that changed", async () => {
    // PATCH means "these fields". Sending the untouched ones would write a stale copy over
    // anything changed elsewhere since this list loaded.
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<EntriesPage />);
    await screen.findByRole("table", { name: "Entries" });

    await user.click(screen.getByRole("button", { name: /Edit entry/ }));
    const amount = screen.getByLabelText("Edit amount");
    await user.clear(amount);
    await user.type(amount, "925.00");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchesFrom(fetchMock)).toHaveLength(1));
    expect(patchesFrom(fetchMock)[0]).toEqual({ amount: "925.00" });
  });

  it("clears a note to null rather than an empty string", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<EntriesPage />);
    await screen.findByRole("table", { name: "Entries" });

    await user.click(screen.getByRole("button", { name: /Edit entry/ }));
    await user.clear(screen.getByLabelText("Edit note"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchesFrom(fetchMock)).toHaveLength(1));
    expect(patchesFrom(fetchMock)[0]).toEqual({ note: null });
  });

  it("sends nothing at all when nothing was touched", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<EntriesPage />);
    await screen.findByRole("table", { name: "Entries" });

    await user.click(screen.getByRole("button", { name: /Edit entry/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByLabelText("Edit amount")).toBeNull());
    expect(patchesFrom(fetchMock)).toHaveLength(0);
  });

  it("refuses an invalid amount before it reaches the server", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<EntriesPage />);
    await screen.findByRole("table", { name: "Entries" });

    await user.click(screen.getByRole("button", { name: /Edit entry/ }));
    const amount = screen.getByLabelText("Edit amount");
    await user.clear(amount);
    await user.type(amount, "0");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("greater than zero");
    expect(patchesFrom(fetchMock)).toHaveLength(0);
    // Still editing, so the typed value is not lost.
    expect(screen.getByLabelText("Edit amount")).toBeInTheDocument();
  });

  it("does not offer kind as editable", async () => {
    // Kind is bound to the category by one foreign key (AD-7), so changing it would have
    // to move the entry too. The API refuses it and the form must not imply otherwise.
    mockApi();
    const user = userEvent.setup();
    render(<EntriesPage />);
    await screen.findByRole("table", { name: "Entries" });

    await user.click(screen.getByRole("button", { name: /Edit entry/ }));
    expect(screen.queryByLabelText("Edit kind")).toBeNull();
  });

  it("offers only categories of the entry's own kind", async () => {
    // The fixture has one expense category and one income category; an expense entry must
    // not be offered the income one, which the database would refuse anyway.
    mockApi();
    const user = userEvent.setup();
    render(<EntriesPage />);
    await screen.findByRole("table", { name: "Entries" });

    await user.click(screen.getByRole("button", { name: /Edit entry/ }));
    const options = [...screen.getByLabelText("Edit category").querySelectorAll("option")].map(
      (option) => option.textContent,
    );
    expect(options).toEqual(["Rent"]);
  });

  it("abandons the change on cancel", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<EntriesPage />);
    await screen.findByRole("table", { name: "Entries" });

    await user.click(screen.getByRole("button", { name: /Edit entry/ }));
    await user.clear(screen.getByLabelText("Edit amount"));
    await user.type(screen.getByLabelText("Edit amount"), "1.00");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Edit amount")).toBeNull();
    expect(patchesFrom(fetchMock)).toHaveLength(0);
  });
});
