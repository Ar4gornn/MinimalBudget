"""AD-3 and AD-4: how tenancy is set, and what happens when it is not.

Two of these are source checks rather than behaviour checks. That is deliberate: the
failure they guard against — a `SET LOCAL` with an interpolated claim, or a stray
`commit()` — produces working-looking code, so nothing else would catch it.
"""

import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError

APP_DIR = Path(__file__).resolve().parents[1] / "app"


def test_unset_tenant_sees_nothing(client, user_a, runtime_connection):
    """The default must be *no* rows, not *all* rows."""
    conn = runtime_connection(None)
    try:
        visible = conn.execute(text("SELECT count(*) FROM users")).scalar_one()
        seeded = conn.execute(text("SELECT count(*) FROM savings_types")).scalar_one()
    finally:
        conn.close()

    assert visible == 0
    assert seeded == 0


def test_tenant_sees_only_its_own_rows(client, user_a, user_b, runtime_connection):
    conn = runtime_connection(user_a["id"])
    try:
        ids = conn.execute(text("SELECT id FROM users")).scalars().all()
        types = conn.execute(text("SELECT count(*) FROM savings_types")).scalar_one()
    finally:
        conn.close()

    assert ids == [user_a["id"]]
    assert types == 3, "registration seeds exactly the three default savings types"


def test_a_tenant_cannot_insert_a_row_owned_by_someone_else(user_a, user_b, runtime_connection):
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(ProgrammingError) as exc:
            conn.execute(
                text("INSERT INTO savings_types (user_id, name) VALUES (:uid, 'smuggled')"),
                {"uid": str(user_a["id"])},
            )
        assert "row-level security" in str(exc.value).lower()
    finally:
        conn.close()


def test_setting_is_transaction_local(user_a, runtime_connection):
    """AD-3: `set_config(..., true)` is scoped to the transaction.

    This is why a mid-request commit is forbidden — it would end the transaction and take
    the tenant with it, after which every query returns nothing and the endpoint answers
    200 with empty data.
    """
    conn = runtime_connection(user_a["id"])
    try:
        assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 1
        conn.commit()
        after_commit = conn.execute(
            text("SELECT current_setting('app.user_id', true)")
        ).scalar_one()
        assert after_commit in (None, ""), "the tenant survived a commit; AD-4 would not protect us"
        assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 0
    finally:
        conn.close()


def test_a_non_uuid_subject_never_becomes_a_tenant():
    """AD-3: the claim is validated as a UUID before it can reach set_config."""
    import jwt

    from app.core.config import get_settings
    from app.core.security import decode_subject

    settings = get_settings()
    forged = jwt.encode({"sub": "'; DROP TABLE users; --"}, settings.secret_key, algorithm="HS256")
    assert decode_subject(forged) is None

    unsigned = jwt.encode({"sub": str(uuid.uuid4())}, "not-the-real-key", algorithm="HS256")
    assert decode_subject(unsigned) is None


def _python_sources() -> list[Path]:
    return sorted(APP_DIR.rglob("*.py"))


def test_set_local_is_never_used():
    """AD-3: `SET LOCAL` takes no bound parameter, so using it invites interpolation."""
    offenders = []
    for path in _python_sources():
        code = "\n".join(
            line.split("#", 1)[0] for line in path.read_text(encoding="utf-8").splitlines()
        )
        if "set local" in code.lower():
            offenders.append(str(path.relative_to(APP_DIR)))
    assert offenders == [], f"SET LOCAL found in {offenders}; use set_config with a bound parameter"


def test_only_the_session_dependency_commits():
    """AD-4: a commit anywhere else silently discards the tenant."""
    allowed = {Path("core/db.py")}
    offenders = []
    for path in _python_sources():
        relative = path.relative_to(APP_DIR)
        if relative in allowed:
            continue
        source = path.read_text(encoding="utf-8")
        if ".commit()" in source or ".begin()" in source:
            offenders.append(str(relative))
    assert offenders == [], f"transaction control outside core/db.py: {offenders}"
