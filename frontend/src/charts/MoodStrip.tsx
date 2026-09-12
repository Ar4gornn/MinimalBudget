import type { MoodDay, MoodHistory, MoodPoint } from "../api/types";
import { moodColour, moodWord } from "../components/MoodFace";

/**
 * Recent days, one cell each, in inline SVG like every other chart here (Epic 24).
 *
 * **A strip and not the habit heat-map's week grid**, deliberately. A heat-map's columns
 * exist so "do I only ever do this at the weekend" is visible, which is a question about an
 * *act* you either performed or did not. A mood is read as a trend, so time runs one way
 * and the days sit in a line.
 *
 * **A gap is a gap.** A day with no row is drawn as an empty outline, never as a low score:
 * "did not say" and "said the worst" are different things, and the only reason the
 * distinction survives to here is that the API returns answered days rather than a
 * zero-filled series.
 *
 * The thin bar under each cell is the day's verdict — filled when the day was called good,
 * hollow when it was not, absent when nobody said. Two channels, because the two questions
 * are independent and neither can be read off the other.
 */

const CELL = 9;
const GAP = 2;
const TOP = 0;
const STRIP = 14;
const VERDICT_Y = STRIP + 3;
const VERDICT_H = 3;
const HEIGHT = VERDICT_Y + VERDICT_H;

function isoOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function describe(iso: string, row: MoodDay | undefined): string {
  if (!row) return `${iso}: not answered`;
  const parts: string[] = [];
  if (row.mood !== null) parts.push(moodWord(row.mood));
  if (row.day_ok !== null) parts.push(row.day_ok ? "a good day" : "not a good day");
  if (row.note) parts.push(row.note);
  return `${iso}: ${parts.join(" — ")}`;
}

export function MoodStrip({ data }: { data: MoodHistory }) {
  const start = new Date(`${data.start_on}T00:00:00`);
  const end = new Date(`${data.end_on}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));

  const byDay = new Map(data.days.map((row) => [row.on, row]));
  const width = days * (CELL + GAP);

  return (
    // Sized in CSS, not pinned to its intrinsic width: the viewBox keeps the aspect ratio
    // so filling the column scales the cells up on a phone rather than stretching them,
    // and `.mood-strip` caps it before it becomes a wall on a desktop.
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      className="mood-strip"
      role="img"
      aria-label={`The last ${days} days: ${data.days_answered} answered`}
    >
      {Array.from({ length: days }).map((_, index) => {
        const day = new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate() + index,
        );
        const iso = isoOf(day);
        const row = byDay.get(iso);
        const point = row?.mood ?? null;
        const x = index * (CELL + GAP);
        return (
          <g key={iso}>
            <rect
              x={x}
              y={TOP}
              width={CELL}
              height={STRIP}
              rx={2}
              fill={point === null ? "none" : moodColour(point as MoodPoint)}
              stroke={point === null ? "var(--border-strong)" : "none"}
              strokeWidth={1}
            >
              <title>{describe(iso, row)}</title>
            </rect>
            {row?.day_ok !== null && row?.day_ok !== undefined && (
              <rect
                x={x}
                y={VERDICT_Y}
                width={CELL}
                height={VERDICT_H}
                rx={1}
                fill={row.day_ok ? "var(--accent)" : "none"}
                stroke={row.day_ok ? "none" : "var(--spend)"}
                strokeWidth={1}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * How many days carried each point, as five bars.
 *
 * A tally and not an average. A five-point scale is *ordinal*: the distance from 2 to 3 is
 * not the distance from 4 to 5, so a mean of it is arithmetic on labels, and "your week was
 * 3.4" is a number nobody chose and nothing can check. Five counts say everything the data
 * actually supports (AD-41).
 */
export function MoodTally({ data }: { data: MoodHistory }) {
  const peak = Math.max(1, ...data.counts.map((row) => row.days));
  return (
    <ul className="mood-tally">
      {data.counts.map((row) => (
        <li key={row.point}>
          <span className="mood-tally-word">{moodWord(row.point)}</span>
          <span className="mood-tally-track" aria-hidden="true">
            <span
              className="mood-tally-bar"
              style={{
                width: `${(row.days / peak) * 100}%`,
                background: moodColour(row.point),
              }}
            />
          </span>
          <span className="mood-tally-count">
            {row.days}
            {/* Read aloud as "Bad, 0 of 12 days answered": the count on its own is a
                number without a denominator, and the denominator is the whole point —
                days *answered*, never days in the window. */}
            <span className="visually-hidden">
              {` of ${data.days_with_mood} ${data.days_with_mood === 1 ? "day" : "days"} answered`}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
