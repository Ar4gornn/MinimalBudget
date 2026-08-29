import uuid

from pydantic import BaseModel, ConfigDict

from app.schemas.common import NonNegativeMoney, SignedMoney


class BudgetVsActual(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category_id: uuid.UUID
    category_name: str
    # None means "spent here, but never set a budget" — reported rather than omitted (AD-22).
    budget: NonNegativeMoney | None
    actual: NonNegativeMoney


class TargetVsActual(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    savings_type_id: uuid.UUID
    savings_type_name: str
    target: NonNegativeMoney | None
    actual: NonNegativeMoney


class SummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    month: str
    income: NonNegativeMoney
    expense: NonNegativeMoney
    # The one figure that can go below zero: the month you spent more than you earned.
    net: SignedMoney
    saved: NonNegativeMoney
    budgets: list[BudgetVsActual]
    savings: list[TargetVsActual]


class CategorySeries(BaseModel):
    category_id: uuid.UUID
    category_name: str
    values: list[NonNegativeMoney]


class TrendsOut(BaseModel):
    """Parallel arrays: ``months[i]`` labels index ``i`` of every series."""

    months: list[str]
    income: list[NonNegativeMoney]
    expense: list[NonNegativeMoney]
    saved: list[NonNegativeMoney]
    expense_by_category: list[CategorySeries]
