import { useEffect, useState } from "react";

import { api } from "../api/client";
import { disablePush, enablePush, pushSupported } from "../push";
import type { Currency } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { SecurityCard } from "../components/SecurityCard";
import { Card, ErrorBanner } from "../components/ui";
import { useMoney } from "../useMoney";

/**
 * Everything about the account rather than the money: currency, password, recovery codes,
 * signing out. These used to sit on the Plan page beside budgets, where "change my
 * password" is not a thing anyone goes looking for.
 */
const EXPORTS = [
  { kind: "entries" as const, label: "Entries CSV" },
  { kind: "savings" as const, label: "Savings CSV" },
  { kind: "inventory" as const, label: "Stock CSV" },
];

export function SettingsPage() {
  const { user, signOut, refreshUser: refreshProfile } = useAuth();
  const money = useMoney();
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
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
        if (outcome === "denied") {
          setError(
            "Your browser is blocking notifications for this site. Allow them in its site " +
              "settings, then try again.",
          );
        } else if (outcome === "unsupported") {
          setError("This browser cannot show notifications.");
        } else if (outcome === "unavailable") {
          setError("Notifications are not configured on this instance.");
        }
      }
      setPush(await api.pushStatus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change that.");
    } finally {
      setPushBusy(false);
    }
  }

  async function exportCsv(kind: "entries" | "savings" | "inventory") {
    setError(null);
    setExporting(kind);
    try {
      await api.exportCsv(kind);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export that.");
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
      setError(caught instanceof Error ? caught.message : "Could not change the currency.");
    } finally {
      setChanging(false);
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 18, margin: "0 0 16px" }}>Settings</h1>
      <ErrorBanner message={error} />

      <Card title="Account">
        <p style={{ margin: "0 0 12px" }} data-stat="Email">
          <span className="hint">Signed in as </span>
          {user?.email}
        </p>
        <div className="row">
          <label style={{ flex: "0 0 200px" }}>
            Account currency
            <select
              aria-label="Account currency"
              value={money.currency}
              disabled={changing}
              onChange={(event) => void changeCurrency(event.target.value as Currency)}
            >
              <option value="USD">US dollars ($)</option>
              <option value="EUR">Euros (€)</option>
            </select>
          </label>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Amounts are stored, not converted — changing this relabels them. It locks as soon as
          the account has its first entry.
        </p>
      </Card>

      <SecurityCard />

      <Card title="Export">
        <p className="hint" style={{ margin: "0 0 10px" }}>
          Your records as CSV files, for a spreadsheet or for keeping. Text that a
          spreadsheet would run as a formula is written as plain text.
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
              {exporting === kind ? "Preparing…" : label}
            </button>
          ))}
        </div>
      </Card>

      {push?.enabled && pushSupported() && (
        <Card title="Notifications">
          <p className="hint" style={{ margin: "0 0 10px" }}>
            A single daily reminder on this device when something needs restocking or a
            recurring entry is waiting. At most one a day, and nothing at all on a day with
            nothing to say.
          </p>
          <div className="row">
            <button type="button" disabled={pushBusy} onClick={() => void togglePush(true)}>
              {pushBusy ? "Working…" : "Turn on for this device"}
            </button>
            <button
              type="button"
              className="quiet"
              disabled={pushBusy || push.devices === 0}
              onClick={() => void togglePush(false)}
            >
              Turn off
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {push.devices === 0
              ? "No devices are receiving notifications."
              : `${push.devices} ${push.devices === 1 ? "device is" : "devices are"} receiving them.`}
          </p>
        </Card>
      )}

      <Card title="Session">
        <p className="hint" style={{ margin: "0 0 10px" }}>
          Signs this device out. Other devices stay signed in; changing the password signs
          out everything.
        </p>
        <button type="button" className="quiet" onClick={signOut}>
          Sign out
        </button>
      </Card>
    </>
  );
}
