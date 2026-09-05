"""Send each person their daily digest of what needs doing (Epic 18).

    python notify.py            # send to everyone who has something waiting
    python notify.py --dry-run  # print what would be sent, send nothing

Run by cron on the host, **not** by the API. A push has to be sent on a schedule, and this
deployment is one container: an in-process scheduler would die with it, run twice with two
replicas, and put network calls to an outside service inside a request. Cron is already how
backups run here, so this adds an entry rather than a component (AD-34).

Connects as the runtime role, one tenant at a time, so every read obeys row-level security
exactly as a request does — a notifier that bypassed RLS could tell one person what is in
another's fridge.

Sends at most one notification per device per day. A reminder that arrives every hour is a
reminder nobody reads.
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import sys

from sqlalchemy import create_engine, text

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]


def owner_url() -> str:
    """The owner role, only to *list* which users exist — `users` is not readable otherwise.

    Everything about a user's data is then read as the runtime role under their tenancy.
    """
    url = os.environ.get("MIGRATION_DATABASE_URL")
    if not url:
        env_path = REPO_ROOT / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                key, _, value = line.partition("=")
                if key.strip() == "MIGRATION_DATABASE_URL":
                    url = value.strip()
                    break
    if not url:
        raise SystemExit("MIGRATION_DATABASE_URL is not set.")
    return url


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="print, send nothing")
    args = parser.parse_args()

    from app.core.config import get_settings

    settings = get_settings()
    if not settings.push_enabled:
        print(
            "Push is not configured: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and "
            "VAPID_SUBJECT. Nothing to do.",
            file=sys.stderr,
        )
        return 0

    from app.core.db import tenant_session
    from app.services import push as push_service

    today = dt.date.today()
    owner = create_engine(owner_url())
    with owner.connect() as conn:
        user_ids = list(conn.execute(text("SELECT id FROM users ORDER BY created_at")).scalars())
    owner.dispose()

    sent = skipped = dropped = 0
    for user_id in user_ids:
        with tenant_session(user_id) as session:
            subscriptions = push_service.list_subscriptions(session, user_id)
            if not subscriptions:
                continue
            digest = push_service.digest(session, user_id)
            if digest.empty:
                continue

            payload = json.dumps(
                {"title": digest.title, "body": digest.body, "url": "/"},
                ensure_ascii=False,
            )
            for subscription in subscriptions:
                if subscription.notified_on == today:
                    skipped += 1
                    continue
                if args.dry_run:
                    print(f"would send to {subscription.endpoint[:48]}…: {digest.body}")
                    sent += 1
                    continue
                if _send(settings, subscription, payload):
                    push_service.mark_notified(session, subscription.id, today)
                    sent += 1
                else:
                    push_service.forget(session, subscription.endpoint)
                    dropped += 1

    print(f"sent {sent}, skipped {skipped} already told today, dropped {dropped} dead")
    return 0


def _send(settings, subscription, payload: str) -> bool:
    """True if it went, False if the subscription is dead and should be forgotten."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=60 * 60 * 12,
        )
        return True
    except WebPushException as exc:
        # 404 and 410 are the push service saying this endpoint is gone for good — an
        # uninstalled app, a cleared browser. Anything else may be temporary, so the
        # subscription is kept and the next run tries again.
        status = getattr(exc, "status_code", None) or getattr(exc.response, "status_code", None)
        if status in (404, 410):
            print(f"dropping dead subscription ({status})", file=sys.stderr)
            return False
        print(f"push failed ({status}): {exc}", file=sys.stderr)
        return True


if __name__ == "__main__":
    raise SystemExit(main())
