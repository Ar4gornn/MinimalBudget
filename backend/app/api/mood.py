import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUserId, DbSession, StartDay
from app.core.months import month_range
from app.schemas.common import Page
from app.schemas.mood import MoodCount, MoodDayIn, MoodDayOut, MoodHistoryOut
from app.services import mood

router = APIRouter(prefix="/api/mood", tags=["mood"])


def _out(row) -> MoodDayOut:
    return MoodDayOut(on=row.on_day, mood=row.mood, day_ok=row.day_ok, note=row.note)


# `/history` is declared before the `/days/{on_day}` shape so nothing tries to parse it as
# a date, the same ordering habits uses for `/progress`.


@router.get("/history", response_model=MoodHistoryOut)
def read_history(
    user_id: CurrentUserId,
    session: DbSession,
    days: Annotated[int, Query(ge=1, le=mood.MAX_HISTORY_DAYS)] = mood.DEFAULT_HISTORY_DAYS,
) -> MoodHistoryOut:
    """The strip and the tally the Habits page draws, counted server-side.

    Counted here rather than in the client so the definition lives once: the same rule that
    keeps the restock predicate out of the dashboard (AD-30). In particular
    ``days_answered`` is the denominator every figure is read against — a day with no row
    is a day nobody answered, not a bad one.
    """
    result = mood.history(session, user_id, days=days)
    return MoodHistoryOut(
        start_on=result.start_on,
        end_on=result.end_on,
        days=[_out(row) for row in result.days],
        counts=[MoodCount(point=point, days=count) for point, count in result.counts],
        days_with_mood=result.days_with_mood,
        days_ok=result.days_ok,
        days_not_ok=result.days_not_ok,
        days_answered=result.days_answered,
    )


@router.get("/days", response_model=Page[MoodDayOut])
def list_days(
    user_id: CurrentUserId,
    session: DbSession,
    month: Annotated[str | None, Query(description="YYYY-MM, the account's month")] = None,
    start_day: StartDay = 1,
) -> Page[MoodDayOut]:
    """Answered days in one window — what the calendar's mood layer reads.

    The window is the account's budget month (AD-10), not the calendar one, so this list
    and the grid drawn over it cover exactly the same days. Only answered days come back;
    a gap is a day nobody said anything about, and a zero-filled row would say the worst.
    """
    start = end = None
    if month is not None:
        start, end = month_range(month, start_day)
    rows = mood.list_days(session, user_id, start=start, end=end)
    return Page[MoodDayOut](items=[_out(row) for row in rows])


@router.get("/days/{on_day}", response_model=MoodDayOut)
def read_day(on_day: dt.date, user_id: CurrentUserId, session: DbSession) -> MoodDayOut:
    """A day, answered or not — always 200.

    An unanswered day is not a missing resource: it is the answer to "what did they say
    about the 3rd". 404 stays reserved for another user's row or a route that is not there
    (AD-8), and there are no ids here to enumerate anyway.
    """
    row = mood.get_day(session, user_id, on_day)
    if row is None:
        return MoodDayOut(on=on_day, mood=None, day_ok=None, note=None)
    return _out(row)


@router.put("/days/{on_day}", response_model=MoodDayOut)
def write_day(
    on_day: dt.date, payload: MoodDayIn, user_id: CurrentUserId, session: DbSession
) -> MoodDayOut:
    """Replace a day's answer; both nulls clear it.

    PUT and not PATCH: absent and null mean the same thing here — *no answer to that
    question* — and a partial update would need a third state on the wire to tell "leave
    it" from "clear it". The client has just rendered both answers, so sending both costs
    nothing. Same upsert shape as a budget (AD-11).
    """
    row = mood.set_day(
        session,
        user_id,
        on_day,
        mood=payload.mood,
        day_ok=payload.day_ok,
        note=payload.note,
    )
    if row is None:
        return MoodDayOut(on=on_day, mood=None, day_ok=None, note=None)
    return _out(row)
