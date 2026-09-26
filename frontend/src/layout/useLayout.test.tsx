import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Preferences, PreferencesPatch } from "../api/types";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { DEFAULT_PREFERENCES, applyPatch } from "./preferences";
import { PHONE_QUERY, useLayout, usePreferences } from "./useLayout";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A controllable `(max-width: 720px)`. jsdom has no matchMedia at all. */
function stubScreen(phone: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return phone;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  const matchMedia = vi.fn((q: string) => {
    expect(q).toBe(PHONE_QUERY);
    return query;
  });
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    resize(nowPhone: boolean) {
      phone = nowPhone;
      for (const fn of listeners) fn();
    },
  };
}

function LayoutProbe() {
  return <p>{useLayout()}</p>;
}

describe("useLayout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is a desktop without matchMedia", () => {
    render(<LayoutProbe />);
    expect(screen.getByText("desktop")).toBeInTheDocument();
  });

  it("follows the 720px breakpoint live", () => {
    const screenSize = stubScreen(true);
    render(<LayoutProbe />);
    expect(screen.getByText("phone")).toBeInTheDocument();
    act(() => screenSize.resize(false));
    expect(screen.getByText("desktop")).toBeInTheDocument();
  });
});

describe("usePreferences", () => {
  const gymOff: PreferencesPatch = { modules: { ...DEFAULT_PREFERENCES.modules, gym: false } };
  let patchAnswer: () => Response;
  let requests: { url: string; method: string; body: unknown }[];

  function signedIn(preferences: Preferences | undefined) {
    window.localStorage.setItem("everything-everywhere.token", "test-token");
    requests = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        const user = { id: "u1", email: "sam@example.com", currency: "USD", created_at: "" };
        if (url.includes("/api/auth/me/preferences")) return patchAnswer();
        if (url.includes("/api/auth/me")) return json({ ...user, preferences });
        return json({});
      }),
    );
  }

  function Probe() {
    const { current, preferences, layout, update } = usePreferences();
    return (
      <div>
        <p>layout {layout}</p>
        <p>gym {String(preferences.modules.gym)}</p>
        <p>first card {current.cards[0]?.id}</p>
        <button type="button" onClick={() => void update(gymOff).catch(() => undefined)}>
          gym off
        </button>
      </div>
    );
  }

  beforeEach(() => {
    stubScreen(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the account's preferences with no request of its own", async () => {
    const phone = { ...DEFAULT_PREFERENCES.phone, cards: [...DEFAULT_PREFERENCES.phone.cards].reverse() };
    signedIn({ ...DEFAULT_PREFERENCES, phone });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("first card categories")).toBeInTheDocument();
    expect(screen.getByText("layout phone")).toBeInTheDocument();
    expect(requests.map((r) => r.url)).toEqual([expect.stringContaining("/api/auth/me")]);
  });

  it("falls back to the app as it was for a server without them", async () => {
    signedIn(undefined);
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("first card stats")).toBeInTheDocument();
    expect(screen.getByText("gym true")).toBeInTheDocument();
  });

  it("keeps a change when the server agrees", async () => {
    // "At once" is the saver's own test; this one proves the wiring sends the patch.
    signedIn(DEFAULT_PREFERENCES);
    patchAnswer = () => json({ id: "u1", email: "sam@example.com", currency: "USD",
      created_at: "", preferences: applyPatch(DEFAULT_PREFERENCES, gymOff) });
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText("gym true");

    await userEvent.click(screen.getByRole("button", { name: "gym off" }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual(gymOff),
    );
    expect(screen.getByText("gym false")).toBeInTheDocument();
  });

  it("does not land a slow save on the next account to sign in", async () => {
    // Sam switches Gym off, signs out before the save answers, and Alex signs in on the
    // same browser. Sam's answer must not become Alex's screen.
    signedIn(DEFAULT_PREFERENCES);
    let answerSam!: (r: Response) => void;
    patchAnswer = () => undefined as never;
    const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.includes("/api/auth/me/preferences")) {
        return new Promise<Response>((resolve) => {
          answerSam = resolve;
        });
      }
      if (url.includes("/api/auth/login")) {
        return json({ access_token: "t2", refresh_token: "r2", token_type: "bearer", expires_in: 900 });
      }
      if (url.includes("/api/auth/logout")) return new Response(null, { status: 204 });
      if (url.includes("/api/auth/me") && method === "GET") {
        const who = window.localStorage.getItem("everything-everywhere.token") === "t2"
          ? { id: "u2", email: "alex@example.com" }
          : { id: "u1", email: "sam@example.com" };
        return json({ ...who, currency: "USD", created_at: "", preferences: DEFAULT_PREFERENCES });
      }
      return json({});
    });
    vi.stubGlobal("fetch", fetchStub);

    function Accounts() {
      const { signOut, signIn, user } = useAuth();
      return (
        <div>
          <p>who {user?.id ?? "nobody"}</p>
          <button type="button" onClick={signOut}>sign out</button>
          <button type="button" onClick={() => void signIn("alex@example.com", "correct-horse")}>
            sign in
          </button>
        </div>
      );
    }
    function Screen() {
      const { user } = useAuth();
      return user ? <Probe /> : null;
    }

    render(<AuthProvider><Accounts /><Screen /></AuthProvider>);
    await screen.findByText("gym true");
    await userEvent.click(screen.getByRole("button", { name: "gym off" }));
    expect(screen.getByText("gym false")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "sign out" }));
    await userEvent.click(screen.getByRole("button", { name: "sign in" }));
    await screen.findByText("who u2");
    expect(screen.getByText("gym true")).toBeInTheDocument();

    await act(async () => {
      answerSam(json({ id: "u1", email: "sam@example.com", currency: "USD", created_at: "",
        preferences: applyPatch(DEFAULT_PREFERENCES, gymOff) }));
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("who u2")).toBeInTheDocument();
    expect(screen.getByText("gym true")).toBeInTheDocument();
  });

  it("puts it back when the save fails", async () => {
    signedIn(DEFAULT_PREFERENCES);
    patchAnswer = () => json({ detail: "boom", code: "error" }, 500);
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText("gym true");

    await userEvent.click(screen.getByRole("button", { name: "gym off" }));
    await waitFor(() => expect(screen.getByText("gym true")).toBeInTheDocument());
    expect(requests.some((r) => r.method === "PATCH")).toBe(true);
  });
});
