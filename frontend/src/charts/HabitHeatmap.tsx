import type { Heatmap } from "../api/types";
import { useT } from "../i18n";
import { useDates } from "../useDates";

/**
 * The last N weeks of a habit, one cell per day.
 *
 * Hand-rolled inline SVG like every other chart here — no library, and none is to be added.
 * Columns are weeks (Monday first), rows are weekdays, so a habit that only ever happens at
 * the weekend shows as two bright rows rather than as noise.
 *
 * **Three states, not two** (Epic 26). A day was done, or it was asked for and missed, or
 * it was never a habit day. Drawing the last two the same way makes a Monday-Wednesday-
 * Friday habit look like a wall of failure — five sevenths of every week unfilled — when in
 * fact it was never asked for on those days. A missed day is outlined; a day the schedule
 * ignored is left flat.
 *
 * Opacity carries the count against the day's share of the target, so a "three times a
 * week" habit does not look like a permanent failure next to a daily one: for that kind the
 * full-strength cell is one occurrence, since the target is met across the week rather than
 * within a day.
 */

const CELL = 12;
const GAP = 3;
const TOP = 12;
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function HabitHeatmap({ data }: { data: Heatmap }) {
  const t = useT();
  const dates = useDates();
  const start = new Date(`${data.start_on}T00:00:00`);
  const end = new Date(`${data.end_on}T00:00:00`);
  const total = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const weeks = Math.max(1, Math.ceil(total / 7));

  const byDay = new Map(data.days.map((day) => [day.on, day]));
  // For a per-day schedule the target is per day; for `times_per_week` a single occurrence
  // is a full day's worth, so one check-in reads as a full cell rather than a third of one.
  const full =
    data.schedule.kind === "times_per_week" ? 1 : Math.max(1, data.schedule.target_count);

  const width = weeks * (CELL + GAP) + 16;
  const height = TOP + 7 * (CELL + GAP);

  return (
    // Sized in CSS rather than pinned to the intrinsic 196px: on a phone that left the grid
    // occupying half a 311px column with cells smaller than they needed to be. The viewBox
    // keeps the aspect ratio, so filling the column scales the cells up instead of
    // stretching them, and `.heatmap` caps it before it becomes a wall on a desktop.
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="heatmap"
      role="img"
      aria-label={t("habits.heatmapAria", { name: data.name, weeks })}
    >
      {WEEKDAYS.map((row) => (
        <text
          key={row}
          x={0}
          y={TOP + row * (CELL + GAP) + CELL - 2}
          fontSize={8}
          fill="var(--faint)"
        >
          {dates.weekdayInitial(row)}
        </text>
      ))}
      {Array.from({ length: weeks }).flatMap((_, column) =>
        Array.from({ length: 7 }).map((__, row) => {
          const day = new Date(
            start.getFullYear(),
            start.getMonth(),
            start.getDate() + column * 7 + row,
          );
          if (day >= end) return null;
          const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
            day.getDate(),
          ).padStart(2, "0")}`;
          const cell = byDay.get(iso);
          const times = cell?.times ?? 0;
          const missed = times === 0 && (cell?.due ?? false);
          return (
            <rect
              key={iso}
              x={12 + column * (CELL + GAP)}
              y={TOP + row * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={2}
              fill={times > 0 ? "var(--accent)" : "var(--border)"}
              opacity={times > 0 ? Math.min(1, 0.35 + (0.65 * times) / full) : missed ? 1 : 0.45}
              stroke={missed ? "var(--faint)" : "none"}
              strokeWidth={missed ? 1 : 0}
            >
              <title>
                {times > 0
                  ? t("habits.cellDone", { date: iso, times })
                  : missed
                    ? t("habits.cellMissed", { date: iso })
                    : t("habits.cellResting", { date: iso })}
              </title>
            </rect>
          );
        }),
      )}
    </svg>
  );
}
