import { useEffect, useState } from "react";

import { api } from "../api/client";
import { MAX_START_DAY, budgetMonth } from "../months";
import { useDates } from "../useDates";
import { disablePush, enablePush, pushSupported } from "../push";
import type { Currency, Language } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { LANGUAGES, useLanguage } from "../i18n";
import { errorMessage } from "../i18n/errors";
import { LayoutCard } from "../components/LayoutCard";
import { SecurityCard } from "../components/SecurityCard";
import { useTutorial } from "../components/Tutorial/useTutorial";
import { Card, ErrorBanner } from "../components/ui";
import { useMoney } from "../useMoney";
import { ACCENTS, ACCENT_SWATCH, MODES, useTheme, type Accent, type Mode } from "../theme";

const MODE_LABELS = {
  system: "settings.themeSystem",
  light: "settings.themeLight",
  dark: "settings.themeDark",
  oled: "settings.themeOled",
  hc: "settings.themeHc",
  sepia: "settings.themeSepia",
} as const satisfies Record<Mode, string>;

const ACCENT_LABELS = {
  blue: "settings.accentBlue",
  indigo: "settings.accentIndigo",
  violet: "settings.accentViolet",
  magenta: "settings.accentMagenta",
  teal: "settings.accentTeal",
  graphite: "settings.accentGraphite",
  slate: "settings.accentSlate",
  cobalt: "settings.accentCobalt",
  plum: "settings.accentPlum",
} as const satisfies Record<Accent, string>;

/**
 * Everything about the account rather than the money: currency, language, password,
 * recovery codes, signing out. These used to sit on the Plan page beside budgets, where
 * "change my password" is not a thing anyone goes looking for.
 */
const EXPORTS = [
  { kind: "entries" as const, label: "settings.exportEntries" as const },
  { kind: "savings" as const, label: "settings.exportSavings" as const },
  { kind: "inventory" as const, label: "settings.exportInventory" as const },
  { kind: "books" as const, label: "settings.exportBooks" as const },
];

export function SettingsPage() {
  const { user, signOut, refreshUser: refreshProfile } = useAuth();
  const { t, lang, setLanguage } = useLanguage();
  const theme = useTheme();
  const { discard } = theme;
  // A preview is only a preview: leaving Settings without saving puts the saved theme back.
  useEffect(() => discard, [discard]);
  const swatches = theme.resolved === "dark" || theme.resolved === "oled" ? "dark" : "light";
  const dates = useDates();
  const money = useMoney();
  const tour = useTutorial();
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const startDay = user?.budget_start_day ?? 1;
  const thisMonth = budgetMonth(startDay);
  const [push, setPush] = useState<{ enabled: boolean; devices: number } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.pushStatus().then(
      (status) => {
        if (!cancelled) setPush(status);
      },
      () => {
        // An older server with no push endpoints: hide the card rather than show an error.
        if (!cancelled) setPush(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePush(on: boolean) {
    setError(null);
    setPushBusy(true);
    try {
      if (!on) {
        await disablePush();
      } else {
        const outcome = await enablePush();
        if (outcome === "denied") setError(t("settings.pushBlocked"));
        else if (outcome === "unsupported") setError(t("settings.pushUnsupported"));
        else if (outcome === "unavailable") setError(t("settings.pushUnavailable"));
      }
      setPush(await api.pushStatus());
    } catch (caught) {
      setError(errorMessage(t, caught, "settings.couldNotChange"));
    } finally {
      setPushBusy(false);
    }
  }

  async function changeStartDay(day: number) {
    setError(null);
    setChanging(true);
    try {
      await api.setBudgetStartDay(day);
      // Every month picker in the app reads this, so re-read the profile rather than guess.
      await refreshProfile();
    } catch (caught) {
      setError(errorMessage(t, caught, "settings.couldNotChange"));
    } finally {
      setChanging(false);
    }
  }

  async function changeLanguage(next: Language) {
    if (next === lang) return;
    setError(null);
    setChanging(true);
    try {
      // The provider writes it to the account and re-reads the profile: the server is the
      // authority on what the account now says, exactly as for the currency.
      await setLanguage(next);
    } catch (caught) {
      setError(errorMessage(t, caught, "settings.couldNotChange"));
    } finally {
      setChanging(false);
    }
  }

  async function exportCsv(kind: "entries" | "savings" | "inventory" | "books") {
    setError(null);
    setExporting(kind);
    try {
      await api.exportCsv(kind);
    } catch (caught) {
      setError(errorMessage(t, caught, "settings.couldNotExport"));
    } finally {
      setExporting(null);
    }
  }

  async function changeCurrency(next: Currency) {
    if (next === money.currency) return;
    setError(null);
    setChanging(true);
    try {
      await api.setCurrency(next);
      // The profile is the source of the symbol everywhere; re-read it rather than guess.
      await refreshProfile();
    } catch (caught) {
      setError(errorMessage(t, caught, "settings.couldNotChange"));
    } finally {
      setChanging(false);
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 18, margin: "0 0 16px" }}>{t("settings.title")}</h1>
      <ErrorBanner message={error} />

      <Card title={t("settings.account")}>
        <p style={{ margin: "0 0 12px" }} data-stat="Email">
          <span className="hint">{t("settings.signedInAs")}</span>
          {user?.email}
        </p>
        <div className="row">
          <label style={{ flex: "0 0 200px" }}>
            {t("settings.currency")}
            <select
              aria-label={t("settings.currency")}
              value={money.currency}
              disabled={changing}
              onChange={(event) => void changeCurrency(event.target.value as Currency)}
            >
              <option value="USD">{t("settings.currencyUsd")}</option>
              <option value="EUR">{t("settings.currencyEur")}</option>
            </select>
          </label>
          <label style={{ flex: "0 0 200px" }}>
            {t("settings.language")}
            <select
              aria-label={t("settings.language")}
              value={lang}
              disabled={changing}
              onChange={(event) => void changeLanguage(event.target.value as Language)}
            >
              {LANGUAGES.map((option) => (
                <option key={option} value={option}>
                  {option === "en" ? t("settings.languageEn") : t("settings.languageFr")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {t("settings.currencyHint")}
        </p>
        <p className="hint" style={{ marginTop: 8 }}>
          {t("settings.languageHint")}
        </p>
      </Card>

      <Card title={t("settings.appearance")}>
        <div className="row">
          <label style={{ flex: "0 0 200px" }}>
            {t("settings.theme")}
            <select
              aria-label={t("settings.theme")}
              value={theme.shown.mode}
              onChange={(event) => theme.preview({ mode: event.target.value as Mode })}
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(MODE_LABELS[mode])}
                </option>
              ))}
            </select>
          </label>
        </div>
        {/* A radio group of swatches rather than a select: the colour is the choice, and a
            list of colour names makes you imagine it. Each carries its name for a screen
            reader and as a tooltip. */}
        <fieldset className="accents">
          <legend>{t("settings.accent")}</legend>
          {ACCENTS.map((accent) => (
            <label key={accent} className="accent-choice" data-tip={t(ACCENT_LABELS[accent])}>
              <input
                type="radio"
                name="accent"
                value={accent}
                checked={theme.shown.accent === accent}
                onChange={() => theme.preview({ accent })}
                aria-label={t(ACCENT_LABELS[accent])}
              />
              <span className="dot" aria-hidden="true" style={{ background: ACCENT_SWATCH[swatches][accent] }} />
            </label>
          ))}
        </fieldset>
        {/* Shown whatever the state, disabled until there is something to save, so the
            buttons do not jump into place under the finger that just picked a swatch. */}
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" onClick={theme.save} disabled={!theme.previewing}>
            {t("action.save")}
          </button>
          <button
            type="button"
            className="quiet"
            onClick={theme.discard}
            disabled={!theme.previewing}
          >
            {t("action.cancel")}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {t("settings.appearanceHint")}
        </p>
      </Card>

      <LayoutCard />

      <Card title={t("settings.budgetMonth")}>
        <div className="row">
          <label style={{ flex: "0 0 200px" }}>
            {t("settings.startsOnDay")}
            <select
              aria-label={t("settings.startsOnDayAria")}
              value={startDay}
              disabled={changing}
              onChange={(event) => void changeStartDay(Number(event.target.value))}
            >
              {Array.from({ length: MAX_START_DAY }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  {day === 1 ? t("settings.startsOnDayCalendar") : day}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {startDay === 1
            ? t("settings.monthPlainHint")
            : t("settings.monthShiftedHint", {
                day: startDay,
                month: dates.month(thisMonth),
                range: dates.monthRange(thisMonth, startDay),
              })}{" "}
          {t("settings.monthHintTail")}
        </p>
      </Card>

      <SecurityCard />

      <Card title={t("settings.export")}>
        <p className="hint" style={{ margin: "0 0 10px" }}>
          {t("settings.exportHint")}
        </p>
        <div className="row">
          {EXPORTS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              className="quiet"
              disabled={exporting !== null}
              onClick={() => void exportCsv(kind)}
            >
              {exporting === kind ? t("settings.exportPreparing") : t(label)}
            </button>
          ))}
        </div>
      </Card>

      {push?.enabled && pushSupported() && (
        <Card title={t("settings.notifications")}>
          <p className="hint" style={{ margin: "0 0 10px" }}>
            {t("settings.notificationsHint")}
          </p>
          <div className="row">
            <button type="button" disabled={pushBusy} onClick={() => void togglePush(true)}>
              {pushBusy ? t("state.working") : t("settings.notificationsOn")}
            </button>
            <button
              type="button"
              className="quiet"
              disabled={pushBusy || push.devices === 0}
              onClick={() => void togglePush(false)}
            >
              {t("settings.notificationsOff")}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {push.devices === 0
              ? t("settings.noDevices")
              : t.n("settings.devices", push.devices)}
          </p>
        </Card>
      )}

      <Card title={t("settings.help")}>
        <p className="hint" style={{ margin: "0 0 10px" }}>
          {t("settings.tourHint")}
        </p>
        <button type="button" className="quiet" onClick={tour.start}>
          {t("settings.replayTour")}
        </button>
      </Card>

      <Card title={t("settings.session")}>
        <p className="hint" style={{ margin: "0 0 10px" }}>
          {t("settings.sessionHint")}
        </p>
        <button type="button" className="quiet" onClick={signOut}>
          {t("settings.signOut")}
        </button>
      </Card>
    </>
  );
}
