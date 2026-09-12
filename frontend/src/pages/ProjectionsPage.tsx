import { Fragment, useMemo, useState } from "react";

import { GrowthChart } from "../charts/GrowthChart";
import type { GrowthSeries } from "../charts/GrowthChart";
import { Card, Empty, ErrorBanner, Stat, TableWrap } from "../components/ui";
import { isNonNegativeMoney, subtractMoney, toCents } from "../money";
import { useMoney } from "../useMoney";
import { project, yearlyPoints } from "../interest";
import { useT, type Translate } from "../i18n";
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
  const t = useT();
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
        <ErrorBanner message={t("grow.badInput")} />
      )}

      {comparing ? (
        <Card title={t("grow.compare")}>
          <CompareFields
            first={first}
            second={second}
            onFirst={setFirst}
            onSecond={setSecond}
            symbol={money.symbol}
            t={t}
          />
        </Card>
      ) : (
        <ScenarioCard
          title={t("grow.whatItGrowsTo")}
          accent="var(--accent)"
          scenario={first}
          onChange={setFirst}
          symbol={money.symbol}
          t={t}
        />
      )}

      <Card>
        <div className="row" style={{ alignItems: "center" }}>
          <label style={{ flex: "1 1 220px", textTransform: "none" }}>
            <span style={{ textTransform: "uppercase", fontSize: 12, letterSpacing: "0.03em" }}>
              {t.n("grow.overYears", years)}
            </span>
            <input
              type="range"
              min={1}
              max={40}
              step={1}
              aria-label={t("grow.years")}
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
            {comparing ? t("grow.removeComparison") : t("grow.compareWith")}
          </button>
        </div>
        {comparing && (
          <p className="hint" style={{ marginTop: 8 }}>
            {t("grow.sameHorizonHint")}
          </p>
        )}
      </Card>

      {projectionA && (
        <>
          <div className="grid" style={{ marginTop: 16 }}>
            {comparing && projectionB ? (
              <>
                <Stat label={t("grow.endsAtA")} value={projectionA.finalBalance} tone="in" />
                <Stat label={t("grow.endsAtB")} value={projectionB.finalBalance} tone="in" />
                <div className="card stat" data-stat="Difference">
                  <div className="label">{t("grow.bMinusA")}</div>
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
                  <div className="label">{t("grow.growthAB")}</div>
                  <div className="value" style={{ fontSize: 19 }}>
                    {projectionA.growthPercent?.toFixed(0) ?? "—"}% /{" "}
                    {projectionB.growthPercent?.toFixed(0) ?? "—"}%
                  </div>
                </div>
              </>
            ) : (
              <>
                <Stat label={t("grow.endsAt")} value={projectionA.finalBalance} tone="in" />
                <Stat label={t("grow.youPutIn")} value={projectionA.totalContributed} />
                <Stat label={t("grow.interest")} value={projectionA.totalInterest} tone="in" />
                <div className="card stat" data-stat="Growth">
                  <div className="label">{t("grow.growth")}</div>
                  <div className="value">
                    {projectionA.growthPercent === null
                      ? "—"
                      : `${projectionA.growthPercent.toFixed(1)}%`}
                  </div>
                </div>
              </>
            )}
          </div>

          <Card title={t("grow.balanceOverTime")}>
            <GrowthChart series={series} />
            <p className="hint" style={{ marginTop: 8 }}>
              {comparing
                ? t("grow.hintComparing")
                : first.mode === "compound"
                  ? t("grow.hintCompound")
                  : t("grow.hintSimple")}
            </p>
          </Card>

          <Card title={t("grow.yearByYear")}>
            {projectionA.points.length < 2 ? (
              <Empty>{t("grow.nothingYet")}</Empty>
            ) : (
              <TableWrap>
                <table className="stacked" aria-label={t("grow.yearByYear")}>
                  <thead>
                    <tr>
                      <th>{t("grow.colYear")}</th>
                      <th className="num">
                        {t("grow.withSymbol", {
                          label: comparing ? "A" : t("grow.colPaidIn"),
                          symbol: money.symbol,
                        })}
                      </th>
                      <th className="num">
                        {t("grow.withSymbol", {
                          label: comparing ? "B" : t("grow.interest"),
                          symbol: money.symbol,
                        })}
                      </th>
                      <th className="num">
                        {t("grow.withSymbol", {
                          label: comparing ? t("grow.colDifference") : t("grow.colBalance"),
                          symbol: money.symbol,
                        })}
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
                            <td data-label={t("grow.colYear")}>{point.month / 12}</td>
                            <td
                              className="num"
                              data-label={comparing ? "A" : t("grow.colPaidIn")}
                            >
                              {money.plain(comparing ? point.balance : point.contributed)}
                            </td>
                            <td
                              className="num"
                              data-label={comparing ? "B" : t("grow.interest")}
                            >
                              {comparing
                                ? money.plain(other?.balance ?? "0.00")
                                : money.plain(point.interest)}
                            </td>
                            <td
                              className="num"
                              data-label={
                                comparing ? t("grow.colDifference") : t("grow.colBalance")
                              }
                            >
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
  t,
}: {
  title: string;
  accent: string;
  scenario: Scenario;
  onChange: (next: Scenario) => void;
  symbol: string;
  t: Translate;
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
          {t("grow.starting", { symbol })}
          <input
            className="num"
            inputMode="decimal"
            aria-label={t("grow.startingAria", { title })}
            value={scenario.initial}
            onChange={(event) => set("initial", event.target.value)}
          />
        </label>

        <label style={{ flex: "1 1 130px" }}>
          {t("grow.monthly", { symbol })}
          <input
            className="num"
            inputMode="decimal"
            aria-label={t("grow.monthlyAria", { title })}
            value={scenario.monthly}
            onChange={(event) => set("monthly", event.target.value)}
          />
        </label>

        <label style={{ flex: "1 1 110px" }}>
          {t("grow.rate")}
          <input
            className="num"
            inputMode="decimal"
            aria-label={t("grow.rateAria", { title })}
            value={scenario.rate}
            onChange={(event) => set("rate", event.target.value)}
          />
        </label>

        <label style={{ flex: "1 1 130px" }}>
          {t("grow.interestType")}
          <select
            aria-label={t("grow.modeAria", { title })}
            value={scenario.mode}
            onChange={(event) => set("mode", event.target.value as InterestMode)}
          >
            <option value="compound">{t("grow.compound")}</option>
            <option value="simple">{t("grow.simple")}</option>
          </select>
        </label>

        {scenario.mode === "compound" && (
          <label style={{ flex: "1 1 130px" }}>
            {t("grow.compounded")}
            <select
              aria-label={t("grow.frequencyAria", { title })}
              value={scenario.compounding}
              onChange={(event) => set("compounding", event.target.value as Compounding)}
            >
              <option value="monthly">{t("grow.everyMonth")}</option>
              <option value="quarterly">{t("grow.everyQuarter")}</option>
              <option value="annually">{t("grow.everyYear")}</option>
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
  t,
}: {
  first: Scenario;
  second: Scenario;
  onFirst: (next: Scenario) => void;
  onSecond: (next: Scenario) => void;
  symbol: string;
  t: Translate;
}) {
  const rows: {
    key: keyof Scenario;
    label: string;
    kind: "money" | "rate" | "mode" | "freq";
  }[] = [
    { key: "initial", label: t("grow.rowStart", { symbol }), kind: "money" },
    { key: "monthly", label: t("grow.rowMonthly", { symbol }), kind: "money" },
    { key: "rate", label: t("grow.rowRate"), kind: "rate" },
    { key: "mode", label: t("grow.interestType"), kind: "mode" },
    { key: "compounding", label: t("grow.rowEvery"), kind: "freq" },
  ];

  const cell = (
    scenario: Scenario,
    set: (next: Scenario) => void,
    row: (typeof rows)[number],
    which: "A" | "B",
  ) => {
    const label = t("grow.scenarioField", { which, label: row.label });
    if (row.kind === "mode") {
      return (
        <select
          aria-label={label}
          value={scenario.mode}
          onChange={(event) => set({ ...scenario, mode: event.target.value as InterestMode })}
        >
          <option value="compound">{t("grow.compound")}</option>
          <option value="simple">{t("grow.simple")}</option>
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
          <option value="monthly">{t("grow.freqMonth")}</option>
          <option value="quarterly">{t("grow.freqQuarter")}</option>
          <option value="annually">{t("grow.freqYear")}</option>
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
