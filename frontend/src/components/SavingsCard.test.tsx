import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Pot, SavingsOverview } from "../api/types";
import { AuthProvider } from "../auth/AuthContext";
import { todayIso } from "../months";
import { confirmDate, SavingsCard } from "./SavingsCard";
import { ToastProvider } from "./Toast";

function render() {
  return rtlRender(
    <AuthProvider>
      <ToastProvider>
        <SavingsCard />
      </ToastProvider>
    </AuthProvider>,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pot(overrides: Partial<Pot> = {}): Pot {
  return {
    savings_type_id: "p1",
    name: "Holidays",
    balance: "300.00",
    saved: "40.00",
    target: "100.00",
    due: "60.00",
    skipped: false,
    goal_amount: null,
    goal_date: null,
    needed_per_month: null,
    ...overrides,
  };
}

function overview(pots: Pot[], overrides: Partial<SavingsOverview> = {}): SavingsOverview {
  return {
    month: "2026-09",
    start: "2026-09-01",
    end: "2026-10-01",
    current_month: "2026-09",
    pots,
    ...overrides,
  };
}

type Answer = { status: number; body?: unknown };

function mockApi(
  pots: Pot[],
  answers: { deleteType?: Answer; createContribution?: Answer; patchType?: Answer } = {},
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const answer = (a: Answer | undefined, fallback: unknown) =>
      a ? json(a.body ?? null, a.status) : json(fallback, fallback === null ? 204 : 200);

    if (url.startsWith("/api/savings/overview")) {
      const month = new URL(url, "http://x").searchParams.get("month") ?? "2026-09";
      return json(overview(pots, { month }));
    }
    if (url.startsWith("/api/savings/contributions") && method === "POST") {
      return answer(answers.createContribution, { id: "new" });
    }
    if (url.startsWith("/api/savings/contributions")) return json({ items: [] });
    if (url.startsWith("/api/savings/skips")) return json(null, 204);
    if (url.startsWith("/api/savings/types") && method === "PATCH") {
      return answer(answers.patchType, {});
    }
    if (url.startsWith("/api/savings/types") && method === "DELETE") {
      return answer(answers.deleteType, null);
    }
    if (url.startsWith("/api/savings/targets")) return json({});
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof mockApi>, method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url).startsWith(prefix) && (init?.method ?? "GET") === method,
  );

const bodyOf = (call: unknown[] | undefined) =>
  JSON.parse(String((call?.[1] as RequestInit | undefined)?.body));

describe("SavingsCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows each pot's balance, the month against its target, and what is due", async () => {
    mockApi([pot()]);
    render();

    expect(await screen.findByText("Balance $300.00")).toBeInTheDocument();
    expect(screen.getByText("$40.00 of $100.00 this month")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Holidays this month" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
    expect(screen.getByText("Due $60.00")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount to put aside for Holidays")).toHaveValue("60.00");
  });

  it("puts the amount due aside as a deposit dated today, in the current month", async () => {
    const fetchMock = mockApi([pot()]);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Put aside for Holidays" }));

    await waitFor(() => expect(calls(fetchMock, "POST", "/api/savings/contributions")).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, "POST", "/api/savings/contributions")[0])).toEqual({
      savings_type_id: "p1",
      amount: "60.00",
      occurred_on: todayIso(),
    });
  });

  it("lets the proposed amount be changed before it is put aside, with a comma", async () => {
    const fetchMock = mockApi([pot()]);
    const user = userEvent.setup();
    render();

    const input = await screen.findByLabelText("Amount to put aside for Holidays");
    await user.clear(input);
    await user.type(input, "25,5");
    await user.click(screen.getByRole("button", { name: "Put aside for Holidays" }));

    await waitFor(() => expect(calls(fetchMock, "POST", "/api/savings/contributions")).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, "POST", "/api/savings/contributions")[0]).amount).toBe("25.5");
  });

  it("skips a month with a PUT for that pot and that month, recording nothing", async () => {
    const fetchMock = mockApi([pot()]);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Skip Holidays this month" }));

    await waitFor(() =>
      expect(calls(fetchMock, "PUT", "/api/savings/skips/p1/2026-09")).toHaveLength(1),
    );
    expect(calls(fetchMock, "POST", "/api/savings/contributions")).toHaveLength(0);
  });

  it("offers to undo a skipped month instead of proposing it", async () => {
    const fetchMock = mockApi([pot({ due: null, skipped: true })]);
    const user = userEvent.setup();
    render();

    expect(await screen.findByText("Skipped this month")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Put aside for Holidays" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Propose Holidays again this month" }));
    await waitFor(() =>
      expect(calls(fetchMock, "DELETE", "/api/savings/skips/p1/2026-09")).toHaveLength(1),
    );
  });

  it("shows a goal with what it needs per month", async () => {
    mockApi([pot({ goal_amount: "1000.00", goal_date: "2026-12-31", needed_per_month: "175.00" })]);
    render();

    expect(await screen.findByText(/Goal \$1,000\.00 by/)).toHaveTextContent(
      "$175.00 a month to get there",
    );
    expect(screen.getByRole("meter", { name: "Holidays goal" })).toHaveAttribute(
      "aria-valuenow",
      "30",
    );
  });

  it("says a goal is reached rather than asking for more", async () => {
    mockApi([pot({ balance: "1200.00", goal_amount: "1000.00", goal_date: "2026-12-31" })]);
    render();
    expect(await screen.findByText(/Goal reached/)).toBeInTheDocument();
  });

  it("records a withdrawal with its kind", async () => {
    const fetchMock = mockApi([pot()]);
    const user = userEvent.setup();
    render();

    await user.selectOptions(await screen.findByLabelText("Deposit or withdrawal"), "withdrawal");
    await user.type(screen.getByLabelText("Contribution amount"), "20");
    const card = screen.getByRole("heading", { name: "Put in or take out" }).closest("section");
    await user.click(within(card as HTMLElement).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(calls(fetchMock, "POST", "/api/savings/contributions")).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, "POST", "/api/savings/contributions")[0])).toMatchObject({
      savings_type_id: "p1",
      kind: "withdrawal",
      amount: "20",
    });
  });

  it("shows an overdrawn withdrawal's refusal inside the card that sent it", async () => {
    mockApi([pot()], {
      createContribution: {
        status: 409,
        body: { detail: "overdrawn", code: "savings_balance_negative" },
      },
    });
    const user = userEvent.setup();
    render();

    await user.selectOptions(await screen.findByLabelText("Deposit or withdrawal"), "withdrawal");
    await user.type(screen.getByLabelText("Contribution amount"), "5000");
    const card = screen.getByRole("heading", { name: "Put in or take out" }).closest("section");
    await user.click(within(card as HTMLElement).getByRole("button", { name: "Add" }));

    expect(await within(card as HTMLElement).findByRole("alert")).toHaveTextContent(
      "more out of the pot than there is in it",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("refuses a malformed amount in the card, before it reaches the server", async () => {
    const fetchMock = mockApi([pot()]);
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByLabelText("Contribution amount"), "1,2,3");
    const card = screen.getByRole("heading", { name: "Put in or take out" }).closest("section");
    await user.click(within(card as HTMLElement).getByRole("button", { name: "Add" }));

    expect(await within(card as HTMLElement).findByRole("alert")).toHaveTextContent(
      "at most two decimal places",
    );
    expect(calls(fetchMock, "POST", "/api/savings/contributions")).toHaveLength(0);
  });

  it("saves a goal and a new target from the editor", async () => {
    const fetchMock = mockApi([pot()]);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Edit Holidays" }));
    await user.clear(screen.getByLabelText("Monthly target"));
    await user.type(screen.getByLabelText("Monthly target"), "120");
    await user.type(screen.getByLabelText("Goal amount"), "2000");
    await user.type(screen.getByLabelText("Goal date"), "2027-06-30");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls(fetchMock, "PATCH", "/api/savings/types/p1")).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, "PATCH", "/api/savings/types/p1")[0])).toEqual({
      goal_amount: "2000",
      goal_date: "2027-06-30",
    });
    await waitFor(() => expect(calls(fetchMock, "PUT", "/api/savings/targets/p1")).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, "PUT", "/api/savings/targets/p1")[0])).toEqual({
      monthly_amount: "120",
    });
  });

  it("refuses a goal date without a goal amount before it reaches the server", async () => {
    const fetchMock = mockApi([pot()]);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Edit Holidays" }));
    await user.type(screen.getByLabelText("Goal date"), "2027-06-30");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A goal date needs a goal amount");
    expect(calls(fetchMock, "PATCH", "/api/savings/types/p1")).toHaveLength(0);
  });

  it("shows the server's reason when a pot with contributions cannot be deleted", async () => {
    mockApi([pot()], {
      deleteType: { status: 409, body: { detail: "x", code: "savings_type_in_use" } },
    });
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Edit Holidays" }));
    await user.click(screen.getByRole("button", { name: "Delete Holidays" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("still has contributions");
  });

  it("walks back a month, and cannot walk past the current one", async () => {
    const fetchMock = mockApi([pot()]);
    const user = userEvent.setup();
    render();

    const next = await screen.findByRole("button", { name: /next/i });
    expect(next).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /previous/i }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url) === "/api/savings/overview?month=2026-08"),
      ).toBe(true),
    );
    expect(
      fetchMock.mock.calls.some(
        ([url]) => String(url) === "/api/savings/contributions?month=2026-08",
      ),
    ).toBe(true);
    await waitFor(() => expect(screen.getByRole("button", { name: /next/i })).toBeEnabled());
  });
});

describe("confirmDate", () => {
  it("is today in the current month", () => {
    expect(confirmDate(overview([]), "2026-09-26")).toBe("2026-09-26");
  });

  it("is the last day of a past month, which is the day before its end", () => {
    const past = overview([], { month: "2026-08", start: "2026-08-01", end: "2026-09-01" });
    expect(confirmDate(past, "2026-09-26")).toBe("2026-08-31");
  });

  it("follows the budget month, not the calendar", () => {
    const past = overview([], { month: "2026-08", start: "2026-07-26", end: "2026-08-26" });
    expect(confirmDate(past, "2026-09-26")).toBe("2026-08-25");
  });
});
