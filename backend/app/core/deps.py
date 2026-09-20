"""Request dependencies.

The only way a route reaches the database is :func:`get_session`, which depends on
:func:`get_current_user_id`. There is no way to obtain a session without a tenant (AD-4).
"""

from collections.abc import Iterator
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import anonymous_session, session_for_user
from app.core.security import decode_subject

_bearer = HTTPBearer(auto_error=False)


def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> UUID:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = decode_subject(credentials.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id


def get_session(
    user_id: Annotated[UUID, Depends(get_current_user_id)],
) -> Iterator[Session]:
    yield from session_for_user(user_id)


def get_anonymous_session() -> Iterator[Session]:
    yield from anonymous_session()


def get_start_day(
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    session: Annotated[Session, Depends(get_session, scope="function")],
) -> int:
    """The day this account's budget month starts on (AD-10).

    One indexed primary-key read, on the same session and inside the same transaction as
    everything else the request does — so it cannot see a different value from the writes
    around it. Injected only into the routes that actually take a month, rather than into
    every route.
    """
    from app.core.months import DEFAULT_START_DAY
    from app.models.user import User

    day = session.execute(
        select(User.budget_start_day).where(User.id == user_id)
    ).scalar_one_or_none()
    # A token for a user that no longer exists is the caller's problem, not this one's; the
    # route's own read will answer 404. Fall back to the calendar month rather than raise.
    return int(day) if day is not None else DEFAULT_START_DAY


CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]

# ``scope="function"``: the session's exit code — the commit in ``core.db`` — runs when the
# path function returns, **before** the response is sent. FastAPI's default for a yield
# dependency is the request scope, whose exit code runs *after* the response has gone out
# (documented: "Normally the exit code of dependencies with yield is executed after the
# response is sent to the client"). Under that default a client that writes and then reads
# — every "await api.update…(); await load()" in the web client — can receive a 200 for
# the write and then a list that does not yet contain it, because its GET arrives while the
# PATCH's transaction is still open on another thread. It also means a commit that *fails*
# fails after the 200 was already sent. Seen on the Books page during Epic 28's browser
# walk: an edit answered 200 and the reload that followed showed the row unchanged.
DbSession = Annotated[Session, Depends(get_session, scope="function")]
AnonSession = Annotated[Session, Depends(get_anonymous_session, scope="function")]
StartDay = Annotated[int, Depends(get_start_day)]
