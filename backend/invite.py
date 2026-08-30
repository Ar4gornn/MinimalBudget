"""Issue and list registration invites (Story 7.1).

    python invite.py new --note "sister" --days 14
    python invite.py list

Runs as the **owner** role, not the runtime role. The API holds SELECT and UPDATE on
`invites` and no INSERT, so it can spend an invite and can never mint one — which means a
compromised API cannot create its own way in. Issuing is a deliberate act by whoever holds
the owner credentials.

The code is shown once, at creation, and only its hash is stored. There is no way to
recover it afterwards; issue another.
"""

import argparse
import os
import pathlib
import secrets
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, text

from app.services.invites import hash_code

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]


def owner_url() -> str:
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
        raise SystemExit(
            "MIGRATION_DATABASE_URL is not set. Issuing an invite needs the owner "
            "credentials; the API's runtime role has no INSERT on invites by design."
        )
    return url


def new_invite(days: int, note: str | None) -> int:
    # 160 bits. Long enough that guessing is not a threat model, so the endpoint that
    # consumes it needs no rate limit of its own.
    code = secrets.token_urlsafe(20)
    expires = datetime.now(UTC) + timedelta(days=days)

    engine = create_engine(owner_url())
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO invites (code_hash, note, expires_at) "
                "VALUES (:h, :note, :expires)"
            ),
            {"h": hash_code(code), "note": note, "expires": expires},
        )
    engine.dispose()

    print()
    print("  Invite code:  " + code)
    print(f"  Expires:      {expires:%Y-%m-%d %H:%M UTC}")
    if note:
        print(f"  Note:         {note}")
    print()
    print("  Shown once — only its hash is stored. Send it over something private;")
    print("  anyone holding it can create one account on this instance.")
    print()
    return 0


def list_invites() -> int:
    engine = create_engine(owner_url())
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT note, created_at, expires_at, used_at, "
                "       (used_by IS NOT NULL) AS claimed "
                "FROM invites ORDER BY created_at DESC"
            )
        ).all()
    engine.dispose()

    if not rows:
        print("No invites issued.")
        return 0

    now = datetime.now(UTC)
    print(f"{'note':<20} {'issued':<12} {'state':<24}")
    print("-" * 58)
    for note, created, expires, used, claimed in rows:
        if used is not None:
            state = f"used {used:%Y-%m-%d}" + (" (claimed)" if claimed else "")
        elif expires <= now:
            state = f"expired {expires:%Y-%m-%d}"
        else:
            state = f"open until {expires:%Y-%m-%d}"
        print(f"{(note or '-'):<20} {created:%Y-%m-%d:<12} {state:<24}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    issue = sub.add_parser("new", help="issue a single-use invite code")
    issue.add_argument("--days", type=int, default=14, help="days until it expires")
    issue.add_argument("--note", default=None, help="who it is for, for your own records")

    sub.add_parser("list", help="show issued invites and their state")

    args = parser.parse_args()
    if args.command == "new":
        return new_invite(args.days, args.note)
    return list_invites()


if __name__ == "__main__":
    sys.exit(main())
