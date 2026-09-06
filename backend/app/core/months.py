"""AD-10: a ``YYYY-MM`` parameter becomes a half-open date range.

Half-open, always: ``>= start AND < end``. ``BETWEEN`` is the off-by-one that either drops
the last day or double-counts the boundary, and it is the kind of bug that only shows up as
a slightly wrong total.

**The month need not be the calendar one.** An account whose salary lands on the 26th keeps
a budget month that runs from the 26th to the 25th, and the period is labelled by the month
its **last day** falls in — so with a start day of 26, "2026-09" means 26 August to 25
September. A start day of 1 is the calendar month, unchanged, which is what every existing
account has.

The start day is limited to 1–28 by a database CHECK, and that is a real constraint rather
than a shrug: the 29th, 30th and 31st do not exist in every month, so a boundary on one of
them would have to be clamped — and a clamped boundary breaks the arithmetic that maps a
date back to its period, silently, in February. Paying on "the 31st" means the last banking
day of the month, which is a different feature (a rule, not a day) and not this one.
"""

import datetime as dt
import enum
import re

_MONTH = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")

# The widest start day that exists in every month. See the module docstring.
MAX_START_DAY = 28
DEFAULT_START_DAY = 1


class InvalidMonth(ValueError):
    pass


_YEAR = re.compile(r"^\d{4}$")


def parse_year(value: str) -> int:
    if _YEAR.match(value.strip()) is None:
        raise InvalidMonth("year must be formatted YYYY")
    return int(value.strip())


def year_range(year: int, start_day: int = DEFAULT_START_DAY) -> tuple[dt.date, dt.date]:
    """The twelve labelled months of a year, as one half-open range.

    A year is exactly its twelve budget months, so with a start day of 26 the year 2026 runs
    from 26 December 2025 to 25 December 2026. Deriving it from the month windows rather
    than from January 1st is the whole point: a year that did not line up with the months
    inside it would make the twelve figures fail to add up to the one.
    """
    start, _ = month_range(f"{year:04d}-01", start_day)
    _, end = month_range(f"{year:04d}-12", start_day)
    return start, end


def parse_month(value: str) -> dt.date:
    match = _MONTH.match(value.strip())
    if match is None:
        raise InvalidMonth("month must be formatted YYYY-MM")
    year, month = int(match.group(1)), int(match.group(2))
    return dt.date(year, month, 1)


def _checked(start_day: int) -> int:
    if not 1 <= start_day <= MAX_START_DAY:
        raise InvalidMonth(f"the budget month must start between day 1 and day {MAX_START_DAY}")
    return start_day


def month_range(value: str, start_day: int = DEFAULT_START_DAY) -> tuple[dt.date, dt.date]:
    """Return ``[start, end)`` for a ``YYYY-MM`` label.

    With ``start_day = 1`` this is the calendar month. Otherwise the period ends on the day
    *before* ``start_day`` of the labelled month, and begins on ``start_day`` of the month
    before it — so the period's last day always falls in the month it is named after.
    """
    first = parse_month(value)
    day = _checked(start_day)
    if day == 1:
        return first, add_months(first, 1)
    return (
        dt.date(*_ym(add_months(first, -1)), day),
        dt.date(first.year, first.month, day),
    )


def month_of(when: dt.date, start_day: int = DEFAULT_START_DAY) -> str:
    """Which labelled month a date belongs to. The inverse of :func:`month_range`."""
    day = _checked(start_day)
    if day == 1 or when.day < day:
        return format_month(when)
    return format_month(add_months(when.replace(day=1), 1))


def bucket_params(start_day: int = DEFAULT_START_DAY) -> dict[str, int]:
    """Bind parameters for the SQL that groups rows into labelled months.

    The expression is::

        date_trunc('month', <date> - make_interval(days => :bucket_shift))
            + make_interval(months => :bucket_bump)

    Shifting the date back by ``start_day - 1`` days moves a period onto a calendar month
    boundary, and the bump then names it after the month it ends in. Both are **bound
    parameters**, never interpolated: the day comes from a user's profile, and AD-3's rule
    about not building SQL out of user data does not stop being true because it is an int.
    """
    day = _checked(start_day)
    return {"bucket_shift": day - 1, "bucket_bump": 0 if day == 1 else 1}


# The SQL fragment those parameters belong to, written once so the five call sites cannot
# drift from each other.
def bucket(column: str) -> str:
    return (
        f"(date_trunc('month', {column} - make_interval(days => :bucket_shift))"
        " + make_interval(months => :bucket_bump))"
    )


def _ym(when: dt.date) -> tuple[int, int]:
    return when.year, when.month


def add_months(first_of_month: dt.date, count: int) -> dt.date:
    total = (first_of_month.year * 12 + first_of_month.month - 1) + count
    return dt.date(total // 12, total % 12 + 1, 1)


def format_month(first_of_month: dt.date) -> str:
    return f"{first_of_month.year:04d}-{first_of_month.month:02d}"


class Period(enum.StrEnum):
    """How wide a window the headline figures cover.

    ``month`` and ``year`` are the account's, not the calendar's (AD-10): a year is exactly
    its twelve budget months, so the twelve monthly figures add up to the yearly one.
    """

    month = "month"
    year = "year"
    all = "all"


def period_window(
    period: Period, anchor: str, start_day: int = DEFAULT_START_DAY
) -> tuple[dt.date | None, dt.date | None, str]:
    """The half-open range a period covers, and how to name it.

    ``all`` has no bounds at all — ``None`` rather than a sentinel date, so the SQL says
    "no lower bound" instead of "later than some year I picked", which is the kind of
    guess that quietly drops a row.
    """
    if period is Period.all:
        return None, None, "All time"
    if period is Period.year:
        year = parse_year(anchor[:4]) if len(anchor) >= 4 else parse_year(anchor)
        start, end = year_range(year, start_day)
        return start, end, f"{year:04d}"
    start, end = month_range(anchor, start_day)
    return start, end, anchor
