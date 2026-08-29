import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUserId, DbSession
from app.schemas.common import Page
from app.schemas.savings import AmountIn, BudgetOut
from app.services import savings

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.get("", response_model=Page[BudgetOut])
def list_budgets(user_id: CurrentUserId, session: DbSession) -> Page[BudgetOut]:
    rows = savings.list_budgets(session, user_id)
    return Page[BudgetOut](items=[BudgetOut.model_validate(r) for r in rows])


@router.put("/{category_id}", response_model=BudgetOut)
def set_budget(
    category_id: uuid.UUID, payload: AmountIn, user_id: CurrentUserId, session: DbSession
) -> BudgetOut:
    # AD-11: one standing amount per expense category. Setting it twice updates.
    budget = savings.set_budget(
        session, user_id, category_id, monthly_amount=payload.monthly_amount
    )
    return BudgetOut.model_validate(budget)
