import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import Money, NonNegativeMoney


class SavingsTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @model_validator(mode="after")
    def _trim(self) -> "SavingsTypeCreate":
        object.__setattr__(self, "name", self.name.strip())
        if not self.name:
            raise ValueError("name cannot be blank")
        return self


class SavingsTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: dt.datetime


class ContributionCreate(BaseModel):
    # AD-12: contributions never auto-create a savings type. Unlike a category, a savings
    # goal is a deliberate thing to set up, and a typo should not silently become one.
    savings_type_id: uuid.UUID
    amount: Money
    occurred_on: dt.date
    note: str | None = Field(default=None, max_length=500)


class ContributionUpdate(BaseModel):
    savings_type_id: uuid.UUID | None = None
    amount: Money | None = None
    occurred_on: dt.date | None = None
    note: str | None = Field(default=None, max_length=500)


class ContributionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    savings_type_id: uuid.UUID
    amount: Money
    occurred_on: dt.date
    note: str | None
    created_at: dt.datetime


class AmountIn(BaseModel):
    """The body of a budget or target PUT. Zero is allowed; negative is not."""

    monthly_amount: NonNegativeMoney


class TargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    savings_type_id: uuid.UUID
    monthly_amount: NonNegativeMoney
    updated_at: dt.datetime


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category_id: uuid.UUID
    monthly_amount: NonNegativeMoney
    updated_at: dt.datetime
