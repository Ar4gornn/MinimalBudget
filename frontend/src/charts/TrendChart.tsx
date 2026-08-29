/**
 * Grouped bars: income, expense and saved, one group per month.
 *
 * Hand-rolled SVG. The dashboard needs three chart shapes; a library would add a
 * dependency and a theming surface larger than the code it saves.
 */

import { formatMoney, toChartNumber } from "../money";
import { monthTick } from "../months";
import type { Money } from "../api/types";

interface Series {
  label: string;
  values: Money[];
  color: string;
}

const WIDTH = 640;
const HEIGHT = 200;
const PAD_LEFT = 8;
const PAD_BOTTOM = 22;
const PAD_TOP = 8;

export function TrendChart({
  months,
  income,
  expense,
  saved,
}: {
  months: string[];
  income: Money[];
  expense: Money[];
  saved: Money[];
}) {
  const series: Series[] = [
    { label: "Income", values: income, color: "var(--accent)" },
    { label: "Expense", values: expense, color: "var(--spend)" },
    { label: "Saved", values: saved, color: "var(--border-strong)" },
  ];

  if (months.length === 0) return <p className="empty">No months to show.</p>;

  const numbers = series.flatMap((s) => s.values.map(toChartNumber));
  // A flat all-zero window would otherwise divide by zero and render nothing.
  const peak = Math.max(1, ...numbers);
  const plotHeight = HEIGHT - PAD_BOTTOM - PAD_TOP;
  const groupWidth = (WIDTH - PAD_LEFT * 2) / months.length;
  const barWidth = Math.max(3, (groupWidth * 0.7) / series.length);

  return (
    <>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Income, expense and savings for ${months[0]} to ${months[months.length - 1]}`}
        preserveAspectRatio="none"
      >
        <line
          x1={0}
          y1={HEIGHT - PAD_BOTTOM}
          x2={WIDTH}
          y2={HEIGHT - PAD_BOTTOM}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
        {months.map((month, index) => {
          const groupLeft = PAD_LEFT + index * groupWidth;
          const groupCentre = groupLeft + groupWidth / 2;
          const barsLeft = groupCentre - (barWidth * series.length) / 2;
          return (
            <g key={month}>
              {series.map((s, seriesIndex) => {
                const value = toChartNumber(s.values[index] ?? "0.00");
                const barHeight = (value / peak) * plotHeight;
                return (
                  <rect
                    key={s.label}
                    x={barsLeft + seriesIndex * barWidth}
                    y={HEIGHT - PAD_BOTTOM - barHeight}
                    width={Math.max(1, barWidth - 1)}
                    height={barHeight}
                    fill={s.color}
                    rx={1}
                  >
                    <title>{`${s.label} — ${month}: ${formatMoney(s.values[index] ?? "0.00")}`}</title>
                  </rect>
                );
              })}
              <text
                x={groupCentre}
                y={HEIGHT - 6}
                textAnchor="middle"
                fontSize={11}
                fill="var(--faint)"
              >
                {monthTick(month)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.label}>
            <i className="swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
    </>
  );
}
