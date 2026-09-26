"""Wire shapes for notes (Epic 32)."""

import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.notes import (
    BODY_MAX,
    MAX_POINTS,
    MAX_STROKES,
    SKETCH_COLOURS,
    SKETCH_HEIGHT,
    SKETCH_WIDTH,
    SKETCH_WIDTHS,
    TITLE_MAX,
)

NoteKind = Literal["text", "sketch"]


class Stroke(BaseModel):
    """One pen movement: an ink, a nib, and its points as a flat ``[x0, y0, x1, y1, …]``.

    Flat rather than a list of pairs because it halves the JSON for the same drawing, and
    a sketch is sent whole on every save. Integers on the logical canvas: sub-unit precision
    is invisible at any size a phone draws it, and a float would triple the bytes.
    """

    c: int = Field(ge=0, lt=SKETCH_COLOURS)
    w: int = Field(ge=0, lt=SKETCH_WIDTHS)
    p: list[int] = Field(min_length=2)

    @field_validator("p")
    @classmethod
    def _points_on_canvas(cls, points: list[int]) -> list[int]:
        if len(points) % 2:
            raise ValueError("points come in x, y pairs")
        for index, value in enumerate(points):
            bound = SKETCH_WIDTH if index % 2 == 0 else SKETCH_HEIGHT
            if not 0 <= value <= bound:
                raise ValueError(f"a point is inside the {SKETCH_WIDTH}×{SKETCH_HEIGHT} canvas")
        return points


class Sketch(BaseModel):
    strokes: list[Stroke] = Field(max_length=MAX_STROKES)

    @model_validator(mode="after")
    def _not_too_many_points(self) -> "Sketch":
        points = sum(len(stroke.p) // 2 for stroke in self.strokes)
        if points > MAX_POINTS:
            raise ValueError(f"a sketch holds at most {MAX_POINTS} points")
        return self


class NoteIn(BaseModel):
    """The whole note. Sent with ``PUT /api/notes/{id}``, so it replaces rather than merges.

    PUT with a client-chosen id is what makes an offline draft safe to retry (AD-48): the
    second attempt after a lost response lands on the same row. A text note sends ``title``
    and/or ``body``; a sketch sends ``sketch`` and may send a ``title``.
    """

    kind: NoteKind
    title: str | None = Field(default=None, max_length=TITLE_MAX)
    body: str | None = Field(default=None, max_length=BODY_MAX)
    sketch: Sketch | None = None
    pinned: bool = False

    @field_validator("title", mode="before")
    @classmethod
    def _trim_title(cls, value: object) -> object:
        # Before the length check, so "   " is judged as the empty title it is.
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("body", mode="before")
    @classmethod
    def _blank_body_is_none(cls, value: object) -> object:
        # The body keeps its own whitespace — indentation in a list is meaning — but a body
        # of nothing but whitespace is no body.
        if isinstance(value, str) and not value.strip():
            return None
        return value


class NoteOut(BaseModel):
    id: uuid.UUID
    kind: NoteKind
    title: str | None
    body: str | None
    sketch: Sketch | None
    pinned: bool
    created_at: dt.datetime
    updated_at: dt.datetime
