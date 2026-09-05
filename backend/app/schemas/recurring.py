import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.ledger import EntryKind
from app.models.recurring import Cadence
from app.schemas.common import Money


class TemplateCreate(BaseModel):
    kind: EntryKind
    amount: Money
    note: str | None = Field(default=None, max_length=500)
    cadence: Cadence
    start_on: dt.date
    end_on: dt.date | None = None
    auto: bool = False
    # AD-12: exactly one, as on entries.
    category_id: uuid.UUID | None = None
    category_name: str | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def _rules(self) -> "TemplateCreate":
        if (self.category_id is None) == (self.category_name is None):
            raise ValueError("provide exactly one of category_id or category_name")
        if self.category_name is not None:
            trimmed = self.category_name.strip()
            if not trimmed:
                raise ValueError("category_name cannot be blank")
            object.__setattr__(self, "category_name", trimmed)
        if self.end_on is not None and self.end_on < self.start_on:
            raise ValueError("end_on must not be before start_on")
        return self


class TemplateUpdate(BaseModel):
    """Cadence and start date are not editable: they define which dates already happened.
    Delete and recreate to change the rhythm."""

    amount: Money | None = None
    note: str | None = Field(default=None, max_length=500)
    auto: bool | None = None
    paused: bool | None = None
    end_on: dt.date | None = None
    category_id: uuid.UUID | None = None


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: EntryKind
    category_id: uuid.UUID
    amount: Money
    note: str | None
    cadence: Cadence
    start_on: dt.date
    end_on: dt.date | None
    auto: bool
    paused: bool
    next_due: dt.date
    created_at: dt.datetime


class PendingOut(BaseModel):
    """A proposed entry: what the template would create, waiting for a yes or a no."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    template_id: uuid.UUID
    due_on: dt.date
    kind: EntryKind
    category_id: uuid.UUID
    category_name: str
    amount: Money
    note: str | None
    cadence: Cadence


class ConfirmRequest(BaseModel):
    # The amount may be corrected at confirmation — the electricity bill is never quite the
    # template's figure — without editing the template.
    amount: Money | None = None
