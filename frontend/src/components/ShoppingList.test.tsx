import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShoppingList } from "./ShoppingList";
import { ToastProvider } from "./Toast";
import type { ShoppingList as List } from "../api/types";

function render(ui: React.ReactElement) {
  return rtlRender(<ToastProvider>{ui}</ToastProvider>);
}

const list: List = {
  items: [
    {
      item_id: "milk",
      name: "Milk",
      space_id: "fridge",
      space_name: "Fridge",
      quantity: 0,
      restock_below: 2,
      unit_cost: "1.20",
      suggested: 3,
      estimate: "3.60",
    },
    {
      item_id: "batteries",
      name: "Batteries",
      space_id: "house",
      space_name: "House stuff",
      quantity: 0,
      restock_below: 1,
      unit_cost: null,
      suggested: 2,
      estimate: null,
    },
  ],
  estimate: "3.60",
  without_cost: 1,
};

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockApi(overrides: { list?: List } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/shopping-list")) return json(overrides.list ?? list);
    if (url.includes("/purchase")) {
      return json({ item: { id: "milk", quantity: 3 }, purchase: { id: "p1" } });
    }
    if (url.includes("/api/categories")) {
      return json({ items: [{ id: "c1", kind: "expense", name: "Groceries", created_at: "" }] });
    }
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function purchases(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls
    .filter(([url]) => String(url).includes("/purchase"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

describe("ShoppingList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("prefills the suggested quantity and the estimated cost", async () => {
    mockApi();
    render(<ShoppingList />);

    await screen.findByRole("table", { name: "Shopping list" });
    expect(screen.getByLabelText("How many Milk")).toHaveValue("3");
    expect(screen.getByLabelText("What Milk cost")).toHaveValue("3.60");
    // No recorded cost: the field is empty rather than showing a made-up zero.
    expect(screen.getByLabelText("What Batteries cost")).toHaveValue("");
  });

  it("says what the estimate leaves out", async () => {
    mockApi();
    render(<ShoppingList />);
    expect(
      await screen.findByText(/not counting 1 item with no recorded cost/),
    ).toBeInTheDocument();
  });

  it("records the restock and the expense in one request", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<ShoppingList />);
    await screen.findByRole("table", { name: "Shopping list" });

    await user.type(screen.getByLabelText("File spending under"), "Groceries");
    await user.click(screen.getByRole("button", { name: "Bought Milk" }));

    await waitFor(() => {
      expect(purchases(fetchMock)).toHaveLength(1);
      expect(purchases(fetchMock)[0]).toMatchObject({
        quantity: 3,
        amount: "3.60",
        category_name: "Groceries",
      });
    });
  });

  it("restocks without an entry when the cost is left blank", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<ShoppingList />);
    await screen.findByRole("table", { name: "Shopping list" });

    await user.click(screen.getByRole("button", { name: "Bought Batteries" }));

    await waitFor(() => {
      const [body] = purchases(fetchMock);
      expect(body).toBeDefined();
      expect(body.quantity).toBe(2);
      // No amount, so no category and no expense: a free restock is still a restock.
      expect(body.amount).toBeUndefined();
      expect(body.category_name).toBeUndefined();
    });
  });

  it("refuses an amount with no category before it reaches the server", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<ShoppingList />);
    await screen.findByRole("table", { name: "Shopping list" });

    await user.click(screen.getByRole("button", { name: "Bought Milk" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("needs a category");
    expect(purchases(fetchMock)).toHaveLength(0);
  });

  it("refuses a quantity that is not a whole number of at least one", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<ShoppingList />);
    await screen.findByRole("table", { name: "Shopping list" });

    const field = screen.getByLabelText("How many Milk");
    await user.clear(field);
    await user.type(field, "0");
    await user.click(screen.getByRole("button", { name: "Bought Milk" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("at least one");
    expect(purchases(fetchMock)).toHaveLength(0);
  });

  it("remembers the category between shops, per device", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    const { unmount } = render(<ShoppingList />);
    await screen.findByRole("table", { name: "Shopping list" });

    await user.type(screen.getByLabelText("File spending under"), "Groceries");
    await user.click(screen.getByRole("button", { name: "Bought Milk" }));
    await waitFor(() => expect(purchases(fetchMock)).toHaveLength(1));
    unmount();

    render(<ShoppingList />);
    await screen.findByRole("table", { name: "Shopping list" });
    expect(screen.getByLabelText("File spending under")).toHaveValue("Groceries");
  });

  it("renders nothing at all when there is nothing to buy", async () => {
    mockApi({ list: { items: [], estimate: "0.00", without_cost: 0 } });
    render(<ShoppingList />);
    await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
    expect(screen.queryByText(/estimated/)).toBeNull();
  });

  it("renders nothing rather than crashing on a payload it does not recognise", async () => {
    // This card sits above the shelves on the Stock page: a malformed response must not
    // take the whole page down. It did, before the shape check.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        json(url.includes("/shopping-list") ? { items: [{ name: "Milk" }] } : { items: [] }),
      ),
    );
    render(<ShoppingList />);
    await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
  });
});
