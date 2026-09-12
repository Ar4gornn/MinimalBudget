"""Wire shapes for the day's answers (Epic 24)."""

import datetime as dt

from pydantic import BaseModel, Field

from app.models.mood import MOOD_MAX, MOOD_MIN


class MoodDayIn(BaseModel):
    """The whole of a day's answer. Sent with ``PUT``, so it replaces rather than merges.

    Absent and ``null`` mean the same thing here — *no answer to that question* — which is
    why this is a PUT and not a PATCH: a partial update would need a third state on the
    wire to distinguish "leave it" from "clear it", and the client always knows both
    answers because it just rendered them. Sending both as null clears the day, and the
    row goes with it.
    """

    mood: int | None = Field(default=None, ge=MOOD_MIN, le=MOOD_MAX)
    day_ok: bool | None = None
    note: str | None = Field(default=None, max_length=500)


class MoodDayOut(BaseModel):
    """A day, answered or not.

    Carries **no id**: a day is addressed by its date, and there is at most one row per
    date. An unanswered day is a legitimate answer to "what did they say on the 3rd" — it
    is returned with nulls and a 200, not a 404, because 404 is reserved for a row that
    belongs to somebody else or a route that is not there (AD-8).
    """

    on: dt.date
    mood: int | None
    day_ok: bool | None
    note: str | None


class MoodCount(BaseModel):
    """How many days in the window carried this point. Zero-filled (AD-22)."""

    point: int
    days: int


class MoodHistoryOut(BaseModel):
    """The window, the days in it, and counts over them.

    Counts, never a mean. A five-point scale is *ordinal*: the distance from 2 to 3 is not
    the distance from 4 to 5, so an average of it is arithmetic on labels and would put a
    number like "3.4" on a screen that nobody chose and nothing can check (AD-41).

    ``days_answered`` is the denominator every figure here is read against. Days with no
    row are not zeroes and not bad days — they are days nobody said anything about.
    """

    # Half-open ``[start_on, end_on)``, carried so the client never reconstructs it. A mood
    # window is "the last N days", deliberately not a budget month, so it does not borrow
    # the month contract of AD-10.
    start_on: dt.date
    end_on: dt.date
    days: list[MoodDayOut]
    counts: list[MoodCount]
    days_with_mood: int
    days_ok: int
    days_not_ok: int
    days_answered: int
