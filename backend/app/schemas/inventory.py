import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import Money, NonNegativeMoney


def _trimmed(name: str) -> str:
    trimmed = name.strip()
    if not trimmed:
        raise ValueError("name cannot be blank")
    return trimmed


class SpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @model_validator(mode="after")
    def _trim(self) -> "SpaceCreate":
        object.__setattr__(self, "name", _trimmed(self.name))
        return self


class SpaceUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @model_validator(mode="after")
    def _trim(self) -> "SpaceUpdate":
        object.__setattr__(self, "name", _trimmed(self.name))
        return self


class SpaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: dt.datetime


class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    quantity: int = Field(ge=0)
    restock_below: int | None = Field(default=None, ge=0)
    cost: NonNegativeMoney | None = None
    note: str | None = Field(default=None, max_length=500)
    # AD-12: exactly one. space_name creates the space if absent, like category_name.
    space_id: uuid.UUID | None = None
    space_name: str | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def _rules(self) -> "ItemCreate":
        object.__setattr__(self, "name", _trimmed(self.name))
        if (self.space_id is None) == (self.space_name is None):
            raise ValueError("provide exactly one of space_id or space_name")
        if self.space_name is not None:
            object.__setattr__(self, "space_name", _trimmed(self.space_name))
        if self.note is not None and not self.note.strip():
            object.__setattr__(self, "note", None)
        return self


class ItemUpdate(BaseModel):
    """Every field optional. ``quantity`` is absolute, never a delta."""

    name: str | None = Field(default=None, min_length=1, max_length=80)
    quantity: int | None = Field(default=None, ge=0)
    restock_below: int | None = Field(default=None, ge=0)
    cost: NonNegativeMoney | None = None
    note: str | None = Field(default=None, max_length=500)
    space_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _trim(self) -> "ItemUpdate":
        if self.name is not None:
            object.__setattr__(self, "name", _trimmed(self.name))
        if self.note is not None and not self.note.strip():
            object.__setattr__(self, "note", None)
        return self


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    space_id: uuid.UUID
    name: str
    quantity: int
    restock_below: int | None
    cost: NonNegativeMoney | None
    note: str | None
    # AD-30: read from the model's column_property — computed in SQL, never stored.
    needs_restock: bool
    restocked_at: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime


class ItemChangeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    quantity_before: int
    quantity_after: int
    changed_at: dt.datetime


class ItemChangeRowOut(BaseModel):
    """A quantity change, named — the account-wide form the calendar reads.

    Carries the item so the calendar does not have to fetch every item to caption a row.
    """

    item_id: uuid.UUID
    item_name: str
    quantity_before: int
    quantity_after: int
    changed_at: dt.datetime


class SpaceRestockSeries(BaseModel):
    space_id: uuid.UUID
    space_name: str
    # Restocks per month: the number of quantity changes that went up.
    values: list[int]


class RestocksOut(BaseModel):
    months: list[str]
    series: list[SpaceRestockSeries]


class ShoppingRowOut(BaseModel):
    """One thing to buy: how many, and what it is likely to cost."""

    model_config = ConfigDict(from_attributes=True)

    item_id: uuid.UUID
    name: str
    space_id: uuid.UUID
    space_name: str
    quantity: int
    restock_below: int | None
    unit_cost: NonNegativeMoney | None
    suggested: int
    # None when the item has no recorded cost — never 0.00, which would be a price.
    estimate: NonNegativeMoney | None


class ShoppingListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[ShoppingRowOut]
    # Covers only the rows that have a cost; `without_cost` says how many it leaves out, so
    # the figure is never quietly wrong.
    estimate: NonNegativeMoney
    without_cost: int


class PurchaseCreate(BaseModel):
    """Ticking an item off the list: restock it, and record what it cost.

    ``amount`` is optional — a restock that was free is still a restock — but an amount
    needs a category, since an entry cannot exist without one (AD-7).
    """

    quantity: int = Field(gt=0)
    amount: Money | None = None
    occurred_on: dt.date | None = None
    category_id: uuid.UUID | None = None
    category_name: str | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def _rules(self) -> "PurchaseCreate":
        if self.category_id is not None and self.category_name is not None:
            raise ValueError("provide at most one of category_id or category_name")
        if self.amount is not None and self.category_id is None and self.category_name is None:
            raise ValueError("an amount needs a category to file it under")
        if self.amount is None and (self.category_id is not None or self.category_name is not None):
            raise ValueError("a category without an amount records nothing")
        if self.category_name is not None:
            trimmed = self.category_name.strip()
            if not trimmed:
                raise ValueError("category_name cannot be blank")
            object.__setattr__(self, "category_name", trimmed)
        return self


class PurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_id: uuid.UUID
    entry_id: uuid.UUID | None
    quantity: int
    purchased_on: dt.date
    created_at: dt.datetime


class PurchaseResultOut(BaseModel):
    """Both halves of the one action, so the client needs no second request."""

    item: ItemOut
    purchase: PurchaseOut
