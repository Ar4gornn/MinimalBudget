import { useMemo } from "react";

import { useT } from "./i18n";
import {
  dayLabel,
  monthLabel,
  monthName,
  monthNameShort,
  monthRangeLabel,
  monthTick,
  weekdayInitial,
  weekdayName,
  weekdayNameShort,
} from "./months";

/**
 * The date labels, bound to the language the account reads in (Epic 25).
 *
 * A hook rather than threading a translator through every call site, and rather than a
 * module-level global — the same reasoning as `useMoney`: a global would be read during
 * render while being written by auth, which is exactly the kind of thing that shows one
 * family member another's language for a frame after signing in.
 *
 * The underlying functions in `months.ts` stay callable without a translator, in English,
 * so the arithmetic can be tested without mounting a provider.
 */
export function useDates(): {
  month: (month: string) => string;
  monthTick: (month: string) => string;
  monthRange: (month: string, startDay?: number) => string;
  day: (iso: string) => string;
  monthName: (index: number) => string;
  monthNameShort: (index: number) => string;
  weekday: (weekday: number) => string;
  weekdayShort: (weekday: number) => string;
  weekdayInitial: (weekday: number) => string;
} {
  const t = useT();
  return useMemo(
    () => ({
      month: (month: string) => monthLabel(month, t),
      monthTick: (month: string) => monthTick(month, t),
      monthRange: (month: string, startDay = 1) => monthRangeLabel(month, startDay, t),
      day: (iso: string) => dayLabel(iso, t),
      monthName: (index: number) => monthName(index, t),
      monthNameShort: (index: number) => monthNameShort(index, t),
      weekday: (weekday: number) => weekdayName(weekday, t),
      weekdayShort: (weekday: number) => weekdayNameShort(weekday, t),
      weekdayInitial: (weekday: number) => weekdayInitial(weekday, t),
    }),
    [t],
  );
}
