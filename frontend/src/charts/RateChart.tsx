/**
 * A unit-price series across the trend window.
 *
 * A line, not bars: a rate is a level to be compared month to month, not an amount to be
 * summed. A month with no purchase is a gap in the line, never a drop to zero — zero would
 * be a price, and a chart that dips to the floor whenever you skipped a fill-up lies about
 * fuel getting cheaper (AD-29).
 */

import type { Rate, Unit } from "../api/types";
import { toTenThousandths } from "../quantity";
import { useT } from "../i18n";

const WIDTH = 240;
const HEIGHT = 56;
const PAD = 4;

export function RateChart({
  values,
  months,
  unit,
  label,
}: {
  values: (Rate | null)[];
  months: string[];
  unit: Unit;
  label: string;
}) {
  const t = useT();
  const present = values.filter((v): v is Rate => v !== null).map(toTenThousandths);
  if (present.length === 0) return null;

  const low = Math.min(...present);
  const high = Math.max(...present);
  // A flat series still needs a visible line; give it a band rather than dividing by zero.
  const span = Math.max(high - low, Math.max(1, Math.round(high * 0.05)));
  const step = values.length > 1 ? (WIDTH - PAD * 2) / (values.length - 1) : 0;

  const x = (index: number) => PAD + index * step;
  const y = (value: number) => HEIGHT - PAD - ((value - low) / span) * (HEIGHT - PAD * 2);

  // Consecutive present points join; a null breaks the segment.
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${x(index).toFixed(1)},${y(toTenThousandths(value)).toFixed(1)}`);
  });
  if (current.length > 0) segments.push(current.join(" "));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      style={{ maxWidth: WIDTH * 2, height: "auto", display: "block" }}
      preserveAspectRatio="xMinYMid meet"
      role="img"
      aria-label={t("chart.rateAria", { label, unit })}
    >
      {segments.map((points, index) => (
        <polyline
          key={index}
          points={points}
          fill="none"
          stroke="var(--spend)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {values.map((value, index) =>
        value === null ? null : (
          <circle
            key={months[index] ?? index}
            cx={x(index)}
            cy={y(toTenThousandths(value))}
            r={2.5}
            fill="var(--spend)"
          >
            <title>{`${months[index] ?? ""}: ${value} /${unit}`}</title>
          </circle>
        ),
      )}
    </svg>
  );
}
