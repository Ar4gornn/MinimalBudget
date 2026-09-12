import type { Entry } from "../catalogue";

/**
 * Month names, weekday names, and the labels built from them (Epic 25).
 *
 * These are message keys rather than `Intl.DateTimeFormat` for the same reason `money.ts`
 * pins `en-US` grouping: the *system* locale on a machine is not the language the account
 * chose, and a heading that changed with the machine would make a screenshot, a test and a
 * bug report irreproducible. The account says French, so the app says French — on a machine
 * set to Japanese, in a test with no locale at all, everywhere.
 *
 * French month and weekday names are lower case. That is the rule in French, not an
 * oversight, and capitalising them would be the single most visible sign that the
 * translation was done by pattern-matching English.
 */
export const dates = {
  "month.1": { en: "January", fr: "janvier" },
  "month.2": { en: "February", fr: "février" },
  "month.3": { en: "March", fr: "mars" },
  "month.4": { en: "April", fr: "avril" },
  "month.5": { en: "May", fr: "mai" },
  "month.6": { en: "June", fr: "juin" },
  "month.7": { en: "July", fr: "juillet" },
  "month.8": { en: "August", fr: "août" },
  "month.9": { en: "September", fr: "septembre" },
  "month.10": { en: "October", fr: "octobre" },
  "month.11": { en: "November", fr: "novembre" },
  "month.12": { en: "December", fr: "décembre" },

  // The axis label on a chart, and the column head on a narrow table.
  "monthShort.1": { en: "Jan", fr: "janv." },
  "monthShort.2": { en: "Feb", fr: "févr." },
  "monthShort.3": { en: "Mar", fr: "mars" },
  "monthShort.4": { en: "Apr", fr: "avr." },
  "monthShort.5": { en: "May", fr: "mai" },
  "monthShort.6": { en: "Jun", fr: "juin" },
  "monthShort.7": { en: "Jul", fr: "juil." },
  "monthShort.8": { en: "Aug", fr: "août" },
  "monthShort.9": { en: "Sep", fr: "sept." },
  "monthShort.10": { en: "Oct", fr: "oct." },
  "monthShort.11": { en: "Nov", fr: "nov." },
  "monthShort.12": { en: "Dec", fr: "déc." },

  // Monday-first, matching the server, Postgres and every schedule in the app.
  "weekday.0": { en: "Monday", fr: "lundi" },
  "weekday.1": { en: "Tuesday", fr: "mardi" },
  "weekday.2": { en: "Wednesday", fr: "mercredi" },
  "weekday.3": { en: "Thursday", fr: "jeudi" },
  "weekday.4": { en: "Friday", fr: "vendredi" },
  "weekday.5": { en: "Saturday", fr: "samedi" },
  "weekday.6": { en: "Sunday", fr: "dimanche" },

  "weekdayShort.0": { en: "Mon", fr: "lun." },
  "weekdayShort.1": { en: "Tue", fr: "mar." },
  "weekdayShort.2": { en: "Wed", fr: "mer." },
  "weekdayShort.3": { en: "Thu", fr: "jeu." },
  "weekdayShort.4": { en: "Fri", fr: "ven." },
  "weekdayShort.5": { en: "Sat", fr: "sam." },
  "weekdayShort.6": { en: "Sun", fr: "dim." },

  // One letter per column in the heat-map and the calendar head. French reuses M for
  // "mardi" and "mercredi" the way English reuses T; both are read by position.
  "weekdayInitial.0": { en: "M", fr: "L" },
  "weekdayInitial.1": { en: "T", fr: "M" },
  "weekdayInitial.2": { en: "W", fr: "M" },
  "weekdayInitial.3": { en: "T", fr: "J" },
  "weekdayInitial.4": { en: "F", fr: "V" },
  "weekdayInitial.5": { en: "S", fr: "S" },
  "weekdayInitial.6": { en: "S", fr: "D" },

  // "September 2026" / "septembre 2026" — the same order in both, but stated rather than
  // assumed, because the next language may not agree.
  "date.monthYear": { en: "{month} {year}", fr: "{month} {year}" },
  // "Sat 15 August" / "sam. 15 août".
  "date.dayLong": { en: "{weekday} {day} {month}", fr: "{weekday} {day} {month}" },
  // "26 Aug – 25 Sep", so nobody has to guess what a shifted month covers.
  "date.range": { en: "{from} – {to}", fr: "{from} – {to}" },
  "date.dayShort": { en: "{day} {month}", fr: "{day} {month}" },
  "date.ordinal": { en: "{day}", fr: "{day}" },
} satisfies Record<string, Entry>;
