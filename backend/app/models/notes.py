"""Notes: a few words or a sketch, kept quickly (Epic 32).

A module beside the others and inside none of them (AD-31): it imports its own models and
nothing else. A note is **either** text **or** a sketch — never both on one note — so each
row says which it is and the schema refuses the other half (AD-48).

The sketch is stored as vector strokes in ``jsonb``, not as an image: a stroke is a colour,
a width and a list of points on a fixed logical canvas. That is what makes the eraser and
undo cheap on the client, keeps a note to a few kilobytes, and means the database holds
no blob that ``pg_dump`` would have to carry as binary.
"""

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

NOTE_KINDS = ("text", "sketch")

TITLE_MAX = 200
BODY_MAX = 20_000

# The logical canvas every sketch is drawn on, portrait like the phone it is drawn on. The
# client scales it to whatever box it has; the numbers stored never depend on a screen.
SKETCH_WIDTH = 750
SKETCH_HEIGHT = 1000

# Three inks and two nibs, stored as indexes so the palette can follow the theme: ink 0 is
# "the text colour", which is dark on a light page and light on a dark one.
SKETCH_COLOURS = 3
SKETCH_WIDTHS = 2

# Ceilings on a single sketch. A phone doodle is tens of strokes and a few thousand points;
# these are an order of magnitude above that and stop one request storing megabytes.
MAX_STROKES = 1_000
MAX_POINTS = 20_000


class Note(Base):
    __tablename__ = "notes"
    __table_args__ = (
        CheckConstraint("kind IN ('text', 'sketch')", name="notes_kind_known"),
        CheckConstraint(
            "(kind = 'text' AND sketch IS NULL) OR (kind = 'sketch' AND body IS NULL "
            "AND sketch IS NOT NULL)",
            name="notes_one_kind_of_content",
        ),
        CheckConstraint(
            "kind <> 'text' OR length(coalesce(title, '')) + length(coalesce(body, '')) > 0",
            name="notes_text_says_something",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str | None] = mapped_column(String(TITLE_MAX), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ``none_as_null``: without it SQLAlchemy stores Python ``None`` as the JSON value
    # ``null`` — a non-NULL column — and every text note fails the kind CHECK.
    sketch: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    pinned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
