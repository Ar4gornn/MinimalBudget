"""Habits and their check-ins (Epics 23 and 26).

A habit is a plan, a check-in is a record, and neither writes the other (AD-35). Nothing
here stores a streak, a completion percentage or a "done today" flag: every one of those is
derived from the rows below (AD-9, AD-30, AD-43).
"""

import datetime as dt
import enum
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    SmallInteger,
    String,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# Monday is 0, matching `datetime.date.weekday()` and Postgres `date_trunc('week', …)`.
# Stated once, here, because a habit on "day 0" that meant Sunday in one file and Monday in
# another would be wrong exactly one seventh of the time.
MONDAY = 0
SUNDAY = 6


class ScheduleKind(enum.StrEnum):
    """When a habit is *due*. What "enough" means within one occasion is ``target_count``.

    ``times_per_week`` is the odd one out and deliberately kept: its occasion is a whole
    Monday-week rather than a day, which is the only way to say "three times a week, I do
    not care which days". Every other kind names days.
    """

    daily = "daily"
    weekdays = "weekdays"
    every_n_days = "every_n_days"
    day_of_month = "day_of_month"
    nth_weekday = "nth_weekday"
    times_per_week = "times_per_week"


#: Which optional column each kind requires. The database holds the same rule in
#: ``habits_schedule_shape`` (migration 0018); this is what the service validates against
#: before a write ever reaches it, so a bad schedule is a 422 with a sentence rather than a
#: constraint violation with a constraint name.
SCHEDULE_FIELDS: dict[str, tuple[str, ...]] = {
    ScheduleKind.daily: (),
    ScheduleKind.times_per_week: (),
    ScheduleKind.weekdays: ("weekdays",),
    ScheduleKind.every_n_days: ("interval_days",),
    ScheduleKind.day_of_month: ("day_of_month",),
    ScheduleKind.nth_weekday: ("nth", "weekday"),
}

#: Every column that only some kinds use. Anything not required by a kind must be NULL.
OPTIONAL_COLUMNS: tuple[str, ...] = (
    "weekdays",
    "interval_days",
    "day_of_month",
    "nth",
    "weekday",
)

#: The widest day of the month that exists in every month — the same ceiling, for the same
#: reason, as ``users.budget_start_day`` (AD-10).
MAX_DAY_OF_MONTH = 28

#: ``nth = -1`` is "the last one in the month"; 1..4 are counted from the start.
LAST = -1


class Habit(Base):
    __tablename__ = "habits"
    __table_args__ = (
        CheckConstraint(
            "schedule_kind IN ('daily', 'weekdays', 'every_n_days', 'day_of_month', "
            "'nth_weekday', 'times_per_week')",
            name="habits_schedule_kind_supported",
        ),
        CheckConstraint("target_count >= 1 AND target_count <= 100", name="habits_target_in_range"),
        CheckConstraint(
            "weekdays IS NULL OR weekdays BETWEEN 1 AND 127", name="habits_weekdays_in_range"
        ),
        CheckConstraint(
            "interval_days IS NULL OR interval_days BETWEEN 2 AND 365",
            name="habits_interval_in_range",
        ),
        CheckConstraint(
            "day_of_month IS NULL OR day_of_month BETWEEN 1 AND 28",
            name="habits_day_of_month_in_range",
        ),
        CheckConstraint("nth IS NULL OR nth IN (-1, 1, 2, 3, 4)", name="habits_nth_in_range"),
        CheckConstraint(
            "weekday IS NULL OR weekday BETWEEN 0 AND 6", name="habits_weekday_in_range"
        ),
        CheckConstraint("started_on >= DATE '2000-01-01'", name="habits_started_on_sane"),
        UniqueConstraint("user_id", "id", name="habits_user_id_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)

    # --- the schedule (Epic 26) -------------------------------------------
    schedule_kind: Mapped[str] = mapped_column(String(14), nullable=False)
    #: How many times within one occasion. Means the same thing for all six kinds.
    target_count: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Bitmask, bit 0 = Monday. "Mon, Wed, Fri" is 21.
    weekdays: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    interval_days: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    day_of_month: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    nth: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    weekday: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    started_on: Mapped[dt.date] = mapped_column(Date, nullable=False)
    archived_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    remind: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HabitCheckin(Base):
    """One occurrence: the day it happened, and the time if the person said one.

    One row per check-in, not per day. Migration 0018 explains why that reverses Epic 23's
    counter: with a time recorded, a double-tap and a second dose are finally different
    rows, and "delete the 2pm one" names a row instead of decrementing a number.

    ``done_at`` is ``time without time zone`` and nullable — NULL is "did it, did not say
    when", which is not midnight. Without a zone because it is paired with ``done_on``,
    the calendar day the *person* names (AD-10); an absolute instant beside a chosen date
    would let the two disagree about which day it was.
    """

    __tablename__ = "habit_checkins"
    __table_args__ = (
        CheckConstraint("done_on >= DATE '2000-01-01'", name="habit_checkins_done_on_sane"),
        ForeignKeyConstraint(
            ["user_id", "habit_id"],
            ["habits.user_id", "habits.id"],
            name="habit_checkins_habit_fkey",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    habit_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    done_on: Mapped[dt.date] = mapped_column(Date, nullable=False)
    done_at: Mapped[dt.time | None] = mapped_column(Time(timezone=False), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
