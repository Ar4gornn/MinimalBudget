import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInPage } from "./SignInPage";
import { AuthProvider } from "../auth/AuthContext";

function render(ui: React.ReactElement) {
  return rtlRender(<AuthProvider>{ui}</AuthProvider>);
}

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const token = {
  access_token: "access",
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "refresh",
};
const me = { id: "u1", email: "sam@example.com", currency: "USD", created_at: "" };

function mockApi(recoverStatus = 204) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes("/api/auth/recover")) {
      return recoverStatus === 204
        ? json(null, 204)
        : json({ detail: "Incorrect email or recovery code" }, recoverStatus);
    }
    if (url.includes("/api/auth/login")) return json(token);
    if (url.includes("/api/auth/me")) return json(me);
    return json({ detail: `unexpected ${url}` }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("SignInPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("lets the password be shown", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<SignInPage />);

    const field = screen.getByLabelText("Password") as HTMLInputElement;
    expect(field.type).toBe("password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(field.type).toBe("text");
  });

  it("recovers with email, code and new password, then signs in", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));
    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Recovery code"), " ABCDE-FGHJK ");
    await user.type(screen.getByLabelText("New password"), "a-brand-new-password");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    await waitFor(() => {
      const recover = fetchMock.mock.calls.find(([url]) => String(url).includes("/recover"));
      expect(recover).toBeDefined();
      const body = JSON.parse(String(recover?.[1]?.body));
      expect(body).toEqual({
        email: "sam@example.com",
        code: "ABCDE-FGHJK",
        new_password: "a-brand-new-password",
      });
    });
    // Then a normal sign-in with the new password.
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/login"))).toBe(true);
    });
  });

  it("shows the server's refusal and stays on the recovery form", async () => {
    mockApi(401);
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));
    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Recovery code"), "wrong-wrong");
    await user.type(screen.getByLabelText("New password"), "a-brand-new-password");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or recovery code");
    expect(screen.getByLabelText("Recovery code")).toBeInTheDocument();
  });
});
