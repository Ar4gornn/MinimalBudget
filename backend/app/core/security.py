"""Password hashing and access tokens (AD-13)."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

from app.core.config import get_settings

_ALGORITHM = "HS256"
_hasher = PasswordHasher()


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        _hasher.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError):
        return False
    return True


def create_access_token(user_id: UUID) -> tuple[str, int]:
    """Return the signed token and its lifetime in seconds."""
    settings = get_settings()
    ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "iat": now, "exp": now + ttl}
    token = jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)
    return token, int(ttl.total_seconds())


def decode_subject(token: str) -> UUID | None:
    """Return the validated user id, or ``None`` if the token is unusable.

    AD-3: the ``sub`` claim is parsed as a UUID *here*, before it can reach
    ``set_config``. A claim that is not a UUID never becomes a tenant.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None
    subject = payload.get("sub")
    if not isinstance(subject, str):
        return None
    try:
        return UUID(subject)
    except ValueError:
        return None
