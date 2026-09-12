import { useState, type FormEvent } from "react";

import { api } from "../api/client";
import { ErrorBanner } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { LANGUAGES, useLanguage } from "../i18n";
import { errorMessage } from "../i18n/errors";
import type { Currency, Language } from "../api/types";

export function SignInPage() {
  const { signIn, register } = useAuth();
  // The full context rather than `useT`: this is the one screen where the reader has no
  // account yet, so the picker below is their only way out of a language they cannot read.
  const { t, lang, setLanguage } = useLanguage();
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
      // The language the page is being read in is what the new account starts with, so the
      // first screen after registering is already right. It is a setting, not a vow: it
      // changes freely afterwards.
      if (registering) await register(email, password, inviteCode, currency, lang);
      else if (recovering) {
        // The code sets the password and revokes every session; then sign in with it.
        await api.recover(email, recoveryCode, password);
        await signIn(email, password);
      } else await signIn(email, password);
    } catch (caught) {
      setError(errorMessage(t, caught, "error.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin">
      <h1>{t("app.name")}</h1>
      <p className="hint">
        {registering
          ? t("signin.introRegister")
          : recovering
            ? t("signin.introRecover")
            : t("signin.intro")}
      </p>

      <form className="stack" onSubmit={submit}>
        <ErrorBanner message={error} />

        <label>
          {t("signin.email")}
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
            {t("signin.recoveryCode")}
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
          {recovering ? t("signin.newPassword") : t("signin.password")}
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
              aria-label={showPassword ? t("signin.hidePassword") : t("signin.showPassword")}
            >
              {showPassword ? t("signin.hide") : t("signin.show")}
            </button>
          </div>
        </label>

        {registering && (
          <>
            <label>
              {t("signin.inviteCode")}
              <input
                name="invite-code"
                autoComplete="off"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
              />
            </label>
            <label>
              {t("signin.currency")}
              <select
                aria-label={t("signin.currency")}
                value={currency}
                onChange={(event) => setCurrency(event.target.value as Currency)}
              >
                <option value="USD">{t("settings.currencyUsd")}</option>
                <option value="EUR">{t("settings.currencyEur")}</option>
              </select>
            </label>
            <p className="hint">{t("signin.registerHint")}</p>
          </>
        )}

        <button type="submit" disabled={busy}>
          {busy
            ? t("state.working")
            : registering
              ? t("signin.submitRegister")
              : recovering
                ? t("signin.submitRecover")
                : t("signin.submit")}
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
            {recovering ? t("signin.backToSignIn") : t("signin.forgot")}
          </button>
        </p>
      )}

      <p className="hint" style={{ marginTop: 16 }}>
        {registering ? t("signin.haveAccount") : t("signin.noAccount")}
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(registering ? "signin" : "register");
            setError(null);
          }}
        >
          {registering ? t("signin.submit") : t("signin.createOne")}
        </button>
      </p>

      {/* The picker belongs on this page and not only in Settings: Settings is behind a
          sign-in, so without it someone whose browser guessed wrong would have to read a
          language they do not speak in order to reach the setting that fixes it. Signed
          out it only writes to this device; the account's own choice wins after that. */}
      <p className="hint" style={{ marginTop: 16 }}>
        <label className="inline-select">
          {t("signin.language")}
          <select
            aria-label={t("signin.language")}
            value={lang}
            onChange={(event) => void setLanguage(event.target.value as Language)}
          >
            {LANGUAGES.map((option) => (
              <option key={option} value={option}>
                {option === "en" ? t("settings.languageEn") : t("settings.languageFr")}
              </option>
            ))}
          </select>
        </label>
      </p>
    </main>
  );
}
