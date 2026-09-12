"""Exercises, routines and workout logs (Epic 19).

A module beside the ledger and the inventory, not inside either (AD-31): it imports its own
models and `users` and nothing else. Nothing here commits (AD-4).
"""

import datetime as dt
import uuid
from decimal import Decimal
from urllib.parse import urlparse

from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Invalid, NotFound
from app.core.months import DEFAULT_START_DAY, month_range
from app.models.gym import Exercise, Routine, RoutineExercise, Workout, WorkoutSet

# Where a form-check video may point. https only, and no credentials in the URL: the link is
# rendered as an anchor a person clicks, so `javascript:` must never reach the DOM and a
# "user:password@" URL must never be shown to someone who would click it. Checked here as
# well as by the database CHECK, because a helpful message beats a constraint violation.
_ALLOWED_SCHEMES = ("https",)


def clean_video_url(raw: str | None) -> str | None:
    if raw is None:
        return None
    url = raw.strip()
    if not url:
        return None
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise Invalid("a video link must start with https://", "video_link_not_https")
    if not parsed.netloc or "@" in parsed.netloc:
        raise Invalid("that does not look like a video link", "video_link_invalid")
    return url


# ----------------------------------------------------------------- exercises


def list_exercises(session: Session, user_id: uuid.UUID) -> list[Exercise]:
    return list(
        session.execute(
            select(Exercise)
            .where(Exercise.user_id == user_id)
            .order_by(func.lower(Exercise.name), Exercise.id)
        ).scalars()
    )


def get_or_create_exercise(session: Session, user_id: uuid.UUID, *, name: str) -> Exercise:
    """AD-12, the same shape as categories and vendors: insert-or-return, never check-then-act."""
    inserted = session.execute(
        text(
            """
            INSERT INTO exercises (user_id, name)
            VALUES (:uid, :name)
            ON CONFLICT (user_id, lower(name)) DO NOTHING
            RETURNING id
            """
        ),
        {"uid": str(user_id), "name": name},
    ).scalar_one_or_none()

    if inserted is None:
        existing = session.execute(
            select(Exercise).where(
                Exercise.user_id == user_id, func.lower(Exercise.name) == name.lower()
            )
        ).scalar_one_or_none()
        if existing is None:  # pragma: no cover — would mean the unique index disagrees
            raise Conflict("exercise could not be created or found", "exercise_unwritable")
        return existing

    session.expire_all()
    exercise = session.get(Exercise, inserted)
    if exercise is None:  # pragma: no cover
        raise Conflict("exercise was inserted but is not readable", "exercise_unreadable")
    return exercise


def get_exercise(session: Session, user_id: uuid.UUID, exercise_id: uuid.UUID) -> Exercise:
    exercise = session.execute(
        select(Exercise).where(Exercise.user_id == user_id, Exercise.id == exercise_id)
    ).scalar_one_or_none()
    if exercise is None:
        raise NotFound("No exercise with that id")
    return exercise


def update_exercise(
    session: Session, user_id: uuid.UUID, exercise_id: uuid.UUID, fields: dict
) -> Exercise:
    exercise = get_exercise(session, user_id, exercise_id)
    if "name" in fields and fields["name"]:
        exercise.name = fields["name"]
    if "video_url" in fields:
        exercise.video_url = clean_video_url(fields["video_url"])
    if "note" in fields:
        exercise.note = fields["note"]
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise Conflict(
            "You already have an exercise with that name", "exercise_name_taken"
        ) from exc
    return exercise


def delete_exercise(session: Session, user_id: uuid.UUID, exercise_id: uuid.UUID) -> None:
    try:
        result = session.execute(
            delete(Exercise).where(Exercise.user_id == user_id, Exercise.id == exercise_id)
        )
    except IntegrityError as exc:
        # AD-21: RESTRICT. Deleting it would empty routines and orphan a training history.
        session.rollback()
        raise Conflict(
            "That exercise is still used by a routine or a logged set", "exercise_in_use"
        ) from exc
    if result.rowcount == 0:
        raise NotFound("No exercise with that id")


# ------------------------------------------------------------------ routines


def list_routines(session: Session, user_id: uuid.UUID) -> list[Routine]:
    return list(
        session.execute(
            select(Routine)
            .where(Routine.user_id == user_id)
            .order_by(func.lower(Routine.name), Routine.id)
        ).scalars()
    )


def get_routine(session: Session, user_id: uuid.UUID, routine_id: uuid.UUID) -> Routine:
    routine = session.execute(
        select(Routine).where(Routine.user_id == user_id, Routine.id == routine_id)
    ).scalar_one_or_none()
    if routine is None:
        raise NotFound("No routine with that id")
    return routine


def create_routine(session: Session, user_id: uuid.UUID, *, name: str, note: str | None) -> Routine:
    routine = Routine(user_id=user_id, name=name, note=note)
    session.add(routine)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise Conflict("You already have a routine with that name", "routine_name_taken") from exc
    return routine


def delete_routine(session: Session, user_id: uuid.UUID, routine_id: uuid.UUID) -> None:
    get_routine(session, user_id, routine_id)
    # Lines cascade; workouts done from it survive with a null routine_id, because what
    # happened is a record and the plan it came from is not.
    session.execute(delete(Routine).where(Routine.user_id == user_id, Routine.id == routine_id))
    session.flush()


def routine_lines(
    session: Session, user_id: uuid.UUID, routine_id: uuid.UUID
) -> list[tuple[RoutineExercise, Exercise]]:
    get_routine(session, user_id, routine_id)
    rows = session.execute(
        select(RoutineExercise, Exercise)
        .join(Exercise, Exercise.id == RoutineExercise.exercise_id)
        .where(RoutineExercise.user_id == user_id, RoutineExercise.routine_id == routine_id)
        .order_by(RoutineExercise.position, RoutineExercise.id)
    ).all()
    return [(line, exercise) for line, exercise in rows]


def add_routine_line(
    session: Session,
    user_id: uuid.UUID,
    routine_id: uuid.UUID,
    *,
    exercise_id: uuid.UUID | None,
    exercise_name: str | None,
    target_sets: int | None,
    target_reps: int | None,
) -> RoutineExercise:
    get_routine(session, user_id, routine_id)
    if exercise_name is not None:
        exercise = get_or_create_exercise(session, user_id, name=exercise_name)
    else:
        assert exercise_id is not None  # the schema's exactly-one rule guarantees it
        exercise = get_exercise(session, user_id, exercise_id)

    # Appended: the next position after whatever is there, so order is explicit and stable.
    highest = session.execute(
        select(func.max(RoutineExercise.position)).where(
            RoutineExercise.user_id == user_id, RoutineExercise.routine_id == routine_id
        )
    ).scalar_one()
    line = RoutineExercise(
        user_id=user_id,
        routine_id=routine_id,
        exercise_id=exercise.id,
        position=0 if highest is None else highest + 1,
        target_sets=target_sets,
        target_reps=target_reps,
    )
    session.add(line)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise Conflict(
            "That exercise is already in this routine", "routine_exercise_duplicate"
        ) from exc
    return line


def remove_routine_line(session: Session, user_id: uuid.UUID, line_id: uuid.UUID) -> None:
    result = session.execute(
        delete(RoutineExercise).where(
            RoutineExercise.user_id == user_id, RoutineExercise.id == line_id
        )
    )
    if result.rowcount == 0:
        raise NotFound("No routine line with that id")
    session.flush()


# ------------------------------------------------------------------ workouts


def list_workouts(
    session: Session,
    user_id: uuid.UUID,
    *,
    limit: int = 30,
    month: str | None = None,
    start_day: int = DEFAULT_START_DAY,
) -> list[Workout]:
    query = select(Workout).where(Workout.user_id == user_id)
    if month is not None:
        start, end = month_range(month, start_day)
        query = query.where(Workout.performed_on >= start, Workout.performed_on < end)
    query = query.order_by(
        Workout.performed_on.desc(), Workout.created_at.desc(), Workout.id
    ).limit(limit)
    return list(session.execute(query).scalars())


def get_workout(session: Session, user_id: uuid.UUID, workout_id: uuid.UUID) -> Workout:
    workout = session.execute(
        select(Workout).where(Workout.user_id == user_id, Workout.id == workout_id)
    ).scalar_one_or_none()
    if workout is None:
        raise NotFound("No workout with that id")
    return workout


def start_workout(
    session: Session,
    user_id: uuid.UUID,
    *,
    performed_on: dt.date,
    routine_id: uuid.UUID | None,
    note: str | None,
) -> Workout:
    """Start a session, optionally from a routine.

    Starting from a routine does **not** copy its lines into sets: a target is not a record.
    The client reads the routine to prefill the form, and a set exists once it was done.
    """
    if routine_id is not None:
        get_routine(session, user_id, routine_id)
    workout = Workout(user_id=user_id, performed_on=performed_on, routine_id=routine_id, note=note)
    session.add(workout)
    session.flush()
    return workout


def delete_workout(session: Session, user_id: uuid.UUID, workout_id: uuid.UUID) -> None:
    result = session.execute(
        delete(Workout).where(Workout.user_id == user_id, Workout.id == workout_id)
    )
    if result.rowcount == 0:
        raise NotFound("No workout with that id")
    session.flush()


def workout_sets(
    session: Session, user_id: uuid.UUID, workout_id: uuid.UUID
) -> list[tuple[WorkoutSet, Exercise]]:
    get_workout(session, user_id, workout_id)
    rows = session.execute(
        select(WorkoutSet, Exercise)
        .join(Exercise, Exercise.id == WorkoutSet.exercise_id)
        .where(WorkoutSet.user_id == user_id, WorkoutSet.workout_id == workout_id)
        .order_by(WorkoutSet.position, WorkoutSet.id)
    ).all()
    return [(row, exercise) for row, exercise in rows]


def log_set(
    session: Session,
    user_id: uuid.UUID,
    workout_id: uuid.UUID,
    *,
    exercise_id: uuid.UUID | None,
    exercise_name: str | None,
    reps: int,
    weight: Decimal | None,
) -> WorkoutSet:
    get_workout(session, user_id, workout_id)
    if exercise_name is not None:
        exercise = get_or_create_exercise(session, user_id, name=exercise_name)
    else:
        assert exercise_id is not None
        exercise = get_exercise(session, user_id, exercise_id)

    highest = session.execute(
        select(func.max(WorkoutSet.position)).where(
            WorkoutSet.user_id == user_id, WorkoutSet.workout_id == workout_id
        )
    ).scalar_one()
    row = WorkoutSet(
        user_id=user_id,
        workout_id=workout_id,
        exercise_id=exercise.id,
        position=0 if highest is None else highest + 1,
        reps=reps,
        weight=weight,
    )
    session.add(row)
    session.flush()
    return row


def delete_set(session: Session, user_id: uuid.UUID, set_id: uuid.UUID) -> None:
    result = session.execute(
        delete(WorkoutSet).where(WorkoutSet.user_id == user_id, WorkoutSet.id == set_id)
    )
    if result.rowcount == 0:
        raise NotFound("No set with that id")
    session.flush()


# --------------------------------------------------------------- progression

_HISTORY = text(
    """
    SELECT w.performed_on                       AS performed_on,
           max(s.weight)                        AS top_weight,
           sum(s.reps)                          AS reps,
           count(*)                             AS sets,
           -- Volume is the honest measure of a session's work, and it is null rather than
           -- zero when nothing carried a weight: a bodyweight day has volume nobody can
           -- state in kilos, and 0 would read as "did nothing".
           sum(s.weight * s.reps) FILTER (WHERE s.weight IS NOT NULL) AS volume
    FROM workout_sets s
    JOIN workouts w ON w.user_id = s.user_id AND w.id = s.workout_id
    WHERE s.user_id = :uid AND s.exercise_id = :exercise_id
    GROUP BY w.performed_on
    ORDER BY w.performed_on
    """
)


def exercise_history(session: Session, user_id: uuid.UUID, exercise_id: uuid.UUID) -> list[dict]:
    """Per session: the heaviest set, total reps, and volume. The answer to "am I improving?"."""
    get_exercise(session, user_id, exercise_id)
    return [
        {
            "performed_on": row.performed_on,
            "top_weight": row.top_weight,
            "reps": int(row.reps),
            "sets": int(row.sets),
            "volume": row.volume,
        }
        for row in session.execute(_HISTORY, {"uid": str(user_id), "exercise_id": str(exercise_id)})
    ]
