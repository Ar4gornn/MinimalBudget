import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, readToken, setUnauthorizedHandler, writeToken } from "./client";

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
  });

  it("unwraps the items envelope so no caller has to know about it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respond({ items: [{ id: "1", kind: "expense", name: "Rent", created_at: "" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const categories = await api.listCategories();

    expect(Array.isArray(categories)).toBe(true);
    expect(categories[0]?.name).toBe("Rent");
  });

  it("attaches the bearer token when there is one, and not when there is not", async () => {
    // A fresh Response per call: a Response body can only be read once, so reusing one
    // object makes the second call fail in a way that looks like a client bug.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      respond({ items: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.listCategories();
    const anonymous = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(anonymous.get("Authorization")).toBeNull();

    writeToken("a-token");
    await api.listCategories();
    const authenticated = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(authenticated.get("Authorization")).toBe("Bearer a-token");
  });

  it("clears the token and calls the handler exactly once on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ detail: "nope" }, 401)));
    writeToken("stale");
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await expect(api.me()).rejects.toBeInstanceOf(ApiError);

    expect(readToken()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server's detail message rather than a generic failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respond({ detail: "That category still has entries" }, 409)),
    );

    await expect(api.deleteCategory("abc")).rejects.toMatchObject({
      status: 409,
      message: "That category still has entries",
    });
  });

  it("reads the first message out of a 422 validation body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respond({ detail: [{ msg: "amounts carry at most two decimal places" }] }, 422),
      ),
    );

    await expect(
      api.createEntry({
        kind: "expense",
        amount: "1.234",
        occurred_on: "2026-08-01",
        category_name: "Food",
      }),
    ).rejects.toMatchObject({ message: "amounts carry at most two decimal places" });
  });

  it("handles a 204 with no body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(null, 204)));
    await expect(api.deleteEntry("abc")).resolves.toBeUndefined();
  });

  it("drops empty query parameters instead of sending blanks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await api.listEntries({ month: "2026-08", category_id: "" });

    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://test.invalid");
    expect(requested.pathname + requested.search).toBe("/api/entries?month=2026-08");
  });

  it("survives localStorage throwing, as it does in a private window", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readToken()).toBeNull();
    getItem.mockRestore();
  });
});
