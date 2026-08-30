/**
 * Contributions against total balance over time, as a filled area.
 *
 * The gap between the two bands *is* the interest, which is the thing the page exists to
 * show. A single balance line would grow impressively without making clear how much of the
 * growth was money the person put in themselves.
 */

import { toChartNumber } from "../money";
import { useMoney } from "../useMoney";
import type { ProjectionPoint } from "../interest";

const WIDTH = 720;
const HEIGHT = 240;
const PAD_LEFT = 56;
const PAD_BOTTOM = 26;
const PAD_TOP = 12;

/** A round number at or above `value`, so the axis reads 1,000 rather than 987. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (magnitude * step >= value) return magnitude * step;
  }
  return magnitude * 10;
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return value.toFixed(0);
}

export function GrowthChart({ points }: { points: ProjectionPoint[] }) {
  const money = useMoney();
  if (points.length < 2) return <p className="empty">Add an amount and a rate to see this.</p>;

  const balances = points.map((p) => toChartNumber(p.balance));
  const contributions = points.map((p) => toChartNumber(p.contributed));
  const peak = niceCeiling(Math.max(...balances, ...contributions, 1));
  const floor = Math.min(0, ...balances);

  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotWidth = WIDTH - PAD_LEFT - 8;
  const x = (index: number) => PAD_LEFT + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) =>
    HEIGHT - PAD_BOTTOM - ((value - floor) / (peak - floor)) * plotHeight;

  const area = (values: number[]) =>
    `M ${x(0)} ${y(floor)} ` +
    values.map((value, index) => `L ${x(index)} ${y(value)}`).join(" ") +
    ` L ${x(values.length - 1)} ${y(floor)} Z`;

  const line = (values: number[]) =>
    values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");

  // Four gridlines is enough to read a value off without becoming graph paper.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => floor + (peak - floor) * fraction);
  const years = Math.round((points.length - 1) / 12);
  const yearTicks = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.month % 12 === 0 && point.month > 0)
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
        aria-label={`Balance and contributions over ${years} years`}
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

        {/* Balance behind, contributions in front: the visible gap is the interest. */}
        <path d={area(balances)} fill="var(--accent)" opacity={0.22} />
        <path d={area(contributions)} fill="var(--border-strong)" opacity={0.45} />
        <path d={line(balances)} fill="none" stroke="var(--accent)" strokeWidth={2} />
        <path
          d={line(contributions)}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        {yearTicks.map(({ point, index }) => (
          <text
            key={point.month}
            x={x(index)}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize={11}
            fill="var(--faint)"
          >
            {point.month / 12}y
          </text>
        ))}
      </svg>

      <div className="legend">
        <span>
          <i className="swatch" style={{ background: "var(--accent)" }} aria-hidden="true" />
          Balance — {money.amount(points[points.length - 1]?.balance ?? "0.00")}
        </span>
        <span>
          <i
            className="swatch"
            style={{ background: "var(--border-strong)" }}
            aria-hidden="true"
          />
          Paid in — {money.amount(points[points.length - 1]?.contributed ?? "0.00")}
        </span>
      </div>
    </>
  );
}
