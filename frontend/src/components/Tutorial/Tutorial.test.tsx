import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";
import { AuthProvider } from "../../auth/AuthContext";
import { LanguageProvider } from "../../i18n";
import { ToastProvider } from "../Toast";
import { ThemeProvider } from "../../theme";

/**
 * The guided tour (Epic 30), driven through the real App: the real router, the real
 * pages, the real record form. A tour that only worked against a stub of the Entries page
 * would prove nothing about the one thing it exists for — that recording an entry moves
 * it on.
 */

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const summary = {
  month: "2026-09",
  income: "0.00",
  expense: "12.50",
  net: "-12.50",
  saved: "0.00",
  budgets: [{ category_id: "c1", category_name: "Coffee", budget: null, actual: "12.50" }],
  savings: [],
};

const trends = { months: [], income: [], expense: [], saved: [], expense_by_category: [] };

const categories = [{ id: "c1", name: "Coffee", kind: "expense", created_at: "" }];

const entry = {
  id: "e1",
  kind: "expense",
  category_id: "c1",
  amount: "12.50",
  occurred_on: "2026-09-20",
  note: null,
  quantity: null,
  unit: null,
  unit_price: null,
  created_at: "",
};

type Profile = Record<string, unknown>;

function profile(overrides: Profile = {}): Profile {
  return {
    id: "u1",
    email: "new@example.com",
    currency: "USD",
    weight_unit: "kg",
    budget_start_day: 1,
    language: "en",
    created_at: "",
    tutorial_completed: false,
    tutorial_skipped_at: null,
    ...overrides,
  };
}

function mockApi(me: Profile, tutorialWrites: "ok" | "fail" = "ok") {
  let current = me;
  const entries: unknown[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.includes("/api/auth/me/tutorial")) {
      if (tutorialWrites === "fail") return json({ detail: "boom", code: "error" }, 500);
      const outcome = JSON.parse(String(init?.body)).outcome as string;
      current =
        outcome === "completed"
          ? { ...current, tutorial_completed: true }
          : { ...current, tutorial_skipped_at: "2026-09-20T10:00:00Z" };
      return json(current);
    }
    if (url.includes("/api/auth/me/currency")) {
      current = { ...current, currency: JSON.parse(String(init?.body)).currency as string };
      return json(current);
    }
    if (url.includes("/api/auth/me")) return json(current);
    if (url.includes("/api/dashboard/summary")) return json(summary);
    if (url.includes("/api/dashboard/trends")) return json(trends);
    if (url.includes("/api/savings/overview")) {
      return json({
        month: "2026-09",
        start: "2026-09-01",
        end: "2026-10-01",
        current_month: "2026-09",
        pots: [],
      });
    }
    if (url.includes("/api/categories")) return json({ items: categories });
    if (url.includes("/api/entries") && method === "POST") {
      entries.push(entry);
      return json(entry, 201);
    }
    if (url.includes("/api/entries")) return json({ items: entries });
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderApp(me: Profile, path = "/", tutorialWrites: "ok" | "fail" = "ok") {
  window.localStorage.setItem("everything-everywhere.token", "test-token");
  const fetchMock = mockApi(me, tutorialWrites);
  render(
    <AuthProvider>
      <LanguageProvider>
        <ToastProvider>
          <ThemeProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
          </ThemeProvider>
        </ToastProvider>
      </LanguageProvider>
    </AuthProvider>,
  );
  return fetchMock;
}

const dialog = () => screen.getByRole("dialog");

/**
 * The tour opens from an effect, which React flushes after the commit that drew the
 * navigation — so "no dialog right after the nav appears" is true of a tour that is
 * about to open too. Wait long enough for it to have opened, and insist it did not.
 * (Made to fail by loosening the provider's check to `!tutorial_completed`; an
 * immediate `queryByRole` stayed green under that mutation.)
 */
async function neverOpens(): Promise<void> {
  await screen.findByRole("navigation", { name: "Sections" });
  await expect(screen.findByRole("dialog", {}, { timeout: 300 })).rejects.toThrow();
}

function outcomes(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .filter(([url, init]) => String(url).includes("/api/auth/me/tutorial") && init?.method === "PATCH")
    .map(([, init]) => JSON.parse(String(init?.body)).outcome as string);
}

describe("the guided tour", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    delete document.body.dataset.tourStep;
  });

  it("opens on a new account, dimmed, with the first step focused", async () => {
    renderApp(profile());
    await screen.findByRole("dialog");
    expect(within(dialog()).getByText("Welcome to Everything Everywhere")).toBeInTheDocument();
    expect(within(dialog()).getByText("Step 1 of 5")).toBeInTheDocument();
    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(within(dialog()).getByRole("button", { name: "Let’s go" })).toHaveFocus();
    // Nothing is ringed on the welcome screen: it points at nothing.
    expect(document.body.dataset.tourStep).toBeUndefined();
  });

  it("does not open for an account that finished it", async () => {
    renderApp(profile({ tutorial_completed: true }));
    await neverOpens();
  });

  it("does not open for an account that skipped it", async () => {
    renderApp(profile({ tutorial_skipped_at: "2026-09-20T10:00:00Z" }));
    await neverOpens();
  });

  it("reads a server that sends neither field as 'seen', not as 'new'", async () => {
    // A client ahead of its server must not welcome an account that has been recording
    // entries for a year. Made to fail by loosening the check to `!tutorial_completed`.
    const me = profile();
    delete me.tutorial_completed;
    delete me.tutorial_skipped_at;
    renderApp(me);
    await neverOpens();
  });

  it("skips from the first screen and records it", async () => {
    const user = userEvent.setup();
    const fetchMock = renderApp(profile());
    await screen.findByRole("dialog");
    await user.click(within(dialog()).getByRole("button", { name: "Skip the tour" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(outcomes(fetchMock)).toEqual(["skipped"]));
  });

  it("skips on Escape, from a step in the middle", async () => {
    const user = userEvent.setup();
    const fetchMock = renderApp(profile());
    await screen.findByRole("dialog");
    await user.keyboard("{Enter}");
    await screen.findByText("Step 2 of 5");
    dialog().focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.dataset.tourStep).toBeUndefined();
    await waitFor(() => expect(outcomes(fetchMock)).toEqual(["skipped"]));
  });

  it("walks the five steps through the real pages and records completion", async () => {
    const user = userEvent.setup();
    const fetchMock = renderApp(profile());
    await screen.findByRole("dialog");

    // 1 → 2: to the entries page, with the record form ringed and not dimmed.
    await user.click(within(dialog()).getByRole("button", { name: "Let’s go" }));
    await screen.findByText("Step 2 of 5");
    const form = await screen.findByRole("form", { name: "Record an entry" });
    expect(dialog()).not.toHaveAttribute("aria-modal");
    expect(document.body.dataset.tourStep).toBe("entry");
    expect(form.closest("[data-tour]")).toHaveAttribute("data-tour", "record-form");
    // The panel names the form's own button, so the instruction and the control agree.
    expect(within(dialog()).getByText(/press Add\./)).toBeInTheDocument();

    // 2 → 3 happens by itself when the entry is saved — the step the tour exists for.
    await user.type(within(form).getByLabelText("Amount"), "12.50");
    await user.type(within(form).getByLabelText("Category"), "Coffee");
    await user.click(within(form).getByRole("button", { name: "Add" }));
    await screen.findByText("Step 3 of 5");
    expect(document.body.dataset.tourStep).toBe("history");
    // The saved entry is in the ringed list — the category cell links to its page.
    const list = document.querySelector('[data-tour="entries-list"]') as HTMLElement;
    expect(await within(list).findByRole("link", { name: "Coffee" })).toBeInTheDocument();

    // 3 → 4: to the plan page, budgets ringed.
    await user.click(within(dialog()).getByRole("button", { name: "Next" }));
    await screen.findByText("Step 4 of 5");
    await screen.findByRole("heading", { name: "Monthly budgets" });
    expect(document.body.dataset.tourStep).toBe("budget");

    // 4 → 5: back to the dashboard, the budget card ringed.
    await user.click(within(dialog()).getByRole("button", { name: "Next" }));
    await screen.findByText("Step 5 of 5");
    await screen.findByRole("heading", { name: "Budget vs actual" });
    expect(document.body.dataset.tourStep).toBe("progress");

    // 5 → done: dimmed again, no step counter, and Done records it.
    await user.click(within(dialog()).getByRole("button", { name: "Next" }));
    await within(dialog()).findByText("You’re all set");
    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(within(dialog()).queryByText(/Step \d of 5/)).toBeNull();
    expect(within(dialog()).queryByRole("button", { name: "Skip the tour" })).toBeNull();
    await user.click(within(dialog()).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.dataset.tourStep).toBeUndefined();
    await waitFor(() => expect(outcomes(fetchMock)).toEqual(["completed"]));
  });

  it("ignores a saved entry when it is not on that step", async () => {
    // The Entries page reports every save; only the entry step listens. Otherwise
    // recording something while reading step 4 would jump the tour to step 3.
    const user = userEvent.setup();
    renderApp(profile());
    await screen.findByRole("dialog");
    await user.click(within(dialog()).getByRole("button", { name: "Let’s go" }));
    await screen.findByText("Step 2 of 5");
    await user.click(within(dialog()).getByRole("button", { name: "Next" }));
    await screen.findByText("Step 3 of 5");
    await user.click(within(dialog()).getByRole("button", { name: "Next" }));
    await screen.findByText("Step 4 of 5");
    const sections = screen.getByRole("navigation", { name: "Sections" });
    await user.click(within(sections).getByRole("link", { name: /Entries/ }));
    const form = await screen.findByRole("form", { name: "Record an entry" });
    await user.type(within(form).getByLabelText("Amount"), "3.00");
    await user.type(within(form).getByLabelText("Category"), "Coffee");
    await user.click(within(form).getByRole("button", { name: "Add" }));
    await screen.findByText("Entry added");
    expect(within(dialog()).getByText("Step 4 of 5")).toBeInTheDocument();
  });

  it("can be replayed from Settings after it was completed", async () => {
    const user = userEvent.setup();
    renderApp(profile({ tutorial_completed: true }), "/settings");
    await screen.findByRole("heading", { name: "Help" });
    await expect(screen.findByRole("dialog", {}, { timeout: 300 })).rejects.toThrow();
    await user.click(screen.getByRole("button", { name: "Show the tour again" }));
    expect(within(dialog()).getByText("Welcome to Everything Everywhere")).toBeInTheDocument();
  });

  it("is offered once per sign-in, not once per profile refresh", async () => {
    // The write that records the skip can fail, and then the profile still says "not
    // seen". A later refresh — changing the currency, say — must not bring the welcome
    // screen back in the same session; the next sign-in is soon enough.
    const user = userEvent.setup();
    renderApp(profile(), "/settings", "fail");
    await screen.findByRole("dialog");
    await user.click(within(dialog()).getByRole("button", { name: "Skip the tour" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Account currency"), "EUR");
    await waitFor(() => expect(screen.getByLabelText("Account currency")).toHaveValue("EUR"));
    await expect(screen.findByRole("dialog", {}, { timeout: 300 })).rejects.toThrow();
  });
});
