/**
 * `YYYY-MM` helpers, matching the server's month contract (AD-10).
 *
 * The budget month need not start on the 1st. An account paid on the 26th has months
 * running 26th to 25th, labelled by the month the period *ends* in — so with a start day of
 * 26, "September" means 26 August to 25 September. Every function here that takes a
 * `startDay` mirrors the server's arithmetic exactly; a client that disagreed by a day
 * would show a total that does not match the list beneath it.
 *
 * **Arithmetic here, words in the catalogue** (Epic 25). The label functions take a
 * translator so that a French account reads "septembre 2026" — they are not `Intl`, for
 * the same reason `money.ts` pins its grouping: the *system* locale is not the language
 * the account chose, and a heading that changed with the machine would make a screenshot
 * and a test irreproducible. Called without one they answer in English, which is what
 * keeps them testable without mounting a provider.
 */

import { translator, type MessageKey, type Translate } from "./i18n/catalogue";

/** The widest start day that exists in every month. Mirrors MAX_START_DAY on the server. */
export const MAX_START_DAY = 28;

const EN = translator("en");

export function currentMonth(today: Date = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export function todayIso(today: Date = new Date()): string {
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

/** Which labelled month a date belongs to, for an account starting on `startDay`. */
export function monthOf(date: Date, startDay = 1): string {
  const calendar = currentMonth(date);
  return startDay === 1 || date.getDate() < startDay ? calendar : shiftMonth(calendar, 1);
}

/** Today's budget month. The default month every page opens on. */
export function budgetMonth(startDay = 1, today: Date = new Date()): string {
  return monthOf(today, startDay);
}

/** The real dates a labelled month covers, as `[start, endInclusive]`. */
export function monthBounds(month: string, startDay = 1): [Date, Date] {
  const [year = "1970", index = "01"] = month.split("-");
  const y = Number(year);
  const m = Number(index) - 1;
  if (startDay === 1) {
    return [new Date(y, m, 1), new Date(y, m + 1, 0)];
  }
  return [new Date(y, m - 1, startDay), new Date(y, m, startDay - 1)];
}

/** Alias: `addMonths(m, -1)` reads better than `shiftMonth(m, -1)` at call sites. */
export const addMonths = (month: string, by: number): string => shiftMonth(month, by);

export function shiftMonth(month: string, by: number): string {
  const [year = "1970", index = "01"] = month.split("-");
  const total = Number(year) * 12 + (Number(index) - 1) + by;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** The month's name, 1-based: `monthName(9)` is "September" / "septembre". */
export function monthName(index: number, t: Translate = EN): string {
  return t(`month.${index}` as MessageKey);
}

/** The short form for an axis tick or a narrow column: "Sep" / "sept.". */
export function monthNameShort(index: number, t: Translate = EN): string {
  return t(`monthShort.${index}` as MessageKey);
}

/** Monday-first, matching the server and every schedule in the app. 0 is Monday. */
export function weekdayName(weekday: number, t: Translate = EN): string {
  return t(`weekday.${weekday}` as MessageKey);
}

export function weekdayNameShort(weekday: number, t: Translate = EN): string {
  return t(`weekdayShort.${weekday}` as MessageKey);
}

/** One letter for a column head. Read by position: French repeats M, English repeats T. */
export function weekdayInitial(weekday: number, t: Translate = EN): string {
  return t(`weekdayInitial.${weekday}` as MessageKey);
}

/** Monday-first weekday of a `Date`, converted from JavaScript's Sunday-first `getDay()`. */
function mondayFirst(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** "September 2026" / "septembre 2026". */
export function monthLabel(month: string, t: Translate = EN): string {
  const [year, index] = month.split("-");
  const number = Number(index);
  if (!year || !Number.isInteger(number) || number < 1 || number > 12) return month;
  return t("date.monthYear", { month: monthName(number, t), year });
}

/** Short axis label: "Aug" / "août". */
export function monthTick(month: string, t: Translate = EN): string {
  const [, index] = month.split("-");
  const number = Number(index);
  return number >= 1 && number <= 12 ? monthNameShort(number, t) : month;
}

/** "26 Aug – 25 Sep", so nobody has to guess what "September" covers. Empty when it is
 *  the plain calendar month, which needs no explaining. */
export function monthRangeLabel(month: string, startDay = 1, t: Translate = EN): string {
  if (startDay === 1) return "";
  const [start, end] = monthBounds(month, startDay);
  const show = (d: Date) =>
    t("date.dayShort", { day: d.getDate(), month: monthNameShort(d.getMonth() + 1, t) });
  return t("date.range", { from: show(start), to: show(end) });
}

/**
 * "Sat 15 August" / "sam. 15 août" for a `YYYY-MM-DD`.
 *
 * Parsed as local midnight (`T00:00:00`), never with `new Date("2026-08-15")`, which the
 * spec says is UTC — west of UTC that renders the day before.
 */
export function dayLabel(iso: string, t: Translate = EN): string {
  const at = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(at.getTime())) return iso;
  return t("date.dayLong", {
    weekday: weekdayNameShort(mondayFirst(at), t),
    day: at.getDate(),
    month: monthName(at.getMonth() + 1, t),
  });
}
