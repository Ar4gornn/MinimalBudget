import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useT } from "../i18n";
import { errorMessage } from "../i18n/errors";
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
  const t = useT();
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
      setError(t("security.tooShort"));
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
      toast.show(t("security.changed"));
    } catch (caught) {
      setError(errorMessage(t, caught, "security.couldNotChange"));
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
      setError(errorMessage(t, caught, "security.couldNotGenerate"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card title={t("security.title")}>
      <ErrorBanner message={error} />

      <form className="stack" onSubmit={changePassword} aria-label={t("security.changePassword")}>
        <label>
          {t("security.currentPassword")}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          {t("security.newPassword")}
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
              aria-label={
                showNew ? t("security.hideNewPassword") : t("security.showNewPassword")
              }
            >
              {showNew ? t("signin.hide") : t("signin.show")}
            </button>
          </div>
        </label>
        <button type="submit" disabled={changing}>
          {changing ? t("security.changing") : t("security.changePassword")}
        </button>
      </form>

      <hr className="rule" />

      <h3>{t("security.codes")}</h3>
      <p className="hint">
        {t("security.codesHint")}
        {status && status.total > 0
          ? t("security.codesUnused", { unused: status.unused, total: status.total })
          : t("security.codesNone")}
      </p>

      {codes ? (
        <>
          <ul className="codes" aria-label={t("security.codes")}>
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <p className="hint">
            {t("security.codesShownOnce")}{" "}
            <button type="button" className="link" onClick={() => setCodes(null)}>
              {t("security.codesSaved")}
            </button>
          </p>
        </>
      ) : (
        <form className="row" onSubmit={generate} aria-label={t("security.generate")}>
          <label style={{ flex: "1 1 200px" }}>
            {t("security.confirmPassword")}
            <input
              type="password"
              autoComplete="current-password"
              required
              aria-label={t("security.confirmPassword")}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          <button type="submit" className="quiet" disabled={generating}>
            {generating
              ? t("security.generating")
              : status && status.total > 0
                ? t("security.generateNew")
                : t("security.generate")}
          </button>
        </form>
      )}
    </Card>
  );
}
