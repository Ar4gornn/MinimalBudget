import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteInput } from "../api/types";
import { clearAllDrafts, flushDrafts, keepDraft, readDrafts, saveDraft } from "./drafts";

/**
 * The device's drafts (Epic 32, AD-48). The promise under test: a note written with no
 * network is kept until the server has *that* content, and is then sent exactly once, under
 * the id it was written with.
 */

const text = (body: string): NoteInput => ({
  kind: "text",
  title: null,
  body,
  sketch: null,
  pinned: false,
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const saved = (id: string, note: NoteInput) => ({
  id,
  ...note,
  created_at: "2026-09-26T10:00:00Z",
  updated_at: "2026-09-26T10:00:00Z",
});

describe("drafts", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops the draft once the server has it", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json(saved("n1", text("milk")), 201),
    );
    vi.stubGlobal("fetch", fetchMock);
    keepDraft("u1", "n1", text("milk"));

    const outcome = await saveDraft("u1", "n1", text("milk"));
    expect(outcome.state).toBe("saved");
    expect(readDrafts("u1")).toEqual({});
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/notes/n1");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
  });

  it("keeps it pending when there is no network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    keepDraft("u1", "n1", text("on the train"));

    expect((await saveDraft("u1", "n1", text("on the train"))).state).toBe("offline");
    expect(readDrafts("u1")["n1"]?.pending).toBe(true);
    expect(readDrafts("u1")["n1"]?.note.body).toBe("on the train");
  });

  it("keeps a refused draft but stops retrying it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "a note needs a title or some text", code: "note_empty" }, 422)),
    );
    keepDraft("u1", "n1", text("x"));

    expect((await saveDraft("u1", "n1", text("x"))).state).toBe("refused");
    const draft = readDrafts("u1")["n1"];
    expect(draft?.pending).toBe(false);
    expect(draft?.refused).toBe("note_empty");
  });

  it("keeps what was typed while the save was in flight", async () => {
    // The server answers for "first"; by then the person has typed "first, second". Made
    // red by dropping the draft on every success.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        keepDraft("u1", "n1", text("first, second"));
        return json(saved("n1", text("first")));
      }),
    );
    keepDraft("u1", "n1", text("first"));

    await saveDraft("u1", "n1", text("first"));
    expect(readDrafts("u1")["n1"]?.note.body).toBe("first, second");
    expect(readDrafts("u1")["n1"]?.pending).toBe(true);
  });

  it("flushes every pending draft once, even when asked twice at the same moment", async () => {
    const fetchMock = vi.fn(async (url: string) => json(saved(url.split("/").pop() ?? "", text("a"))));
    vi.stubGlobal("fetch", fetchMock);
    keepDraft("u1", "n1", text("a"));
    keepDraft("u1", "n2", text("b"));

    // The `online` event and the app's start, together. Made red by removing the
    // single-flight: four PUTs.
    const [first, second] = await Promise.all([flushDrafts("u1"), flushDrafts("u1")]);
    expect(first).toBe(2);
    expect(second).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readDrafts("u1")).toEqual({});
  });

  it("stops at the first draft that finds no network rather than trying each", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    keepDraft("u1", "n1", text("a"));
    keepDraft("u1", "n2", text("b"));

    expect(await flushDrafts("u1")).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Object.keys(readDrafts("u1"))).toEqual(["n1", "n2"]);
  });

  it("keeps each account's drafts apart, and sign-out clears them all", () => {
    keepDraft("u1", "n1", text("mine"));
    keepDraft("u2", "n2", text("theirs"));
    expect(Object.keys(readDrafts("u1"))).toEqual(["n1"]);
    expect(Object.keys(readDrafts("u2"))).toEqual(["n2"]);

    window.localStorage.setItem("everything-everywhere.language", "fr");
    clearAllDrafts();
    expect(readDrafts("u1")).toEqual({});
    expect(readDrafts("u2")).toEqual({});
    // Only the drafts: a sign-out must not forget the language.
    expect(window.localStorage.getItem("everything-everywhere.language")).toBe("fr");
  });

  it("reads a corrupt store as no drafts rather than throwing", () => {
    window.localStorage.setItem("everything-everywhere.notes.drafts.u1", "{not json");
    expect(readDrafts("u1")).toEqual({});
  });
});
