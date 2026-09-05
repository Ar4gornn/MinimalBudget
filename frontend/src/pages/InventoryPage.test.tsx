import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InventoryPage } from "./InventoryPage";
import type { InventoryItem, Space } from "../api/types";

function render(ui: React.ReactElement, path = "/inventory") {
  return rtlRender(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

const spaces: Space[] = [
  { id: "fridge", name: "Fridge", created_at: "" },
  { id: "garage", name: "Garage", created_at: "" },
];

const item = (overrides: Partial<InventoryItem>): InventoryItem => ({
  id: "i",
  space_id: "fridge",
  name: "Milk",
  quantity: 2,
  restock_below: null,
  cost: null,
  note: null,
  needs_restock: false,
  restocked_at: null,
  created_at: "",
  updated_at: "",
  ...overrides,
});

const items: InventoryItem[] = [
  item({ id: "milk", name: "Milk", quantity: 0, restock_below: 1, needs_restock: true }),
  item({ id: "eggs", name: "Eggs", quantity: 6, restock_below: 2, cost: "3.20" }),
  item({ id: "oil", name: "Engine oil", space_id: "garage", quantity: 1, note: "5W-30" }),
];

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockApi() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/inventory/spaces") && init?.method === "DELETE") {
      return json({ detail: "That space still has items" }, 409);
    }
    if (url.includes("/api/inventory/spaces")) return json({ items: spaces });
    if (url.includes("/api/inventory/restocks")) {
      return json({
        months: ["2026-08", "2026-09"],
        series: [{ space_id: "fridge", space_name: "Fridge", values: [1, 2] }],
      });
    }
    if (url.includes("/history")) {
      return json({
        items: [
          { quantity_before: 0, quantity_after: 2, changed_at: "2026-09-01T10:00:00Z" },
          { quantity_before: 2, quantity_after: 0, changed_at: "2026-09-04T10:00:00Z" },
        ],
      });
    }
    if (url.includes("/api/inventory/items") && init?.method === "POST") {
      return json(item({ id: "new", ...JSON.parse(String(init.body)) }), 201);
    }
    if (url.includes("/api/inventory/items") && init?.method === "PATCH") {
      return json(item(JSON.parse(String(init.body))));
    }
    if (url.includes("/api/inventory/items") && init?.method === "DELETE") return json(null, 204);
    return json({ items });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function patches(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) }));
}

describe("InventoryPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows every space on one page, grouped, with low items badged", async () => {
    mockApi();
    render(<InventoryPage />);

    const fridge = await screen.findByRole("table", { name: "Fridge items" });
    const garage = screen.getByRole("table", { name: "Garage items" });
    expect(within(fridge).getByText("Milk")).toBeInTheDocument();
    expect(within(fridge).getByText("Eggs")).toBeInTheDocument();
    expect(within(garage).getByText("Engine oil")).toBeInTheDocument();
    expect(within(garage).getByText("5W-30")).toBeInTheDocument();
    // The badge comes from the server's flag, not a client-side recomputation.
    expect(within(fridge).getAllByText("restock")).toHaveLength(1);
  });

  it("filters to what needs restocking, and arrives filtered from the dashboard link", async () => {
    mockApi();
    render(<InventoryPage />, "/inventory?filter=restock");

    const fridge = await screen.findByRole("table", { name: "Fridge items" });
    expect(within(fridge).getByText("Milk")).toBeInTheDocument();
    expect(within(fridge).queryByText("Eggs")).toBeNull();
    expect(screen.queryByRole("table", { name: "Garage items" })).toBeNull();
    expect(screen.getByRole("button", { name: /Needs restocking · 1/ })).toBeInTheDocument();
  });

  it("changes a quantity with the stepper as an absolute PATCH", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<InventoryPage />);
    await screen.findByRole("table", { name: "Fridge items" });

    await user.click(screen.getByRole("button", { name: "One more Eggs" }));
    await waitFor(() => expect(patches(fetchMock)).toEqual([{ url: expect.stringContaining("/items/eggs"), body: { quantity: 7 } }]));
  });

  it("will not step below zero", async () => {
    mockApi();
    render(<InventoryPage />);
    await screen.findByRole("table", { name: "Fridge items" });
    expect(screen.getByRole("button", { name: "One less Milk" })).toBeDisabled();
  });

  it("marks an item as running low by setting the threshold pair in one PATCH", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<InventoryPage />);
    await screen.findByRole("table", { name: "Garage items" });

    // Engine oil has no threshold: running low means "threshold 1, quantity 0".
    await user.click(screen.getByRole("button", { name: "Engine oil is running low" }));
    await waitFor(() =>
      expect(patches(fetchMock)[0]).toEqual({
        url: expect.stringContaining("/items/oil"),
        body: { restock_below: 1, quantity: 0 },
      }),
    );
  });

  it("creates an item into a space by name", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<InventoryPage />);
    await screen.findByRole("table", { name: "Fridge items" });

    const form = screen.getByRole("form", { name: "Add an item" });
    await user.type(within(form).getByLabelText("Name"), "Batteries");
    await user.clear(within(form).getByLabelText("Quantity"));
    await user.type(within(form).getByLabelText("Quantity"), "8");
    await user.type(within(form).getByLabelText("Space"), "House stuff");
    await user.type(within(form).getByLabelText("Restock threshold"), "2");
    await user.click(within(form).getByRole("button", { name: "Add" }));

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      const body = JSON.parse(String(posted?.[1]?.body));
      expect(body).toEqual({ name: "Batteries", quantity: 8, space_name: "House stuff", restock_below: 2 });
    });
  });

  it("shows the server's explanation when a space delete is refused", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<InventoryPage />);
    await screen.findByRole("table", { name: "Fridge items" });

    await user.click(screen.getByRole("button", { name: "Delete Fridge" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That space still has items");
  });

  it("unfolds an item's history as an inline SVG step chart", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<InventoryPage />);
    await screen.findByRole("table", { name: "Fridge items" });

    await user.click(screen.getByRole("button", { name: "History of Milk" }));
    expect(await screen.findByRole("img", { name: "Milk quantity over time" })).toBeInTheDocument();
  });

  it("draws restocks per space per month", async () => {
    mockApi();
    render(<InventoryPage />);
    expect(await screen.findByRole("img", { name: "Fridge restocks per month" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Restocks per space" });
    expect(within(table).getByText("3")).toBeInTheDocument();
  });

  it("explains what a space is when there are none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/restocks")) return json({ months: [], series: [] });
        return json({ items: [] });
      }),
    );
    render(<InventoryPage />);
    expect(await screen.findByText(/A space is anywhere you keep things/)).toBeInTheDocument();
  });
});
