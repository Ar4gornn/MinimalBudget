import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Card, ErrorBanner } from "./ui";
import { useToast } from "./Toast";

/**
 * Password and recovery codes (Epic 12).
 *
 * Both actions re-ask for the current password: a phone left unlocked on a table should
 * not be enough to change the password or mint a way back in. Changing the password
 * revokes every session, this one included, so the card signs back in with the new one
 * rather than leaving the person on a page whose next request would bounce them out.
 */
export function SecurityCard() {
  const { user, signIn } = useAuth();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<{ unused: number; total: number } | null>(null);
  const loadStatus = useCallback(async () => {
    try {
      const next = await api.recoveryStatus();
      // Tolerate an old server (or a test mock) that does not answer this shape.
      setStatus(
        typeof next?.total === "number" ? { unused: next.unused ?? 0, total: next.total } : null,
      );
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [changing, setChanging] = useState(false);

  const [confirmPassword, setConfirmPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [generating, setGenerating] = useState(false);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 10) {
      setError("The new password needs at least 10 characters.");
      return;
    }
    setError(null);
    setChanging(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      // Every session was revoked, this one included. Sign straight back in.
      if (user) await signIn(user.email, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      toast.show("Password changed. Other devices were signed out.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the password.");
    } finally {
      setChanging(false);
    }
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setGenerating(true);
    try {
      const result = await api.generateRecoveryCodes(confirmPassword);
      setCodes(result.codes);
      setConfirmPassword("");
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate codes.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card title="Password and recovery">
      <ErrorBanner message={error} />

      <form className="stack" onSubmit={changePassword} aria-label="Change password">
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          New password
          <div className="password-field">
            <input
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={10}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <button
              type="button"
              className="quiet"
              onClick={() => setShowNew((was) => !was)}
              aria-pressed={showNew}
              aria-label={showNew ? "Hide new password" : "Show new password"}
            >
              {showNew ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        <button type="submit" disabled={changing}>
          {changing ? "Changing…" : "Change password"}
        </button>
      </form>

      <hr className="rule" />

      <h3>Recovery codes</h3>
      <p className="hint">
        If you forget your password, one of these codes plus your email lets you set a new
        one. Each works once. Keep them somewhere that is not this app.
        {status && status.total > 0
          ? ` ${status.unused} of ${status.total} unused.`
          : " None generated yet."}
      </p>

      {codes ? (
        <>
          <ul className="codes" aria-label="Recovery codes">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <p className="hint">
            Shown once. Any codes you had before no longer work.{" "}
            <button type="button" className="link" onClick={() => setCodes(null)}>
              I have saved them
            </button>
          </p>
        </>
      ) : (
        <form className="row" onSubmit={generate} aria-label="Generate recovery codes">
          <label style={{ flex: "1 1 200px" }}>
            Confirm password
            <input
              type="password"
              autoComplete="current-password"
              required
              aria-label="Confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          <button type="submit" className="quiet" disabled={generating}>
            {generating
              ? "Generating…"
              : status && status.total > 0
                ? "Generate new codes"
                : "Generate codes"}
          </button>
        </form>
      )}
    </Card>
  );
}
