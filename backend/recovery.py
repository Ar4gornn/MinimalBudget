"""Issue a recovery code to an account that has none (Epic 12, the operator fallback).

    python recovery.py issue someone@example.com

For the person who forgot their password *and* never generated codes, or lost them. Runs as
the **owner** role, like `invite.py`. The code is printed once, stored only as a hash, and
works exactly once on the sign-in page's "Forgot your password?" form, where the person
chooses the new password themselves — so the operator never learns or picks a password,
which is the improvement over `reset_password.py`.

Confirm who is asking through some channel that is not the app, and send the code over
something private: anyone holding it can set that account's password.
"""

import argparse
import os
import pathlib
import sys

from sqlalchemy import create_engine, text

from app.services.recovery import hash_code, new_code

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
            "MIGRATION_DATABASE_URL is not set. Issuing a recovery code needs the owner "
            "credentials; the API's runtime role cannot mint one for another account."
        )
    return url


def issue(email: str) -> int:
    email = email.strip().lower()
    code = new_code()

    engine = create_engine(owner_url())
    with engine.begin() as conn:
        user_id = conn.execute(
            text("SELECT id FROM users WHERE lower(email) = :e"), {"e": email}
        ).scalar_one_or_none()
        if user_id is None:
            print(f"No account for {email}.", file=sys.stderr)
            return 1
        conn.execute(
            text("INSERT INTO recovery_codes (user_id, code_hash) VALUES (:uid, :h)"),
            {"uid": str(user_id), "h": hash_code(code)},
        )
        unused = conn.execute(
            text("SELECT count(*) FROM recovery_codes WHERE user_id = :uid AND used_at IS NULL"),
            {"uid": str(user_id)},
        ).scalar_one()
    engine.dispose()

    print()
    print(f"  Recovery code for {email}:  {code}")
    print()
    print("  Shown once — only its hash is stored. It works one time, on the sign-in page")
    print('  under "Forgot your password?", together with the email and a new password.')
    print(f"  The account now has {unused} unused code(s).")
    print()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    cmd = sub.add_parser("issue", help="print one single-use recovery code for an account")
    cmd.add_argument("email", help="the account that needs a way back in")
    args = parser.parse_args()
    return issue(args.email)


if __name__ == "__main__":
    raise SystemExit(main())
