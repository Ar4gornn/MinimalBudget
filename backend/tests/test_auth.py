"""Stories 1.4 and 1.5 — registration, login, current user."""

from tests.conftest import register_user


def test_health_needs_no_token(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_registration_returns_the_profile_and_never_the_hash(client):
    response = client.post(
        "/api/auth/register", json={"email": "new@example.com", "password": "correct-horse-battery"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new@example.com"
    assert "password" not in body and "password_hash" not in body


def test_registration_seeds_the_three_default_savings_types(client, runtime_connection):
    from sqlalchemy import text

    user = register_user(client, "seeded@example.com")
    conn = runtime_connection(user["id"])
    try:
        names = conn.execute(text("SELECT name FROM savings_types ORDER BY name")).scalars().all()
    finally:
        conn.close()
    assert names == ["investment", "startup", "vacation"]


def test_email_is_normalised_and_unique_case_insensitively(client):
    first = client.post(
        "/api/auth/register",
        json={"email": "Mixed@Example.COM", "password": "correct-horse-battery"},
    )
    assert first.status_code == 201
    assert first.json()["email"] == "mixed@example.com"

    second = client.post(
        "/api/auth/register", json={"email": "mixed@example.com", "password": "another-long-pass"}
    )
    assert second.status_code == 409


def test_login_returns_a_bearer_token_and_sets_no_cookie(client):
    register_user(client, "login@example.com")
    response = client.post(
        "/api/auth/login", json={"email": "login@example.com", "password": "correct-horse-battery"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    # AD-14: nothing browser-shaped, so a mobile client can use the same endpoint.
    assert "set-cookie" not in {k.lower() for k in response.headers}


def test_wrong_password_and_unknown_email_are_indistinguishable(client):
    register_user(client, "known@example.com")
    wrong = client.post(
        "/api/auth/login", json={"email": "known@example.com", "password": "not-the-password"}
    )
    unknown = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "not-the-password"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_me_returns_the_caller(client, user_a):
    response = client.get("/api/auth/me", headers=user_a["headers"])
    assert response.status_code == 200
    assert response.json()["id"] == str(user_a["id"])


def test_me_requires_a_token(client):
    assert client.get("/api/auth/me").status_code == 401
    forged = client.get("/api/auth/me", headers={"Authorization": "Bearer nonsense"})
    assert forged.status_code == 401


def test_short_passwords_are_rejected(client):
    response = client.post(
        "/api/auth/register", json={"email": "a@example.com", "password": "short"}
    )
    assert response.status_code == 422
