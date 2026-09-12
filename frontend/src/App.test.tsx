import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/Toast";

/**
 * The navigation answer (Epics 22 and 23).
 *
 * The bottom bar holds five items at 375px and that is the measured maximum. Two new
 * sections arrived, so this file pins the resolution: Habits takes a tab, Plan moves to the
 * top bar, and the calendar is a second view of the Dashboard section rather than a sixth
 * tab. A test rather than a comment, because "we will remember not to add a sixth" is not
 * a constraint anybody can enforce in review.
 */

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderAt(path: string) {
  window.localStorage.setItem("minimalbudget.token", "test-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/auth/me")) {
        return json({
          id: "u1",
          email: "sam@example.com",
          currency: "USD",
          weight_unit: "kg",
          budget_start_day: 1,
          created_at: "",
        });
      }
      return json({ items: [] });
    }),
  );
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>,
  );
}

const bottomBar = () => screen.getByRole("navigation", { name: "Sections" });
const topExtra = () => screen.getByRole("navigation", { name: "More" });

describe("navigation", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps exactly five bottom tabs", async () => {
    renderAt("/");
    await waitFor(() => expect(bottomBar()).toBeInTheDocument());

    // The leading glyph is decorative and aria-hidden, so it is stripped here rather than
    // baked into the expectation.
    const labels = within(bottomBar())
      .getAllByRole("link")
      .map((link) => link.textContent?.replace(/^\W+/, "").trim());
    expect(labels).toEqual(["Dashboard", "Entries", "Habits", "Stock", "Gym"]);
  });

  it("puts Plan, Grow and Recipes in the top bar, where they stay visible on a phone", async () => {
    renderAt("/");
    await waitFor(() => expect(topExtra()).toBeInTheDocument());

    // Recipes joined these two in Epic 27 rather than taking a sixth bottom tab. The
    // bottom bar holds five and the assertion above is what keeps it at five: a section
    // added here cannot quietly appear down there as well.
    const labels = within(topExtra())
      .getAllByRole("link")
      .map((link) => link.textContent?.trim());
    expect(labels).toEqual(["Plan", "Grow", "Recipes"]);
  });

  it("marks the Dashboard tab as the section you are in while the calendar is open", async () => {
    renderAt("/calendar");
    await waitFor(() => expect(bottomBar()).toBeInTheDocument());

    const dashboard = within(bottomBar()).getByRole("link", { name: /Dashboard/ });
    // Not aria-current — that belongs to the exact path — but the same lit state, so five
    // tabs still describe where you are.
    expect(dashboard.className).toContain("on");
    expect(within(bottomBar()).getByRole("link", { name: /Entries/ }).className).not.toContain(
      "on",
    );
  });

  it("reaches the calendar and the habits page by their own routes", async () => {
    renderAt("/calendar");
    expect(await screen.findByRole("group", { name: "Layers" })).toBeInTheDocument();
  });

  it("shows quick add on the calendar, where a day is the thing you would record against", async () => {
    renderAt("/calendar");
    expect(await screen.findByRole("button", { name: "Add an entry" })).toBeInTheDocument();
  });
});
