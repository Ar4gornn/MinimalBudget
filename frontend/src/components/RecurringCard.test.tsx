import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecurringCard } from "./RecurringCard";
import { ToastProvider } from "./Toast";
import type { PendingEntry, RecurringTemplate } from "../api/types";

function render(ui: React.ReactElement) {
  return rtlRender(<ToastProvider>{ui}</ToastProvider>);
}

const templates: RecurringTemplate[] = [
  {
    id: "t1",
    kind: "expense",
    category_id: "c1",
    amount: "1200.00",
    note: null,
    cadence: "monthly",
    start_on: "2026-07-01",
    end_on: null,
    auto: true,
    paused: false,
    next_due: "2026-10-01",
    created_at: "",
  },
  {
    id: "t2",
    kind: "expense",
    category_id: "c2",
    amount: "60.00",
    note: "estimate",
    cadence: "monthly",
    start_on: "2026-07-05",
    end_on: null,
    auto: false,
    paused: true,
    next_due: "2026-10-05",
    created_at: "",
  },
];

const pending: PendingEntry[] = [
  {
    id: "o1",
    template_id: "t2",
    due_on: "2026-09-05",
    kind: "expense",
    category_id: "c2",
    category_name: "Electricity",
    amount: "60.00",
    note: "estimate",
    cadence: "monthly",
  },
];

const categories = [
  { id: "c1", kind: "expense" as const, name: "Rent", created_at: "" },
  { id: "c2", kind: "expense" as const, name: "Electricity", created_at: "" },
];

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockApi(overrides: { pending?: PendingEntry[] } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.includes("/api/recurring/pending")) {
      return json({ items: overrides.pending ?? pending });
    }
    if (url.includes("/confirm")) return json({ id: "e1", amount: "72.40" });
    if (url.includes("/skip")) return json(null, 204);
    if (url.includes("/api/recurring/templates") && method === "POST") {
      return json({ ...templates[0], ...JSON.parse(String(init?.body)) }, 201);
    }
    if (url.includes("/api/recurring/templates") && method === "PATCH") return json(templates[1]);
    if (url.includes("/api/recurring/templates") && method === "DELETE") return json(null, 204);
    if (url.includes("/api/recurring/templates")) return json({ items: templates });
    if (url.includes("/api/categories")) return json({ items: categories });
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function posts(mock: ReturnType<typeof vi.fn>, fragment: string) {
  return mock.mock.calls
    .filter(([url, init]) => String(url).includes(fragment) && (init as RequestInit)?.method === "POST")
    .map(([url, init]) => ({
      url: String(url),
      body: JSON.parse(String((init as RequestInit).body || "{}")),
    }));
}

describe("RecurringCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("lists proposals to confirm and the templates behind them", async () => {
    mockApi();
    render(<RecurringCard />);

    const proposals = await screen.findByRole("table", { name: "Entries to confirm" });
    expect(within(proposals).getByText("Electricity")).toBeInTheDocument();
    expect(within(proposals).getByText("2026-09-05")).toBeInTheDocument();

    const list = screen.getByRole("table", { name: "Recurring templates" });
    expect(within(list).getByText("auto")).toBeInTheDocument();
    expect(within(list).getByText("paused")).toBeInTheDocument();
    // A paused template has no next date to show.
    expect(within(list).getByText("—")).toBeInTheDocument();
  });

  it("confirms a proposal at the template's amount, sending no override", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<RecurringCard />);
    await screen.findByRole("table", { name: "Entries to confirm" });

    await user.click(screen.getByRole("button", { name: "Add Electricity due 2026-09-05" }));

    await waitFor(() => {
      // Untouched amount: the server uses the template's figure rather than being told it.
      expect(posts(fetchMock, "/confirm")[0]?.body).toEqual({});
    });
  });

  it("confirms with a corrected amount when the field is edited", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<RecurringCard />);
    await screen.findByRole("table", { name: "Entries to confirm" });

    const field = screen.getByLabelText("Amount for Electricity due 2026-09-05");
    await user.clear(field);
    await user.type(field, "72.40");
    await user.click(screen.getByRole("button", { name: "Add Electricity due 2026-09-05" }));

    await waitFor(() => {
      expect(posts(fetchMock, "/confirm")[0]?.body).toEqual({ amount: "72.40" });
    });
  });

  it("refuses a corrected amount that is not money, before it reaches the server", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<RecurringCard />);
    await screen.findByRole("table", { name: "Entries to confirm" });

    const field = screen.getByLabelText("Amount for Electricity due 2026-09-05");
    await user.clear(field);
    await user.type(field, "12.345");
    await user.click(screen.getByRole("button", { name: "Add Electricity due 2026-09-05" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("at most two decimal places");
    expect(posts(fetchMock, "/confirm")).toHaveLength(0);
  });

  it("skips a proposal", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<RecurringCard />);
    await screen.findByRole("table", { name: "Entries to confirm" });

    await user.click(screen.getByRole("button", { name: "Skip Electricity due 2026-09-05" }));
    await waitFor(() => expect(posts(fetchMock, "/skip")).toHaveLength(1));
  });

  it("creates a template that proposes rather than creates, unless told otherwise", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<RecurringCard />);
    await screen.findByRole("table", { name: "Recurring templates" });

    const form = screen.getByRole("form", { name: "Add a recurring entry" });
    await user.type(within(form).getByLabelText("Recurring amount"), "1200.00");
    await user.type(within(form).getByLabelText("Recurring category"), "Rent");
    await user.click(within(form).getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(posts(fetchMock, "/api/recurring/templates")[0]?.body).toMatchObject({
        kind: "expense",
        amount: "1200.00",
        cadence: "monthly",
        category_name: "Rent",
        // The default is a proposal, never a silent write.
        auto: false,
      });
    });
  });

  it("shows nothing to confirm when there are no proposals", async () => {
    mockApi({ pending: [] });
    render(<RecurringCard />);

    await screen.findByRole("table", { name: "Recurring templates" });
    expect(screen.queryByRole("table", { name: "Entries to confirm" })).toBeNull();
  });
});
