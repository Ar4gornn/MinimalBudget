"""Registration and login.

Neither function commits — only the session dependency does (AD-4). ``flush`` is used
where a constraint violation must be turned into a status code while the request is still
in scope.

Note the shape of every read of ``users``: the runtime role holds ``SELECT`` on
``(id, email, created_at)`` and nothing else (AD-19), so a ``SELECT *`` — which is what
``session.get(User, ...)`` emits — would be refused by the database. Reads here name their
columns.
"""

import uuid
from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.savings import DEFAULT_SAVINGS_TYPES, SavingsType
from app.models.user import User


class EmailAlreadyRegistered(Exception):
    pass


class UserRow:
    """The three columns of a user the runtime role is allowed to read."""

    def __init__(self, id: uuid.UUID, email: str, created_at: datetime) -> None:
        self.id = id
        self.email = email
        self.created_at = created_at


def _read_user(session: Session, user_id: uuid.UUID) -> UserRow | None:
    row = session.execute(
        select(User.id, User.email, User.created_at).where(User.id == user_id)
    ).one_or_none()
    return None if row is None else UserRow(*row)


def register(session: Session, *, user_id: uuid.UUID, email: str, password: str) -> UserRow:
    """Create the user and seed their default savings types.

    The caller has already pinned the transaction to ``user_id`` (AD-19), so both writes
    happen *inside* row-level security rather than around it.
    """
    session.add(User(id=user_id, email=email, password_hash=hash_password(password)))
    try:
        # Flushed on its own, and before the seed rows: the unit of work does not reliably
        # order these, and the seed rows have a foreign key to this one. Narrow scope also
        # means only a genuine email conflict can become a 409 — a failure while seeding is
        # a real error, not a misreported duplicate.
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise EmailAlreadyRegistered from exc

    session.add_all(SavingsType(user_id=user_id, name=name) for name in DEFAULT_SAVINGS_TYPES)
    session.flush()

    created = _read_user(session, user_id)
    if created is None:  # pragma: no cover — would mean RLS rejected our own insert
        raise RuntimeError("user was inserted but is not readable in its own transaction")
    return created


def read_profile(session: Session, user_id: uuid.UUID) -> UserRow | None:
    return _read_user(session, user_id)


def authenticate(session: Session, *, email: str, password: str) -> uuid.UUID | None:
    """Return the user id for valid credentials, or ``None``.

    Goes through the SECURITY DEFINER function of AD-19: the runtime role cannot read
    ``users.password_hash`` directly, and has no way to list users at all.
    """
    row = session.execute(
        text("SELECT user_id, password_hash FROM auth_lookup(:email)"),
        {"email": email},
    ).one_or_none()

    if row is None:
        # Hash anyway, so an unknown email and a wrong password cost the same time.
        verify_password(password, _DUMMY_HASH)
        return None

    user_id, password_hash = row
    if not verify_password(password, password_hash):
        return None
    return user_id


# A real Argon2 hash of a value nobody can supply, used only to equalise timing above.
_DUMMY_HASH = hash_password(uuid.uuid4().hex)
