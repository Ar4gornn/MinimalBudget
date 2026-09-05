"""Recovery codes and password writes (Epic 12).

Nothing here commits (AD-4). Every statement runs under the tenant the caller pinned:
for a signed-in user that is the request's own; for recovery it is the id the email
resolved to, pinned before anything is read (AD-19's registration pattern).

A password hash is written only through ``auth_set_password``, which refuses any id
other than the transaction's tenant — so this module cannot be turned against another
account even by a caller that gets the arguments wrong (AD-32).
"""

import hashlib
import secrets
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import hash_password

CODE_COUNT = 8
# No 0/O, 1/I/l: a code read off a printout must not depend on the font.
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
_CODE_LENGTH = 10


def new_code() -> str:
    raw = "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LENGTH))
    return f"{raw[:5]}-{raw[5:]}"


def normalise(code: str) -> str:
    """Case, spaces and the dash are presentation; the letters are the code."""
    return "".join(ch for ch in code.lower() if ch.isalnum())


def hash_code(code: str) -> str:
    # SHA-256, not Argon2: 50 bits of random have no dictionary to defend against, and a
    # slow hash here would only slow the person who is locked out.
    return hashlib.sha256(normalise(code).encode("utf-8")).hexdigest()


def generate(session: Session, user_id: uuid.UUID) -> list[str]:
    """Replace the account's codes with a fresh set and return them, once, in plain text."""
    session.execute(text("DELETE FROM recovery_codes WHERE user_id = :uid"), {"uid": str(user_id)})
    codes = [new_code() for _ in range(CODE_COUNT)]
    for code in codes:
        session.execute(
            text("INSERT INTO recovery_codes (user_id, code_hash) VALUES (:uid, :h)"),
            {"uid": str(user_id), "h": hash_code(code)},
        )
    session.flush()
    return codes


def status(session: Session, user_id: uuid.UUID) -> tuple[int, int]:
    """``(unused, total)`` for the account."""
    row = session.execute(
        text(
            "SELECT count(*) FILTER (WHERE used_at IS NULL) AS unused, count(*) AS total "
            "FROM recovery_codes WHERE user_id = :uid"
        ),
        {"uid": str(user_id)},
    ).one()
    return int(row.unused), int(row.total)


def redeem(session: Session, user_id: uuid.UUID, code: str) -> bool:
    """Mark one unused code as used. False if no such code — used, unknown, or not this user's.

    The UPDATE is the check: guarded on ``used_at IS NULL`` so two concurrent redemptions
    of the same code cannot both succeed.
    """
    updated = session.execute(
        text(
            "UPDATE recovery_codes SET used_at = now() "
            "WHERE user_id = :uid AND code_hash = :h AND used_at IS NULL"
        ),
        {"uid": str(user_id), "h": hash_code(code)},
    ).rowcount
    return updated == 1


def set_password(session: Session, user_id: uuid.UUID, password: str) -> None:
    session.execute(
        text("SELECT auth_set_password(CAST(:uid AS uuid), :h)"),
        {"uid": str(user_id), "h": hash_password(password)},
    )
