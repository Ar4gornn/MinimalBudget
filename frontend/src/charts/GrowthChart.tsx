/**
 * Balance over time, for one or two scenarios.
 *
 * With a single scenario the contributions are drawn underneath, because the gap between
 * the two bands *is* the interest — a lone balance line grows impressively without showing
 * how much of that was money the person put in themselves.
 *
 * With two, the contribution bands are dropped. Four overlapping filled areas is mud, and
 * the question being asked has changed: it is no longer "how much of this is interest" but
 * "how far apart do these two end up".
 */

import { toChartNumber } from "../money";
import { useMoney } from "../useMoney";
import type { ProjectionPoint } from "../interest";

export interface GrowthSeries {
  label: string;
  points: ProjectionPoint[];
  /** A CSS colour, so the palette stays in one place. */
  colour: string;
}

const WIDTH = 720;
const HEIGHT = 240;
const PAD_LEFT = 56;
const PAD_BOTTOM = 26;
const PAD_TOP = 12;

/**
 * A round gridline interval, and the axis top that follows from it.
 *
 * Two earlier attempts were wrong in different ways. Quartering the maximum produced axes
 * reading "6.3k, 13k, 19k" — arithmetically fine, and nobody reads a value off it. Rounding
 * the top separately from the step then emitted a label above the plot area, drawn off the
 * canvas entirely.
 *
 * So the step is chosen first and the top is derived from it: the highest gridline *is* the
 * top of the chart, which means every label is on screen and the axis ends on a round
 * number.
 */
function niceScale(floor: number, highest: number): { peak: number; ticks: number[] } {
  const span = Math.max(highest - floor, 1);
  const rough = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rough) ??
    magnitude * 10;

  const peak = Math.ceil(highest / step) * step;
  const ticks: number[] = [];
  for (let value = Math.ceil(floor / step) * step; value <= peak + step / 1000; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return { peak, ticks };
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return value.toFixed(0);
}

export function GrowthChart({ series }: { series: GrowthSeries[] }) {
  const money = useMoney();
  const usable = series.filter((one) => one.points.length >= 2);
  if (usable.length === 0) {
    return <p className="empty">Add an amount and a rate to see this.</p>;
  }

  const comparing = usable.length > 1;
  // The longest scenario sets the x-axis, so two runs of different lengths still line up
  // at year zero rather than being stretched to the same width.
  const longest = Math.max(...usable.map((one) => one.points.length));

  const everyValue = usable.flatMap((one) => [
    ...one.points.map((p) => toChartNumber(p.balance)),
    ...(comparing ? [] : one.points.map((p) => toChartNumber(p.contributed))),
  ]);
  const floor = Math.min(0, ...everyValue);
  const { peak, ticks } = niceScale(floor, Math.max(...everyValue, 1));

  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotWidth = WIDTH - PAD_LEFT - 8;
  const x = (index: number) => PAD_LEFT + (index / (longest - 1)) * plotWidth;
  const y = (value: number) =>
    HEIGHT - PAD_BOTTOM - ((value - floor) / (peak - floor)) * plotHeight;

  const area = (values: number[]) =>
    `M ${x(0)} ${y(floor)} ` +
    values.map((value, index) => `L ${x(index)} ${y(value)}`).join(" ") +
    ` L ${x(values.length - 1)} ${y(floor)} Z`;

  const line = (values: number[]) =>
    values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");

  const yearTicks = Array.from({ length: longest }, (_, index) => index)
    .filter((index) => index % 12 === 0 && index > 0)
    .filter((_, i, all) => all.length <= 10 || i % Math.ceil(all.length / 10) === 0);

  return (
    <>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        // Height follows the viewBox aspect ratio; a fixed height letterboxes on narrow
        // screens, leaving a band of dead space above and below the plot.
        style={{ display: "block", height: "auto" }}
        role="img"
        aria-label={
          comparing
            ? `Comparing ${usable.map((one) => one.label).join(" and ")}`
            : `Balance and contributions over ${Math.round((longest - 1) / 12)} years`
        }
      >
        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD_LEFT}
              y1={y(value)}
              x2={WIDTH - 8}
              y2={y(value)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 8}
              y={y(value) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--faint)"
            >
              {compact(value)}
            </text>
          </g>
        ))}

        {usable.map((one) => {
          const balances = one.points.map((p) => toChartNumber(p.balance));
          const contributions = one.points.map((p) => toChartNumber(p.contributed));
          return (
            <g key={one.label}>
              <path d={area(balances)} fill={one.colour} opacity={comparing ? 0.14 : 0.22} />
              {!comparing && (
                <path d={area(contributions)} fill="var(--border-strong)" opacity={0.45} />
              )}
              <path d={line(balances)} fill="none" stroke={one.colour} strokeWidth={2} />
              {!comparing && (
                <path
                  d={line(contributions)}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              )}
            </g>
          );
        })}

        {yearTicks.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize={11}
            fill="var(--faint)"
          >
            {index / 12}y
          </text>
        ))}
      </svg>

      <div className="legend">
        {usable.map((one) => (
          <span key={one.label}>
            <i className="swatch" style={{ background: one.colour }} aria-hidden="true" />
            {one.label} — {money.amount(one.points[one.points.length - 1]?.balance ?? "0.00")}
          </span>
        ))}
        {!comparing && (
          <span>
            <i
              className="swatch"
              style={{ background: "var(--border-strong)" }}
              aria-hidden="true"
            />
            Paid in — {money.amount(usable[0]?.points.at(-1)?.contributed ?? "0.00")}
          </span>
        )}
      </div>
    </>
  );
}
