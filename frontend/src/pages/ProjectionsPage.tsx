import { useMemo, useState } from "react";

import { GrowthChart } from "../charts/GrowthChart";
import { Card, Empty, Stat, TableWrap } from "../components/ui";
import { isNonNegativeMoney } from "../money";
import { useMoney } from "../useMoney";
import { project, yearlyPoints } from "../interest";
import type { Compounding, InterestMode } from "../interest";

/**
 * What money does if left alone.
 *
 * Entirely client-side: nothing here is stored, because a projection is a question you ask
 * rather than a record you keep. That also means it needs no API, no migration and no
 * row-level security — it is the cheapest possible second module, and a useful check that
 * the app can grow past budgeting.
 */
export function ProjectionsPage() {
  const money = useMoney();

  const [initial, setInitial] = useState("1000");
  const [monthly, setMonthly] = useState("100");
  const [rate, setRate] = useState("5");
  const [years, setYears] = useState(10);
  const [compounding, setCompounding] = useState<Compounding>("monthly");
  const [mode, setMode] = useState<InterestMode>("compound");

  const valid = isNonNegativeMoney(initial) && isNonNegativeMoney(monthly) && rate.trim() !== "";
  const parsedRate = Number(rate);

  const projection = useMemo(() => {
    if (!valid || Number.isNaN(parsedRate)) return null;
    return project({
      initial: Number(initial).toFixed(2),
      monthlyContribution: Number(monthly).toFixed(2),
      annualRatePercent: parsedRate,
      years,
      compounding,
      mode,
    });
  }, [valid, parsedRate, initial, monthly, years, compounding, mode]);

  return (
    <>
      <Card title="What it grows to">
        <form className="row" onSubmit={(event) => event.preventDefault()}>
          <label style={{ flex: "1 1 130px" }}>
            Starting amount ({money.symbol})
            <input
              className="num"
              inputMode="decimal"
              aria-label="Starting amount"
              value={initial}
              onChange={(event) => setInitial(event.target.value)}
            />
          </label>

          <label style={{ flex: "1 1 130px" }}>
            Added monthly ({money.symbol})
            <input
              className="num"
              inputMode="decimal"
              aria-label="Added monthly"
              value={monthly}
              onChange={(event) => setMonthly(event.target.value)}
            />
          </label>

          <label style={{ flex: "1 1 110px" }}>
            Rate (% a year)
            <input
              className="num"
              inputMode="decimal"
              aria-label="Annual rate"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
          </label>

          <label style={{ flex: "1 1 130px" }}>
            Interest
            <select
              aria-label="Interest type"
              value={mode}
              onChange={(event) => setMode(event.target.value as InterestMode)}
            >
              <option value="compound">Compound</option>
              <option value="simple">Simple</option>
            </select>
          </label>

          {mode === "compound" && (
            <label style={{ flex: "1 1 130px" }}>
              Compounded
              <select
                aria-label="Compounding frequency"
                value={compounding}
                onChange={(event) => setCompounding(event.target.value as Compounding)}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </label>
          )}
        </form>

        <label style={{ marginTop: 12, textTransform: "none" }}>
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

        {!valid && (
          <p className="hint">
            Enter amounts of zero or more, with at most two decimal places, and a rate.
          </p>
        )}
      </Card>

      {projection && (
        <>
          <div className="grid" style={{ marginTop: 16 }}>
            <Stat label="Ends at" value={projection.finalBalance} tone="in" />
            <Stat label="You put in" value={projection.totalContributed} />
            <Stat label="Interest" value={projection.totalInterest} tone="in" />
            <div className="card stat" data-stat="Growth">
              <div className="label">Growth</div>
              <div className="value">
                {projection.growthPercent === null
                  ? "—"
                  : `${projection.growthPercent.toFixed(1)}%`}
              </div>
            </div>
          </div>

          <Card title="Balance over time">
            <GrowthChart points={projection.points} />
            <p className="hint" style={{ marginTop: 8 }}>
              {mode === "compound"
                ? "The gap between the two lines is interest earning interest."
                : "Simple interest is paid on what you put in, never on the interest itself."}
            </p>
          </Card>

          <Card title="Year by year">
            {projection.points.length < 2 ? (
              <Empty>Nothing to show yet.</Empty>
            ) : (
              <TableWrap>
                <table className="stacked" aria-label="Year by year">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th className="num">Paid in ({money.symbol})</th>
                      <th className="num">Interest ({money.symbol})</th>
                      <th className="num">Balance ({money.symbol})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyPoints(projection)
                      .filter((point) => point.month > 0)
                      .map((point) => (
                        <tr key={point.month}>
                          <td data-label="Year">{point.month / 12}</td>
                          <td className="num" data-label="Paid in">
                            {money.plain(point.contributed)}
                          </td>
                          <td className="num" data-label="Interest">
                            {money.plain(point.interest)}
                          </td>
                          <td className="num" data-label="Balance">
                            {money.plain(point.balance)}
                          </td>
                        </tr>
                      ))}
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
