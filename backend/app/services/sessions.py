"""Refresh-token issue, rotation and revocation (Story 7.3).

The rule that makes rotation worth having: presenting a token that was already rotated
means a copy exists. The honest user and the thief both hold tokens from the same family,
and there is no way to tell which one just called. So the whole family is revoked — both
are logged out, the theft becomes visible, and the real user re-authenticates with a
password the thief does not have.
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings


def hash_token(token: str) -> str:
    """SHA-256: these are 256 bits of random, not a human-chosen secret."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class RefreshRejected(Exception):
    """Unknown, expired, or revoked. Not distinguished, for the usual reason."""


@dataclass(frozen=True)
class Lookup:
    user_id: uuid.UUID
    family_id: uuid.UUID
    expired: bool
    revoked: bool


def look_up(session: Session, token: str) -> Lookup:
    """Resolve a refresh token to its owner without a tenant already being set."""
    row = session.execute(
        text("SELECT user_id, family_id, expired, revoked FROM refresh_lookup(:h)"),
        {"h": hash_token(token)},
    ).one_or_none()
    if row is None:
        raise RefreshRejected
    return Lookup(row.user_id, row.family_id, row.expired, row.revoked)


def issue(
    session: Session, *, user_id: uuid.UUID, family_id: uuid.UUID | None = None
) -> str:
    """Mint a refresh token. Runs inside the caller's tenant-pinned transaction."""
    token = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(days=get_settings().refresh_token_ttl_days)
    session.execute(
        text(
            "INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) "
            "VALUES (:uid, :h, :fid, :expires)"
        ),
        {
            "uid": str(user_id),
            "h": hash_token(token),
            "fid": str(family_id or uuid.uuid4()),
            "expires": expires,
        },
    )
    return token


def revoke(session: Session, token: str) -> None:
    session.execute(
        text(
            "UPDATE refresh_tokens SET revoked_at = now() "
            "WHERE token_hash = :h AND revoked_at IS NULL"
        ),
        {"h": hash_token(token)},
    )


def revoke_family(session: Session, family_id: uuid.UUID) -> None:
    """Used on reuse detection, and on logout-everywhere."""
    session.execute(
        text(
            "UPDATE refresh_tokens SET revoked_at = now() "
            "WHERE family_id = :fid AND revoked_at IS NULL"
        ),
        {"fid": str(family_id)},
    )


def rotate(session: Session, *, token: str, lookup: Lookup) -> str:
    """Revoke the presented token and mint its successor in the same family.

    The UPDATE is guarded on ``revoked_at IS NULL`` so two concurrent refreshes with the
    same token cannot both mint a successor — the loser sees zero rows and is rejected,
    which is the same signal as reuse and is treated as such by the caller.
    """
    result = session.execute(
        text(
            "UPDATE refresh_tokens SET revoked_at = now() "
            "WHERE token_hash = :h AND revoked_at IS NULL"
        ),
        {"h": hash_token(token)},
    )
    if result.rowcount != 1:
        raise RefreshRejected
    return issue(session, user_id=lookup.user_id, family_id=lookup.family_id)
