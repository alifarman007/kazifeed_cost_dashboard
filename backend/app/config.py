"""Application settings, loaded from environment / .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    pghost: str = "172.16.253.172"
    pgport: int = 5555
    pguser: str = "adempiere"
    # No default: the ERP password must come from the environment or .env, never
    # from a file that is committed. This repo has a public remote.
    pgpassword: str = ""
    pgdatabase: str = "kfg_idempiere"

    db_pool_min: int = 2
    db_pool_max: int = 10
    db_statement_timeout_ms: int = 60_000

    cache_ttl: int = 900

    cors_origins: str = "http://localhost:3000"

    @property
    def dsn(self) -> str:
        return (
            f"postgresql://{self.pguser}:{self.pgpassword}"
            f"@{self.pghost}:{self.pgport}/{self.pgdatabase}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
