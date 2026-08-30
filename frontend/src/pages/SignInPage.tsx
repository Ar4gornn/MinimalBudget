import { useState, type FormEvent } from "react";

import { ErrorBanner } from "../components/ui";
import { useAuth } from "../auth/AuthContext";

export function SignInPage() {
  const { signIn, register } = useAuth();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const registering = mode === "register";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (registering) await register(email, password, inviteCode);
      else await signIn(email, password);
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

        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete={registering ? "new-password" : "current-password"}
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
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
            <p className="hint">
              Passwords need at least 10 characters. An invite code is required unless this
              instance is running in open mode.
            </p>
          </>
        )}

        <button type="submit" disabled={busy}>
          {busy ? "Working…" : registering ? "Create account" : "Sign in"}
        </button>
      </form>

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
