import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.ledger import EntryKind
from app.schemas.common import Money


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


class EntryCreate(BaseModel):
    kind: EntryKind
    amount: Money
    occurred_on: dt.date
    note: str | None = Field(default=None, max_length=500)
    # AD-12: exactly one of these. Both, or neither, is a 422.
    category_id: uuid.UUID | None = None
    category_name: str | None = Field(default=None, min_length=1, max_length=80)

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


class EntryUpdate(BaseModel):
    """Every field optional; ``kind`` is deliberately not among them.

    Changing an entry's kind would have to move it to a different category as well, since
    the two are bound by one foreign key (AD-7). Delete and recreate instead.
    """

    amount: Money | None = None
    occurred_on: dt.date | None = None
    note: str | None = Field(default=None, max_length=500)
    category_id: uuid.UUID | None = None


class EntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: EntryKind
    category_id: uuid.UUID
    amount: Money
    occurred_on: dt.date
    note: str | None
    created_at: dt.datetime
