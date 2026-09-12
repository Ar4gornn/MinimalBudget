"""When a habit is due: calendar arithmetic, and nothing else (Epic 26, AD-43).

Pure functions over dates. No session, no models, no imports from ``app.services`` — which
is what lets every rule below be tested without a database, and what stops a second copy of
"is today a habit day" appearing in the notifier, in the heat-map and on the page.

**Why this is Python and not SQL.** Epic 23 generated its periods with
``generate_series``, which is exactly right for "every day" and "every week". It is not
right for "the last Friday of the month": expressing that in SQL costs a correlated
subquery per month, and expressing all six kinds costs a ``CASE`` that no one would read
twice. Counting is still SQL — one ``GROUP BY done_on`` for the whole page — and counting
is what AD-9 is about. Deciding which days were *due* is calendar arithmetic over a handful
of rows, so it lives here where it can be read (AD-43).

The vocabulary the rest of the code uses:

* an **occasion** is one thing the schedule asks for, with inclusive bounds. For five of
  the six kinds an occasion is a single day; for ``times_per_week`` it is a Monday-week.
* an occasion is **met** when the check-ins inside it reach ``target_count``.
* the occasion containing today is **open**: it has not failed yet, and never counts as a
  miss (AD-40).
"""

import calendar
import datetime as dt
from collections.abc import Iterator
from typing import NamedTuple

from app.models.habits import LAST, MAX_DAY_OF_MONTH, ScheduleKind

#: Monday-based, matching ``date.weekday()``.
WEEKDAY_BITS = tuple(1 << n for n in range(7))

#: A schedule cannot be walked back further than this many occasions in one read. The
#: ``started_on >= 2000-01-01`` floor already bounds it, but a daily habit dated 2000 is
#: 9,000 iterations per read and a streak longer than this is not a number anyone reads —
#: it is a bug. Reaching the cap truncates the streak rather than failing the request.
MAX_WALK = 10_000


class Occasion(NamedTuple):
    """Inclusive bounds. ``start == end`` for every kind but ``times_per_week``."""

    start: dt.date
    end: dt.date


class Schedule(NamedTuple):
    """The plan, detached from the row it came from, so tests need no database."""

    kind: str
    target_count: int
    weekdays: int | None = None
    interval_days: int | None = None
    day_of_month: int | None = None
    nth: int | None = None
    weekday: int | None = None

    @classmethod
    def of(cls, habit) -> "Schedule":  # noqa: ANN001 — a Habit row, typed loosely to keep
        """Read a schedule off a habit row."""  # this module free of an ORM import
        return cls(
            kind=str(habit.schedule_kind),
            target_count=habit.target_count,
            weekdays=habit.weekdays,
            interval_days=habit.interval_days,
            day_of_month=habit.day_of_month,
            nth=habit.nth,
            weekday=habit.weekday,
        )


# ---------------------------------------------------------------- weekdays


def weekday_set(mask: int) -> list[int]:
    """The Monday-based weekday numbers a bitmask names, ascending."""
    return [n for n in range(7) if mask & WEEKDAY_BITS[n]]


def weekday_mask(days: list[int]) -> int:
    mask = 0
    for day in days:
        mask |= WEEKDAY_BITS[day]
    return mask


# ------------------------------------------------------------------- weeks


def week_start(when: dt.date) -> dt.date:
    """The Monday of ``when``'s week.

    Monday, stated rather than inferred, and the same Monday Postgres ``date_trunc('week')``
    uses — so the two never disagree by a day. It is deliberately not the account's budget
    month boundary: ``budget_start_day`` is 1-28 and cannot express a weekday, and a habit
    week is not a pay cycle.
    """
    return when - dt.timedelta(days=when.weekday())


def week_of(when: dt.date) -> Occasion:
    start = week_start(when)
    return Occasion(start, start + dt.timedelta(days=6))


# ------------------------------------------------------------ month helpers


def _shift_month(year: int, month: int, by: int) -> tuple[int, int]:
    total = year * 12 + (month - 1) + by
    return total // 12, total % 12 + 1


def _nth_weekday_of(year: int, month: int, weekday: int, nth: int) -> dt.date:
    """The ``nth`` ``weekday`` of a month; ``nth == LAST`` is the last one.

    Always exists. ``nth`` is capped at 4 by the schema, and the fourth of any weekday
    falls on day ``1 + offset + 21`` with ``offset <= 6`` — day 28 at the very latest,
    which every month has. That is the same 28 that bounds ``day_of_month``, arrived at
    from the other direction.
    """
    if nth == LAST:
        last_day = calendar.monthrange(year, month)[1]
        last = dt.date(year, month, last_day)
        return last - dt.timedelta(days=(last.weekday() - weekday) % 7)
    first = dt.date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return dt.date(year, month, 1 + offset + (nth - 1) * 7)


def _monthly_occasion(schedule: Schedule, year: int, month: int) -> dt.date:
    """The single day a monthly kind falls on in a given month."""
    if schedule.kind == ScheduleKind.nth_weekday:
        assert schedule.nth is not None and schedule.weekday is not None
        return _nth_weekday_of(year, month, schedule.weekday, schedule.nth)
    assert schedule.day_of_month is not None
    return dt.date(year, month, min(schedule.day_of_month, MAX_DAY_OF_MONTH))


# ------------------------------------------------------------- is it due?


def is_scheduled(schedule: Schedule, started_on: dt.date, day: dt.date) -> bool:
    """Is ``day`` a day this schedule asks for?

    ``times_per_week`` names no days at all — it asks for a count across a week — so it
    answers False for every individual day, and the callers that care about weeks ask
    :func:`occasion_containing` instead. Reading "is Tuesday a scheduled day" as True for a
    three-times-a-week habit would make the digest nag every single evening.
    """
    if day < started_on:
        return False
    kind = schedule.kind
    if kind == ScheduleKind.daily:
        return True
    if kind == ScheduleKind.weekdays:
        return bool((schedule.weekdays or 0) & WEEKDAY_BITS[day.weekday()])
    if kind == ScheduleKind.every_n_days:
        return (day - started_on).days % (schedule.interval_days or 1) == 0
    if kind in (ScheduleKind.day_of_month, ScheduleKind.nth_weekday):
        return day == _monthly_occasion(schedule, day.year, day.month)
    return False


def occasion_containing(
    schedule: Schedule, started_on: dt.date, day: dt.date
) -> Occasion | None:
    """The occasion ``day`` falls inside, or None if the schedule asks for nothing then.

    A ``times_per_week`` habit's occasion is the whole week, so any day of a week that
    overlaps the habit's life is inside one — including a week the habit started midway
    through. That period is judged whole rather than prorated: "three times this week" does
    not become "one and a half" because it was written down on Wednesday.
    """
    if schedule.kind == ScheduleKind.times_per_week:
        window = week_of(day)
        return window if window.end >= started_on else None
    return Occasion(day, day) if is_scheduled(schedule, started_on, day) else None


# ------------------------------------------------------------ walking back


def occasions_back_from(
    schedule: Schedule, started_on: dt.date, when: dt.date
) -> Iterator[Occasion]:
    """Every occasion at or before ``when``, most recent first, stopping at ``started_on``.

    A generator on purpose: the streak walk stops at the first miss, and a habit kept for
    three years should not cost a thousand dates to learn that yesterday was missed.
    """
    kind = schedule.kind

    if kind == ScheduleKind.times_per_week:
        window = week_of(when)
        for _ in range(MAX_WALK):
            if window.end < started_on:
                return
            yield window
            start = window.start - dt.timedelta(days=7)
            window = Occasion(start, start + dt.timedelta(days=6))
        return

    if kind == ScheduleKind.every_n_days:
        step = schedule.interval_days or 1
        if when < started_on:
            return
        day = started_on + dt.timedelta(days=((when - started_on).days // step) * step)
        for _ in range(MAX_WALK):
            if day < started_on:
                return
            yield Occasion(day, day)
            day -= dt.timedelta(days=step)
        return

    if kind in (ScheduleKind.day_of_month, ScheduleKind.nth_weekday):
        year, month = when.year, when.month
        if _monthly_occasion(schedule, year, month) > when:
            year, month = _shift_month(year, month, -1)
        for _ in range(MAX_WALK):
            day = _monthly_occasion(schedule, year, month)
            if day < started_on:
                return
            yield Occasion(day, day)
            year, month = _shift_month(year, month, -1)
        return

    # daily and weekdays: step a day at a time and let is_scheduled decide. Seven steps per
    # occasion at the very worst, which is cheaper than the special case would be to read.
    day = when
    for _ in range(MAX_WALK * 7):
        if day < started_on:
            return
        if is_scheduled(schedule, started_on, day):
            yield Occasion(day, day)
        day -= dt.timedelta(days=1)


def next_occasion_after(
    schedule: Schedule, started_on: dt.date, when: dt.date
) -> dt.date | None:
    """The first day the schedule asks for, strictly after ``when``.

    Answers the "not due today" half of the Habits card. ``times_per_week`` returns the
    next Monday: the next thing it asks for is a fresh week.
    """
    if schedule.kind == ScheduleKind.times_per_week:
        return week_start(when) + dt.timedelta(days=7)

    floor = max(when + dt.timedelta(days=1), started_on)

    if schedule.kind == ScheduleKind.every_n_days:
        step = schedule.interval_days or 1
        if floor <= started_on:
            return started_on
        gap = (floor - started_on).days
        return started_on + dt.timedelta(days=((gap + step - 1) // step) * step)

    if schedule.kind in (ScheduleKind.day_of_month, ScheduleKind.nth_weekday):
        year, month = floor.year, floor.month
        # At most two months: this month's day may already have passed, the next month's
        # never has.
        for _ in range(2):
            day = _monthly_occasion(schedule, year, month)
            if day >= floor:
                return day
            year, month = _shift_month(year, month, 1)
        return None  # pragma: no cover — the second month always answers

    for offset in range(8):  # daily answers at 0, weekdays within a week
        day = floor + dt.timedelta(days=offset)
        if is_scheduled(schedule, started_on, day):
            return day
    return None  # pragma: no cover — a mask of 0 is refused by the schema


def occasions_in(
    schedule: Schedule, started_on: dt.date, start: dt.date, end: dt.date
) -> list[Occasion]:
    """Occasions whose *end* falls in the inclusive window ``[start, end]``, ascending.

    This is what "3 this week" counts. A monthly habit answers an empty list in most weeks,
    and the card says "next on the 15th" rather than inventing a denominator of zero.
    """
    found: list[Occasion] = []
    for occasion in occasions_back_from(schedule, started_on, end):
        # Break, never filter: the generator walks back to `started_on`, so a comprehension
        # would enumerate three years of days to collect this week's three.
        if occasion.end < start:
            break
        found.append(occasion)
    return sorted(found)
