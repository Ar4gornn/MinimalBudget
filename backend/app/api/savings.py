import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUserId, DbSession, StartDay
from app.schemas.common import Page
from app.schemas.savings import (
    AmountIn,
    ContributionCreate,
    ContributionOut,
    ContributionUpdate,
    SavingsTypeCreate,
    SavingsTypeOut,
    TargetOut,
)
from app.services import savings

router = APIRouter(prefix="/api/savings", tags=["savings"])


@router.get("/types", response_model=Page[SavingsTypeOut])
def list_types(user_id: CurrentUserId, session: DbSession) -> Page[SavingsTypeOut]:
    rows = savings.list_types(session, user_id)
    return Page[SavingsTypeOut](items=[SavingsTypeOut.model_validate(r) for r in rows])


@router.post("/types", response_model=SavingsTypeOut, status_code=status.HTTP_201_CREATED)
def create_type(
    payload: SavingsTypeCreate, user_id: CurrentUserId, session: DbSession
) -> SavingsTypeOut:
    created = savings.get_or_create_type(session, user_id, name=payload.name)
    return SavingsTypeOut.model_validate(created)


@router.delete("/types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_type(type_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    savings.delete_type(session, user_id, type_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/contributions", response_model=Page[ContributionOut])
def list_contributions(
    user_id: CurrentUserId,
    session: DbSession,
    month: Annotated[str | None, Query(description="YYYY-MM")] = None,
    savings_type_id: uuid.UUID | None = None,
    start_day: StartDay = 1,
) -> Page[ContributionOut]:
    rows = savings.list_contributions(
        session, user_id, month=month, savings_type_id=savings_type_id, start_day=start_day
    )
    return Page[ContributionOut](items=[ContributionOut.model_validate(r) for r in rows])


@router.post(
    "/contributions", response_model=ContributionOut, status_code=status.HTTP_201_CREATED
)
def create_contribution(
    payload: ContributionCreate, user_id: CurrentUserId, session: DbSession
) -> ContributionOut:
    created = savings.create_contribution(
        session,
        user_id,
        savings_type_id=payload.savings_type_id,
        amount=payload.amount,
        occurred_on=payload.occurred_on,
        note=payload.note,
    )
    return ContributionOut.model_validate(created)


@router.patch("/contributions/{contribution_id}", response_model=ContributionOut)
def update_contribution(
    contribution_id: uuid.UUID,
    payload: ContributionUpdate,
    user_id: CurrentUserId,
    session: DbSession,
) -> ContributionOut:
    updated = savings.update_contribution(
        session,
        user_id,
        contribution_id,
        savings_type_id=payload.savings_type_id,
        amount=payload.amount,
        occurred_on=payload.occurred_on,
        note=payload.note,
        note_given="note" in payload.model_fields_set,
    )
    return ContributionOut.model_validate(updated)


@router.delete("/contributions/{contribution_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contribution(
    contribution_id: uuid.UUID, user_id: CurrentUserId, session: DbSession
) -> Response:
    savings.delete_contribution(session, user_id, contribution_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/targets", response_model=Page[TargetOut])
def list_targets(user_id: CurrentUserId, session: DbSession) -> Page[TargetOut]:
    rows = savings.list_targets(session, user_id)
    return Page[TargetOut](items=[TargetOut.model_validate(r) for r in rows])


@router.put("/targets/{type_id}", response_model=TargetOut)
def set_target(
    type_id: uuid.UUID, payload: AmountIn, user_id: CurrentUserId, session: DbSession
) -> TargetOut:
    # AD-11: PUT, because there is one standing amount per type. Twice is an update.
    target = savings.set_target(
        session, user_id, type_id, monthly_amount=payload.monthly_amount
    )
    return TargetOut.model_validate(target)
