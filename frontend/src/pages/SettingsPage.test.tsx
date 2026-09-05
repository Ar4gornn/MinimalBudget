import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";
import { AuthProvider } from "../auth/AuthContext";
import { ToastProvider } from "../components/Toast";

function render(ui: React.ReactElement) {
  return rtlRender(
    <AuthProvider>
      <ToastProvider>{ui}</ToastProvider>
    </AuthProvider>,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CSV_BODY = "date,kind,category";
const me = { id: "u1", email: "sam@example.com", currency: "USD", created_at: "" };

function mockApi(overrides: { currencyStatus?: number; currencyDetail?: string } = {}) {
  window.localStorage.setItem("minimalbudget.token", "test-token");
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.includes("/api/auth/me/currency")) {
      if (overrides.currencyStatus && overrides.currencyStatus !== 200) {
        return json({ detail: overrides.currencyDetail }, overrides.currencyStatus);
      }
      return json({ ...me, currency: JSON.parse(String(init?.body)).currency });
    }
    if (url.includes("/api/auth/me/recovery-codes") && method === "GET") {
      return json({ unused: 3, total: 8 });
    }
    if (url.includes("/api/export/")) {
      return new Response(CSV_BODY, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="minimalbudget-entries-2026-09-05.csv"',
        },
      });
    }
    if (url.includes("/api/auth/me")) return json(me);
    if (url.includes("/api/auth/logout")) return json(null, 204);
    return json({ detail: `unexpected ${url}` }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("shows who is signed in and their recovery-code status", async () => {
    mockApi();
    render(<SettingsPage />);
    expect(await screen.findByText("sam@example.com")).toBeInTheDocument();
    expect(await screen.findByText(/3 of 8 unused/)).toBeInTheDocument();
  });

  it("changes the currency with a PATCH and re-reads the profile", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("sam@example.com");

    await user.selectOptions(screen.getByLabelText("Account currency"), "EUR");
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(patch?.[0]).toContain("/api/auth/me/currency");
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ currency: "EUR" });
    });
  });

  it("shows why the currency is locked rather than a generic failure", async () => {
    mockApi({
      currencyStatus: 409,
      currencyDetail: "This account already has entries. Changing the currency would relabel them.",
    });
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("sam@example.com");

    await user.selectOptions(screen.getByLabelText("Account currency"), "EUR");
    expect(await screen.findByRole("alert")).toHaveTextContent("already has entries");
  });

  it("signs out from here", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("sam@example.com");

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(window.localStorage.getItem("minimalbudget.token")).toBeNull());
  });

  it("downloads an export with the token, under the name the server gives it", async () => {
    const clicked: { href: string; download: string }[] = [];
    const created: string[] = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn((url: string) => created.push(url)),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ href: this.href, download: this.download });
      });

    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("Export");

    await user.click(screen.getByRole("button", { name: "Entries CSV" }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    // Named by the server's Content-Disposition, not by the client.
    expect(clicked[0]?.download).toBe("minimalbudget-entries-2026-09-05.csv");
    // The blob URL is released rather than held for the life of the page.
    expect(created).toEqual(["blob:fake"]);
    // A plain link could not carry this, which is why it is fetched.
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/export/"));
    expect(new Headers((call?.[1] as RequestInit).headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
    click.mockRestore();
  });
});
