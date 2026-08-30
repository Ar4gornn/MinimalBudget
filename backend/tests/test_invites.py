"""Story 7.1 — registration is invite-only on a closed instance.

These tests set `REGISTRATION_MODE` explicitly instead of relying on the suite default, and
clear the settings cache so the route sees the change. That is the point: the behaviour
under test is the closed mode, which the rest of the suite deliberately does not use.
"""

import secrets
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.core.config import get_settings
from app.services.invites import hash_code


@pytest.fixture
def invite_only(monkeypatch):
    monkeypatch.setenv("REGISTRATION_MODE", "invite")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def issue(owner_engine, *, days: int = 7, used: bool = False) -> str:
    """Mint an invite the way the operator script does — as the owner role."""
    code = secrets.token_urlsafe(20)
    with owner_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO invites (code_hash, note, expires_at, used_at) "
                "VALUES (:h, 'test', :expires, :used)"
            ),
            {
                "h": hash_code(code),
                "expires": datetime.now(UTC) + timedelta(days=days),
                "used": datetime.now(UTC) if used else None,
            },
        )
    return code


def register(client, email, code=None):
    body = {"email": email, "password": "correct-horse-battery"}
    if code is not None:
        body["invite_code"] = code
    return client.post("/api/auth/register", json=body)


def test_a_valid_invite_creates_the_account(client, owner_engine, invite_only):
    code = issue(owner_engine)
    response = register(client, "invited@example.com", code)
    assert response.status_code == 201, response.text


def test_registration_without_a_code_is_refused(client, invite_only):
    response = register(client, "stranger@example.com")
    assert response.status_code == 403
    assert client.post(
        "/api/auth/login",
        json={"email": "stranger@example.com", "password": "correct-horse-battery"},
    ).status_code == 401, "no account should exist to log into"


@pytest.mark.parametrize("bad", ["", "   ", "not-a-real-code", "x" * 100])
def test_an_invalid_code_is_refused(client, bad, invite_only):
    assert register(client, "stranger@example.com", bad).status_code == 403


def test_an_expired_code_is_refused(client, owner_engine, invite_only):
    code = issue(owner_engine, days=-1)
    assert register(client, "late@example.com", code).status_code == 403


def test_an_already_used_code_is_refused(client, owner_engine, invite_only):
    code = issue(owner_engine, used=True)
    assert register(client, "second@example.com", code).status_code == 403


def test_an_invite_is_single_use(client, owner_engine, invite_only):
    code = issue(owner_engine)
    assert register(client, "first@example.com", code).status_code == 201
    assert register(client, "second@example.com", code).status_code == 403


def test_unknown_used_and_expired_are_indistinguishable(client, owner_engine, invite_only):
    """The endpoint must not become an oracle for which codes exist."""
    unknown = register(client, "a@example.com", "definitely-not-a-code")
    used = register(client, "b@example.com", issue(owner_engine, used=True))
    expired = register(client, "c@example.com", issue(owner_engine, days=-1))

    assert unknown.status_code == used.status_code == expired.status_code == 403
    assert unknown.json() == used.json() == expired.json()


def test_a_failed_registration_does_not_burn_the_invite(client, owner_engine, invite_only):
    """The invite and the user are written in one transaction.

    A duplicate email fails *after* the invite is consumed, so without a shared transaction
    the code would be spent on an account that was never created.
    """
    register(client, "taken@example.com", issue(owner_engine))

    code = issue(owner_engine)
    assert register(client, "taken@example.com", code).status_code == 409
    # The same code must still work for someone else.
    assert register(client, "fresh@example.com", code).status_code == 201


def test_open_mode_still_registers_without_a_code(client, monkeypatch):
    monkeypatch.setenv("REGISTRATION_MODE", "open")
    get_settings.cache_clear()
    try:
        assert register(client, "local@example.com").status_code == 201
    finally:
        get_settings.cache_clear()


def test_the_default_mode_is_the_closed_one(monkeypatch):
    """AD-25. Guessing wrong here leaves an internet-facing instance open to strangers."""
    monkeypatch.delenv("REGISTRATION_MODE", raising=False)
    get_settings.cache_clear()
    try:
        from app.core.config import Settings

        settings = Settings(
            _env_file=None,
            database_url="postgresql+psycopg://u:p@localhost:5432/d",
            secret_key="Xk3n9QwRt7ZbLmVp2ScFdEgHjKlNoPqR",
        )
        assert settings.registration_mode == "invite"
    finally:
        get_settings.cache_clear()


def test_the_runtime_role_cannot_mint_an_invite(user_a, runtime_connection):
    """The grant, not a code path, is what stops a compromised API letting itself in."""
    from sqlalchemy.exc import ProgrammingError

    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(ProgrammingError) as exc:
            conn.execute(
                text(
                    "INSERT INTO invites (code_hash, expires_at) "
                    "VALUES ('deadbeef', now() + interval '1 day')"
                )
            )
        assert "permission denied" in str(exc.value).lower()
    finally:
        conn.close()
