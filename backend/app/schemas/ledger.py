import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.ledger import EntryKind, Unit
from app.schemas.common import Money, Quantity, Rate


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: EntryKind

    @model_validator(mode="after")
    def _trim(self) -> "CategoryCreate":
        object.__setattr__(self, "name", self.name.strip())
        if not self.name:
            raise ValueError("name cannot be blank")
        return self


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: EntryKind
    name: str
    created_at: dt.datetime


_QUANTITY_TOGETHER = "quantity and unit go together: send both, or neither"
_QUANTITY_EXPENSE_ONLY = "only an expense can carry a quantity"


class EntryCreate(BaseModel):
    kind: EntryKind
    amount: Money
    occurred_on: dt.date
    note: str | None = Field(default=None, max_length=500)
    # AD-12: exactly one of these. Both, or neither, is a 422.
    category_id: uuid.UUID | None = None
    category_name: str | None = Field(default=None, min_length=1, max_length=80)
    # AD-29: optional, and only together. The unit is an enum, so anything outside the
    # closed list is a 422 before the database's CHECK ever sees it.
    quantity: Quantity | None = None
    unit: Unit | None = None

    @model_validator(mode="after")
    def _exactly_one_category(self) -> "EntryCreate":
        if (self.category_id is None) == (self.category_name is None):
            raise ValueError("provide exactly one of category_id or category_name")
        if self.category_name is not None:
            trimmed = self.category_name.strip()
            if not trimmed:
                raise ValueError("category_name cannot be blank")
            object.__setattr__(self, "category_name", trimmed)
        return self

    @model_validator(mode="after")
    def _quantity_rules(self) -> "EntryCreate":
        if (self.quantity is None) != (self.unit is None):
            raise ValueError(_QUANTITY_TOGETHER)
        if self.quantity is not None and self.kind is not EntryKind.expense:
            raise ValueError(_QUANTITY_EXPENSE_ONLY)
        return self


class EntryUpdate(BaseModel):
    """Every field optional; ``kind`` is deliberately not among them.

    Changing an entry's kind would have to move it to a different category as well, since
    the two are bound by one foreign key (AD-7). Delete and recreate instead.

    ``quantity`` and ``unit`` are accepted only as a pair: both set, or both explicitly
    ``null`` to clear. A PATCH that would leave one without the other is refused here, so
    the database CHECK is the backstop rather than the first line.
    """

    amount: Money | None = None
    occurred_on: dt.date | None = None
    note: str | None = Field(default=None, max_length=500)
    category_id: uuid.UUID | None = None
    quantity: Quantity | None = None
    unit: Unit | None = None

    @property
    def quantity_given(self) -> bool:
        return "quantity" in self.model_fields_set or "unit" in self.model_fields_set

    @model_validator(mode="after")
    def _quantity_pair(self) -> "EntryUpdate":
        given = {"quantity", "unit"} & self.model_fields_set
        if given and given != {"quantity", "unit"}:
            raise ValueError(_QUANTITY_TOGETHER)
        if given and (self.quantity is None) != (self.unit is None):
            raise ValueError(_QUANTITY_TOGETHER)
        return self


class EntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: EntryKind
    category_id: uuid.UUID
    amount: Money
    occurred_on: dt.date
    note: str | None
    quantity: Quantity | None
    unit: Unit | None
    # AD-29: read from the model's property — computed, four places, never stored.
    unit_price: Rate | None
    created_at: dt.datetime
