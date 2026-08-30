"""Set a new password for an account (Story 7.6).

    python reset_password.py someone@example.com

There is no self-service password reset in v1 — that needs email delivery, which this
deployment does not have. On a family instance the honest substitute is the person running
it doing this by hand, having confirmed who is asking through some channel that is not the
application.

Runs as the **owner** role, like the invite script. The runtime role cannot even read a
password hash, let alone write one, so this is not something a compromised API can do.

Every refresh token for the account is revoked at the same time. A password change that
left existing sessions alive would be useless for the case that matters — someone else has
been in the account — so the two are one operation rather than two things to remember.
"""

import argparse
import getpass
import os
import pathlib
import sys

from sqlalchemy import create_engine, text

from app.core.security import hash_password

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]

MIN_LENGTH = 10


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
            "MIGRATION_DATABASE_URL is not set. Resetting a password needs the owner "
            "credentials; the API's runtime role cannot read or write a password hash."
        )
    return url


def read_password() -> str:
    """Prompt without echo at a terminal; read a line when there is not one.

    `getpass` talks to the console directly and ignores a pipe, which would hang this
    script under `docker compose run -T` — the exact way it gets used on a server.
    """
    if sys.stdin.isatty():
        password = getpass.getpass("New password: ")
        if password != getpass.getpass("Repeat it: "):
            print("They do not match.", file=sys.stderr)
            raise SystemExit(1)
        return password

    print("Reading the new password from stdin (no terminal attached).", file=sys.stderr)
    return sys.stdin.readline().strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email", help="the account to reset")
    args = parser.parse_args()
    email = args.email.strip().lower()

    password = read_password()
    if len(password) < MIN_LENGTH:
        print(f"Password must be at least {MIN_LENGTH} characters.", file=sys.stderr)
        return 1

    engine = create_engine(owner_url())
    with engine.begin() as conn:
        updated = conn.execute(
            text("UPDATE users SET password_hash = :h WHERE lower(email) = :e"),
            {"h": hash_password(password), "e": email},
        ).rowcount

        if updated != 1:
            print(f"No account for {email}.", file=sys.stderr)
            raise SystemExit(1)

        # Anyone already signed in as this account is signed out. If the reason for the
        # reset is that someone else got in, leaving their session alive would defeat it.
        revoked = conn.execute(
            text(
                "UPDATE refresh_tokens SET revoked_at = now() "
                "WHERE user_id = (SELECT id FROM users WHERE lower(email) = :e) "
                "AND revoked_at IS NULL"
            ),
            {"e": email},
        ).rowcount

    engine.dispose()
    print(f"Password set for {email}. {revoked} active session(s) revoked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
