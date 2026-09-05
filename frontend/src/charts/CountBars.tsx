/**
 * Whole-number counts per month — restocks per space — as a small multiple.
 *
 * The same shape as the spending sparkline so the two read as one family, but for
 * integers rather than money: no decimal helper, no currency, a count is a count.
 */

const WIDTH = 120;
const HEIGHT = 26;

export function CountBars({
  values,
  months,
  label,
  peak,
}: {
  values: number[];
  months: string[];
  label: string;
  /** Shared across every row, so the rows are comparable to each other. */
  peak: number;
}) {
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
      aria-label={`${label} restocks per month`}
    >
      {values.map((value, index) => {
        const height = (value / scale) * (HEIGHT - 2);
        return (
          <rect
            key={months[index] ?? index}
            x={index * step}
            y={HEIGHT - height}
            width={barWidth}
            height={height}
            fill="var(--accent)"
            opacity={0.85}
            rx={1}
          >
            <title>{`${months[index] ?? ""}: ${value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
