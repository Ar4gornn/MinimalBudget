import { useState, type FormEvent } from "react";

import { api } from "../api/client";
import { ErrorBanner } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import type { Currency } from "../api/types";

export function SignInPage() {
  const { signIn, register } = useAuth();
  const [mode, setMode] = useState<"signin" | "register" | "recover">("signin");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A typo in a hidden field is indistinguishable from a wrong password, and eight wrong
  // passwords lock the account for fifteen minutes. Letting people look is cheaper.
  const [showPassword, setShowPassword] = useState(false);

  const registering = mode === "register";
  const recovering = mode === "recover";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (registering) await register(email, password, inviteCode, currency);
      else if (recovering) {
        // The code sets the password and revokes every session; then sign in with it.
        await api.recover(email, recoveryCode, password);
        await signIn(email, password);
      } else await signIn(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin">
      <h1>MinimalBudget</h1>
      <p className="hint">
        {registering
          ? "Create an account. Your data is visible only to you."
          : recovering
            ? "Enter your email, one unused recovery code, and a new password."
            : "Sign in to your account."}
      </p>

      <form className="stack" onSubmit={submit}>
        <ErrorBanner message={error} />

        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        {recovering && (
          <label>
            Recovery code
            <input
              name="recovery-code"
              autoComplete="off"
              placeholder="xxxxx-xxxxx"
              required
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value)}
            />
          </label>
        )}

        <label>
          {recovering ? "New password" : "Password"}
          <div className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete={registering || recovering ? "new-password" : "current-password"}
              required
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="quiet"
              onClick={() => setShowPassword((was) => !was)}
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {registering && (
          <>
            <label>
              Invite code
              <input
                name="invite-code"
                autoComplete="off"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
              />
            </label>
            <label>
              Currency
              <select
                aria-label="Currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as Currency)}
              >
                <option value="USD">US dollars ($)</option>
                <option value="EUR">Euros (€)</option>
              </select>
            </label>
            <p className="hint">
              Passwords need at least 10 characters. An invite code is required unless this
              instance is running in open mode. Your currency can only be changed while the
              account is still empty — amounts are stored, not converted.
            </p>
          </>
        )}

        <button type="submit" disabled={busy}>
          {busy
            ? "Working…"
            : registering
              ? "Create account"
              : recovering
                ? "Set new password"
                : "Sign in"}
        </button>
      </form>

      {!registering && (
        <p className="hint" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(recovering ? "signin" : "recover");
              setError(null);
            }}
          >
            {recovering ? "Back to sign in" : "Forgot your password?"}
          </button>
        </p>
      )}

      <p className="hint" style={{ marginTop: 16 }}>
        {registering ? "Already have an account? " : "No account yet? "}
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(registering ? "signin" : "register");
            setError(null);
          }}
        >
          {registering ? "Sign in" : "Create one"}
        </button>
      </p>
    </main>
  );
}
