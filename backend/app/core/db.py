"""Database access.

AD-3 and AD-4 live here, and nowhere else:

* one transaction per request,
* ``app.user_id`` set through a **bound parameter** before any other statement,
* this module is the only thing that commits.

Anything that reaches Postgres outside this dependency is a defect.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_settings = get_settings()

engine = create_engine(
    _settings.sqlalchemy_url,
    pool_pre_ping=True,
    future=True,
)

SessionFactory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)

# AD-3: set_config takes the value as a bound parameter. `SET LOCAL` cannot, which is
# exactly why it is forbidden — it would force the JWT claim to be interpolated into SQL.
_SET_TENANT = text("SELECT set_config('app.user_id', :uid, true)")


def _open_tenant_session(user_id: UUID) -> Session:
    """Open a transaction and pin it to one user. Caller owns commit/rollback."""
    session = SessionFactory()
    session.execute(_SET_TENANT, {"uid": str(user_id)})
    return session


def session_for_user(user_id: UUID) -> Iterator[Session]:
    """Request-scoped session, pinned to ``user_id``.

    The only place in the application that commits (AD-4). A ``commit()`` anywhere else
    would end the transaction and silently discard ``app.user_id``, after which every
    RLS-filtered query returns nothing and the endpoint answers 200 with empty data.
    """
    session = _open_tenant_session(user_id)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# Registration has no token to authenticate, but it is not anonymous either: it mints the
# new user's id and pins the transaction to it before writing anything (AD-19).
tenant_session = contextmanager(session_for_user)


def anonymous_session() -> Iterator[Session]:
    """A session with **no** tenant set, for the two routes that run before a user is known.

    Every policy treats an unset ``app.user_id`` as matching nothing, so this session can
    reach only what is explicitly granted to the runtime role: the login lookup function
    of AD-19. It cannot read a single row of user data.
    """
    session = SessionFactory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
