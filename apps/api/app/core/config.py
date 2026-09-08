"""Typed, validated settings. Nothing in the app reads os.environ directly."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"), extra="ignore", case_sensitive=False
    )

    environment: Literal["development", "staging", "production"] = "development"
    service_name: str = "eog-api"

    database_url: PostgresDsn
    database_migration_url: PostgresDsn | None = None
    database_pool_size: int = 10
    database_max_overflow: int = 5
    database_statement_timeout_ms: int = 5_000

    # Origin serving the immutable, content-hashed game bundles. Every asset URL
    # in a manifest is built from this.
    cdn_base_url: str = "http://localhost:8000/cdn"
    # Development only: where `skin-baker publish --backend local` wrote its
    # objects. Ignored in production, where assets come from object storage.
    dev_cdn_root: str = "cdn"

    # NoDecode: pydantic-settings JSON-decodes complex types straight out of the
    # dotenv source, which would reject a plain comma-separated list before the
    # validator below ever runs.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    internal_api_key: str = Field(min_length=16)

    log_level: str = "INFO"
    log_format: Literal["console", "json"] = "console"
    sentry_dsn: str | None = None
    otel_exporter_otlp_endpoint: str | None = None

    # Prefetch policy — mirrors packages/prefetch-core/src/policy.ts. Both sides
    # read these from the /v1/prefetch/policy response so they can never diverge.
    policy_half_life_days: float = 7.0
    policy_popularity_weight: float = 0.35
    policy_stickiness: float = 0.15
    policy_max_games: int = 8

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
