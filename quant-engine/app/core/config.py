"""Typed, validated configuration (Pydantic Settings). Fails fast at startup on bad config."""

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

# Host development: load the repo-root .env (with ${VAR} interpolation) without overriding
# variables already set by the container environment.
_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"
if _ROOT_ENV.exists():
    load_dotenv(_ROOT_ENV, override=False, interpolate=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    log_level: str = Field(default="info", alias="LOG_LEVEL")
    log_json: bool = Field(default=True, alias="LOG_JSON")

    worker_database_url: PostgresDsn = Field(alias="WORKER_DATABASE_URL")
    dispatcher_database_url: PostgresDsn | None = Field(default=None, alias="DISPATCHER_DATABASE_URL")
    redis_queue_url: RedisDsn = Field(alias="REDIS_QUEUE_URL")
    internal_service_token: str = Field(min_length=32, alias="INTERNAL_SERVICE_TOKEN")

    # ADR-005 timings (seconds). Production defaults; tests may shorten them.
    heartbeat_every_s: float = Field(default=15, alias="HEARTBEAT_EVERY_S")
    stale_after_s: float = Field(default=90, alias="STALE_AFTER_S")
    reaper_every_s: float = Field(default=30, alias="REAPER_EVERY_S")
    lost_message_after_s: float = Field(default=600, alias="LOST_MESSAGE_AFTER_S")
    visibility_timeout_s: int = Field(default=7200, alias="VISIBILITY_TIMEOUT_S")
    dispatch_backoff_base_s: float = Field(default=2, alias="DISPATCH_BACKOFF_BASE_S")
    max_dispatch_attempts: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


def sqlalchemy_url(dsn: PostgresDsn) -> str:
    return str(dsn).replace("postgresql://", "postgresql+psycopg://", 1)
