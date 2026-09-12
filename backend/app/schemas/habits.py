"""Wire shapes for habits, schedules and check-ins (Epics 23 and 26)."""

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.habits import MAX_DAY_OF_MONTH, ScheduleKind

# Every bound here mirrors a CHECK constraint in migration 0018. The pair is deliberate:
# pydantic turns a bad number into a 422 naming the field, and the constraint makes the
# same rule true of rows written by anything that is not this API.
_TARGET = Field(ge=1, le=100)
_WEEKDAYS = Field(default=None, ge=1, le=127)
_INTERVAL = Field(default=None, ge=2, le=365)
_DAY_OF_MONTH = Field(default=None, ge=1, le=MAX_DAY_OF_MONTH)
_WEEKDAY = Field(default=None, ge=0, le=6)


def _trimmed(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("name cannot be blank")
    return trimmed


class ScheduleFields(BaseModel):
    """The five columns only some kinds use. Flat rather than a nested object.

    Flat because the database is flat, and a nested ``{"kind": ..., "of": {...}}`` would
    need unwrapping on both sides for no gain. Which of them a kind requires is stated once
    in ``models.habits.SCHEDULE_FIELDS`` and enforced by ``services.habits.validate_schedule``.
    """

    #: Bitmask, bit 0 = Monday. "Mon, Wed, Fri" is 21.
    weekdays: int | None = _WEEKDAYS
    interval_days: int | None = _INTERVAL
    day_of_month: int | None = _DAY_OF_MONTH
    #: 1..4 counting from the start of the month, or -1 for the last one.
    nth: int | None = Field(default=None)
    weekday: int | None = _WEEKDAY

    @model_validator(mode="after")
    def _check_nth(self) -> "ScheduleFields":
        if self.nth is not None and self.nth not in (-1, 1, 2, 3, 4):
            raise ValueError("nth must be 1, 2, 3, 4, or -1 for the last one")
        return self


class HabitCreate(ScheduleFields):
    name: str = Field(min_length=1, max_length=80)
    schedule_kind: ScheduleKind = ScheduleKind.daily
    #: How many times within one occasion. The same meaning for all six kinds.
    target_count: int = Field(default=1, ge=1, le=100)
    # Absent means "from today". A habit started in the past is legitimate — someone writing
    # down what they have already been doing — so it is allowed, and the streak honours it.
    started_on: dt.date | None = None
    remind: bool = False
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _trim(self) -> "HabitCreate":
        object.__setattr__(self, "name", _trimmed(self.name))
        return self


class HabitUpdate(ScheduleFields):
    """Every field optional; only the ones present in the request are written.

    The schedule changes freely, unlike the currency and the weight unit (AD-36). Changing
    it re-judges derived figures and relabels no stored number — see AD-40. ``archived`` is
    the non-destructive alternative to deleting.
    """

    name: str | None = Field(default=None, min_length=1, max_length=80)
    schedule_kind: ScheduleKind | None = None
    target_count: int | None = Field(default=None, ge=1, le=100)
    remind: bool | None = None
    archived: bool | None = None
    note: str | None = Field(default=None, max_length=500)


class HabitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    schedule_kind: ScheduleKind
    target_count: int
    weekdays: int | None
    interval_days: int | None
    day_of_month: int | None
    nth: int | None
    weekday: int | None
    started_on: dt.date
    archived_at: dt.datetime | None
    remind: bool
    note: str | None
    created_at: dt.datetime


class CheckinCreate(BaseModel):
    """Record one occurrence. Absent ``done_on`` means today.

    ``done_at`` is the wall-clock time the person names, not an instant — see the model.
    Absent means "did it, did not say when", which is a different claim from midnight, so
    it is stored as NULL rather than defaulted.
    """

    done_on: dt.date | None = None
    done_at: dt.time | None = None
    note: str | None = Field(default=None, max_length=500)


class CheckinAmend(BaseModel):
    """Correct one occurrence. Only the fields actually sent are written.

    Both fields are explicitly nullable, and the router reads ``model_fields_set`` to tell
    "clear the time" from "leave the time alone" — a difference a plain default cannot
    express. The day is deliberately not amendable: a check-in on the wrong day is one that
    did not happen, so it is deleted and recorded again.
    """

    done_at: dt.time | None = None
    note: str | None = Field(default=None, max_length=500)


class CheckinOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    habit_id: uuid.UUID
    habit_name: str
    done_on: dt.date
    done_at: dt.time | None
    note: str | None


class ScheduleOut(BaseModel):
    """The plan, echoed back so the client can write the words for it.

    The server sends the rule, never the sentence. "Mon, Wed, Fri" and "lun., mer., ven."
    are the same rule in two languages, and Epic 25 made the client the only place that
    turns stored facts into words."""

    kind: ScheduleKind
    target_count: int
    weekdays: int | None = None
    interval_days: int | None = None
    day_of_month: int | None = None
    nth: int | None = None
    weekday: int | None = None


class CheckinTime(BaseModel):
    """One of today's occurrences: enough to show it and enough to take it back."""

    id: uuid.UUID
    done_at: dt.time | None
    note: str | None


class HabitProgressOut(BaseModel):
    """Where a habit stands right now.

    Every figure here is computed on read. Nothing stores a streak or a "done" flag,
    because a stored one goes stale the moment the schedule changes (AD-30, AD-40).
    """

    habit_id: uuid.UUID
    name: str
    schedule: ScheduleOut
    remind: bool

    #: Does the schedule ask for anything today? False on a Tuesday for a Mon/Wed/Fri habit.
    due_today: bool
    #: Inclusive bounds of the occasion in progress — today, or this Monday-week for a
    #: `times_per_week` habit. Null on a day the schedule does not ask for.
    occasion_start: dt.date | None
    occasion_end: dt.date | None
    #: Check-ins inside that occasion; today's count when there is no occasion.
    done: int
    met: bool

    #: Today's occurrences, in time order with the untimed ones last.
    today_done: int
    today_times: list[CheckinTime]

    #: The Monday-week rollup: how many occasions this week, and how many were met. This is
    #: the "2 of 3 this week" figure, counted in occasions rather than in days.
    window_start: dt.date
    window_end: dt.date
    window_due: int
    window_done: int

    #: The next day the schedule asks for, after today. What the card says when not due.
    next_due: dt.date | None
    #: Consecutive met occasions. The open occasion is never counted as a miss.
    streak: int


class HeatmapDay(BaseModel):
    on: dt.date
    times: int
    #: Did the schedule ask for this day, on or before today? Lets the grid show a missed
    #: Monday differently from a Tuesday that was never a habit day.
    due: bool


class HeatmapOut(BaseModel):
    habit_id: uuid.UUID
    name: str
    schedule: ScheduleOut
    # The half-open window the days cover: [start, end). A heat-map is "the last N weeks",
    # which is deliberately not a budget month — so it carries its own bounds rather than
    # borrowing the month contract of AD-10.
    start_on: dt.date
    end_on: dt.date
    #: Every day in the window, not only the ones with check-ins.
    days: list[HeatmapDay]
