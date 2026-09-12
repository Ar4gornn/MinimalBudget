"""The day's answers, and the counts over them (Epic 24).

A module beside the ledger, the inventory, the gym and the habits — not inside any of them
(AD-31). It imports its own models and nothing else, and nothing here commits (AD-4).

Every figure this module returns is a **count**: how many days carried each point, how many
days were called good, how many days were answered at all. There is deliberately no average
and no "mood score". A five-point scale is ordinal, so a mean over it is arithmetic on
labels — and the denominator of anything derived from it is *days answered*, never days in
the window, because a day nobody answered is not a bad day (AD-41).
"""

import datetime as dt
import uuid

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.errors import Invalid
from app.models.mood import MOOD_MAX, MOOD_MIN, MoodDay

# The floor the schema's CHECK enforces. Guarded here as well so a hand-typed date answers
# 422 with a sentence rather than 500 with an IntegrityError.
EARLIEST = dt.date(2000, 1, 1)

# The widest history window. A year of daily cells is already more than a strip can draw
# legibly; the cap stops a hand-typed query string asking for a decade.
MAX_HISTORY_DAYS = 365
DEFAULT_HISTORY_DAYS = 30


def _guard_day(on_day: dt.date, today: dt.date) -> None:
    """The two rules the database cannot hold.

    *Not the future*: ``CHECK (on_day <= current_date)`` is refused by Postgres because
    ``current_date`` is not IMMUTABLE — the same wall ``habit_checkins`` hit. And unlike a
    check-in, there is no lower bound at a habit's ``started_on``: a mood has no plan behind
    it, so writing down how a day last March felt is a backfill, not an error.
    """
    if on_day > today:
        raise Invalid("that day has not happened yet", "mood_day_future")
    if on_day < EARLIEST:
        raise Invalid(f"that is before {EARLIEST.isoformat()}", "mood_day_too_early")


def get_day(session: Session, user_id: uuid.UUID, on_day: dt.date) -> MoodDay | None:
    """The row for a day, or ``None`` — which is *did not say*, not *not found*."""
    return session.execute(
        select(MoodDay).where(MoodDay.user_id == user_id, MoodDay.on_day == on_day)
    ).scalar_one_or_none()


def set_day(
    session: Session,
    user_id: uuid.UUID,
    on_day: dt.date,
    *,
    mood: int | None,
    day_ok: bool | None,
    note: str | None,
    today: dt.date | None = None,
) -> MoodDay | None:
    """Replace a day's answer. Returns ``None`` when the day was cleared.

    Answering again **overwrites**. That is not the same act as correcting a mistyped
    amount: an amount has a receipt behind it, so an edit moves the row toward a truth that
    exists outside it, while a mood has no referent but the person's memory — so a later
    answer is a *second answer*, from someone who now remembers the day differently. The
    system cannot tell the two apart and does not pretend to; it keeps the latest, and
    ``created_at`` versus ``updated_at`` is the only trace that anything was revised.

    Storing both as null deletes the row rather than leaving one that answers nothing, so
    "no row" stays the single way the data says *did not say* (AD-41).
    """
    _guard_day(on_day, today or dt.date.today())
    if mood is not None and not MOOD_MIN <= mood <= MOOD_MAX:  # pragma: no cover — schema bound
        raise Invalid(f"a mood is {MOOD_MIN} to {MOOD_MAX}", "mood_out_of_range")

    row = get_day(session, user_id, on_day)

    if mood is None and day_ok is None:
        # A note with nothing to annotate is not an answer: it would be a row that says
        # something about a day without saying anything the tally can count, and the
        # schema's CHECK refuses it outright.
        if row is not None:
            session.delete(row)
            session.flush()
        return None

    if row is None:
        row = MoodDay(user_id=user_id, on_day=on_day, mood=mood, day_ok=day_ok, note=note)
        session.add(row)
        session.flush()
        return row

    row.mood = mood
    row.day_ok = day_ok
    row.note = note
    row.updated_at = func.now()
    session.flush()
    # ``updated_at`` is a SQL expression on the instance until it is read back.
    session.refresh(row)
    return row


def list_days(
    session: Session,
    user_id: uuid.UUID,
    *,
    start: dt.date | None = None,
    end: dt.date | None = None,
) -> list[MoodDay]:
    """Answered days in a half-open ``[start, end)`` window (AD-10, AD-20).

    Only rows that exist: an unanswered day has nothing to return, and filling the gap with
    a zero would make "did not say" indistinguishable from "said the worst".
    """
    query = select(MoodDay).where(MoodDay.user_id == user_id)
    if start is not None:
        query = query.where(MoodDay.on_day >= start)
    if end is not None:
        query = query.where(MoodDay.on_day < end)
    return list(session.execute(query.order_by(MoodDay.on_day, MoodDay.id)).scalars())


# How many days in the window carried each point, zero-filled.
#
# Driven from the **points** side, exactly as budget-vs-actual is driven from the budget
# side (AD-22): a point nobody chose comes back as 0 rather than vanishing, so the tally
# has five bars whatever the data does and the client never has to know which are missing.
_COUNTS = text(
    """
    -- The bounds are cast explicitly: an untyped bind parameter leaves
    -- generate_series ambiguous between its integer and numeric overloads.
    WITH points AS (SELECT generate_series(CAST(:lo AS int), CAST(:hi AS int)) AS point)
    SELECT p.point, count(m.id) AS days
    FROM points p
    LEFT JOIN mood_days m
      ON m.mood = p.point
     AND m.user_id = :uid
     AND m.on_day >= CAST(:start AS date)
     AND m.on_day < CAST(:end AS date)
    GROUP BY p.point
    ORDER BY p.point
    """
)

# The three denominators, in one pass. `day_ok` is a nullable boolean, so `NOT day_ok` is
# NULL for an unanswered verdict and the FILTER excludes it — which is the whole point:
# "did not say" must not be counted as "no".
_TOTALS = text(
    """
    SELECT
        count(*) FILTER (WHERE mood IS NOT NULL) AS days_with_mood,
        count(*) FILTER (WHERE day_ok) AS days_ok,
        count(*) FILTER (WHERE NOT day_ok) AS days_not_ok,
        count(*) AS days_answered
    FROM mood_days
    WHERE user_id = :uid
      AND on_day >= CAST(:start AS date)
      AND on_day < CAST(:end AS date)
    """
)


class History:
    def __init__(
        self,
        start: dt.date,
        end: dt.date,
        days: list[MoodDay],
        counts: list[tuple[int, int]],
        days_with_mood: int,
        days_ok: int,
        days_not_ok: int,
        days_answered: int,
    ) -> None:
        self.start_on = start
        self.end_on = end
        self.days = days
        self.counts = counts
        self.days_with_mood = days_with_mood
        self.days_ok = days_ok
        self.days_not_ok = days_not_ok
        self.days_answered = days_answered


def history(
    session: Session,
    user_id: uuid.UUID,
    *,
    days: int = DEFAULT_HISTORY_DAYS,
    today: dt.date | None = None,
) -> History:
    """The last ``days`` days up to and including today, with counts over them.

    A run of days rather than the habit heat-map's Monday-aligned week grid, and the
    difference is the question each answers. A heat-map's columns exist so "do I only ever
    do this at the weekend" is visible — a question about an *act*. A mood is read as a
    trend, so time runs one way and the strip is a line of days.

    Returned as a half-open ``[start_on, end_on)`` window, so ``end_on`` is tomorrow. Not a
    budget month: "the last thirty days" carries its own bounds rather than borrowing
    AD-10's, exactly as the heat-map's window does.
    """
    if not 1 <= days <= MAX_HISTORY_DAYS:
        raise Invalid(f"days must be between 1 and {MAX_HISTORY_DAYS}", "mood_window_invalid")
    today = today or dt.date.today()
    start = today - dt.timedelta(days=days - 1)
    end = today + dt.timedelta(days=1)

    params = {"uid": str(user_id), "start": start, "end": end}
    counts = [
        (int(point), int(count))
        for point, count in session.execute(
            _COUNTS, {**params, "lo": MOOD_MIN, "hi": MOOD_MAX}
        ).all()
    ]
    totals = session.execute(_TOTALS, params).one()

    return History(
        start,
        end,
        list_days(session, user_id, start=start, end=end),
        counts,
        int(totals.days_with_mood),
        int(totals.days_ok),
        int(totals.days_not_ok),
        int(totals.days_answered),
    )

