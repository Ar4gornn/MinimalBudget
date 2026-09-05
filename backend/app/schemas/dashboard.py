import uuid

from pydantic import BaseModel, ConfigDict

from app.models.ledger import Unit
from app.schemas.common import NonNegativeMoney, NonNegativeQuantity, Rate, SignedMoney


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


class UnitPriceSeries(BaseModel):
    """One (category, unit) pair across the window.

    ``unit_price[i]`` is ``null`` for a month with no quantified purchase — the one place
    an aggregate here may be null, because ``0.0000`` would be a price (AD-29).
    ``quantity[i]`` is zero for the same month, because "bought nothing" is a quantity.
    """

    category_id: uuid.UUID
    category_name: str
    unit: Unit
    unit_price: list[Rate | None]
    quantity: list[NonNegativeQuantity]


class UnitPricesOut(BaseModel):
    months: list[str]
    series: list[UnitPriceSeries]
