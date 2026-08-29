/** `YYYY-MM` helpers, matching the server's month contract (AD-10). */

export function currentMonth(today: Date = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export function todayIso(today: Date = new Date()): string {
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

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
