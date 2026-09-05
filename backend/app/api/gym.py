import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUserId, DbSession
from app.schemas.common import Page
from app.schemas.gym import (
    ExerciseCreate,
    ExerciseHistoryOut,
    ExerciseOut,
    ExerciseUpdate,
    HistoryPoint,
    RoutineCreate,
    RoutineDetailOut,
    RoutineLineCreate,
    RoutineLineOut,
    RoutineOut,
    SetCreate,
    SetOut,
    WorkoutCreate,
    WorkoutDetailOut,
    WorkoutOut,
)
from app.services import gym

router = APIRouter(prefix="/api/gym", tags=["gym"])


# ---------------------------------------------------------------- exercises


@router.get("/exercises", response_model=Page[ExerciseOut])
def list_exercises(user_id: CurrentUserId, session: DbSession) -> Page[ExerciseOut]:
    rows = gym.list_exercises(session, user_id)
    return Page[ExerciseOut](items=[ExerciseOut.model_validate(r) for r in rows])


@router.post("/exercises", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
def create_exercise(
    payload: ExerciseCreate, user_id: CurrentUserId, session: DbSession
) -> ExerciseOut:
    """AD-12: idempotent by name, so a second create returns the first."""
    exercise = gym.get_or_create_exercise(session, user_id, name=payload.name)
    if payload.video_url is not None or payload.note is not None:
        exercise = gym.update_exercise(
            session,
            user_id,
            exercise.id,
            {
                k: v
                for k, v in (("video_url", payload.video_url), ("note", payload.note))
                if v is not None
            },
        )
    return ExerciseOut.model_validate(exercise)


@router.patch("/exercises/{exercise_id}", response_model=ExerciseOut)
def update_exercise(
    exercise_id: uuid.UUID,
    payload: ExerciseUpdate,
    user_id: CurrentUserId,
    session: DbSession,
) -> ExerciseOut:
    fields = {key: getattr(payload, key) for key in payload.model_fields_set}
    return ExerciseOut.model_validate(gym.update_exercise(session, user_id, exercise_id, fields))


@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(exercise_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    gym.delete_exercise(session, user_id, exercise_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/exercises/{exercise_id}/history", response_model=ExerciseHistoryOut)
def exercise_history(
    exercise_id: uuid.UUID, user_id: CurrentUserId, session: DbSession
) -> ExerciseHistoryOut:
    exercise = gym.get_exercise(session, user_id, exercise_id)
    points = gym.exercise_history(session, user_id, exercise_id)
    return ExerciseHistoryOut(
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        points=[HistoryPoint(**point) for point in points],
    )


# ----------------------------------------------------------------- routines


@router.get("/routines", response_model=Page[RoutineOut])
def list_routines(user_id: CurrentUserId, session: DbSession) -> Page[RoutineOut]:
    rows = gym.list_routines(session, user_id)
    return Page[RoutineOut](items=[RoutineOut.model_validate(r) for r in rows])


@router.post("/routines", response_model=RoutineOut, status_code=status.HTTP_201_CREATED)
def create_routine(
    payload: RoutineCreate, user_id: CurrentUserId, session: DbSession
) -> RoutineOut:
    return RoutineOut.model_validate(
        gym.create_routine(session, user_id, name=payload.name, note=payload.note)
    )


@router.get("/routines/{routine_id}", response_model=RoutineDetailOut)
def read_routine(
    routine_id: uuid.UUID, user_id: CurrentUserId, session: DbSession
) -> RoutineDetailOut:
    routine = gym.get_routine(session, user_id, routine_id)
    lines = gym.routine_lines(session, user_id, routine_id)
    return RoutineDetailOut(
        id=routine.id,
        name=routine.name,
        note=routine.note,
        lines=[
            RoutineLineOut(
                id=line.id,
                exercise_id=exercise.id,
                exercise_name=exercise.name,
                video_url=exercise.video_url,
                position=line.position,
                target_sets=line.target_sets,
                target_reps=line.target_reps,
            )
            for line, exercise in lines
        ],
    )


@router.delete("/routines/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_routine(routine_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    gym.delete_routine(session, user_id, routine_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/routines/{routine_id}/exercises",
    response_model=RoutineLineOut,
    status_code=status.HTTP_201_CREATED,
)
def add_routine_line(
    routine_id: uuid.UUID,
    payload: RoutineLineCreate,
    user_id: CurrentUserId,
    session: DbSession,
) -> RoutineLineOut:
    line = gym.add_routine_line(
        session,
        user_id,
        routine_id,
        exercise_id=payload.exercise_id,
        exercise_name=payload.exercise_name,
        target_sets=payload.target_sets,
        target_reps=payload.target_reps,
    )
    exercise = gym.get_exercise(session, user_id, line.exercise_id)
    return RoutineLineOut(
        id=line.id,
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        video_url=exercise.video_url,
        position=line.position,
        target_sets=line.target_sets,
        target_reps=line.target_reps,
    )


@router.delete("/routines/lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_routine_line(line_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    gym.remove_routine_line(session, user_id, line_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------------- workouts


@router.get("/workouts", response_model=Page[WorkoutOut])
def list_workouts(
    user_id: CurrentUserId,
    session: DbSession,
    month: Annotated[str | None, Query(description="YYYY-MM")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 30,
) -> Page[WorkoutOut]:
    rows = gym.list_workouts(session, user_id, limit=limit, month=month)
    return Page[WorkoutOut](items=[WorkoutOut.model_validate(r) for r in rows])


@router.post("/workouts", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
def start_workout(payload: WorkoutCreate, user_id: CurrentUserId, session: DbSession) -> WorkoutOut:
    workout = gym.start_workout(
        session,
        user_id,
        performed_on=payload.performed_on or dt.date.today(),
        routine_id=payload.routine_id,
        note=payload.note,
    )
    return WorkoutOut.model_validate(workout)


@router.get("/workouts/{workout_id}", response_model=WorkoutDetailOut)
def read_workout(
    workout_id: uuid.UUID, user_id: CurrentUserId, session: DbSession
) -> WorkoutDetailOut:
    workout = gym.get_workout(session, user_id, workout_id)
    sets = gym.workout_sets(session, user_id, workout_id)
    return WorkoutDetailOut(
        id=workout.id,
        routine_id=workout.routine_id,
        performed_on=workout.performed_on,
        note=workout.note,
        sets=[
            SetOut(
                id=row.id,
                exercise_id=exercise.id,
                exercise_name=exercise.name,
                position=row.position,
                reps=row.reps,
                weight=row.weight,
            )
            for row, exercise in sets
        ],
    )


@router.delete("/workouts/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(workout_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    gym.delete_workout(session, user_id, workout_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/workouts/{workout_id}/sets", response_model=SetOut, status_code=status.HTTP_201_CREATED
)
def log_set(
    workout_id: uuid.UUID, payload: SetCreate, user_id: CurrentUserId, session: DbSession
) -> SetOut:
    row = gym.log_set(
        session,
        user_id,
        workout_id,
        exercise_id=payload.exercise_id,
        exercise_name=payload.exercise_name,
        reps=payload.reps,
        weight=payload.weight,
    )
    exercise = gym.get_exercise(session, user_id, row.exercise_id)
    return SetOut(
        id=row.id,
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        position=row.position,
        reps=row.reps,
        weight=row.weight,
    )


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set(set_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    gym.delete_set(session, user_id, set_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
