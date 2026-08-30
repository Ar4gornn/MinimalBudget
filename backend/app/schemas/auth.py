from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 — the OAuth scheme name, not a credential
    expires_in: int
