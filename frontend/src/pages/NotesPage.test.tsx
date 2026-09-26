import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotesPage } from "./NotesPage";
import { AuthProvider } from "../auth/AuthContext";
import { ToastProvider } from "../components/Toast";

/**
 * The note list (Epic 32, story 32.3).
 *
 * Held here: the order is the server's (pinned first), search is **sent, not applied**, a
 * note still on the device is shown from its draft with a line saying so, and a delete can
 * be undone under the id it had.
 */

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

const note = (overrides: Record<string, unknown>) => ({
  id: "n1",
  kind: "text",
  title: null,
  body: "buy milk",
  sketch: null,
  pinned: false,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
  ...overrides,
});

const server = [
  note({ id: "n2", title: "Pinned plan", body: "step one", pinned: true }),
  note({}),
  note({
    id: "n3",
    kind: "sketch",
    title: null,
    body: null,
    sketch: { strokes: [{ c: 0, w: 0, p: [1, 1, 50, 50] }] },
  }),
];

type Call = { url: string; method: string; body: string };

function mockApi(notes = server) {
  window.localStorage.setItem("everything-everywhere.token", "test-token");
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: String(init?.body ?? "") });
    if (url.includes("/api/auth/me")) return json(me);
    if (url.includes("/api/notes/") && method === "DELETE") return json(null, 204);
    if (url.includes("/api/notes/") && method === "PUT") return json(notes[0]);
    if (url.includes("/api/notes")) return json({ items: notes });
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

function render() {
  return rtlRender(
    <MemoryRouter initialEntries={["/notes"]}>
      <AuthProvider>
        <ToastProvider>
          <NotesPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const headings = () =>
  screen.getAllByRole("listitem").map((item) => item.querySelector(".note-heading")?.textContent);

describe("NotesPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists notes in the server's order, naming each by title or first line", async () => {
    mockApi();
    render();

    await screen.findByText("Pinned plan");
    expect(headings()).toEqual(["Pinned plan", "buy milk", "Untitled sketch"]);
    // A titled note shows its body under the title; an untitled one is named by it.
    expect(screen.getByText("step one")).toBeInTheDocument();
  });

  it("sends the search to the server rather than filtering on its own", async () => {
    const { calls } = mockApi();
    render();
    await screen.findByText("Pinned plan");

    await userEvent.type(screen.getByRole("searchbox", { name: "Search notes" }), "50%");
    await waitFor(() =>
      expect(calls.some((c) => c.method === "GET" && c.url.includes("q=50%25"))).toBe(true),
    );
  });

  it("shows a note still on the device from its draft, marked as not synced", async () => {
    // The draft cannot reach the server during this test's flush: its PUT is refused as
    // offline, so it stays pending and must still be drawn.
    const { calls } = mockApi();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: String(init?.body ?? "") });
      if (url.includes("/api/auth/me")) return json(me);
      if (method === "PUT") throw new TypeError("Failed to fetch");
      if (url.includes("/api/notes")) return json({ items: server });
      return json({ items: [] });
    });
    window.localStorage.setItem(
      "everything-everywhere.notes.drafts.u1",
      JSON.stringify({
        local: {
          note: { kind: "text", title: "Written offline", body: null, sketch: null, pinned: false },
          pending: true,
          refused: null,
          savedAt: "2026-09-26T10:00:00Z",
        },
      }),
    );
    render();

    const item = (await screen.findByText("Written offline")).closest("li");
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).getByText(/not synced yet/)).toBeInTheDocument();
    // Newest unpinned note: after the pinned one, before the older server notes.
    expect(headings()[1]).toBe("Written offline");
  });

  it("deletes a note and puts it back under the same id on undo", async () => {
    const { calls } = mockApi();
    render();
    await screen.findByText("buy milk");

    await userEvent.click(screen.getByRole("button", { name: "Delete buy milk" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/api/notes/n1"))).toBe(true),
    );

    await userEvent.click(await screen.findByRole("button", { name: /undo/i }));
    await waitFor(() => {
      const put = calls.find((c) => c.method === "PUT");
      expect(put?.url).toMatch(/\/api\/notes\/n1$/);
      expect(JSON.parse(put?.body ?? "{}").body).toBe("buy milk");
    });
  });

  it("pins by writing the whole note back with the pin flipped", async () => {
    const { calls } = mockApi();
    render();
    await screen.findByText("buy milk");

    await userEvent.click(screen.getByRole("button", { name: "Pin buy milk" }));
    await waitFor(() => {
      const put = calls.find((c) => c.method === "PUT");
      expect(put?.url).toMatch(/\/api\/notes\/n1$/);
      expect(JSON.parse(put?.body ?? "{}")).toMatchObject({ body: "buy milk", pinned: true });
    });
  });

  it("says there are no notes yet when the list is empty", async () => {
    mockApi([]);
    render();
    expect(await screen.findByText(/No notes yet/)).toBeInTheDocument();
  });
});
