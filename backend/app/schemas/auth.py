from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.months import MAX_START_DAY

Currency = Literal["USD", "EUR"]
WeightUnit = Literal["kg", "lb"]


class Credentials(BaseModel):
    email: EmailStr
    # Long enough to matter, bounded because Argon2 should not be handed a megabyte.
    password: str = Field(min_length=10, max_length=200)

    @field_validator("email")
    @classmethod
    def _normalise(cls, v: str) -> str:
        # AD-23: normalised before it is stored or compared, not only at the index.
        return v.strip().lower()


class RegistrationRequest(Credentials):
    """Registration additionally carries an invite code when the instance is closed.

    Optional on the model rather than required, because `REGISTRATION_MODE=open` is a
    supported configuration for local use; the route decides whether it is needed.
    """

    invite_code: str | None = Field(default=None, max_length=200)
    # Chosen at sign-up because it is far cheaper than changing it later, once the account
    # holds entries the setting can no longer safely relabel.
    currency: Currency = "USD"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    currency: Currency
    weight_unit: WeightUnit
    # AD-10: 1 is the calendar month. See MAX_START_DAY for why 28 is the ceiling.
    budget_start_day: int
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 — the OAuth scheme name, not a credential
    expires_in: int
    # Long-lived, rotated on every use, revocable. The access token stays short so a
    # stolen one expires quickly; the refresh token is what keeps a phone signed in.
    refresh_token: str


class RefreshRequest(BaseModel):
    refresh_token: str


class CurrencyUpdate(BaseModel):
    currency: Currency


class WeightUnitUpdate(BaseModel):
    weight_unit: WeightUnit


class BudgetStartDayUpdate(BaseModel):
    budget_start_day: int = Field(ge=1, le=MAX_START_DAY)


_PASSWORD = Field(min_length=10, max_length=200)


class RecoverRequest(BaseModel):
    """Forgot password: an email, one unused recovery code, and the replacement."""

    email: EmailStr
    code: str = Field(min_length=1, max_length=40)
    new_password: str = _PASSWORD

    @field_validator("email")
    @classmethod
    def _normalise(cls, v: str) -> str:
        return v.strip().lower()


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = _PASSWORD


class PasswordConfirm(BaseModel):
    """Re-authentication for a sensitive action by a signed-in user."""

    password: str = Field(min_length=1, max_length=200)


class RecoveryCodesOut(BaseModel):
    # Plain text, once. Stored only as hashes from here on.
    codes: list[str]


class RecoveryStatusOut(BaseModel):
    unused: int
    total: int
