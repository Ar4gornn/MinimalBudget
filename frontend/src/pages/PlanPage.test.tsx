import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlanPage } from "./PlanPage";
import { AuthProvider } from "../auth/AuthContext";

// PlanPage changes the account currency, so it reads the auth context. Rendering it inside
// a real provider rather than stubbing the hook keeps the test honest about that wiring.
function render(ui: React.ReactElement) {
  return rtlRender(<AuthProvider>{ui}</AuthProvider>);
}

const savingsTypes = [{ id: "st1", name: "Emergency Fund", created_at: "" }];
const categories = [{ id: "c1", kind: "expense" as const, name: "Rent", created_at: "" }];

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** No target, no budget, no contributions set yet — every amount field starts blank. */
function mockApi(overrides: { deleteTypeStatus?: number; deleteTypeDetail?: string } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (url.includes("/api/savings/types") && method === "DELETE") {
      if (overrides.deleteTypeStatus && overrides.deleteTypeStatus !== 204) {
        return json({ detail: overrides.deleteTypeDetail }, overrides.deleteTypeStatus);
      }
      return json(null, 204);
    }
    if (url.includes("/api/savings/types")) return json({ items: savingsTypes });
    if (url.includes("/api/savings/contributions")) return json({ items: [] });
    if (url.includes("/api/savings/targets") && method === "PUT") return json({}, 200);
    if (url.includes("/api/savings/targets")) return json({ items: [] });
    if (url.includes("/api/categories")) return json({ items: categories });
    if (url.includes("/api/budgets") && method === "PUT") return json({}, 200);
    if (url.includes("/api/budgets")) return json({ items: [] });
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PlanPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("saves a budget amount with a PUT carrying a two-place decimal string, never a POST", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<PlanPage />);

    const input = await screen.findByLabelText("Monthly amount for Rent");
    await user.type(input, "150.00");
    await user.click(within(input.closest("tr") as HTMLElement).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === "/api/budgets/c1" && init?.method === "PUT",
      );
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({ monthly_amount: "150.00" });
    });
    // AD-11: setting a budget is always an update, so a POST must never be issued for it.
    expect(
      fetchMock.mock.calls.some(([url, init]) => String(url).startsWith("/api/budgets") && init?.method === "POST"),
    ).toBe(false);
  });

  it("saves a target amount with a PUT to /api/savings/targets/{typeId}", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<PlanPage />);

    const input = await screen.findByLabelText("Monthly amount for Emergency Fund");
    await user.type(input, "500.00");
    await user.click(within(input.closest("tr") as HTMLElement).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === "/api/savings/targets/st1" && init?.method === "PUT",
      );
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({ monthly_amount: "500.00" });
    });
  });

  it("refuses an amount with three decimal places or a negative value before it reaches the server", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<PlanPage />);

    const input = await screen.findByLabelText("Monthly amount for Rent");
    const row = input.closest("tr") as HTMLElement;

    await user.type(input, "10.001");
    await user.click(within(row).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at most two decimal places");

    await user.clear(input);
    await user.type(input, "-5.00");
    await user.click(within(row).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at most two decimal places");

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("shows the server's detail message when a delete is refused with 409", async () => {
    mockApi({ deleteTypeStatus: 409, deleteTypeDetail: "That savings type still has contributions" });
    const user = userEvent.setup();
    render(<PlanPage />);

    await screen.findByLabelText("Monthly amount for Emergency Fund");
    await user.click(screen.getByRole("button", { name: "Delete Emergency Fund" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That savings type still has contributions",
    );
  });
});
