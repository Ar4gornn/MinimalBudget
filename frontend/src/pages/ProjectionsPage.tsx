import { Fragment, useMemo, useState } from "react";

import { GrowthChart } from "../charts/GrowthChart";
import type { GrowthSeries } from "../charts/GrowthChart";
import { Card, Empty, ErrorBanner, Stat, TableWrap } from "../components/ui";
import { isNonNegativeMoney, subtractMoney, toCents } from "../money";
import { useMoney } from "../useMoney";
import { project, yearlyPoints } from "../interest";
import type { Compounding, InterestMode, Projection } from "../interest";

/**
 * What money does if left alone, for one scenario or two side by side.
 *
 * Entirely client-side: nothing here is stored, because a projection is a question you ask
 * rather than a record you keep. That also means it needs no API, no migration and no
 * row-level security — the cheapest possible second module, and a useful check that the app
 * can grow past budgeting.
 *
 * The two scenarios share a time horizon on purpose. Comparing five years against thirty
 * tells you almost nothing, whereas comparing two rates, or compound against simple, over
 * the same period is the question people actually have.
 */

interface Scenario {
  initial: string;
  monthly: string;
  rate: string;
  compounding: Compounding;
  mode: InterestMode;
}

const A: Scenario = {
  initial: "1000",
  monthly: "100",
  rate: "5",
  compounding: "monthly",
  mode: "compound",
};

// Deliberately differs only by rate, so switching the comparison on immediately shows what
// the page is for rather than two identical lines.
const B: Scenario = { ...A, rate: "8" };

function isUsable(scenario: Scenario): boolean {
  return (
    isNonNegativeMoney(scenario.initial) &&
    isNonNegativeMoney(scenario.monthly) &&
    scenario.rate.trim() !== "" &&
    !Number.isNaN(Number(scenario.rate))
  );
}

function run(scenario: Scenario, years: number): Projection | null {
  if (!isUsable(scenario)) return null;
  return project({
    initial: Number(scenario.initial).toFixed(2),
    monthlyContribution: Number(scenario.monthly).toFixed(2),
    annualRatePercent: Number(scenario.rate),
    years,
    compounding: scenario.compounding,
    mode: scenario.mode,
  });
}

export function ProjectionsPage() {
  const money = useMoney();
  const [years, setYears] = useState(10);
  const [first, setFirst] = useState<Scenario>(A);
  const [second, setSecond] = useState<Scenario>(B);
  const [comparing, setComparing] = useState(false);

  const projectionA = useMemo(() => run(first, years), [first, years]);
  const projectionB = useMemo(
    () => (comparing ? run(second, years) : null),
    [comparing, second, years],
  );

  const series: GrowthSeries[] = [
    ...(projectionA ? [{ label: "A", points: projectionA.points, colour: "var(--accent)" }] : []),
    ...(projectionB
      ? [{ label: "B", points: projectionB.points, colour: "var(--accent-2)" }]
      : []),
  ];

  const gap =
    projectionA && projectionB
      ? subtractMoney(projectionB.finalBalance, projectionA.finalBalance)
      : null;
  const invalid =
    (!projectionA && isUsable(first) === false) ||
    (comparing && !projectionB && isUsable(second) === false);

  return (
    <>
      {invalid && (
        <ErrorBanner message="Enter amounts of zero or more, with at most two decimal places, and a rate." />
      )}

      {comparing ? (
        <Card title="Compare">
          <CompareFields
            first={first}
            second={second}
            onFirst={setFirst}
            onSecond={setSecond}
            symbol={money.symbol}
          />
        </Card>
      ) : (
        <ScenarioCard
          title="What it grows to"
          accent="var(--accent)"
          scenario={first}
          onChange={setFirst}
          symbol={money.symbol}
        />
      )}

      <Card>
        <div className="row" style={{ alignItems: "center" }}>
          <label style={{ flex: "1 1 220px", textTransform: "none" }}>
            <span style={{ textTransform: "uppercase", fontSize: 12, letterSpacing: "0.03em" }}>
              Over {years} {years === 1 ? "year" : "years"}
            </span>
            <input
              type="range"
              min={1}
              max={40}
              step={1}
              aria-label="Years"
              value={years}
              onChange={(event) => setYears(Number(event.target.value))}
              style={{ padding: 0 }}
            />
          </label>
          <button
            type="button"
            className="quiet"
            onClick={() => setComparing((on) => !on)}
            aria-pressed={comparing}
          >
            {comparing ? "Remove comparison" : "Compare with another"}
          </button>
        </div>
        {comparing && (
          <p className="hint" style={{ marginTop: 8 }}>
            Both run over the same period — comparing five years against thirty would tell you
            very little.
          </p>
        )}
      </Card>

      {projectionA && (
        <>
          <div className="grid" style={{ marginTop: 16 }}>
            {comparing && projectionB ? (
              <>
                <Stat label="A ends at" value={projectionA.finalBalance} tone="in" />
                <Stat label="B ends at" value={projectionB.finalBalance} tone="in" />
                <div className="card stat" data-stat="Difference">
                  <div className="label">B minus A</div>
                  <div
                    className={`value ${toCents(gap ?? "0.00") < 0 ? "negative" : ""}`}
                    style={
                      toCents(gap ?? "0.00") >= 0 ? { color: "var(--accent-2)" } : undefined
                    }
                  >
                    {money.amount(gap ?? "0.00")}
                  </div>
                </div>
                <div className="card stat" data-stat="Growth">
                  <div className="label">Growth A / B</div>
                  <div className="value" style={{ fontSize: 19 }}>
                    {projectionA.growthPercent?.toFixed(0) ?? "—"}% /{" "}
                    {projectionB.growthPercent?.toFixed(0) ?? "—"}%
                  </div>
                </div>
              </>
            ) : (
              <>
                <Stat label="Ends at" value={projectionA.finalBalance} tone="in" />
                <Stat label="You put in" value={projectionA.totalContributed} />
                <Stat label="Interest" value={projectionA.totalInterest} tone="in" />
                <div className="card stat" data-stat="Growth">
                  <div className="label">Growth</div>
                  <div className="value">
                    {projectionA.growthPercent === null
                      ? "—"
                      : `${projectionA.growthPercent.toFixed(1)}%`}
                  </div>
                </div>
              </>
            )}
          </div>

          <Card title="Balance over time">
            <GrowthChart series={series} />
            <p className="hint" style={{ marginTop: 8 }}>
              {comparing
                ? "Contribution bands are hidden while comparing — four overlapping areas is mud."
                : first.mode === "compound"
                  ? "The gap between the two lines is interest earning interest."
                  : "Simple interest is paid on what you put in, never on the interest itself."}
            </p>
          </Card>

          <Card title="Year by year">
            {projectionA.points.length < 2 ? (
              <Empty>Nothing to show yet.</Empty>
            ) : (
              <TableWrap>
                <table className="stacked" aria-label="Year by year">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th className="num">{comparing ? "A" : "Paid in"} ({money.symbol})</th>
                      <th className="num">
                        {comparing ? "B" : "Interest"} ({money.symbol})
                      </th>
                      <th className="num">
                        {comparing ? "Difference" : "Balance"} ({money.symbol})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyPoints(projectionA)
                      .filter((point) => point.month > 0)
                      .map((point, index) => {
                        const other = projectionB
                          ? yearlyPoints(projectionB).filter((p) => p.month > 0)[index]
                          : undefined;
                        return (
                          <tr key={point.month}>
                            <td data-label="Year">{point.month / 12}</td>
                            <td className="num" data-label={comparing ? "A" : "Paid in"}>
                              {money.plain(comparing ? point.balance : point.contributed)}
                            </td>
                            <td className="num" data-label={comparing ? "B" : "Interest"}>
                              {comparing
                                ? money.plain(other?.balance ?? "0.00")
                                : money.plain(point.interest)}
                            </td>
                            <td className="num" data-label={comparing ? "Difference" : "Balance"}>
                              {comparing
                                ? money.plain(
                                    subtractMoney(other?.balance ?? "0.00", point.balance),
                                  )
                                : money.plain(point.balance)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function ScenarioCard({
  title,
  accent,
  scenario,
  onChange,
  symbol,
}: {
  title: string;
  accent: string;
  scenario: Scenario;
  onChange: (next: Scenario) => void;
  symbol: string;
}) {
  const set = <K extends keyof Scenario>(key: K, value: Scenario[K]) =>
    onChange({ ...scenario, [key]: value });

  return (
    <Card title={title}>
      {/* A colour bar rather than only a coloured title: it is what ties this form to its
          line on the chart at a glance. */}
      <div
        aria-hidden="true"
        style={{ height: 3, background: accent, borderRadius: 2, marginBottom: 12 }}
      />
      <form className="row" onSubmit={(event) => event.preventDefault()}>
        <label style={{ flex: "1 1 130px" }}>
          Starting ({symbol})
          <input
            className="num"
            inputMode="decimal"
            aria-label={`${title} starting amount`}
            value={scenario.initial}
            onChange={(event) => set("initial", event.target.value)}
          />
        </label>

        <label style={{ flex: "1 1 130px" }}>
          Monthly ({symbol})
          <input
            className="num"
            inputMode="decimal"
            aria-label={`${title} added monthly`}
            value={scenario.monthly}
            onChange={(event) => set("monthly", event.target.value)}
          />
        </label>

        <label style={{ flex: "1 1 110px" }}>
          Rate (% a year)
          <input
            className="num"
            inputMode="decimal"
            aria-label={`${title} annual rate`}
            value={scenario.rate}
            onChange={(event) => set("rate", event.target.value)}
          />
        </label>

        <label style={{ flex: "1 1 130px" }}>
          Interest
          <select
            aria-label={`${title} interest type`}
            value={scenario.mode}
            onChange={(event) => set("mode", event.target.value as InterestMode)}
          >
            <option value="compound">Compound</option>
            <option value="simple">Simple</option>
          </select>
        </label>

        {scenario.mode === "compound" && (
          <label style={{ flex: "1 1 130px" }}>
            Compounded
            <select
              aria-label={`${title} compounding frequency`}
              value={scenario.compounding}
              onChange={(event) => set("compounding", event.target.value as Compounding)}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </label>
        )}
      </form>
    </Card>
  );
}


/**
 * The two scenarios as aligned rows: one row per parameter, A and B beside each other.
 *
 * Two stacked forms is the obvious layout and the wrong one. On a phone it put ten
 * full-width fields between the reader and the chart, and — worse for a comparison — it
 * separated the two values being compared by a screen of scrolling. Side by side, the one
 * field that differs is the one that looks different.
 */
function CompareFields({
  first,
  second,
  onFirst,
  onSecond,
  symbol,
}: {
  first: Scenario;
  second: Scenario;
  onFirst: (next: Scenario) => void;
  onSecond: (next: Scenario) => void;
  symbol: string;
}) {
  const rows: { key: keyof Scenario; label: string; kind: "money" | "rate" | "mode" | "freq" }[] = [
    { key: "initial", label: `Start (${symbol})`, kind: "money" },
    { key: "monthly", label: `Monthly (${symbol})`, kind: "money" },
    { key: "rate", label: "Rate %", kind: "rate" },
    { key: "mode", label: "Interest", kind: "mode" },
    { key: "compounding", label: "Every", kind: "freq" },
  ];

  const cell = (
    scenario: Scenario,
    set: (next: Scenario) => void,
    row: (typeof rows)[number],
    which: "A" | "B",
  ) => {
    const label = `Scenario ${which} ${row.label}`;
    if (row.kind === "mode") {
      return (
        <select
          aria-label={label}
          value={scenario.mode}
          onChange={(event) => set({ ...scenario, mode: event.target.value as InterestMode })}
        >
          <option value="compound">Compound</option>
          <option value="simple">Simple</option>
        </select>
      );
    }
    if (row.kind === "freq") {
      return (
        <select
          aria-label={label}
          // Disabled rather than hidden: removing the row for one scenario would break the
          // grid alignment that makes this readable at a glance.
          disabled={scenario.mode !== "compound"}
          value={scenario.compounding}
          onChange={(event) =>
            set({ ...scenario, compounding: event.target.value as Compounding })
          }
        >
          <option value="monthly">Month</option>
          <option value="quarterly">Quarter</option>
          <option value="annually">Year</option>
        </select>
      );
    }
    return (
      <input
        className="num"
        inputMode="decimal"
        aria-label={label}
        value={scenario[row.key] as string}
        onChange={(event) => set({ ...scenario, [row.key]: event.target.value })}
      />
    );
  };

  return (
    <div className="compare-grid">
      <span />
      <div className="head">
        A
        <div className="swatch-line" style={{ background: "var(--accent)" }} />
      </div>
      <div className="head">
        B
        <div className="swatch-line" style={{ background: "var(--accent-2)" }} />
      </div>

      {rows.map((row) => (
        <Fragment key={row.key}>
          <span className="param">{row.label}</span>
          {cell(first, onFirst, row, "A")}
          {cell(second, onSecond, row, "B")}
        </Fragment>
      ))}
    </div>
  );
}
