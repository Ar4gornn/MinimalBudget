"""The day's two answers (Epic 24).

A mood is not a habit: no target, no period, no notion of "enough", so there is nothing here
to keep a streak of. It is its own module and imports nobody else's models (AD-31).

Nothing stored here is derived. The tally the Habits page draws — how many days carried each
point, how many days were answered at all — is counted in SQL on read (AD-9, AD-41).
"""

import datetime as dt
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# The scale, in one place. Ordered on a single axis — worse to better — which is what makes
# 5 > 3 a true sentence and what stops "angry" and "sad" being points on it at all.
MOOD_MIN = 1
MOOD_MAX = 5


class MoodDay(Base):
    """One day, and what the person said about it.

    Both answers are nullable and a CHECK requires at least one, so a row always says
    something. Clearing the last answer deletes the row rather than leaving it blank: "no
    row" is then the only way the data says *did not say*, the same rule a habit check-in
    follows at zero (AD-41).
    """

    __tablename__ = "mood_days"
    __table_args__ = (
        CheckConstraint(
            f"mood >= {MOOD_MIN} AND mood <= {MOOD_MAX}", name="mood_days_point_in_range"
        ),
        CheckConstraint("mood IS NOT NULL OR day_ok IS NOT NULL", name="mood_days_says_something"),
        CheckConstraint("on_day >= DATE '2000-01-01'", name="mood_days_on_day_sane"),
        UniqueConstraint("user_id", "on_day", name="mood_days_day_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    on_day: Mapped[dt.date] = mapped_column(Date, nullable=False)
    mood: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    day_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
