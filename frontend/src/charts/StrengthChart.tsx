import type { HistoryPoint, WeightUnit } from "../api/types";
import { useT } from "../i18n";

/**
 * One exercise over time: the heaviest set per session (Epic 19).
 *
 * Inline SVG, hand-rolled, like every other chart here (Consistency Conventions). Top set
 * rather than volume, because it is the number people actually track — and sessions with no
 * weight at all are drawn as a gap rather than a drop to zero, the same rule the unit-price
 * chart follows: nothing is not the same as none.
 */
const WIDTH = 320;
const HEIGHT = 120;
const PAD = 18;

export function StrengthChart({
  points,
  label,
  unit,
}: {
  points: HistoryPoint[];
  label: string;
  unit: WeightUnit;
}) {
  const t = useT();
  const weighted = points.filter((point) => point.top_weight !== null);
  if (weighted.length === 0) {
    return (
      <p className="hint">
        Every {label} session so far was bodyweight, so there is no weight to chart. The reps
        are in the sessions below.
      </p>
    );
  }

  const values = weighted.map((point) => Number(point.top_weight));
  const peak = Math.max(...values);
  const floor = Math.min(...values);
  // A flat series would divide by zero; give it a band so the line sits in the middle.
  const span = peak === floor ? Math.max(1, peak * 0.1) : peak - floor;
  const low = peak === floor ? peak - span : floor;

  const x = (index: number) =>
    points.length === 1
      ? WIDTH / 2
      : PAD + (index / (points.length - 1)) * (WIDTH - PAD * 2);
  const y = (value: number) =>
    HEIGHT - PAD - ((value - low) / (peak - low || 1)) * (HEIGHT - PAD * 2);

  // Broken into runs, so a bodyweight session leaves a gap instead of a line through zero.
  const runs: { index: number; value: number }[][] = [];
  let run: { index: number; value: number }[] = [];
  points.forEach((point, index) => {
    if (point.top_weight === null) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    run.push({ index, value: Number(point.top_weight) });
  });
  if (run.length) runs.push(run);

  return (
    <>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        style={{ maxWidth: WIDTH }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={t("chart.strengthAria", { label, unit })}
      >
        {runs.map((segment) => (
          <polyline
            key={segment[0]?.index}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            points={segment.map((p) => `${x(p.index)},${y(p.value)}`).join(" ")}
          />
        ))}
        {points.map((point, index) =>
          point.top_weight === null ? null : (
            <circle
              key={point.performed_on}
              cx={x(index)}
              cy={y(Number(point.top_weight))}
              r={3}
              fill="var(--accent)"
            >
              <title>{`${point.performed_on}: ${point.top_weight} ${unit} · ${point.sets} sets · ${point.reps} reps`}</title>
            </circle>
          ),
        )}
      </svg>
      <div className="legend">
        <span>
          {floor} – {peak} {unit}
        </span>
        <span>
          {points.length} {points.length === 1 ? "session" : "sessions"}
        </span>
      </div>
    </>
  );
}
