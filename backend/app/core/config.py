"""Settings, per AD-15: every value arrives from the environment, nothing has a working default."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# app/core/config.py -> app -> backend -> repository root, where .env and docker-compose live.
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Anchored to the repository, so the API behaves the same whether it is started
        # from backend/, from the root, or from inside a container.
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # No default: a missing DATABASE_URL fails startup rather than pointing somewhere surprising.
    database_url: PostgresDsn
    secret_key: str = Field(min_length=32)
    access_token_ttl_minutes: int = Field(default=60, gt=0)
    cors_origins: str = ""

    @field_validator("secret_key")
    @classmethod
    def _reject_placeholder_secret(cls, v: str) -> str:
        # A secret that looks like the one shipped in .env.example is not a secret.
        if v.strip().lower() in {"changeme", "change_me", "secret", "placeholder"}:
            raise ValueError("SECRET_KEY is a placeholder; generate a real one")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sqlalchemy_url(self) -> str:
        return str(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
