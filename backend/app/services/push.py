"""Push subscriptions, and the digest text (Epic 18).

This module stores subscriptions and decides *what* a person should be told. It never sends
anything: sending needs the network and a schedule, and neither belongs in a request. The
sending half lives in ``notify.py``, run by cron on the host (AD-34).

Nothing here commits (AD-4).
"""

import datetime as dt
import uuid

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.models.push import PushSubscription


def list_subscriptions(session: Session, user_id: uuid.UUID) -> list[PushSubscription]:
    return list(
        session.execute(
            select(PushSubscription)
            .where(PushSubscription.user_id == user_id)
            .order_by(PushSubscription.created_at, PushSubscription.id)
        ).scalars()
    )


def subscribe(
    session: Session, user_id: uuid.UUID, *, endpoint: str, p256dh: str, auth: str
) -> PushSubscription:
    """Idempotent by endpoint, and it *moves* the row rather than refusing it.

    The endpoint identifies a browser install, not a person. If a device is handed on and
    someone else signs in, the subscription has to follow the new account — otherwise the
    previous owner keeps being told what is in this person's fridge.

    That cannot be done with ``ON CONFLICT DO UPDATE``: resolving the conflict means
    updating a row the caller is not allowed to see, and row-level security refuses it —
    correctly. So the previous claim on this endpoint is released first, through the
    narrow delete-only function of migration 0013, and the insert then runs under the
    caller's own tenancy like every other write.
    """
    session.execute(text("SELECT push_release_endpoint(:endpoint)"), {"endpoint": endpoint})
    row_id = session.execute(
        text(
            """
            INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
            VALUES (:uid, :endpoint, :p256dh, :auth)
            ON CONFLICT (endpoint) DO UPDATE
                SET user_id = EXCLUDED.user_id,
                    p256dh = EXCLUDED.p256dh,
                    auth = EXCLUDED.auth,
                    notified_on = NULL
            RETURNING id
            """
        ),
        {"uid": str(user_id), "endpoint": endpoint, "p256dh": p256dh, "auth": auth},
    ).scalar_one()
    session.flush()
    session.expire_all()
    subscription = session.get(PushSubscription, row_id)
    if subscription is None:  # pragma: no cover — the insert just returned this id
        raise NotFound("subscription was written but is not readable")
    return subscription


def unsubscribe(session: Session, user_id: uuid.UUID, endpoint: str) -> None:
    """Idempotent: an endpoint that is already gone is a success, not a 404."""
    session.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user_id, PushSubscription.endpoint == endpoint
        )
    )
    session.flush()


def forget(session: Session, endpoint: str) -> None:
    """Drop a subscription the push service has told us is dead (404 or 410)."""
    session.execute(delete(PushSubscription).where(PushSubscription.endpoint == endpoint))
    session.flush()


def mark_notified(session: Session, subscription_id: uuid.UUID, on: dt.date) -> None:
    subscription = session.get(PushSubscription, subscription_id)
    if subscription is not None:
        subscription.notified_on = on
    session.flush()


class Digest:
    """What one person has waiting, and the one line that says it."""

    def __init__(self, low_items: int, pending: int, item_names: list[str]) -> None:
        self.low_items = low_items
        self.pending = pending
        self.item_names = item_names

    @property
    def empty(self) -> bool:
        return self.low_items == 0 and self.pending == 0

    @property
    def title(self) -> str:
        return "MinimalBudget"

    @property
    def body(self) -> str:
        parts = []
        if self.low_items:
            noun = "item needs" if self.low_items == 1 else "items need"
            named = ", ".join(self.item_names[:3])
            tail = f" ({named}{', …' if self.low_items > 3 else ''})" if named else ""
            parts.append(f"{self.low_items} {noun} restocking{tail}")
        if self.pending:
            verb = "entry is" if self.pending == 1 else "entries are"
            parts.append(f"{self.pending} recurring {verb} waiting")
        return ". ".join(parts) + "."


def digest(session: Session, user_id: uuid.UUID) -> Digest:
    """Read-only. The counts come from the same predicates the pages use (AD-30, AD-33).

    Deliberately does *not* materialise recurring occurrences: a notification job must not
    write to the ledger. It reports what is already pending, and the next visit to the app
    brings the rest into being.
    """
    low = (
        session.execute(
            text(
                "SELECT name FROM inventory_items "
                "WHERE user_id = :uid AND restock_below IS NOT NULL AND quantity <= restock_below "
                "ORDER BY lower(name)"
            ),
            {"uid": str(user_id)},
        )
        .scalars()
        .all()
    )
    pending = session.execute(
        text(
            "SELECT count(*) FROM recurring_occurrences WHERE user_id = :uid AND status = 'pending'"
        ),
        {"uid": str(user_id)},
    ).scalar_one()
    return Digest(len(low), int(pending), list(low))
