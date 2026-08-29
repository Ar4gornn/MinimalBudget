"""Request dependencies.

The only way a route reaches the database is :func:`get_session`, which depends on
:func:`get_current_user_id`. There is no way to obtain a session without a tenant (AD-4).
"""

from collections.abc import Iterator
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
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


CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_session)]
AnonSession = Annotated[Session, Depends(get_anonymous_session)]
