export function ProgressBar({
  percent,
  over,
  label,
}: {
  percent: number | null;
  over: boolean;
  label: string;
}) {
  if (percent === null) {
    return <span className="hint">—</span>;
  }
  return (
    <div
      className="bar-track"
      role="meter"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`bar-fill ${over ? "over" : "under"}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}
