"""Test bootstrap.

Tests run against **real Postgres** on a throwaway database created and dropped per run.
There is deliberately no SQLite path: SQLite has no row-level security, so every assertion
in ``test_isolation.py`` would pass against it while proving nothing (AD-24).

The database URLs are rewritten *before* the application is imported, so the app's engine
is built against the test database.
"""

import os
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
TEST_DB = "minimalbudget_test"


def _read_dotenv() -> dict[str, str]:
    path = REPO_ROOT / ".env"
    if not path.exists():
        raise RuntimeError(
            f"{path} not found. Copy .env.example to .env and fill it in before running tests."
        )
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def _swap_database(url: str, database: str) -> str:
    base, _, _ = url.rpartition("/")
    return f"{base}/{database}"


_env = _read_dotenv()
ADMIN_URL = _env["MIGRATION_DATABASE_URL"]
OWNER_TEST_URL = _swap_database(ADMIN_URL, TEST_DB)
APP_TEST_URL = _swap_database(_env["DATABASE_URL"], TEST_DB)

# Environment variables win over the .env file in pydantic-settings, so this is what the
# application will read when it is imported below.
os.environ["DATABASE_URL"] = APP_TEST_URL
os.environ["MIGRATION_DATABASE_URL"] = OWNER_TEST_URL
# The suite registers users freely, the way a local instance does. Invite-only behaviour
# has its own tests, which set the mode explicitly rather than relying on this.
os.environ["REGISTRATION_MODE"] = "open"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _test_database() -> Iterator[None]:
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
    admin.dispose()

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    command.upgrade(cfg, "head")

    yield

    from app.core.db import engine as app_engine

    app_engine.dispose()
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)'))
    admin.dispose()


@pytest.fixture(scope="session")
def owner_engine():
    """Connected as the schema owner. For inspecting and truncating, never for app behaviour."""
    engine = create_engine(OWNER_TEST_URL, future=True)
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables(owner_engine):
    yield
    with owner_engine.begin() as conn:
        tables = conn.execute(
            text(
                "SELECT tablename FROM pg_tables "
                "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
            )
        ).scalars().all()
        if tables:
            joined = ", ".join(f'"{t}"' for t in tables)
            conn.execute(text(f"TRUNCATE {joined} RESTART IDENTITY CASCADE"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def runtime_connection():
    """A connection **as the runtime role**, optionally pinned to a tenant.

    This is what makes the isolation tests mean something: they exercise the same role,
    with the same privileges and the same policies, that the running API uses.
    """
    from app.core.db import engine

    def _connect(user_id: uuid.UUID | None):
        conn = engine.connect()
        if user_id is not None:
            conn.execute(
                text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(user_id)}
            )
        return conn

    return _connect


def register_user(
    client: TestClient, email: str, password: str = "correct-horse-battery"
) -> dict:
    """Register and log in, returning ids, headers and the raw responses' useful bits."""
    created = client.post("/api/auth/register", json={"email": email, "password": password})
    assert created.status_code == 201, created.text
    token = client.post("/api/auth/login", json={"email": email, "password": password})
    assert token.status_code == 200, token.text
    access = token.json()["access_token"]
    return {
        "id": uuid.UUID(created.json()["id"]),
        "email": created.json()["email"],
        "password": password,
        "headers": {"Authorization": f"Bearer {access}"},
    }


@pytest.fixture
def user_a(client: TestClient) -> dict:
    return register_user(client, "alice@example.com")


@pytest.fixture
def user_b(client: TestClient) -> dict:
    return register_user(client, "bob@example.com")
