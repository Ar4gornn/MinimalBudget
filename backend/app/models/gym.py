import datetime as dt
import decimal
import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedMixin


class WeightUnit(enum.StrEnum):
    kg = "kg"
    lb = "lb"


class Exercise(TimestampedMixin, Base):
    """A movement, with an optional link to a video showing how it is done."""

    __tablename__ = "exercises"
    __table_args__ = (
        CheckConstraint(
            "video_url IS NULL OR video_url LIKE 'https://%'", name="exercises_video_https_only"
        ),
        UniqueConstraint("user_id", "id", name="exercises_user_id_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class Routine(TimestampedMixin, Base):
    """A named plan: the exercises, in order, with what to aim for."""

    __tablename__ = "routines"
    __table_args__ = (UniqueConstraint("user_id", "id", name="routines_user_id_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class RoutineExercise(Base):
    __tablename__ = "routine_exercises"
    __table_args__ = (
        CheckConstraint("position >= 0", name="routine_exercises_position_non_negative"),
        CheckConstraint(
            "target_sets IS NULL OR target_sets > 0", name="routine_exercises_sets_positive"
        ),
        CheckConstraint(
            "target_reps IS NULL OR target_reps > 0", name="routine_exercises_reps_positive"
        ),
        UniqueConstraint(
            "routine_id", "exercise_id", name="routine_exercises_routine_exercise_key"
        ),
        ForeignKeyConstraint(
            ["user_id", "routine_id"],
            ["routines.user_id", "routines.id"],
            name="routine_exercises_routine_fkey",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["user_id", "exercise_id"],
            ["exercises.user_id", "exercises.id"],
            name="routine_exercises_exercise_fkey",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    routine_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    exercise_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    target_sets: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_reps: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Workout(Base):
    """One session that actually happened."""

    __tablename__ = "workouts"
    __table_args__ = (
        # The routine foreign key uses ON DELETE SET NULL (routine_id) — the column-list
        # form, so only that column is nulled and the NOT NULL user_id survives. SQLAlchemy
        # cannot express it; it is declared in migration 0014 only.
        UniqueConstraint("user_id", "id", name="workouts_user_id_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    routine_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    performed_on: Mapped[dt.date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class WorkoutSet(Base):
    """One set: this many reps, at this weight, in this position in the session."""

    __tablename__ = "workout_sets"
    __table_args__ = (
        CheckConstraint("reps > 0", name="workout_sets_reps_positive"),
        CheckConstraint("weight IS NULL OR weight >= 0", name="workout_sets_weight_non_negative"),
        CheckConstraint("position >= 0", name="workout_sets_position_non_negative"),
        ForeignKeyConstraint(
            ["user_id", "workout_id"],
            ["workouts.user_id", "workouts.id"],
            name="workout_sets_workout_fkey",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["user_id", "exercise_id"],
            ["exercises.user_id", "exercises.id"],
            name="workout_sets_exercise_fkey",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    workout_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    exercise_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # Nullable for a bodyweight set: 0 would be a weight, and "8 pull-ups" has none.
    weight: Mapped[decimal.Decimal | None] = mapped_column(Numeric(7, 2), nullable=True)
    reps: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
