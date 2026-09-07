"""A local SQLite warehouse of pre-aggregated cost facts.

Why this exists: the source is a 300 GB+ production iDempiere instance whose
`pp_order` table (4.1 M rows) carries no index on `datefinish`, `ad_org_id` or
`m_product_id`, and whose `fact_acct` table is 282 GB. A single month of feed
cost takes ~2 s to aggregate and a full year ~38 s — far too slow to serve a
dashboard interactively, and rude to a production ERP besides.

So the heavy aggregation runs once per period in `sync.py` and lands here as a
few thousand fact rows. The API then answers from SQLite in microseconds, and
the ERP sees one query per sync instead of one per page view.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Sequence

log = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "warehouse.db"

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS feed_fact (
    year         INTEGER NOT NULL,
    month        INTEGER NOT NULL,
    ad_org_id    INTEGER NOT NULL,
    category_id  INTEGER NOT NULL,
    species      TEXT    NOT NULL,
    sku_key      TEXT    NOT NULL,
    product_name TEXT    NOT NULL,
    uom          TEXT    NOT NULL,
    qty          REAL    NOT NULL,
    cost         REAL    NOT NULL,
    batches      INTEGER NOT NULL,
    PRIMARY KEY (year, month, ad_org_id, category_id, sku_key)
);
CREATE INDEX IF NOT EXISTS feed_fact_period  ON feed_fact (year, month);
CREATE INDEX IF NOT EXISTS feed_fact_species ON feed_fact (species, year, month);

CREATE TABLE IF NOT EXISTS logistics_fact (
    year      INTEGER NOT NULL,
    month     INTEGER NOT NULL,
    ad_org_id INTEGER NOT NULL,
    direction TEXT    NOT NULL,   -- inbound | outbound
    cost_line TEXT    NOT NULL,   -- transport | loading | unloading | custom_duty | other
    amount    REAL    NOT NULL,
    PRIMARY KEY (year, month, ad_org_id, direction, cost_line)
);
CREATE INDEX IF NOT EXISTS logistics_fact_period ON logistics_fact (year, month);

CREATE TABLE IF NOT EXISTS inventory_fact (
    year      INTEGER NOT NULL,
    month     INTEGER NOT NULL,
    ad_org_id INTEGER NOT NULL,
    bucket    TEXT    NOT NULL,   -- raw_material | packaging | spare_parts
    value     REAL    NOT NULL,
    PRIMARY KEY (year, month, ad_org_id, bucket)
);
CREATE INDEX IF NOT EXISTS inventory_fact_period ON inventory_fact (year, month);

-- Org names resolved at sync time, so a mill that only produced in 2022 still
-- shows its real name in the filter instead of a raw id.
CREATE TABLE IF NOT EXISTS dim_org (
    ad_org_id INTEGER PRIMARY KEY,
    name      TEXT NOT NULL
);

-- Key/value notes about the sync, e.g. the source cube's high-water mark.
CREATE TABLE IF NOT EXISTS sync_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_log (
    domain      TEXT    NOT NULL,
    year        INTEGER NOT NULL,
    rows        INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    synced_at   TEXT    NOT NULL,
    PRIMARY KEY (domain, year)
);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
    log.info("Warehouse ready at %s", DB_PATH)


# ------------------------------------------------------------------- writes


def replace_period(
    conn: sqlite3.Connection,
    table: str,
    year: int,
    columns: Sequence[str],
    rows: Iterable[Sequence[Any]],
) -> int:
    """Swap a whole year of one fact table atomically."""
    placeholders = ",".join("?" * len(columns))
    collected = list(rows)
    with conn:
        conn.execute(f"DELETE FROM {table} WHERE year = ?", (year,))
        conn.executemany(
            f"INSERT OR REPLACE INTO {table} ({','.join(columns)}) VALUES ({placeholders})",
            collected,
        )
    return len(collected)


def record_sync(conn: sqlite3.Connection, domain: str, year: int, rows: int, ms: int) -> None:
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO sync_log (domain, year, rows, duration_ms, synced_at)"
            " VALUES (?,?,?,?,?)",
            (domain, year, rows, ms, dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")),
        )


# -------------------------------------------------------------------- reads


def _query(sql: str, params: Sequence[Any] = ()) -> list[dict]:
    with connect() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


async def query(sql: str, params: Sequence[Any] = ()) -> list[dict]:
    """Run a warehouse read off the event loop."""
    return await asyncio.to_thread(_query, sql, params)


async def scalar(sql: str, params: Sequence[Any] = ()) -> Any:
    rows = await query(sql, params)
    if not rows:
        return None
    return next(iter(rows[0].values()))


async def covered_years(table: str = "feed_fact") -> list[int]:
    rows = await query(f"SELECT DISTINCT year FROM {table} ORDER BY year")
    return [r["year"] for r in rows]


async def status() -> list[dict]:
    return await query("SELECT * FROM sync_log ORDER BY domain, year DESC")


async def get_meta(key: str) -> str | None:
    rows = await query("SELECT value FROM sync_meta WHERE key = ?", [key])
    return rows[0]["value"] if rows else None


def set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?,?)", (key, str(value))
        )


async def is_empty() -> bool:
    return (await scalar("SELECT COUNT(*) FROM feed_fact")) in (0, None)
