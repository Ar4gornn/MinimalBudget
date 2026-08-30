"""Story 7.3 — refresh tokens: rotation, reuse detection, revocation."""

import uuid

import pytest
from sqlalchemy import text

from app.services.sessions import hash_token


def login(client, user):
    response = client.post(
        "/api/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    assert response.status_code == 200, response.text
    return response.json()


def refresh(client, token):
    return client.post("/api/auth/refresh", json={"refresh_token": token})


def test_login_returns_both_tokens(client, user_a):
    body = login(client, user_a)
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["access_token"] != body["refresh_token"]


def test_a_refresh_token_buys_a_working_access_token(client, user_a):
    body = login(client, user_a)
    rotated = refresh(client, body["refresh_token"])
    assert rotated.status_code == 200

    new_access = rotated.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200
    assert me.json()["id"] == str(user_a["id"])


def test_refreshing_rotates_the_token(client, user_a):
    body = login(client, user_a)
    first = body["refresh_token"]
    second = refresh(client, first).json()["refresh_token"]
    assert second != first, "the presented token must not be handed back"


def test_a_rotated_token_cannot_be_used_again(client, user_a):
    first = login(client, user_a)["refresh_token"]
    refresh(client, first)
    assert refresh(client, first).status_code == 401


def test_reuse_revokes_the_whole_family(client, user_a):
    """The property that makes rotation worth having.

    A token presented after it was rotated means a copy exists. There is no way to tell
    whether this caller is the thief or the victim, so both are signed out — the theft
    becomes visible instead of silently continuing.
    """
    first = login(client, user_a)["refresh_token"]
    second = refresh(client, first).json()["refresh_token"]

    # The attacker replays the stolen, already-rotated token.
    assert refresh(client, first).status_code == 401

    # The honest user's current token is now dead too.
    assert refresh(client, second).status_code == 401


def test_one_login_does_not_revoke_another_device(client, user_a):
    """Each login starts its own family, or signing out a phone would sign out a laptop."""
    phone = login(client, user_a)["refresh_token"]
    laptop = login(client, user_a)["refresh_token"]

    # Trigger reuse detection on the phone's family only.
    rotated_phone = refresh(client, phone).json()["refresh_token"]
    refresh(client, phone)

    assert refresh(client, rotated_phone).status_code == 401, "phone family is revoked"
    assert refresh(client, laptop).status_code == 200, "laptop must be unaffected"


def test_logout_revokes_the_token(client, user_a):
    token = login(client, user_a)["refresh_token"]
    assert client.post("/api/auth/logout", json={"refresh_token": token}).status_code == 204
    assert refresh(client, token).status_code == 401


def test_logout_is_idempotent_and_says_nothing(client, user_a):
    token = login(client, user_a)["refresh_token"]
    first = client.post("/api/auth/logout", json={"refresh_token": token})
    second = client.post("/api/auth/logout", json={"refresh_token": token})
    unknown = client.post("/api/auth/logout", json={"refresh_token": "not-a-real-token"})
    assert first.status_code == second.status_code == unknown.status_code == 204


@pytest.mark.parametrize("bogus", ["", "not-a-token", "x" * 200])
def test_a_bogus_refresh_token_is_401(client, user_a, bogus):
    assert refresh(client, bogus).status_code == 401


def test_an_expired_token_is_refused(client, user_a, owner_engine):
    token = login(client, user_a)["refresh_token"]
    with owner_engine.begin() as conn:
        conn.execute(
            text("UPDATE refresh_tokens SET expires_at = now() - interval '1 day' "
                 "WHERE token_hash = :h"),
            {"h": hash_token(token)},
        )
    assert refresh(client, token).status_code == 401


def test_tokens_are_stored_hashed_never_in_the_clear(client, user_a, owner_engine):
    """A database backup must not hand someone a working session."""
    token = login(client, user_a)["refresh_token"]
    with owner_engine.connect() as conn:
        stored = conn.execute(text("SELECT token_hash FROM refresh_tokens")).scalars().all()

    assert token not in stored
    assert hash_token(token) in stored


def test_refresh_tokens_are_isolated_between_users(client, user_a, user_b, runtime_connection):
    """AD-1 applies here like every other user-scoped table."""
    login(client, user_a)
    login(client, user_b)

    conn = runtime_connection(user_b["id"])
    try:
        visible = conn.execute(
            text("SELECT DISTINCT user_id FROM refresh_tokens")
        ).scalars().all()
    finally:
        conn.close()

    assert visible == [user_b["id"]], "B must not see A's sessions"


def test_b_cannot_revoke_a_session_of_a(client, user_a, user_b, runtime_connection):
    token = login(client, user_a)["refresh_token"]

    conn = runtime_connection(user_b["id"])
    try:
        affected = conn.execute(
            text("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = :h"),
            {"h": hash_token(token)},
        ).rowcount
        conn.commit()
    finally:
        conn.close()

    assert affected == 0
    assert refresh(client, token).status_code == 200, "A's session must still work"


def test_the_lookup_function_cannot_enumerate(user_a, runtime_connection):
    """The SECURITY DEFINER hole is narrow: one hash in, at most one row out."""
    conn = runtime_connection(user_a["id"])
    try:
        rows = conn.execute(
            text("SELECT * FROM refresh_lookup(:h)"), {"h": hash_token(str(uuid.uuid4()))}
        ).all()
    finally:
        conn.close()
    assert rows == []
