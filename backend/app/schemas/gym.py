import datetime as dt
import uuid
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer, model_validator

from app.schemas.common import quantise, to_decimal

# A weight is not money: two places, never negative, and null for a bodyweight set. Reuses
# the money parser's shape rule — a plain decimal string, never a float on the wire (AD-5).
Weight = Annotated[
    Decimal,
    BeforeValidator(lambda v: quantise(to_decimal(v))),
    Field(ge=Decimal("0"), le=Decimal("99999.99")),
    PlainSerializer(lambda v: f"{v:.2f}", return_type=str),
]


def _trimmed(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("name cannot be blank")
    return trimmed


class ExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    video_url: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _trim(self) -> "ExerciseCreate":
        object.__setattr__(self, "name", _trimmed(self.name))
        return self


class ExerciseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    # Explicit null clears the link; absent leaves it alone.
    video_url: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=500)


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    video_url: str | None
    note: str | None
    created_at: dt.datetime


class RoutineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _trim(self) -> "RoutineCreate":
        object.__setattr__(self, "name", _trimmed(self.name))
        return self


class RoutineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    note: str | None
    created_at: dt.datetime


class RoutineLineCreate(BaseModel):
    """AD-12: exactly one of the two, and a name creates the exercise."""

    exercise_id: uuid.UUID | None = None
    exercise_name: str | None = Field(default=None, min_length=1, max_length=80)
    target_sets: int | None = Field(default=None, gt=0, le=99)
    target_reps: int | None = Field(default=None, gt=0, le=999)

    @model_validator(mode="after")
    def _exactly_one(self) -> "RoutineLineCreate":
        if (self.exercise_id is None) == (self.exercise_name is None):
            raise ValueError("provide exactly one of exercise_id or exercise_name")
        if self.exercise_name is not None:
            object.__setattr__(self, "exercise_name", _trimmed(self.exercise_name))
        return self


class RoutineLineOut(BaseModel):
    id: uuid.UUID
    exercise_id: uuid.UUID
    exercise_name: str
    video_url: str | None
    position: int
    target_sets: int | None
    target_reps: int | None


class RoutineDetailOut(BaseModel):
    id: uuid.UUID
    name: str
    note: str | None
    lines: list[RoutineLineOut]


class WorkoutCreate(BaseModel):
    performed_on: dt.date | None = None
    routine_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=500)


class WorkoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    routine_id: uuid.UUID | None
    performed_on: dt.date
    note: str | None
    created_at: dt.datetime


class SetCreate(BaseModel):
    exercise_id: uuid.UUID | None = None
    exercise_name: str | None = Field(default=None, min_length=1, max_length=80)
    reps: int = Field(gt=0, le=999)
    # Absent for a bodyweight set. Zero is a weight; nothing is not.
    weight: Weight | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> "SetCreate":
        if (self.exercise_id is None) == (self.exercise_name is None):
            raise ValueError("provide exactly one of exercise_id or exercise_name")
        if self.exercise_name is not None:
            object.__setattr__(self, "exercise_name", _trimmed(self.exercise_name))
        return self


class SetOut(BaseModel):
    id: uuid.UUID
    exercise_id: uuid.UUID
    exercise_name: str
    position: int
    reps: int
    weight: Weight | None


class WorkoutDetailOut(BaseModel):
    id: uuid.UUID
    routine_id: uuid.UUID | None
    performed_on: dt.date
    note: str | None
    sets: list[SetOut]


class HistoryPoint(BaseModel):
    performed_on: dt.date
    top_weight: Weight | None
    reps: int
    sets: int
    # Null, not zero, on a session where nothing carried a weight.
    volume: Weight | None


class ExerciseHistoryOut(BaseModel):
    exercise_id: uuid.UUID
    exercise_name: str
    points: list[HistoryPoint]
