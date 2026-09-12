"""Habits, check-ins, and the figures derived from them (Epics 23 and 26).

A module beside the ledger, the inventory and the gym, not inside any of them (AD-31): it
imports its own models plus the pure calendar arithmetic in ``app.core.schedule``, and
nothing else. Nothing here commits (AD-4).

**Nothing is stored that can be computed.** There is no `done_today` flag and no `streak`
column, because both go stale the moment the schedule changes — and the schedule is allowed
to change (AD-40). Completion and streaks are computed on read, defined once, here.

**Where the work happens.** Counting is SQL: one ``GROUP BY (habit_id, done_on)`` for the
whole page. Deciding which days were *due* is calendar arithmetic and lives in
``app.core.schedule``, where it is testable without a database (AD-43). This module is the
join between the two, and it is the only place that knows both.
"""

import datetime as dt
import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Invalid, NotFound
from app.core.schedule import (
    Occasion,
    Schedule,
    is_scheduled,
    next_occasion_after,
    occasion_containing,
    occasions_back_from,
    occasions_in,
    week_of,
)
from app.models.habits import OPTIONAL_COLUMNS, SCHEDULE_FIELDS, Habit, HabitCheckin, ScheduleKind

# The heat-map's widest window. Two years of daily cells is already more than a phone can
# render usefully; the cap keeps a hand-typed query string from generating 40,000 rows.
MAX_HEATMAP_WEEKS = 104

# One habit, one day, one hundred times. This used to be ``CHECK (times <= 100)``; a check
# constraint cannot count rows, so migration 0018 moved the rule here — beside the two
# other rules the schema cannot hold (not in the future, not before the habit existed).
MAX_PER_DAY = 100


# ------------------------------------------------------------- the schedule


def validate_schedule(kind: str, fields: dict) -> dict:
    """Keep only the columns this kind uses, and refuse the ones it needs but did not get.

    The database holds the same rule in ``habits_schedule_shape``. This exists so a bad
    request is a 422 with a sentence naming the missing field, rather than a 500 carrying a
    constraint name — and so ``kind='daily', interval_days=3`` is *cleared* rather than
    stored as a value nothing will ever read.
    """
    if kind not in SCHEDULE_FIELDS:
        raise Invalid(f"'{kind}' is not a schedule this app knows", "schedule_kind_unknown")
    required = SCHEDULE_FIELDS[kind]
    cleaned = {column: None for column in OPTIONAL_COLUMNS}
    for column in required:
        value = fields.get(column)
        if value is None:
            raise Invalid(
                f"a '{kind}' schedule needs {column.replace('_', ' ')}",
                "schedule_incomplete",
            )
        cleaned[column] = value
    return cleaned


# ------------------------------------------------------------------- habits


def list_habits(
    session: Session, user_id: uuid.UUID, *, include_archived: bool = False
) -> list[Habit]:
    query = select(Habit).where(Habit.user_id == user_id)
    if not include_archived:
        query = query.where(Habit.archived_at.is_(None))
    # AD-20: total and deterministic. Archived last, then by name, so the list a person
    # reads twice is the same list twice.
    return list(
        session.execute(
            query.order_by(Habit.archived_at.is_(None).desc(), func.lower(Habit.name), Habit.id)
        ).scalars()
    )


def get_habit(session: Session, user_id: uuid.UUID, habit_id: uuid.UUID) -> Habit:
    habit = session.execute(
        select(Habit).where(Habit.user_id == user_id, Habit.id == habit_id)
    ).scalar_one_or_none()
    if habit is None:
        raise NotFound("No habit with that id")
    return habit


def create_habit(
    session: Session,
    user_id: uuid.UUID,
    *,
    name: str,
    schedule_kind: str,
    target_count: int,
    schedule: dict,
    started_on: dt.date | None,
    remind: bool,
    note: str | None,
    today: dt.date | None = None,
) -> Habit:
    today = today or dt.date.today()
    start = started_on or today
    if start > today:
        # A habit that starts in the future has no occasion to judge and no check-in that
        # could be honest, so it would render as a permanent zero rather than as a plan.
        raise Invalid("a habit cannot start in the future", "habit_start_future")
    habit = Habit(
        user_id=user_id,
        name=name,
        schedule_kind=str(schedule_kind),
        target_count=target_count,
        started_on=start,
        remind=remind,
        note=note,
        **validate_schedule(str(schedule_kind), schedule),
    )
    session.add(habit)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise Conflict("You already have a habit with that name", "habit_name_taken") from exc
    return habit


def update_habit(session: Session, user_id: uuid.UUID, habit_id: uuid.UUID, fields: dict) -> Habit:
    """Write only the fields the request actually carried.

    The schedule is **not** locked once check-ins exist. It re-judges stored facts rather
    than relabelling them: "I did it on the 3rd at 8am" stays true whatever the schedule is,
    and only the derived verdict moves. That is the opposite of the currency and the weight
    unit, which change what a stored *number* means and therefore lock (AD-36, AD-40).

    Changing the kind rewrites the whole schedule, never half of it: sending
    ``schedule_kind`` re-runs :func:`validate_schedule`, so the columns the new kind does
    not use are cleared in the same statement. A partial edit that left ``interval_days``
    behind from a previous kind is the sort of row the shape constraint would refuse, and
    the sort of bug that would otherwise only surface months later.
    """
    habit = get_habit(session, user_id, habit_id)
    if "name" in fields and fields["name"]:
        habit.name = fields["name"].strip()
    for key in ("target_count", "remind", "note"):
        if key in fields and fields[key] is not None:
            setattr(habit, key, fields[key])

    if "schedule_kind" in fields and fields["schedule_kind"] is not None:
        kind = str(fields["schedule_kind"])
        habit.schedule_kind = kind
        for column, value in validate_schedule(kind, fields).items():
            setattr(habit, column, value)
    elif any(column in fields for column in OPTIONAL_COLUMNS):
        # Same kind, adjusted parameters — "Mon, Wed, Fri" becoming "Mon, Thu". Validated
        # against the kind already stored, so an adjustment cannot smuggle in a column the
        # kind does not use.
        merged = {column: getattr(habit, column) for column in OPTIONAL_COLUMNS}
        merged.update({k: v for k, v in fields.items() if k in OPTIONAL_COLUMNS})
        for column, value in validate_schedule(str(habit.schedule_kind), merged).items():
            setattr(habit, column, value)

    if "archived" in fields and fields["archived"] is not None:
        habit.archived_at = func.now() if fields["archived"] else None
    habit.updated_at = func.now()
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise Conflict("You already have a habit with that name", "habit_name_taken") from exc
    # A server-side default assigned above (``func.now()``) is still a SQL expression on the
    # instance until it is read back.
    session.refresh(habit)
    return habit


def delete_habit(session: Session, user_id: uuid.UUID, habit_id: uuid.UUID) -> None:
    """Deletes the check-ins with it, by the foreign key (AD-21).

    Not RESTRICT: a check-in has no meaning without its habit, so keeping the rows would
    preserve nothing readable. Archiving is the non-destructive path, and it is what the
    client offers first.
    """
    result = session.execute(delete(Habit).where(Habit.user_id == user_id, Habit.id == habit_id))
    if result.rowcount == 0:
        raise NotFound("No habit with that id")
    session.flush()


def checkin_count(session: Session, user_id: uuid.UUID, habit_id: uuid.UUID) -> int:
    """How many check-ins exist. Shown before a delete, so nobody is surprised."""
    return int(
        session.execute(
            select(func.count())
            .select_from(HabitCheckin)
            .where(HabitCheckin.user_id == user_id, HabitCheckin.habit_id == habit_id)
        ).scalar_one()
    )


# ---------------------------------------------------------------- check-ins


def get_checkin(
    session: Session, user_id: uuid.UUID, habit_id: uuid.UUID, checkin_id: uuid.UUID
) -> HabitCheckin:
    row = session.execute(
        select(HabitCheckin).where(
            HabitCheckin.user_id == user_id,
            HabitCheckin.habit_id == habit_id,
            HabitCheckin.id == checkin_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFound("No check-in with that id")
    return row


def _times_on(
    session: Session, user_id: uuid.UUID, habit_id: uuid.UUID, day: dt.date
) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(HabitCheckin)
            .where(
                HabitCheckin.user_id == user_id,
                HabitCheckin.habit_id == habit_id,
                HabitCheckin.done_on == day,
            )
        ).scalar_one()
    )


def check_in(
    session: Session,
    user_id: uuid.UUID,
    habit_id: uuid.UUID,
    *,
    done_on: dt.date | None,
    done_at: dt.time | None,
    note: str | None,
    today: dt.date | None = None,
) -> HabitCheckin:
    """Record one occurrence. Each call is its own row, so three doses are three rows.

    A day the schedule did not ask for is still accepted. Evidence is evidence: a
    Monday-Wednesday-Friday runner who ran on Tuesday did run. It simply creates no
    occasion, so it counts towards neither the week's total nor the streak — the schedule
    decides what was *due*, and the check-in only ever says what happened.

    Three rules the database cannot hold, enforced here instead:

    * **not in the future** — a check-in is evidence, and there is no evidence of tomorrow.
      ``CHECK (done_on <= current_date)`` is refused by Postgres because the function is
      not IMMUTABLE.
    * **not before the habit existed** — the bound lives in another table, which a CHECK
      cannot reach.
    * **at most a hundred in one day** — a row count, which no CHECK can see (0018).
    """
    habit = get_habit(session, user_id, habit_id)
    today = today or dt.date.today()
    when = done_on or today
    if when > today:
        raise Invalid("a check-in cannot be in the future", "checkin_future")
    if when < habit.started_on:
        raise Invalid(
            f"that is before this habit started ({habit.started_on.isoformat()})",
            "checkin_before_start",
        )
    if _times_on(session, user_id, habit_id, when) >= MAX_PER_DAY:
        raise Invalid("that is already a hundred times in one day", "checkin_day_full")

    row = HabitCheckin(
        user_id=user_id, habit_id=habit_id, done_on=when, done_at=done_at, note=note
    )
    session.add(row)
    session.flush()
    return row


def delete_checkin(
    session: Session, user_id: uuid.UUID, habit_id: uuid.UUID, checkin_id: uuid.UUID
) -> None:
    """Remove one occurrence, named by its id.

    By id rather than by day, which is the whole point of Epic 26: with three doses
    recorded, "undo" has to say *which*. The page's minus button sends the newest id it
    holds, and the day's list lets any one of them be removed directly.
    """
    result = session.execute(
        delete(HabitCheckin).where(
            HabitCheckin.user_id == user_id,
            HabitCheckin.habit_id == habit_id,
            HabitCheckin.id == checkin_id,
        )
    )
    if result.rowcount == 0:
        raise NotFound("No check-in with that id")
    session.flush()


def amend_checkin(
    session: Session,
    user_id: uuid.UUID,
    habit_id: uuid.UUID,
    checkin_id: uuid.UUID,
    fields: dict,
) -> HabitCheckin:
    """Correct one occurrence: its time, its note, or both.

    ``done_at`` is explicitly nullable — sending null clears the time back to "did it, did
    not say when" rather than leaving the previous one. The *day* is not amendable: a
    check-in on the wrong day is a check-in that did not happen, so it is deleted and
    recorded again, which keeps every ``done_on`` a thing somebody asserted.
    """
    row = get_checkin(session, user_id, habit_id, checkin_id)
    if "done_at" in fields:
        row.done_at = fields["done_at"]
    if "note" in fields:
        row.note = fields["note"]
    row.updated_at = func.now()
    session.flush()
    session.refresh(row)
    return row


def list_checkins(
    session: Session,
    user_id: uuid.UUID,
    *,
    start: dt.date | None = None,
    end: dt.date | None = None,
    habit_id: uuid.UUID | None = None,
) -> list[tuple[HabitCheckin, str]]:
    """Check-ins in a half-open ``[start, end)`` window, with the habit's name.

    Half-open, always (AD-10). Archived habits are included: their check-ins are still a
    record of days that happened, and hiding them would make the calendar lie about the past.

    Ordered by day, then by time with the untimed ones last, then by id — total and
    deterministic (AD-20). Untimed last rather than first because "did it, did not say when"
    is not a claim about midnight.
    """
    query = (
        select(HabitCheckin, Habit.name)
        .join(Habit, Habit.id == HabitCheckin.habit_id)
        .where(HabitCheckin.user_id == user_id)
    )
    if habit_id is not None:
        get_habit(session, user_id, habit_id)
        query = query.where(HabitCheckin.habit_id == habit_id)
    if start is not None:
        query = query.where(HabitCheckin.done_on >= start)
    if end is not None:
        query = query.where(HabitCheckin.done_on < end)
    rows = session.execute(
        query.order_by(
            HabitCheckin.done_on,
            HabitCheckin.done_at.asc().nullslast(),
            func.lower(Habit.name),
            HabitCheckin.id,
        )
    ).all()
    return [(row, name) for row, name in rows]


# ------------------------------------------------------------- derived figures


def _counts(
    session: Session, user_id: uuid.UUID, habit_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[dt.date, int]]:
    """How many check-ins each habit has on each day it has any. One query for the page.

    Only days that carry a check-in come back, so the result is bounded by what was
    actually recorded rather than by the calendar — and a missing key is a definitive "not
    done", which is exactly what the streak walk needs. Every habit is read in full rather
    than over a window: a streak is only correct if the absence of a day is trustworthy,
    and a windowed read cannot tell "not done" from "not fetched". The walk itself is
    capped by ``MAX_WALK``.
    """
    if not habit_ids:
        return {}
    rows = session.execute(
        select(HabitCheckin.habit_id, HabitCheckin.done_on, func.count())
        .where(HabitCheckin.user_id == user_id, HabitCheckin.habit_id.in_(habit_ids))
        .group_by(HabitCheckin.habit_id, HabitCheckin.done_on)
    ).all()
    counts: dict[uuid.UUID, dict[dt.date, int]] = {habit_id: {} for habit_id in habit_ids}
    for habit_id, done_on, times in rows:
        counts[habit_id][done_on] = int(times)
    return counts


def _done_in(counts: dict[dt.date, int], occasion: Occasion) -> int:
    """Check-ins inside an occasion. One lookup for a day, seven for a week."""
    if occasion.start == occasion.end:
        return counts.get(occasion.start, 0)
    total = 0
    day = occasion.start
    while day <= occasion.end:
        total += counts.get(day, 0)
        day += dt.timedelta(days=1)
    return total


def streak_of(
    schedule: Schedule,
    started_on: dt.date,
    counts: dict[dt.date, int],
    today: dt.date,
) -> int:
    """Consecutive **occasions** that met the target, counting back from now.

    This is the answer to "what does three of three this week mean when Tuesday is not a
    habit day": Tuesday is not an occasion, so it is invisible to the streak — neither a
    miss nor a free pass. A Monday-Wednesday-Friday habit with a streak of 5 has met its
    last five habit days, which spans nearly two weeks of calendar.

    The **open** occasion — the one containing today — is skipped when it is not yet met,
    rather than counted as a miss. A daily habit at nine in the morning has not failed
    today; counting it as a miss would show every streak as zero every morning, and
    counting it as met would claim a day that has not happened (AD-40).

    Pure: takes a schedule and a dict, touches no session. Every streak assertion in the
    tests calls this directly with a hand-written dict.
    """
    open_occasion = occasion_containing(schedule, started_on, today)
    run = 0
    for occasion in occasions_back_from(schedule, started_on, today):
        if _done_in(counts, occasion) >= schedule.target_count:
            run += 1
            continue
        if occasion == open_occasion:
            continue
        break
    return run


class Progress:
    """Where one habit stands. Every figure computed on read, none of them stored."""

    def __init__(
        self,
        habit: Habit,
        counts: dict[dt.date, int],
        today_rows: list[HabitCheckin],
        today: dt.date,
    ) -> None:
        schedule = Schedule.of(habit)
        started = habit.started_on

        self.habit_id = habit.id
        self.name = habit.name
        self.schedule = schedule
        self.remind = habit.remind
        self.today_rows = today_rows
        self.today_done = len(today_rows)

        # The occasion in progress: today for a day-shaped schedule that asks for today,
        # this Monday-week for `times_per_week`, and nothing at all on a day the schedule
        # does not ask for.
        occasion = occasion_containing(schedule, started, today)
        self.due_today = occasion is not None
        self.occasion_start = occasion.start if occasion else None
        self.occasion_end = occasion.end if occasion else None
        self.done = _done_in(counts, occasion) if occasion else self.today_done
        self.met = occasion is not None and self.done >= schedule.target_count

        # The week rollup, which is what "2 of 3 this week" counts: occasions the schedule
        # asked for in this Monday-week, and how many of them were met. A monthly habit
        # answers 0 due in most weeks, and the client says "next on the 15th" rather than
        # rendering a denominator of zero.
        window = week_of(today)
        self.window_start, self.window_end = window.start, window.end
        due = occasions_in(schedule, started, window.start, window.end)
        self.window_due = len(due)
        self.window_done = sum(
            1 for one in due if _done_in(counts, one) >= schedule.target_count
        )

        self.next_due = next_occasion_after(schedule, started, today)
        self.streak = streak_of(schedule, started, counts, today)


def progress(
    session: Session, user_id: uuid.UUID, *, today: dt.date | None = None
) -> list[Progress]:
    """Where every live habit stands, for the page and for the digest.

    Three queries for the whole page regardless of how many habits there are: the habits,
    their per-day counts, and today's rows (which carry the times the card shows).
    """
    today = today or dt.date.today()
    habits = list_habits(session, user_id)
    habit_ids = [habit.id for habit in habits]
    counts = _counts(session, user_id, habit_ids)

    today_rows: dict[uuid.UUID, list[HabitCheckin]] = {habit_id: [] for habit_id in habit_ids}
    if habit_ids:
        rows = session.execute(
            select(HabitCheckin)
            .where(
                HabitCheckin.user_id == user_id,
                HabitCheckin.habit_id.in_(habit_ids),
                HabitCheckin.done_on == today,
            )
            .order_by(
                HabitCheckin.done_at.asc().nullslast(),
                HabitCheckin.created_at,
                HabitCheckin.id,
            )
        ).scalars()
        for row in rows:
            today_rows[row.habit_id].append(row)

    return [
        Progress(habit, counts.get(habit.id, {}), today_rows.get(habit.id, []), today)
        for habit in habits
    ]


def outstanding(
    session: Session, user_id: uuid.UUID, *, today: dt.date | None = None
) -> list[str]:
    """Names of the habits that asked to be reminded, are due now, and are not yet done.

    Read-only, and the same predicate the Habits page uses — defined once, here, so the
    notification and the screen can never disagree (AD-30). ``due_today`` is what Epic 26
    adds: a Monday-Wednesday-Friday habit no longer nags on a Tuesday.
    """
    return [
        row.name
        for row in progress(session, user_id, today=today)
        if row.remind and row.due_today and not row.met
    ]


def heatmap(
    session: Session,
    user_id: uuid.UUID,
    habit_id: uuid.UUID,
    *,
    weeks: int,
    today: dt.date | None = None,
) -> tuple[Habit, dt.date, dt.date, list[tuple[dt.date, int, bool]]]:
    """The last ``weeks`` whole weeks up to and including today, day by day.

    Every day in the window is returned, not only the ones with check-ins, and each carries
    whether the schedule asked for it. Without that the grid cannot tell a missed Monday
    from a Tuesday that was never a habit day — which for a Monday-Wednesday-Friday habit is
    the difference between a wall of failure and a clean record.

    Aligned to Monday so every column of the rendered grid is a week, and returned as a
    half-open ``[start, end)`` window the client does not have to reconstruct.
    """
    if not 1 <= weeks <= MAX_HEATMAP_WEEKS:
        raise Invalid(f"weeks must be between 1 and {MAX_HEATMAP_WEEKS}", "heatmap_window_invalid")
    habit = get_habit(session, user_id, habit_id)
    today = today or dt.date.today()
    this_monday = today - dt.timedelta(days=today.weekday())
    start = this_monday - dt.timedelta(weeks=weeks - 1)
    end = this_monday + dt.timedelta(days=7)

    rows = session.execute(
        select(HabitCheckin.done_on, func.count())
        .where(
            HabitCheckin.user_id == user_id,
            HabitCheckin.habit_id == habit_id,
            HabitCheckin.done_on >= start,
            HabitCheckin.done_on < end,
        )
        .group_by(HabitCheckin.done_on)
    ).all()
    counts = {done_on: int(times) for done_on, times in rows}

    schedule = Schedule.of(habit)
    # `times_per_week` asks for no particular day, so no cell is marked due — the week is
    # the unit, and marking all seven would claim a daily habit.
    weekly = schedule.kind == ScheduleKind.times_per_week

    days: list[tuple[dt.date, int, bool]] = []
    day = start
    while day < end:
        due = False if weekly else is_scheduled(schedule, habit.started_on, day)
        days.append((day, counts.get(day, 0), due and day <= today))
        day += dt.timedelta(days=1)
    return habit, start, end, days
