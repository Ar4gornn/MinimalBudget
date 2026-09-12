import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MoodCheckin } from "./MoodCheckin";

/**
 * The day's two answers, from the dashboard (Epic 24, story 24.2).
 *
 * What is worth protecting here is not the styling. It is: the control is a disclosure and
 * says so; a keyboard can close it and gets its focus back; the two questions stay two
 * questions; and "did not say" never renders as "no".
 */

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const unanswered = { on: "2026-09-06", mood: null, day_ok: null, note: null };

function mockApi(initial: unknown = unanswered) {
  window.localStorage.setItem("minimalbudget.token", "test-token");
  const puts: Record<string, unknown>[] = [];
  let day = initial as Record<string, unknown>;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.includes("/api/mood/days/") && method === "PUT") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      puts.push(body);
      day = { on: "2026-09-06", ...body, note: body["note"] ?? null };
      return json(day);
    }
    if (url.includes("/api/mood/days/")) return json(day);
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { puts };
}

/**
 * The verdict question is gated on the device clock, so the clock is the fixture.
 *
 * Only `getHours` is stubbed, not the whole timer system: fake timers stall
 * `userEvent`'s own waiting and the test then times out rather than failing, which is a
 * worse signal than a red assertion.
 */
function atHour(hour: number) {
  vi.spyOn(Date.prototype, "getHours").mockReturnValue(hour);
}

describe("MoodCheckin", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("is a disclosure, not a dialog", async () => {
    mockApi();
    render(<MoodCheckin />);
    const trigger = await screen.findByRole("button", { name: /how do you feel today/i });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    // Deliberately not a dialog: no role, no aria-modal, no focus trap and no scroll lock.
    // If somebody later reaches for real modal machinery this is the test that should be
    // rewritten rather than deleted, because the argument is in MoodCheckin.tsx.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-modal]")).toBeNull();
  });

  it("closes on Escape and gives focus back to the button", async () => {
    mockApi();
    render(<MoodCheckin />);
    const trigger = await screen.findByRole("button", { name: /how do you feel today/i });
    await userEvent.click(trigger);
    expect(screen.getByRole("group", { name: /how do you feel/i })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("group", { name: /how do you feel/i })).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("sends the whole day, so an unasked question is stored as no answer", async () => {
    const { puts } = mockApi();
    render(<MoodCheckin />);
    await userEvent.click(await screen.findByRole("button", { name: /how do you feel today/i }));
    await userEvent.click(screen.getByRole("button", { name: "Good" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    // PUT, not PATCH: absent and null are the same answer here, so the verdict goes as an
    // explicit null rather than being left out and merged server-side.
    expect(puts[0]).toEqual({ mood: 4, day_ok: null, note: null });
  });

  it("takes an answer back when the same face is tapped again", async () => {
    const { puts } = mockApi({ on: "2026-09-06", mood: 4, day_ok: null, note: null });
    render(<MoodCheckin />);
    await userEvent.click(await screen.findByRole("button", { name: /how do you feel today/i }));

    const good = screen.getByRole("button", { name: "Good" });
    expect(good).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(good);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ mood: null, day_ok: null, note: null });
  });

  it("does not ask whether the day was good until the evening", async () => {
    atHour(9);
    mockApi();
    render(<MoodCheckin />);
    await userEvent.click(await screen.findByRole("button", { name: /how do you feel today/i }));

    // No control at all, not a disabled one: at nine in the morning the question has no
    // answer, and a stored verdict from then would mean something different from one given
    // at ten at night — with nothing in the row to tell them apart.
    expect(screen.queryByRole("button", { name: "Yes" })).not.toBeInTheDocument();
    expect(screen.getByText(/ask again this evening/i)).toBeInTheDocument();
    // The mood question is not gated: how you feel has an answer at any hour.
    expect(screen.getByRole("button", { name: "Fine" })).toBeInTheDocument();
  });

  it("asks in the evening, and keeps 'did not say' apart from 'no'", async () => {
    atHour(20);
    mockApi({ on: "2026-09-06", mood: 3, day_ok: null, note: null });
    render(<MoodCheckin />);
    await userEvent.click(await screen.findByRole("button", { name: /how do you feel today/i }));

    // Three states. An unanswered verdict leaves *both* buttons unpressed; rendering "No"
    // as pressed would be the page inventing an answer nobody gave.
    expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "false");
  });

  it("names every face in text, so a drawing is never the only label", async () => {
    mockApi();
    render(<MoodCheckin />);
    await userEvent.click(await screen.findByRole("button", { name: /how do you feel today/i }));

    // AD-42: the SVG is aria-hidden, so these names come from the words beside them. A face
    // that shipped without its word would leave an unnamed button here.
    for (const word of ["Bad", "Low", "Fine", "Good", "Great"]) {
      expect(screen.getByRole("button", { name: word })).toBeInTheDocument();
    }
  });
});
