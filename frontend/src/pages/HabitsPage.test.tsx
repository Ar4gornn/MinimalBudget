import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HabitsPage } from "./HabitsPage";
import { AuthProvider } from "../auth/AuthContext";
import { ToastProvider } from "../components/Toast";

/**
 * Habits (Epics 23 and 26, stories 23.3 and 26.3).
 *
 * The behaviour worth protecting here is that the page never computes a verdict of its own:
 * "done", "met", the week rollup and the streak all come from the server, so the screen and
 * the daily digest cannot disagree (AD-30). A test that asserted a locally derived streak
 * would be asserting a second implementation.
 *
 * What Epic 26 adds to that list: a check-in is an occurrence with a time, so the page has
 * to show the times and delete one *by id*; and a day the schedule does not ask for has to
 * say so rather than render a zero.
 */

function render(ui: React.ReactElement) {
  // A router, because the mood card links back to the dashboard — the page it is recorded
  // from — and a Link outside a router throws.
  return rtlRender(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>{ui}</ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const me = {
  id: "u1",
  email: "sam@example.com",
  currency: "USD",
  weight_unit: "kg",
  budget_start_day: 1,
  created_at: "",
};

/** Monday, Wednesday, Friday — bits 0, 2 and 4. */
const MWF = 1 + 4 + 16;

const habits = [
  {
    id: "h1",
    name: "Run",
    schedule_kind: "weekdays",
    target_count: 2,
    weekdays: MWF,
    interval_days: null,
    day_of_month: null,
    nth: null,
    weekday: null,
    started_on: "2026-08-01",
    archived_at: null,
    remind: false,
    note: null,
    created_at: "",
  },
];

const runSchedule = {
  kind: "weekdays",
  target_count: 2,
  weekdays: MWF,
  interval_days: null,
  day_of_month: null,
  nth: null,
  weekday: null,
};

/** A monthly habit, so the page has a row that is not due today to render. */
const restingRow = {
  habit_id: "h2",
  name: "Bins",
  schedule: {
    kind: "day_of_month",
    target_count: 1,
    weekdays: null,
    interval_days: null,
    day_of_month: 12,
    nth: null,
    weekday: null,
  },
  remind: false,
  due_today: false,
  occasion_start: null,
  occasion_end: null,
  done: 0,
  met: false,
  today_done: 0,
  today_times: [],
  window_start: "2026-09-07",
  window_end: "2026-09-13",
  window_due: 0,
  window_done: 0,
  next_due: "2026-09-12",
  streak: 0,
};

/** The last 30 days, with three answered and the rest silent. Hand-counted: three days
 *  carry a mood (Fine, Great, Great) so the tally is [0, 0, 1, 0, 2] and days_answered is
 *  3, of which one was called a good day and one was not. */
const moodHistory = {
  start_on: "2026-08-08",
  end_on: "2026-09-07",
  days: [
    { on: "2026-08-20", mood: 3, day_ok: null, note: null },
    { on: "2026-09-05", mood: 5, day_ok: true, note: "a long walk" },
    { on: "2026-09-06", mood: 5, day_ok: false, note: null },
  ],
  counts: [
    { point: 1, days: 0 },
    { point: 2, days: 0 },
    { point: 3, days: 1 },
    { point: 4, days: 0 },
    { point: 5, days: 2 },
  ],
  days_with_mood: 3,
  days_ok: 1,
  days_not_ok: 1,
  days_answered: 3,
};

function mockApi(mood: unknown = moodHistory) {
  window.localStorage.setItem("minimalbudget.token", "test-token");
  const calls: { url: string; method: string; body: string }[] = [];
  // Today's occurrences, held by the fake server so the page reads them back rather than
  // guessing — the same contract as the real one.
  let times: { id: string; done_at: string | null; note: string | null }[] = [];
  let issued = 0;

  const progressRow = () => ({
    habit_id: "h1",
    name: "Run",
    schedule: runSchedule,
    remind: false,
    due_today: true,
    occasion_start: "2026-09-07",
    occasion_end: "2026-09-07",
    done: times.length,
    met: times.length >= 2,
    today_done: times.length,
    today_times: times,
    window_start: "2026-09-07",
    window_end: "2026-09-13",
    // Three occasions this week — Monday, Wednesday, Friday — whatever day it is today.
    window_due: 3,
    window_done: times.length >= 2 ? 1 : 0,
    next_due: "2026-09-09",
    streak: 2,
  });

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = String(init?.body ?? "");
    calls.push({ url, method, body });
    if (url.includes("/api/auth/me")) return json(me);
    if (url.includes("/api/mood/history")) {
      return mood === null ? json({ detail: "Not Found" }, 404) : json(mood);
    }
    if (url.includes("/api/habits/progress")) {
      return json({ items: [progressRow(), restingRow] });
    }
    const removal = url.match(/\/api\/habits\/h1\/checkins\/(c\d+)$/);
    if (removal && method === "DELETE") {
      times = times.filter((one) => one.id !== removal[1]);
      return json(null, 204);
    }
    if (url.includes("/api/habits/h1/checkins") && method === "POST") {
      issued += 1;
      const sent = JSON.parse(body || "{}") as { done_at?: string };
      const row = {
        id: `c${issued}`,
        done_at: sent.done_at ? `${sent.done_at}:00` : null,
        note: null,
      };
      times = [...times, row];
      return json({ ...row, habit_id: "h1", habit_name: "Run", done_on: "2026-09-07" }, 201);
    }
    if (url.includes("/api/habits/h1/heatmap")) {
      return json({
        habit_id: "h1",
        name: "Run",
        schedule: runSchedule,
        start_on: "2026-08-31",
        end_on: "2026-09-14",
        days: [{ on: "2026-09-01", times: 1, due: false }],
      });
    }
    if (url.includes("/api/habits/checkins")) return json({ items: [{ id: "c1" }] });
    if (url.includes("/api/habits") && method === "POST") {
      return json({ ...habits[0], id: "h3", name: "Read" }, 201);
    }
    if (url.includes("/api/habits/h1") && method === "PATCH") {
      return json({ ...habits[0], ...JSON.parse(body) });
    }
    if (url.includes("/api/habits/h1") && method === "DELETE") return json(null, 204);
    if (url.includes("/api/habits")) return json({ items: habits });
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

describe("HabitsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the server's figures rather than deriving its own", async () => {
    mockApi();
    render(<HabitsPage />);

    await waitFor(() => {
      expect(screen.getByText(/0 of 2 today/)).toBeInTheDocument();
    });
    // The week rollup is counted in occasions: three is how many times the schedule asked
    // this week, not how many days a week has.
    expect(screen.getByText(/0 of 3 this week/)).toBeInTheDocument();
    expect(screen.getByText("2 in a row")).toBeInTheDocument();
  });

  it("describes the schedule in words, in the list", async () => {
    mockApi();
    render(<HabitsPage />);

    const list = (await screen.findByText("Your habits")).closest("section") as HTMLElement;
    expect(within(list).getByText(/Mon, Wed, Fri/)).toBeInTheDocument();
  });

  it("says when a habit is not due today, and when it next is", async () => {
    // The old model had no way to express this: every habit was due every period, so a
    // Monday-Wednesday-Friday habit rendered "0 of 1" on a Tuesday and read as a failure.
    mockApi();
    render(<HabitsPage />);

    expect(await screen.findByText(/Not due today/)).toBeInTheDocument();
    expect(screen.getByText(/Sat 12 September/)).toBeInTheDocument();
  });

  it("records the time of a check-in and shows it", async () => {
    const { calls } = mockApi();
    render(<HabitsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Check in Run" }));
    await waitFor(() => {
      expect(screen.getByText(/1 of 2 today/)).toBeInTheDocument();
    });

    const posted = calls.find((c) => c.method === "POST" && c.url.includes("/h1/checkins"));
    expect(JSON.parse(posted?.body ?? "{}").done_at).toMatch(/^\d{2}:\d{2}$/);
    // And the time comes back onto the row, which is the whole point of the epic.
    const chip = await screen.findByRole("button", { name: /Remove the \d{2}:\d{2} check-in/ });
    expect(chip).toBeInTheDocument();
  });

  it("reads an emptied time box as “did not say when”, not as an error", async () => {
    // Sending the empty string was a 422 carrying a pydantic sentence — in English, on a
    // French screen — for something the person is entitled to do. NULL is a real state in
    // this model: did it, did not say when.
    const { calls } = mockApi();
    render(<HabitsPage />);

    const box = (await screen.findByLabelText(
      "Time for the next check-in of Run",
    )) as HTMLInputElement;
    await userEvent.clear(box);
    await userEvent.click(screen.getByRole("button", { name: "Check in Run" }));

    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/h1/checkins"))).toBe(true);
    });
    const posted = calls.find((c) => c.method === "POST" && c.url.includes("/h1/checkins"));
    expect(JSON.parse(posted?.body ?? "{}").done_at).toBeNull();
  });

  it("returns the time box to the clock after a check-in", async () => {
    // A box that silently kept 08:00 all day would record the afternoon dose at the time of
    // the morning one — the exact confusion recording a time was meant to end.
    mockApi();
    render(<HabitsPage />);

    const box = (await screen.findByLabelText(
      "Time for the next check-in of Run",
    )) as HTMLInputElement;
    await userEvent.clear(box);
    await userEvent.type(box, "08:00");
    expect(box.value).toBe("08:00");

    await userEvent.click(screen.getByRole("button", { name: "Check in Run" }));
    await waitFor(() => {
      expect(screen.getByText(/1 of 2 today/)).toBeInTheDocument();
    });
    expect(box.value).not.toBe("08:00");
  });

  it("refuses an out-of-range interval itself, rather than letting the server say it in English", async () => {
    // The only 422 the new controls could actually produce, and pydantic's answer to it is
    // "Input should be greater than or equal to 2" — a developer's sentence, in one
    // language, for a household member.
    const { calls } = mockApi();
    render(<HabitsPage />);

    await userEvent.type(await screen.findByLabelText("Habit name"), "Read");
    await userEvent.selectOptions(screen.getByLabelText("New habit: repeats"), "every_n_days");
    // Typed onto the default 2, which is how a person reaches an out-of-range interval:
    // the field is controlled, so it always holds a value and "1" alone cannot be typed —
    // but "2400" is three keystrokes.
    const interval = screen.getByLabelText("New habit: interval in days");
    await userEvent.type(interval, "400");
    expect((interval as HTMLInputElement).value).toBe("2400");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("2 to 365");
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/habits"))).toBe(false);
  });

  it("takes back one specific occurrence, by its id", async () => {
    // Three doses in a day used to be one row with `times = 3`, and "undo" could only mean
    // "decrement". With an id per occurrence, "remove the 2pm one" is an actual request.
    const { calls } = mockApi();
    render(<HabitsPage />);

    const plus = await screen.findByRole("button", { name: "Check in Run" });
    await userEvent.click(plus);
    await waitFor(() => expect(screen.getByText(/1 of 2 today/)).toBeInTheDocument());
    await userEvent.click(plus);
    await waitFor(() => expect(screen.getByText(/2 of 2 today/)).toBeInTheDocument());

    const chips = await screen.findAllByRole("button", { name: /Remove the .* check-in/ });
    expect(chips).toHaveLength(2);
    await userEvent.click(chips[0]!);

    await waitFor(() => {
      expect(screen.getByText(/1 of 2 today/)).toBeInTheDocument();
    });
    expect(calls.some((c) => c.method === "DELETE" && /\/h1\/checkins\/c1$/.test(c.url))).toBe(
      true,
    );
  });

  it("explains a 404 on load instead of showing the server's bare 'Not Found'", async () => {
    // This happened for real: the page was served by a uvicorn that predated the habits
    // router, and the only thing on screen was the word "Not Found". These paths are fixed,
    // so a 404 cannot mean "no such habit" — it can only mean the route is absent.
    window.localStorage.setItem("minimalbudget.token", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/auth/me")) return json(me);
        // The mood card answers normally here: this test is about the habits load, and two
        // banners would make it pass on the wrong one.
        if (url.includes("/api/mood/history")) return json(moodHistory);
        return json({ detail: "Not Found" }, 404);
      }),
    );
    render(<HabitsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("older build");
    expect(alert.textContent).not.toBe("Not Found");

    // And it must not also claim the account has no habits. The arrays are empty because
    // nothing arrived, not because there is nothing there — saying "No habits yet" beside a
    // failed load is the page answering a question it could not ask.
    expect(screen.queryByText(/No habits yet/)).toBeNull();
    expect(screen.queryByText("Nothing here yet.")).toBeNull();
  });

  it("opens the heat-map from the habit's name", async () => {
    mockApi();
    render(<HabitsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "History for Run" }));
    expect(await screen.findByRole("img", { name: /Run: the last/ })).toBeInTheDocument();
    // The legend has to say what an outlined square means, or the third state is invisible.
    expect(screen.getByText(/never a habit day/)).toBeInTheDocument();
  });

  it("archiving keeps the history and says so", async () => {
    const { calls } = mockApi();
    render(<HabitsPage />);

    const list = (await screen.findByText("Your habits")).closest("section") as HTMLElement;
    await userEvent.click(within(list).getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(screen.getByText(/archived\. Its history is kept\./)).toBeInTheDocument();
    });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toContain("/api/habits/h1");
  });

  it("deleting says how many check-ins go with it, and stops if you say no", async () => {
    const { calls } = mockApi();
    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<HabitsPage />);

    const list = (await screen.findByText("Your habits")).closest("section") as HTMLElement;
    await userEvent.click(within(list).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(confirmed).toHaveBeenCalledWith(expect.stringContaining("1 recorded check-in"));
    });
    expect(confirmed.mock.calls[0]?.[0]).toContain("Archiving keeps them");
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/api/habits/h1"))).toBe(
      false,
    );
  });

  it("adds a habit on chosen weekdays", async () => {
    const { calls } = mockApi();
    render(<HabitsPage />);

    await userEvent.type(await screen.findByLabelText("Habit name"), "Read");
    await userEvent.selectOptions(screen.getByLabelText("New habit: repeats"), "weekdays");
    // The picker seeds today's weekday; adding Wednesday and Friday makes it Mon/Wed/Fri on
    // a Monday, and some other pair otherwise — what matters is that a mask is sent at all.
    await userEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    await userEvent.click(screen.getByRole("button", { name: "Friday" }));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/habits"))).toBe(true);
    });
    const sent = JSON.parse(
      calls.find((c) => c.method === "POST" && c.url.endsWith("/api/habits"))?.body ?? "{}",
    );
    expect(sent.schedule_kind).toBe("weekdays");
    expect(sent.weekdays).toBeGreaterThan(0);
    // The columns this kind does not use are sent as null rather than left over from the
    // previous kind — the shape the database's own constraint insists on.
    expect(sent.interval_days).toBeNull();
    expect(sent.day_of_month).toBeNull();
  });

  it("will not turn off the last weekday", async () => {
    // A schedule with no days is refused by the database and means nothing anyway, so the
    // form must not be able to produce one.
    mockApi();
    render(<HabitsPage />);

    await userEvent.selectOptions(
      await screen.findByLabelText("New habit: repeats"),
      "weekdays",
    );
    const pressed = screen
      .getAllByRole("button", { pressed: true })
      .filter((button) => button.className.includes("day-toggle"));
    expect(pressed).toHaveLength(1);
    await userEvent.click(pressed[0]!);
    expect(
      screen.getAllByRole("button", { pressed: true }).filter((b) =>
        b.className.includes("day-toggle"),
      ),
    ).toHaveLength(1);
  });

  it("keeps the target a whole number at least one, as it is typed", async () => {
    // A controlled numeric input cannot hold "2." — React rewrites the value on every
    // keystroke — so a submit-time "must be a whole number" check could never fire and
    // "2.5" would silently have become 25. Clamping as it is typed is the honest version.
    mockApi();
    render(<HabitsPage />);

    const times = (await screen.findByLabelText(
      "New habit: times per occasion",
    )) as HTMLInputElement;

    // Emptied, it is 1 — never 0, never NaN.
    await userEvent.clear(times);
    expect(times.value).toBe("1");

    // Typing "2.5" onto that 1 goes "12", then "12." (the dot cannot survive — React
    // rewrites the value every keystroke), then "125", which the cap turns into 100.
    await userEvent.type(times, "2.5");
    expect(times.value).toBe("100");
  });

  it("refuses an incomplete schedule before sending it", async () => {
    const { calls } = mockApi();
    render(<HabitsPage />);

    await userEvent.type(await screen.findByLabelText("Habit name"), "Read");
    await userEvent.selectOptions(screen.getByLabelText("New habit: repeats"), "every_n_days");
    await userEvent.clear(screen.getByLabelText("New habit: interval in days"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("missing something");
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/habits"))).toBe(false);
  });

  it("shows the mood history here, and says it is not a habit", async () => {
    mockApi();
    render(<HabitsPage />);

    // The chart lives on this tab even though the model does not, so the page has to say
    // so: dropped between things that have targets and streaks, it would be read as one.
    expect(await screen.findByText(/not a habit/i)).toBeInTheDocument();
    expect(screen.getByText(/3 of 30 days answered/)).toBeInTheDocument();
    // Counts, never a mean: a five-point scale is ordinal, so there is no "3.4" anywhere.
    expect(screen.getByText(/Good days: 1 . not good: 1 . not said: 28/)).toBeInTheDocument();
  });

  it("keeps the habits usable when the mood endpoint is the one that fails", async () => {
    mockApi(null);
    render(<HabitsPage />);

    // AD-37: the page composes two modules and a failure costs its own card only. A
    // Promise.all beside the habits would have blanked the list this page exists for.
    expect(await screen.findByText(/0 of 2 today/)).toBeInTheDocument();
    expect(screen.getByText(/older build than this one/i)).toBeInTheDocument();
  });
});
