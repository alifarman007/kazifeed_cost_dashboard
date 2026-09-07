"""asyncpg connection pool and query helpers.

The dashboard is strictly read-only against the iDempiere database: every
connection is opened in read-only mode and carries a statement timeout so a
runaway aggregate can never pin a production ERP backend.
"""

from __future__ import annotations

import logging
from typing import Any

import asyncpg

from .config import get_settings

log = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    settings = get_settings()
    await conn.execute(
        f"SET statement_timeout = {int(settings.db_statement_timeout_ms)}"
    )
    # Belt and braces: the dashboard must never write to the ERP.
    await conn.execute("SET default_transaction_read_only = on")
    # NUMERIC columns arrive as Decimal by default; the API serialises floats.
    await conn.set_type_codec(
        "numeric",
        encoder=str,
        decoder=lambda v: float(v) if v is not None else None,
        schema="pg_catalog",
        format="text",
    )


async def connect() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        settings = get_settings()
        log.info("Opening pool to %s:%s/%s", settings.pghost, settings.pgport, settings.pgdatabase)
        _pool = await asyncpg.create_pool(
            dsn=settings.dsn,
            min_size=settings.db_pool_min,
            max_size=settings.db_pool_max,
            init=_init_connection,
            command_timeout=settings.db_statement_timeout_ms / 1000,
        )
    return _pool


async def disconnect() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialised")
    return _pool


async def fetch(sql: str, *args: Any) -> list[dict[str, Any]]:
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [dict(r) for r in rows]


async def fetchrow(sql: str, *args: Any) -> dict[str, Any] | None:
    async with pool().acquire() as conn:
        row = await conn.fetchrow(sql, *args)
    return dict(row) if row else None


async def fetchval(sql: str, *args: Any) -> Any:
    async with pool().acquire() as conn:
        return await conn.fetchval(sql, *args)
