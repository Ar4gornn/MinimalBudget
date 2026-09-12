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


# The one place on the server that writes prose for a reader (Epic 25).
#
# AD-44 says the client owns every displayed word — and a push notification has no client.
# It is composed by cron on the host, hours after anyone was last in the browser, and it
# arrives as an operating-system notification with no chance to translate anything. So the
# digest, alone, reads `users.language` and writes the sentence itself. That is also the
# reason the language is an account column rather than a browser preference (0019).
#
# Three clauses, and each is a whole sentence rather than a template with a plural switch
# baked into the middle of it: French does not agree with English about where the verb
# goes, and a shared skeleton with `{noun}` holes only ever works for languages that share
# a shape. In French `0` takes the singular, which is why the tests below check `1` and `2`
# rather than trusting a `!= 1` written for English.
_WORDS: dict[str, dict[str, str]] = {
    "en": {
        "restock_one": "{count} item needs restocking",
        "restock_many": "{count} items need restocking",
        "pending_one": "{count} recurring entry is waiting",
        "pending_many": "{count} recurring entries are waiting",
        "habits_one": "{count} habit still to do",
        "habits_many": "{count} habits still to do",
        "more": ", …",
    },
    "fr": {
        "restock_one": "{count} article à racheter",
        "restock_many": "{count} articles à racheter",
        "pending_one": "{count} opération récurrente en attente",
        "pending_many": "{count} opérations récurrentes en attente",
        "habits_one": "{count} habitude à faire",
        "habits_many": "{count} habitudes à faire",
        "more": ", …",
    },
}


def _plural(language: str, count: int) -> str:
    """Which of the two forms a count takes.

    English: 1 is singular. French: 0 *and* 1 are singular — "0 article", not "0 articles".
    Neither is ever asked for a count of zero here (an empty digest is not sent), but the
    rule is written down rather than assumed, because the next language will not share it.
    """
    return "one" if count == 1 or (language == "fr" and count == 0) else "many"


class Digest:
    """What one person has waiting, and the one line that says it, in their language."""

    def __init__(
        self,
        low_items: int,
        pending: int,
        item_names: list[str],
        habit_names: list[str] | None = None,
        language: str = "en",
    ) -> None:
        self.low_items = low_items
        self.pending = pending
        self.item_names = item_names
        # Only the habits that opted in, and only on a day their schedule asks for. Off by
        # default, so a person who has not asked for nagging keeps a digest that arrives
        # when something is exceptional rather than every single evening (AD-34).
        self.habit_names = habit_names or []
        self.language = language if language in _WORDS else "en"

    @property
    def empty(self) -> bool:
        return self.low_items == 0 and self.pending == 0 and not self.habit_names

    @property
    def title(self) -> str:
        return "MinimalBudget"

    def _say(self, key: str, count: int) -> str:
        return _WORDS[self.language][f"{key}_{_plural(self.language, count)}"].format(count=count)

    def _named(self, names: list[str], count: int) -> str:
        """Up to three names in brackets, with an ellipsis when there are more."""
        listed = ", ".join(names[:3])
        if not listed:
            return ""
        more = _WORDS[self.language]["more"] if count > 3 else ""
        return f" ({listed}{more})"

    @property
    def body(self) -> str:
        parts = []
        if self.low_items:
            parts.append(
                self._say("restock", self.low_items) + self._named(self.item_names, self.low_items)
            )
        if self.pending:
            parts.append(self._say("pending", self.pending))
        if self.habit_names:
            count = len(self.habit_names)
            parts.append(self._say("habits", count) + self._named(self.habit_names, count))
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
    # The habits clause calls the habits service rather than rewriting its predicate in SQL
    # here, the way the two counts above are written. That is deliberate: "is this period
    # met" is period arithmetic plus a target, not a comparison — a second copy would drift
    # from the Habits page the first time either changed, which is exactly what AD-30
    # forbids. Reading another module's service (never its models) is what the notification
    # side is allowed to do, being a composer rather than a module (AD-37).
    from app.services import auth as auth_service
    from app.services import habits as habits_service

    # The language is read here rather than passed in, so every caller of `digest` gets a
    # correctly-worded one without having to remember to look it up (AD-30's shape: one
    # definition, no second copy).
    profile = auth_service.read_profile(session, user_id)

    return Digest(
        len(low),
        int(pending),
        list(low),
        habits_service.outstanding(session, user_id),
        language=profile.language if profile else "en",
    )
