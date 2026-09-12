"""When a habit is due, and what a streak counts (Epic 26, story 26.1, AD-43).

No database and no fixtures: every rule below is calendar arithmetic over a hand-written
dict of counts, which is exactly why the arithmetic lives in ``app.core.schedule`` rather
than in a SQL string. Each streak figure is worked out in a comment before it is asserted,
and several were made to fail on purpose — the comments say which rule each one protects.

Reference dates, all 2026, checked once and reused:

    1 Sep  Tue        7 Sep  Mon       14 Sep  Mon
    6 Sep  Sun       15 Sep  Tue       25 Sep  Fri  (the last Friday of September)
    8 Sep  Tue (the second Tuesday)     1 Oct  Thu
"""

import datetime as dt

from app.core.schedule import (
    Occasion,
    Schedule,
    is_scheduled,
    next_occasion_after,
    occasion_containing,
    occasions_back_from,
    occasions_in,
    week_of,
    weekday_mask,
    weekday_set,
)
from app.services.habits import streak_of

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)


def d(day: str) -> dt.date:
    return dt.date.fromisoformat(day)


def daily(target: int = 1) -> Schedule:
    return Schedule(kind="daily", target_count=target)


def mwf(target: int = 1) -> Schedule:
    return Schedule(kind="weekdays", target_count=target, weekdays=weekday_mask([MON, WED, FRI]))


def every(n: int, target: int = 1) -> Schedule:
    return Schedule(kind="every_n_days", target_count=target, interval_days=n)


def monthly(day: int, target: int = 1) -> Schedule:
    return Schedule(kind="day_of_month", target_count=target, day_of_month=day)


def nth(n: int, weekday: int, target: int = 1) -> Schedule:
    return Schedule(kind="nth_weekday", target_count=target, nth=n, weekday=weekday)


def weekly(target: int) -> Schedule:
    return Schedule(kind="times_per_week", target_count=target)


def done(*days: str) -> dict[dt.date, int]:
    """One check-in on each named day."""
    return {d(day): 1 for day in days}


# ------------------------------------------------------------------ weekdays


def test_a_weekday_mask_round_trips():
    assert weekday_mask([MON, WED, FRI]) == 1 + 4 + 16 == 21
    assert weekday_set(21) == [MON, WED, FRI]
    assert weekday_set(127) == list(range(7))


def test_monday_is_zero_everywhere():
    """The one assumption every other file inherits. Made to fail by starting weeks on
    Sunday: `week_of` moved a day and four streaks below went wrong."""
    assert d("2026-09-07").weekday() == MON
    assert week_of(d("2026-09-06")) == Occasion(d("2026-08-31"), d("2026-09-06"))
    assert week_of(d("2026-09-07")) == Occasion(d("2026-09-07"), d("2026-09-13"))


# ------------------------------------------------------------- which days


def test_daily_asks_for_every_day_from_the_start_and_none_before_it():
    schedule, start = daily(), d("2026-09-07")
    assert is_scheduled(schedule, start, d("2026-09-07"))
    assert is_scheduled(schedule, start, d("2026-09-08"))
    assert not is_scheduled(schedule, start, d("2026-09-06")), "before the habit existed"


def test_named_weekdays_ask_for_exactly_those_days():
    schedule, start = mwf(), d("2026-09-01")
    # 7 Sep Mon, 8 Tue, 9 Wed, 10 Thu, 11 Fri
    got = [day for day in range(7, 12) if is_scheduled(schedule, start, d(f"2026-09-{day:02d}"))]
    assert got == [7, 9, 11]


def test_every_n_days_counts_from_the_habits_own_start():
    """Not from any epoch: two habits both "every 3 days" but started a day apart are due on
    different days, and both are right."""
    schedule, start = every(3), d("2026-09-07")
    due = [day for day in range(7, 20) if is_scheduled(schedule, start, d(f"2026-09-{day:02d}"))]
    assert due == [7, 10, 13, 16, 19]


def test_a_day_of_the_month_is_that_day_in_every_month():
    schedule, start = monthly(15), d("2026-09-01")
    assert is_scheduled(schedule, start, d("2026-09-15"))
    assert is_scheduled(schedule, start, d("2026-10-15"))
    assert not is_scheduled(schedule, start, d("2026-09-14"))


def test_the_last_friday_of_the_month_is_found_by_counting_back():
    schedule, start = nth(-1, FRI), d("2026-09-01")
    assert is_scheduled(schedule, start, d("2026-09-25")), "25 Sep 2026 is the last Friday"
    assert not is_scheduled(schedule, start, d("2026-09-18")), "the fourth Friday, not the last"


def test_the_second_tuesday_is_found_by_counting_forward():
    schedule, start = nth(2, TUE), d("2026-09-01")
    assert is_scheduled(schedule, start, d("2026-09-08"))
    assert not is_scheduled(schedule, start, d("2026-09-01")), "that is the first"


def test_the_fourth_of_any_weekday_exists_in_every_month():
    """Why the schema caps `nth` at 4 rather than 5: the fourth falls on day 28 at the very
    latest, and every month has a 28th. February 2026 is the tightest case."""
    for weekday in range(7):
        day = next(
            date
            for date in (dt.date(2026, 2, n) for n in range(1, 29))
            if is_scheduled(nth(4, weekday), dt.date(2026, 2, 1), date)
        )
        assert day.month == 2 and day.day <= 28


def test_times_per_week_names_no_particular_day():
    """It asks for a count across a week, so no single day is "the" habit day. Made to fail
    by answering True: the digest then nagged every evening of the week."""
    schedule, start = weekly(3), d("2026-09-01")
    assert not any(
        is_scheduled(schedule, start, d(f"2026-09-{day:02d}")) for day in range(1, 15)
    )
    assert occasion_containing(schedule, start, d("2026-09-09")) == Occasion(
        d("2026-09-07"), d("2026-09-13")
    )


def test_a_week_the_habit_started_midway_through_is_still_a_whole_occasion():
    """"Three times this week" does not become "one and a half" because it was written down
    on Wednesday."""
    schedule = weekly(3)
    assert occasion_containing(schedule, d("2026-09-09"), d("2026-09-09")) == Occasion(
        d("2026-09-07"), d("2026-09-13")
    )
    assert occasion_containing(schedule, d("2026-09-09"), d("2026-09-01")) is None


# ----------------------------------------------------------- what comes next


def test_the_next_occasion_skips_the_days_the_schedule_ignores():
    schedule, start = mwf(), d("2026-09-01")
    assert next_occasion_after(schedule, start, d("2026-09-07")) == d("2026-09-09")  # Mon → Wed
    assert next_occasion_after(schedule, start, d("2026-09-11")) == d("2026-09-14")  # Fri → Mon


def test_the_next_occasion_of_a_monthly_habit_can_be_next_month():
    schedule, start = monthly(15), d("2026-09-01")
    assert next_occasion_after(schedule, start, d("2026-09-14")) == d("2026-09-15")
    assert next_occasion_after(schedule, start, d("2026-09-15")) == d("2026-10-15")


def test_the_next_occasion_of_an_interval_habit_lands_on_the_grid():
    schedule, start = every(3), d("2026-09-07")
    assert next_occasion_after(schedule, start, d("2026-09-07")) == d("2026-09-10")
    assert next_occasion_after(schedule, start, d("2026-09-11")) == d("2026-09-13")


def test_the_next_thing_a_weekly_habit_asks_for_is_a_fresh_week():
    assert next_occasion_after(weekly(3), d("2026-09-01"), d("2026-09-09")) == d("2026-09-14")


# --------------------------------------------------------- a week's occasions


def test_a_week_holds_three_occasions_for_a_monday_wednesday_friday_habit():
    """This is the denominator in "2 of 3 this week", and it is counted in occasions rather
    than in days — which is the whole answer to what 3 means when Tuesday is not a habit
    day."""
    week = week_of(d("2026-09-09"))
    got = occasions_in(mwf(), d("2026-09-01"), week.start, week.end)
    assert [one.start.day for one in got] == [7, 9, 11]


def test_a_week_holds_no_occasion_for_a_monthly_habit_that_falls_elsewhere():
    """The card must say "next on the 15th" rather than render a denominator of zero."""
    week = week_of(d("2026-09-09"))  # 7–13 Sep
    assert occasions_in(monthly(25), d("2026-09-01"), week.start, week.end) == []


def test_a_week_before_the_habit_started_holds_nothing():
    week = week_of(d("2026-09-02"))  # 31 Aug – 6 Sep
    assert occasions_in(mwf(), d("2026-09-07"), week.start, week.end) == []


def test_walking_back_stops_at_the_start_and_does_not_run_away():
    got = list(occasions_back_from(daily(), d("2026-09-07"), d("2026-09-10")))
    assert [one.start.day for one in got] == [10, 9, 8, 7]


# ------------------------------------------------------------------ streaks


def test_a_daily_streak_counts_days_and_the_open_day_is_never_a_miss():
    # Done 4, 5, 6 Sep; today is 7 Sep and nothing recorded yet. The open day is dropped
    # rather than counted as a miss, so the streak is the three days behind it (AD-40).
    counts = done("2026-09-04", "2026-09-05", "2026-09-06")
    assert streak_of(daily(), d("2026-09-01"), counts, d("2026-09-07")) == 3
    # Doing it today extends the run to four rather than replacing it.
    assert streak_of(daily(), d("2026-09-01"), counts | done("2026-09-07"), d("2026-09-07")) == 4


def test_a_gap_breaks_a_daily_streak_at_the_gap():
    # 3 Sep missing. 4, 5, 6 done, today 7 and open → 3, not 5.
    counts = done("2026-09-01", "2026-09-02", "2026-09-04", "2026-09-05", "2026-09-06")
    assert streak_of(daily(), d("2026-09-01"), counts, d("2026-09-07")) == 3


def test_a_weekday_streak_ignores_the_days_it_never_asked_for():
    """The headline of Epic 26. Mon 7, Wed 9, Fri 11 done; Tue 8 and Thu 10 recorded
    nothing, and neither is a miss because neither was ever asked for. Today is Sat 12,
    which is not an occasion at all — so nothing is open and nothing is dropped.

    Made to fail by treating every calendar day as an occasion: the streak collapsed to 0
    because Saturday had no check-in."""
    counts = done("2026-09-07", "2026-09-09", "2026-09-11")
    assert streak_of(mwf(), d("2026-09-07"), counts, d("2026-09-12")) == 3


def test_a_weekday_streak_spans_weeks():
    # Fri 4, Mon 7, Wed 9, Fri 11 → four consecutive habit days across two calendar weeks.
    counts = done("2026-09-04", "2026-09-07", "2026-09-09", "2026-09-11")
    assert streak_of(mwf(), d("2026-09-01"), counts, d("2026-09-12")) == 4


def test_a_missed_habit_day_breaks_a_weekday_streak_even_though_the_week_looks_full():
    """Wednesday missed, but the person ran on Tuesday and Thursday instead. Five check-ins
    in the week, and the streak is still 1: the schedule decides what was due, and a
    check-in only ever says what happened."""
    counts = done(
        "2026-09-07", "2026-09-08", "2026-09-10", "2026-09-11", "2026-09-12"
    )
    assert streak_of(mwf(), d("2026-09-07"), counts, d("2026-09-12")) == 1


def test_an_unmet_open_occasion_is_skipped_but_a_missed_one_behind_it_still_breaks():
    """Today (Fri 11) is open and empty — dropped, not counted as a miss. Wed 9 *was*
    missed, and it is the most recent judged occasion, so the run ends there at zero. Mon 7
    was done but sits behind the miss, and a streak is the leading run, not a total.

    Made to fail by dropping every unmet occasion rather than only the open one: the streak
    read 2 and could never go down again."""
    counts = done("2026-09-07")
    assert streak_of(mwf(), d("2026-09-07"), counts, d("2026-09-11")) == 0
    # Wednesday done as well, and the same open Friday: now the run is the two behind it.
    assert streak_of(mwf(), d("2026-09-07"), counts | done("2026-09-09"), d("2026-09-11")) == 2


def test_a_target_above_one_needs_that_many_in_the_occasion():
    # "Three times a day". Two on the 6th is not enough, so the run stops there.
    counts = {d("2026-09-05"): 3, d("2026-09-06"): 2, d("2026-09-07"): 3}
    assert streak_of(daily(3), d("2026-09-01"), counts, d("2026-09-07")) == 1


def test_a_weekly_streak_counts_weeks_not_days():
    # Three in the week of 31 Aug, three in the week of 7 Sep, today is Wed 9 with two —
    # the open week is dropped, so the streak is the one completed week behind it.
    counts = {
        d("2026-08-31"): 1, d("2026-09-02"): 1, d("2026-09-04"): 1,
        d("2026-09-07"): 1, d("2026-09-08"): 1,
    }
    assert streak_of(weekly(3), d("2026-08-31"), counts, d("2026-09-09")) == 1
    # A third one this week closes the open week and makes it two.
    assert streak_of(weekly(3), d("2026-08-31"), counts | done("2026-09-09"), d("2026-09-09")) == 2


def test_an_interval_streak_counts_only_the_days_on_the_grid():
    # Every 3 days from Mon 7: due 7, 10, 13. Done 7 and 10; today is 12, which is not on
    # the grid, so nothing is open and the most recent occasion (10) is fully judged.
    counts = done("2026-09-07", "2026-09-10")
    assert streak_of(every(3), d("2026-09-07"), counts, d("2026-09-12")) == 2
    # Doing it on the 11th earns nothing: the 11th is not an occasion.
    assert streak_of(every(3), d("2026-09-07"), counts | done("2026-09-11"), d("2026-09-12")) == 2


def test_a_monthly_streak_counts_months():
    counts = done("2026-07-15", "2026-08-15", "2026-09-15")
    assert streak_of(monthly(15), d("2026-07-01"), counts, d("2026-09-20")) == 3
    # A month missed in the middle stops it there.
    missing = done("2026-07-15", "2026-09-15")
    assert streak_of(monthly(15), d("2026-07-01"), missing, d("2026-09-20")) == 1


def test_a_last_friday_streak_finds_a_different_date_every_month():
    # Last Fridays: 26 Jun, 31 Jul, 28 Aug, 25 Sep 2026.
    counts = done("2026-07-31", "2026-08-28", "2026-09-25")
    assert streak_of(nth(-1, FRI), d("2026-07-01"), counts, d("2026-09-30")) == 3


def test_occasions_before_the_habit_started_are_not_misses():
    """A habit written down today has not failed every day since January."""
    assert streak_of(daily(), d("2026-09-07"), done("2026-09-07"), d("2026-09-07")) == 1


def test_a_brand_new_habit_has_no_streak_until_it_is_done():
    assert streak_of(daily(), d("2026-09-07"), {}, d("2026-09-07")) == 0
