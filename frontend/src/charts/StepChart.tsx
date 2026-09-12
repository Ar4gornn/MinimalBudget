/**
 * One item's quantity over time, drawn from its change log.
 *
 * A step, not a line: a quantity is 3 until the moment it becomes 1, so the honest shape
 * between two changes is flat. The restock threshold is a dashed rule across the chart,
 * so a step dipping under it is visibly the reminder firing.
 */

import type { ItemChange } from "../api/types";
import { useT } from "../i18n";

const WIDTH = 240;
const HEIGHT = 56;
const PAD = 4;

export function StepChart({
  changes,
  threshold,
  label,
  now = new Date(),
}: {
  changes: ItemChange[];
  threshold: number | null;
  label: string;
  /** Injected so a test can pin the right edge of the time axis. */
  now?: Date;
}) {
  const t = useT();
  if (changes.length === 0) return null;

  const times = changes.map((change) => new Date(change.changed_at).getTime());
  const first = times[0] ?? now.getTime();
  const last = Math.max(now.getTime(), times[times.length - 1] ?? first);
  const span = Math.max(1, last - first);

  const peak = Math.max(
    1,
    threshold ?? 0,
    ...changes.map((change) => Math.max(change.quantity_before, change.quantity_after)),
  );

  const x = (time: number) => PAD + ((time - first) / span) * (WIDTH - PAD * 2);
  const y = (quantity: number) => HEIGHT - PAD - (quantity / peak) * (HEIGHT - PAD * 2);

  // Each change is a vertical at its time; between changes the level holds.
  const points: string[] = [];
  changes.forEach((change, index) => {
    const at = x(times[index] ?? first);
    points.push(`${at.toFixed(1)},${y(change.quantity_before).toFixed(1)}`);
    points.push(`${at.toFixed(1)},${y(change.quantity_after).toFixed(1)}`);
  });
  const current = changes[changes.length - 1]?.quantity_after ?? 0;
  points.push(`${x(last).toFixed(1)},${y(current).toFixed(1)}`);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      style={{ maxWidth: WIDTH * 2, height: "auto", display: "block" }}
      preserveAspectRatio="xMinYMid meet"
      role="img"
      aria-label={t("chart.quantityAria", { label })}
    >
      {threshold !== null && (
        <line
          x1={PAD}
          x2={WIDTH - PAD}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="var(--spend)"
          strokeDasharray="3 3"
          strokeWidth={1}
          opacity={0.7}
        >
          <title>{`Restock at ${threshold}`}</title>
        </line>
      )}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {changes.map((change, index) => (
        <circle
          key={change.changed_at + index}
          cx={x(times[index] ?? first)}
          cy={y(change.quantity_after)}
          r={2.5}
          fill="var(--accent)"
        >
          <title>{`${change.changed_at.slice(0, 10)}: ${change.quantity_before} → ${change.quantity_after}`}</title>
        </circle>
      ))}
    </svg>
  );
}
