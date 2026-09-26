import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import Money, NonNegativeMoney, SignedMoney

# AD-50: the amount is always positive; the direction is the kind.
MovementKind = Literal["deposit", "withdrawal"]


class SavingsTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @model_validator(mode="after")
    def _trim(self) -> "SavingsTypeCreate":
        object.__setattr__(self, "name", self.name.strip())
        if not self.name:
            raise ValueError("name cannot be blank")
        return self


class SavingsTypeUpdate(BaseModel):
    """Rename, or set/clear the goal. An omitted field is left alone; ``null`` clears it."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=80)
    goal_amount: Money | None = None
    goal_date: dt.date | None = None

    @model_validator(mode="after")
    def _trim(self) -> "SavingsTypeUpdate":
        if self.name is not None:
            object.__setattr__(self, "name", self.name.strip())
            if not self.name:
                raise ValueError("name cannot be blank")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be cleared")
        return self


class SavingsTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    goal_amount: Money | None = None
    goal_date: dt.date | None = None
    created_at: dt.datetime


class ContributionCreate(BaseModel):
    # AD-12: contributions never auto-create a savings type. Unlike a category, a savings
    # goal is a deliberate thing to set up, and a typo should not silently become one.
    savings_type_id: uuid.UUID
    kind: MovementKind = "deposit"
    amount: Money
    occurred_on: dt.date
    note: str | None = Field(default=None, max_length=500)


class ContributionUpdate(BaseModel):
    savings_type_id: uuid.UUID | None = None
    kind: MovementKind | None = None
    amount: Money | None = None
    occurred_on: dt.date | None = None
    note: str | None = Field(default=None, max_length=500)


class ContributionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    savings_type_id: uuid.UUID
    kind: MovementKind
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


class PotOut(BaseModel):
    """One savings type as seen from one budget month (AD-50)."""

    savings_type_id: uuid.UUID
    name: str
    #: Deposits minus withdrawals, all time. Never negative: the service refuses the write.
    balance: NonNegativeMoney
    #: Net saved inside the month. Negative when more came out than went in.
    saved: SignedMoney
    target: NonNegativeMoney | None
    #: What is left of the target this month; null when there is no target, it is met, or
    #: the month was skipped. The client proposes exactly this amount.
    due: Money | None
    skipped: bool
    goal_amount: Money | None
    goal_date: dt.date | None
    #: Per budget month, from the current one through the goal date's, to reach the goal.
    #: Null without a goal date, or once the goal is reached.
    needed_per_month: Money | None


class OverviewOut(BaseModel):
    month: str
    #: ``[start, end)`` of the budget month (AD-10), so the client can date a confirmation.
    start: dt.date
    end: dt.date
    current_month: str
    pots: list[PotOut]
