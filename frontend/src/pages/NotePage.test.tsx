import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotePage } from "./NotePage";
import { AuthProvider } from "../auth/AuthContext";
import { ToastProvider } from "../components/Toast";
import { readDrafts } from "../notes/drafts";

/**
 * The note editor (Epic 32, story 32.2).
 *
 * What is held: the words are on the device the moment they are typed, the server gets
 * them under the id minted when the note opened, "Saved" is only said once the server has
 * them, and with no network the line says where they are instead.
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

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function render(path: string) {
  return rtlRender(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/notes/:noteId" element={<NotePage />} />
            <Route path="/notes" element={<p>the list</p>} />
          </Routes>
          <Where />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

type Call = { url: string; method: string; body: string };

function mockApi(options: { offline?: boolean; existing?: Record<string, unknown> } = {}) {
  window.localStorage.setItem("everything-everywhere.token", "test-token");
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: String(init?.body ?? "") });
    if (url.includes("/api/auth/me")) return json(me);
    if (url.includes("/api/notes/")) {
      if (options.offline) throw new TypeError("Failed to fetch");
      if (method === "PUT") {
        const id = url.split("/").pop();
        return json({ id, ...JSON.parse(String(init?.body)), created_at: "", updated_at: "" }, 201);
      }
      if (method === "DELETE") return json(null, 204);
      if (options.existing) return json(options.existing);
      return json({ detail: "No note with that id", code: "not_found" }, 404);
    }
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");

describe("NotePage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a new note on the device at once and sends it under its own id", async () => {
    const { calls } = mockApi();
    render("/notes/new");

    const body = await screen.findByLabelText("Note");
    await userEvent.type(body, "buy milk");

    // The address now carries the id minted when the note opened.
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/^\/notes\/[0-9a-f-]{36}$/));
    const id = screen.getByTestId("where").textContent?.split("/").pop() ?? "";
    expect(readDrafts("u1")[id]?.note.body).toBe("buy milk");

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/notes"));

    const sent = puts(calls);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((c) => c.url.endsWith(`/api/notes/${id}`))).toBe(true);
    expect(JSON.parse(sent[sent.length - 1]?.body ?? "{}")).toEqual({
      kind: "text",
      title: null,
      body: "buy milk",
      sketch: null,
      pinned: false,
    });
    // The server has it, so the device no longer needs to.
    expect(readDrafts("u1")).toEqual({});
  });

  it("says the note is on this device when there is no network, and keeps it", async () => {
    mockApi({ offline: true });
    render("/notes/new");

    await userEvent.type(await screen.findByLabelText("Note"), "on the train");
    // Hiding the app sends at once rather than after the delay.
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    fireEvent(document, new Event("visibilitychange"));

    expect(await screen.findByText("On this device — will sync when online")).toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    const drafts = Object.values(readDrafts("u1"));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.pending).toBe(true);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("offers text or sketch only until something is written", async () => {
    mockApi();
    render("/notes/new");

    expect(await screen.findByRole("button", { name: "Sketch" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Note"), "x");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Sketch" })).not.toBeInTheDocument(),
    );
  });

  it("opens a sketch from the shortcut's address, with the drawing tools", async () => {
    mockApi();
    render("/notes/new?kind=sketch");

    expect(await screen.findByRole("img", { name: "Drawing area" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eraser" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.queryByLabelText("Note")).not.toBeInTheDocument();
  });

  it("prefers the device's unsynced copy over the server's when opening a note", async () => {
    const { calls } = mockApi({
      existing: {
        id: "n1",
        kind: "text",
        title: null,
        body: "old",
        sketch: null,
        pinned: false,
        created_at: "",
        updated_at: "",
      },
    });
    window.localStorage.setItem(
      "everything-everywhere.notes.drafts.u1",
      JSON.stringify({
        n1: {
          note: { kind: "text", title: null, body: "newer", sketch: null, pinned: false },
          pending: true,
          refused: null,
          savedAt: "2026-09-26T10:00:00Z",
        },
      }),
    );
    render("/notes/n1");

    expect(await screen.findByDisplayValue("newer")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/api/notes/n1"))).toBe(false);
  });

  it("says so when the note is not there", async () => {
    mockApi();
    render("/notes/9b2c7c1e-0000-4000-8000-000000000000");
    expect(await screen.findByText("This note is not here any more.")).toBeInTheDocument();
  });
});
