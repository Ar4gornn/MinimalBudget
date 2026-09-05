import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GymPage } from "./GymPage";
import { AuthProvider } from "../auth/AuthContext";
import { ToastProvider } from "../components/Toast";
import type { Exercise, Routine } from "../api/types";

// GymPage reads the account's weight unit, so it needs the auth context.
function render(ui: React.ReactElement) {
  return rtlRender(
    <AuthProvider>
      <ToastProvider>{ui}</ToastProvider>
    </AuthProvider>,
  );
}

const me = {
  id: "u1",
  email: "sam@example.com",
  currency: "USD",
  weight_unit: "kg",
  created_at: "",
};

const routines: Routine[] = [{ id: "r1", name: "Push day", note: null, created_at: "" }];
const exercises: Exercise[] = [
  { id: "e1", name: "Bench press", video_url: "https://youtu.be/abc", note: null, created_at: "" },
];

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockApi(overrides: { sets?: unknown[] } = {}) {
  window.localStorage.setItem("minimalbudget.token", "test-token");
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.includes("/api/auth/me")) return json(me);
    if (url.includes("/api/gym/routines/r1")) {
      return json({
        id: "r1",
        name: "Push day",
        note: null,
        lines: [
          {
            id: "l1",
            exercise_id: "e1",
            exercise_name: "Bench press",
            video_url: "https://youtu.be/abc",
            position: 0,
            target_sets: 4,
            target_reps: 8,
          },
        ],
      });
    }
    if (url.includes("/api/gym/routines") && method === "POST") {
      return json({ id: "r2", name: "Pull day", note: null, created_at: "" }, 201);
    }
    if (url.includes("/api/gym/routines")) return json({ items: routines });
    if (url.includes("/api/gym/exercises")) return json({ items: exercises });
    if (url.includes("/sets") && method === "POST") {
      return json({ id: "s1", ...JSON.parse(String(init?.body)) }, 201);
    }
    if (url.includes("/api/gym/workouts") && method === "POST") {
      return json({ id: "w1", routine_id: "r1", performed_on: "2026-09-05", note: null }, 201);
    }
    if (url.match(/\/api\/gym\/workouts\/w1$/)) {
      return json({
        id: "w1",
        routine_id: "r1",
        performed_on: "2026-09-05",
        note: null,
        sets: overrides.sets ?? [],
      });
    }
    if (url.includes("/api/gym/workouts")) return json({ items: [] });
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function posted(mock: ReturnType<typeof vi.fn>, fragment: string) {
  return mock.mock.calls
    .filter(
      ([url, init]) =>
        String(url).includes(fragment) && (init as RequestInit | undefined)?.method === "POST",
    )
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

describe("GymPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("offers each routine as a way to start a session", async () => {
    mockApi();
    render(<GymPage />);
    expect(await screen.findByRole("button", { name: "Start Push day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Push day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start empty" })).toBeInTheDocument();
  });

  it("starting from a routine creates a session with no sets in it", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<GymPage />);
    await screen.findByRole("button", { name: "Start Push day" });

    await user.click(screen.getByRole("button", { name: "Start Push day" }));

    await waitFor(() => {
      expect(posted(fetchMock, "/api/gym/workouts")[0]).toMatchObject({ routine_id: "r1" });
    });
    // A target is not a record: the routine prefills the form, it does not write sets.
    expect(await screen.findByText("No sets yet.")).toBeInTheDocument();
    expect(posted(fetchMock, "/sets")).toHaveLength(0);
    // And the first exercise of the routine is already in the field, ready to log.
    await waitFor(() => expect(screen.getByLabelText("Exercise")).toHaveValue("Bench press"));
  });

  it("logs a set with a weight, and without one for bodyweight", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<GymPage />);
    await screen.findByRole("button", { name: "Start empty" });
    await user.click(screen.getByRole("button", { name: "Start empty" }));
    await screen.findByRole("form", { name: "Log a set" });

    await user.type(screen.getByLabelText("Exercise"), "Bench press");
    await user.type(screen.getByLabelText("Reps"), "8");
    await user.type(screen.getByLabelText("Weight in kg"), "82.5");
    await user.click(screen.getByRole("button", { name: "Log set" }));

    await waitFor(() =>
      expect(posted(fetchMock, "/sets")[0]).toEqual({
        exercise_name: "Bench press",
        reps: 8,
        weight: "82.5",
      }),
    );

    // Blank weight: the field is simply absent, rather than sent as zero.
    await user.clear(screen.getByLabelText("Weight in kg"));
    await user.type(screen.getByLabelText("Reps"), "10");
    await user.click(screen.getByRole("button", { name: "Log set" }));
    await waitFor(() => expect(posted(fetchMock, "/sets")).toHaveLength(2));
    expect(posted(fetchMock, "/sets")[1]).not.toHaveProperty("weight");
  });

  it("refuses a weight that is not a two-place decimal before it reaches the server", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<GymPage />);
    await screen.findByRole("button", { name: "Start empty" });
    await user.click(screen.getByRole("button", { name: "Start empty" }));
    await screen.findByRole("form", { name: "Log a set" });

    await user.type(screen.getByLabelText("Exercise"), "Bench press");
    await user.type(screen.getByLabelText("Reps"), "5");
    await user.type(screen.getByLabelText("Weight in kg"), "82.567");
    await user.click(screen.getByRole("button", { name: "Log set" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("two decimal places");
    expect(posted(fetchMock, "/sets")).toHaveLength(0);
  });

  it("shows a bodyweight set as bodyweight rather than as zero", async () => {
    mockApi({
      sets: [
        {
          id: "s1",
          exercise_id: "e1",
          exercise_name: "Pull-up",
          position: 0,
          reps: 10,
          weight: null,
        },
      ],
    });
    const user = userEvent.setup();
    render(<GymPage />);
    await screen.findByRole("button", { name: "Start empty" });
    await user.click(screen.getByRole("button", { name: "Start empty" }));

    const table = await screen.findByRole("table", { name: "Sets" });
    expect(within(table).getByText("bodyweight")).toBeInTheDocument();
    expect(within(table).queryByText("0.00")).toBeNull();
  });

  it("links a form video safely, never framing it", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<GymPage />);
    await screen.findByRole("button", { name: "Start Push day" });

    // The chip in the Routines card opens it for editing; the button above starts a session.
    await user.click(screen.getByRole("button", { name: "Edit Push day" }));

    const link = await screen.findByRole("link", { name: "video" });
    expect(link).toHaveAttribute("href", "https://youtu.be/abc");
    expect(link).toHaveAttribute("target", "_blank");
    // noopener so the opened page cannot reach back through window.opener.
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(document.querySelector("iframe")).toBeNull();
  });
});
