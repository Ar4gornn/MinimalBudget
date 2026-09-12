/**
 * Reading a schedule (Epic 26).
 *
 * The server sends the rule — a kind and its parameters — and never the sentence. This is
 * where the rule becomes something to read, and it is deliberately the only place: the
 * habits list, the progress card and the heat-map heading all say the same thing about the
 * same habit because they all call the same function.
 *
 * Weekday numbering is Monday-first (0 = Monday), matching the server, Postgres and
 * `date.weekday()` in Python. It is *not* `Date.prototype.getDay()`, which is Sunday-first
 * — `weekdayOfDate` below is the one place that conversion happens.
 */

import type { Schedule, ScheduleKind } from "./api/types";

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Monday-first weekday of a `Date`, converted from JavaScript's Sunday-first `getDay()`. */
export function weekdayOfDate(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function hasWeekday(mask: number | null, weekday: number): boolean {
  return ((mask ?? 0) & (1 << weekday)) !== 0;
}

export function weekdayList(mask: number | null): number[] {
  return WEEKDAYS.filter((weekday) => hasWeekday(mask, weekday));
}

export function toggleWeekday(mask: number | null, weekday: number): number {
  return (mask ?? 0) ^ (1 << weekday);
}

/** Every kind, in the order the picker offers them: commonest first. */
export const SCHEDULE_KINDS: ScheduleKind[] = [
  "daily",
  "weekdays",
  "times_per_week",
  "every_n_days",
  "day_of_month",
  "nth_weekday",
];

/** The parameters a kind needs, mirroring `SCHEDULE_FIELDS` on the server. */
export const SCHEDULE_FIELDS: Record<ScheduleKind, readonly string[]> = {
  daily: [],
  times_per_week: [],
  weekdays: ["weekdays"],
  every_n_days: ["interval_days"],
  day_of_month: ["day_of_month"],
  nth_weekday: ["nth", "weekday"],
};

/** Sensible starting values, so switching kind in the form never produces an invalid one. */
export function defaultsFor(kind: ScheduleKind, today = new Date()): Partial<Schedule> {
  switch (kind) {
    case "weekdays":
      return { weekdays: 1 << weekdayOfDate(today) };
    case "every_n_days":
      return { interval_days: 2 };
    case "day_of_month":
      return { day_of_month: Math.min(today.getDate(), 28) };
    case "nth_weekday":
      return { nth: 1, weekday: weekdayOfDate(today) };
    default:
      return {};
  }
}

/** Bounds the server's CHECK constraints also hold. Mirrored, not guessed. */
export const MIN_INTERVAL_DAYS = 2;
export const MAX_INTERVAL_DAYS = 365;

export type ScheduleProblem = "incomplete" | "interval";

/**
 * What is wrong with a schedule, or null.
 *
 * Checked here rather than left to the server, because the server's answer to "every 1
 * days" is a pydantic field error — English, phrased for a developer, and the only 422 the
 * new controls can actually produce. The interval is deliberately *not* clamped as it is
 * typed the way the target count is: clamping would make 10 unreachable, since typing "1"
 * onto an empty field would become 2 and then 20.
 */
export function scheduleProblem(schedule: Schedule): ScheduleProblem | null {
  const missing = SCHEDULE_FIELDS[schedule.kind].some(
    (field) => schedule[field as keyof Schedule] === null,
  );
  if (missing) return "incomplete";
  if (schedule.kind === "every_n_days") {
    const days = schedule.interval_days ?? 0;
    if (days < MIN_INTERVAL_DAYS || days > MAX_INTERVAL_DAYS) return "interval";
  }
  return null;
}

/** The five parameter columns, so a caller can send the whole schedule in one object. */
export function scheduleBody(schedule: Schedule): {
  schedule_kind: ScheduleKind;
  target_count: number;
  weekdays: number | null;
  interval_days: number | null;
  day_of_month: number | null;
  nth: number | null;
  weekday: number | null;
} {
  return {
    schedule_kind: schedule.kind,
    target_count: schedule.target_count,
    weekdays: schedule.weekdays,
    interval_days: schedule.interval_days,
    day_of_month: schedule.day_of_month,
    nth: schedule.nth,
    weekday: schedule.weekday,
  };
}

/**
 * A time as the person wrote it: `"08:00:00"` from the wire becomes `"08:00"`.
 *
 * Sliced rather than parsed. A `TIME` has no date and no zone, so wrapping it in a `Date`
 * to format it would attach today's date and this machine's offset to a value that has
 * neither — the class of bug that renders 00:30 as the previous day west of UTC.
 */
export function timeLabel(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5);
}

/** `"08:00"` for an input's default, from a real clock. */
export function nowTime(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
