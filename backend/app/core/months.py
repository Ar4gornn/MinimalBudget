"""AD-10: a ``YYYY-MM`` parameter becomes a half-open date range.

Half-open, always: ``>= first of month AND < first of next month``. ``BETWEEN`` is the
off-by-one that either drops the last day or double-counts the boundary, and it is the
kind of bug that only shows up as a slightly wrong total.
"""

import datetime as dt
import re

_MONTH = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


class InvalidMonth(ValueError):
    pass


def parse_month(value: str) -> dt.date:
    match = _MONTH.match(value.strip())
    if match is None:
        raise InvalidMonth("month must be formatted YYYY-MM")
    year, month = int(match.group(1)), int(match.group(2))
    return dt.date(year, month, 1)


def month_range(value: str) -> tuple[dt.date, dt.date]:
    """Return ``[start, end)`` for a ``YYYY-MM`` string."""
    start = parse_month(value)
    return start, add_months(start, 1)


def add_months(first_of_month: dt.date, count: int) -> dt.date:
    total = (first_of_month.year * 12 + first_of_month.month - 1) + count
    return dt.date(total // 12, total % 12 + 1, 1)


def format_month(first_of_month: dt.date) -> str:
    return f"{first_of_month.year:04d}-{first_of_month.month:02d}"
