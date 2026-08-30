import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  api,
  readRefreshToken,
  readToken,
  setUnauthorizedHandler,
  storeTokens,
  writeToken,
} from "./client";

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


describe("transparent refresh", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => setUnauthorizedHandler(null));

  function tokens(suffix: string) {
    return {
      access_token: `access-${suffix}`,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: `refresh-${suffix}`,
    };
  }

  it("refreshes once on a 401 and retries the original request", async () => {
    storeTokens(tokens("one"));
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/auth/refresh")) return respond(tokens("two"));
      // Fail while the stale access token is presented, succeed once it is refreshed.
      return readToken() === "access-two"
        ? respond({ items: [] })
        : respond({ detail: "expired" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.listCategories()).resolves.toEqual([]);
    expect(readToken()).toBe("access-two");
    expect(readRefreshToken()).toBe("refresh-two");
  });

  it("refreshes only once for concurrent requests", async () => {
    // The load-bearing case. Every refresh rotates, so five parallel refreshes would send
    // four already-rotated tokens, trip the server's reuse detection, and sign the user
    // out for the crime of loading a page with five requests on it.
    storeTokens(tokens("one"));
    let refreshes = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/auth/refresh")) {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return respond(tokens("two"));
      }
      return readToken() === "access-two"
        ? respond({ items: [] })
        : respond({ detail: "expired" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      api.listCategories(),
      api.listEntries(),
      api.listBudgets(),
      api.listSavingsTypes(),
      api.listTargets(),
    ]);

    expect(refreshes).toBe(1);
  });

  it("signs the user out when the refresh itself fails", async () => {
    storeTokens(tokens("one"));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/api/auth/refresh")
          ? respond({ detail: "please sign in" }, 401)
          : respond({ detail: "expired" }, 401),
      ),
    );

    await expect(api.listCategories()).rejects.toBeInstanceOf(ApiError);
    expect(readToken()).toBeNull();
    expect(readRefreshToken()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not try to refresh the auth endpoints themselves", async () => {
    // Otherwise a wrong password would trigger a refresh attempt on the way to reporting
    // itself, and a failed login would look like an expired session.
    storeTokens(tokens("one"));
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      respond({ detail: "Incorrect email or password" }, 401),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.login("a@example.com", "wrong-password")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/refresh"))).toBe(false);
  });
});
