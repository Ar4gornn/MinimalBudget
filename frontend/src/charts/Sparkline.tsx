/**
 * One category's spending across the trend window, as a small multiple.
 *
 * Small multiples rather than one multi-line chart: with a dozen categories the combined
 * chart becomes unreadable exactly when it would start being useful, and a row per
 * category keeps the numbers next to the shape.
 */

import { toChartNumber } from "../money";
import { useMoney } from "../useMoney";
import type { Money } from "../api/types";

const WIDTH = 120;
const HEIGHT = 26;

export function Sparkline({
  values,
  months,
  label,
  peak,
}: {
  values: Money[];
  months: string[];
  label: string;
  /** Shared across every row, so the rows are comparable to each other. */
  peak: number;
}) {
  const money = useMoney();
  if (values.length === 0) return null;

  const scale = Math.max(1, peak);
  const step = WIDTH / values.length;
  const barWidth = Math.max(2, step - 2);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={`${label} spending per month`}
    >
      {values.map((value, index) => {
        const height = (toChartNumber(value) / scale) * (HEIGHT - 2);
        return (
          <rect
            key={months[index] ?? index}
            x={index * step}
            y={HEIGHT - height}
            width={barWidth}
            height={height}
            fill="var(--spend)"
            opacity={0.85}
            rx={1}
          >
            <title>{`${months[index] ?? ""}: ${money.amount(value)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
