import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import NonNegativeMoney


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


class SpaceRestockSeries(BaseModel):
    space_id: uuid.UUID
    space_name: str
    # Restocks per month: the number of quantity changes that went up.
    values: list[int]


class RestocksOut(BaseModel):
    months: list[str]
    series: list[SpaceRestockSeries]
