import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUserId, DbSession, StartDay
from app.core.months import month_range
from app.models.habits import OPTIONAL_COLUMNS
from app.schemas.common import Page
from app.schemas.habits import (
    CheckinAmend,
    CheckinCreate,
    CheckinOut,
    CheckinTime,
    HabitCreate,
    HabitOut,
    HabitProgressOut,
    HabitUpdate,
    HeatmapDay,
    HeatmapOut,
    ScheduleOut,
)
from app.services import habits

router = APIRouter(prefix="/api/habits", tags=["habits"])


def _schedule(row) -> ScheduleOut:  # noqa: ANN001 — a Habit row or a Schedule tuple
    """One shape for the plan, whether it came off a row or out of the arithmetic."""
    kind = getattr(row, "schedule_kind", None) or row.kind
    return ScheduleOut(
        kind=kind,
        target_count=row.target_count,
        weekdays=row.weekdays,
        interval_days=row.interval_days,
        day_of_month=row.day_of_month,
        nth=row.nth,
        weekday=row.weekday,
    )


def _checkin(row, habit_name: str) -> CheckinOut:  # noqa: ANN001
    return CheckinOut(
        id=row.id,
        habit_id=row.habit_id,
        habit_name=habit_name,
        done_on=row.done_on,
        done_at=row.done_at,
        note=row.note,
    )


# The static segments are declared before `/{habit_id}`-shaped routes so FastAPI does not
# try to parse "progress" or "checkins" as a UUID.


@router.get("", response_model=Page[HabitOut])
def list_habits(
    user_id: CurrentUserId,
    session: DbSession,
    archived: Annotated[bool, Query(description="include archived habits")] = False,
) -> Page[HabitOut]:
    rows = habits.list_habits(session, user_id, include_archived=archived)
    return Page[HabitOut](items=[HabitOut.model_validate(r) for r in rows])


@router.post("", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
def create_habit(payload: HabitCreate, user_id: CurrentUserId, session: DbSession) -> HabitOut:
    habit = habits.create_habit(
        session,
        user_id,
        name=payload.name,
        schedule_kind=payload.schedule_kind,
        target_count=payload.target_count,
        schedule={column: getattr(payload, column) for column in OPTIONAL_COLUMNS},
        started_on=payload.started_on,
        remind=payload.remind,
        note=payload.note,
    )
    return HabitOut.model_validate(habit)


@router.get("/progress", response_model=Page[HabitProgressOut])
def read_progress(user_id: CurrentUserId, session: DbSession) -> Page[HabitProgressOut]:
    return Page[HabitProgressOut](
        items=[
            HabitProgressOut(
                habit_id=row.habit_id,
                name=row.name,
                schedule=_schedule(row.schedule),
                remind=row.remind,
                due_today=row.due_today,
                occasion_start=row.occasion_start,
                occasion_end=row.occasion_end,
                done=row.done,
                met=row.met,
                today_done=row.today_done,
                today_times=[
                    CheckinTime(id=one.id, done_at=one.done_at, note=one.note)
                    for one in row.today_rows
                ],
                window_start=row.window_start,
                window_end=row.window_end,
                window_due=row.window_due,
                window_done=row.window_done,
                next_due=row.next_due,
                streak=row.streak,
            )
            for row in habits.progress(session, user_id)
        ]
    )


@router.get("/checkins", response_model=Page[CheckinOut])
def list_checkins(
    user_id: CurrentUserId,
    session: DbSession,
    month: Annotated[str | None, Query(description="YYYY-MM, the account's month")] = None,
    habit_id: uuid.UUID | None = None,
    start_day: StartDay = 1,
) -> Page[CheckinOut]:
    """Every habit's check-ins in one window — what the calendar's habits layer reads.

    The window is the account's budget month (AD-10), not the calendar one, so this list and
    the calendar grid drawn over it cover exactly the same days.
    """
    start = end = None
    if month is not None:
        start, end = month_range(month, start_day)
    rows = habits.list_checkins(session, user_id, start=start, end=end, habit_id=habit_id)
    return Page[CheckinOut](items=[_checkin(row, name) for row, name in rows])


@router.patch("/{habit_id}", response_model=HabitOut)
def update_habit(
    habit_id: uuid.UUID, payload: HabitUpdate, user_id: CurrentUserId, session: DbSession
) -> HabitOut:
    fields = {key: getattr(payload, key) for key in payload.model_fields_set}
    return HabitOut.model_validate(habits.update_habit(session, user_id, habit_id, fields))


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(habit_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    """Takes the check-ins with it. The client asks first, and says how many."""
    habits.delete_habit(session, user_id, habit_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{habit_id}/heatmap", response_model=HeatmapOut)
def read_heatmap(
    habit_id: uuid.UUID,
    user_id: CurrentUserId,
    session: DbSession,
    weeks: Annotated[int, Query(ge=1, le=habits.MAX_HEATMAP_WEEKS)] = 12,
) -> HeatmapOut:
    habit, start, end, days = habits.heatmap(session, user_id, habit_id, weeks=weeks)
    return HeatmapOut(
        habit_id=habit.id,
        name=habit.name,
        schedule=_schedule(habit),
        start_on=start,
        end_on=end,
        days=[HeatmapDay(on=on, times=times, due=due) for on, times, due in days],
    )


@router.post("/{habit_id}/checkins", response_model=CheckinOut, status_code=status.HTTP_201_CREATED)
def check_in(
    habit_id: uuid.UUID, payload: CheckinCreate, user_id: CurrentUserId, session: DbSession
) -> CheckinOut:
    """One occurrence, one row. Three doses in a day are three rows with three times."""
    row = habits.check_in(
        session,
        user_id,
        habit_id,
        done_on=payload.done_on,
        done_at=payload.done_at,
        note=payload.note,
    )
    habit = habits.get_habit(session, user_id, habit_id)
    return _checkin(row, habit.name)


@router.delete(
    "/{habit_id}/checkins/{checkin_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_check_in(
    habit_id: uuid.UUID, checkin_id: uuid.UUID, user_id: CurrentUserId, session: DbSession
) -> Response:
    """Remove one occurrence, named by its id.

    By id rather than by day: with three doses recorded, "undo" has to say which one.
    """
    habits.delete_checkin(session, user_id, habit_id, checkin_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{habit_id}/checkins/{checkin_id}", response_model=CheckinOut)
def amend_check_in(
    habit_id: uuid.UUID,
    checkin_id: uuid.UUID,
    payload: CheckinAmend,
    user_id: CurrentUserId,
    session: DbSession,
) -> CheckinOut:
    """Correct the time or the note. Only the fields actually sent are written."""
    fields = {key: getattr(payload, key) for key in payload.model_fields_set}
    row = habits.amend_checkin(session, user_id, habit_id, checkin_id, fields)
    habit = habits.get_habit(session, user_id, habit_id)
    return _checkin(row, habit.name)
