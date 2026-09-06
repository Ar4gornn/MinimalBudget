/**
 * `YYYY-MM` helpers, matching the server's month contract (AD-10).
 *
 * The budget month need not start on the 1st. An account paid on the 26th has months
 * running 26th to 25th, labelled by the month the period *ends* in — so with a start day of
 * 26, "September" means 26 August to 25 September. Every function here that takes a
 * `startDay` mirrors the server's arithmetic exactly; a client that disagreed by a day
 * would show a total that does not match the list beneath it.
 */

/** The widest start day that exists in every month. Mirrors MAX_START_DAY on the server. */
export const MAX_START_DAY = 28;

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

/** "26 Aug – 25 Sep", so nobody has to guess what "September" covers. Empty when it is
 *  the plain calendar month, which needs no explaining. */
export function monthRangeLabel(month: string, startDay = 1): string {
  if (startDay === 1) return "";
  const [start, end] = monthBounds(month, startDay);
  const show = (d: Date) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()]?.slice(0, 3) ?? ""}`;
  return `${show(start)} – ${show(end)}`;
}

/** Alias: `addMonths(m, -1)` reads better than `shiftMonth(m, -1)` at call sites. */
export const addMonths = (month: string, by: number): string => shiftMonth(month, by);

export function shiftMonth(month: string, by: number): string {
  const [year = "1970", index = "01"] = month.split("-");
  const total = Number(year) * 12 + (Number(index) - 1) + by;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  const name = MONTH_NAMES[Number(index) - 1];
  return name ? `${name} ${year}` : month;
}

/** Short axis label: "Aug". */
export function monthTick(month: string): string {
  const [, index] = month.split("-");
  return MONTH_NAMES[Number(index) - 1]?.slice(0, 3) ?? month;
}
