import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";
import { AuthProvider } from "../auth/AuthContext";
import { LanguageProvider } from "../i18n";
import { ToastProvider } from "../components/Toast";
import { ACCENTS, MODES, ThemeProvider } from "../theme";

function render(ui: React.ReactElement) {
  return rtlRender(wrap(ui));
}

function wrap(ui: React.ReactElement) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LanguageProvider>
          <ToastProvider>{ui}</ToastProvider>
        </LanguageProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CSV_BODY = "date,kind,category";
const me = {
  id: "u1",
  email: "sam@example.com",
  currency: "USD",
  weight_unit: "kg",
  budget_start_day: 1,
  created_at: "",
};

function mockApi(overrides: { currencyStatus?: number; currencyDetail?: string } = {}) {
  window.localStorage.setItem("everything-everywhere.token", "test-token");
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.includes("/api/auth/me/currency")) {
      if (overrides.currencyStatus && overrides.currencyStatus !== 200) {
        return json({ detail: overrides.currencyDetail }, overrides.currencyStatus);
      }
      return json({ ...me, currency: JSON.parse(String(init?.body)).currency });
    }
    if (url.includes("/api/auth/me/budget-start-day")) {
      return json({ ...me, budget_start_day: JSON.parse(String(init?.body)).budget_start_day });
    }
    if (url.includes("/api/auth/me/recovery-codes") && method === "GET") {
      return json({ unused: 3, total: 8 });
    }
    if (url.includes("/api/export/")) {
      return new Response(CSV_BODY, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="everything-everywhere-entries-2026-09-05.csv"',
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

  it("previews a theme and accent, and keeps them on this device only on Save", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("sam@example.com");
    const calls = fetchMock.mock.calls.length;
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Theme"), "oled");
    await user.click(screen.getByRole("radio", { name: "Teal" }));

    expect(document.documentElement.dataset.theme).toBe("oled");
    expect(document.documentElement.dataset.accent).toBe("teal");
    expect(screen.getByRole("radio", { name: "Teal" })).toBeChecked();
    expect(window.localStorage.getItem("everything-everywhere.theme")).toBeNull();

    await user.click(save);
    expect(window.localStorage.getItem("everything-everywhere.theme")).toBe("oled");
    expect(window.localStorage.getItem("everything-everywhere.accent")).toBe("teal");
    expect(save).toBeDisabled();
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("offers sepia and every accent, and saves them like the others", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("sam@example.com");

    const modes = [...(screen.getByLabelText("Theme") as HTMLSelectElement).options].map((o) => o.value);
    expect(modes).toEqual([...MODES]);
    for (const name of ["Blue", "Indigo", "Violet", "Magenta", "Teal", "Graphite", "Slate", "Cobalt", "Plum"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("radio")).toHaveLength(ACCENTS.length);

    await user.selectOptions(screen.getByLabelText("Theme"), "sepia");
    await user.click(screen.getByRole("radio", { name: "Plum" }));
    expect(document.documentElement.dataset.theme).toBe("sepia");
    expect(document.documentElement.dataset.accent).toBe("plum");

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(window.localStorage.getItem("everything-everywhere.theme")).toBe("sepia");
    expect(window.localStorage.getItem("everything-everywhere.accent")).toBe("plum");
  });

  it("drops an unsaved preview when Settings is left", async () => {
    mockApi();
    const user = userEvent.setup();
    const { rerender } = render(<SettingsPage />);
    await screen.findByText("sam@example.com");

    await user.click(screen.getByRole("radio", { name: "Violet" }));
    expect(document.documentElement.dataset.accent).toBe("violet");
    // Navigate away: Settings goes, the provider stays.
    rerender(wrap(<p>elsewhere</p>));

    expect(document.documentElement.dataset.accent).toBe("blue");
    expect(window.localStorage.getItem("everything-everywhere.accent")).toBeNull();
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
    await waitFor(() => expect(window.localStorage.getItem("everything-everywhere.token")).toBeNull());
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
    expect(clicked[0]?.download).toBe("everything-everywhere-entries-2026-09-05.csv");
    // The blob URL is released rather than held for the life of the page.
    expect(created).toEqual(["blob:fake"]);
    // A plain link could not carry this, which is why it is fetched.
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/export/"));
    expect(new Headers((call![1] as RequestInit).headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
    click.mockRestore();
  });

  it("sets the budget month start, and spells out what it covers", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText("Budget month");

    await user.selectOptions(screen.getByLabelText("Budget month starts on day"), "26");

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/api/auth/me/budget-start-day"),
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({
        budget_start_day: 26,
      });
    });
  });

  it("offers no day that is missing from some month", async () => {
    mockApi();
    render(<SettingsPage />);
    await screen.findByText("Budget month");

    const options = within(screen.getByLabelText("Budget month starts on day")).getAllByRole(
      "option",
    );
    // 29, 30 and 31 do not exist in February, and a clamped boundary breaks the arithmetic.
    expect(options).toHaveLength(28);
    expect(options.at(-1)).toHaveValue("28");
  });
});
