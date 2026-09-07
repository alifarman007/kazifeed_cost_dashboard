"""ETL: pull cost aggregates from iDempiere into the local warehouse.

Run it directly:

    python -m app.sync              # every year that has data
    python -m app.sync --year 2026  # one year
    python -m app.sync --years 2025 2026 --domain feed

A year of feed costs takes ~40 s to aggregate at source and lands as ~2,000
rows, so a full five-year backfill is a few minutes and then the dashboard is
instant. Re-running a year replaces it atomically.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import logging
import time

from . import db, extract, warehouse
from .taxonomy import (
    DUCK_OVERRIDE_VALUES,
    EXCLUDED_PRODUCT_VALUES,
    FEED_CATEGORY_GROUP,
    FEED_CATEGORY_IDS,
)

log = logging.getLogger("kfg.sync")

FEED_COLUMNS = (
    "year", "month", "ad_org_id", "category_id", "species",
    "sku_key", "product_name", "uom", "qty", "cost", "batches",
)


def _species(category_id: int, sample_value: str) -> str:
    """Species group, with the Duck miscategorisation corrected."""
    if sample_value in DUCK_OVERRIDE_VALUES:
        return "duck"
    return FEED_CATEGORY_GROUP.get(category_id, "other")


async def sync_feed(year: int) -> int:
    start = time.monotonic()
    log.info("feed %s: querying iDempiere (this takes ~40s)…", year)

    rows = await db.fetch(
        extract.FEED_YEAR_SQL,
        FEED_CATEGORY_IDS,
        list(EXCLUDED_PRODUCT_VALUES),
        dt.date(year, 1, 1),
        dt.date(year + 1, 1, 1),
    )

    facts = [
        (
            year,
            r["month"],
            r["ad_org_id"],
            r["category_id"],
            _species(r["category_id"], r["sample_value"] or ""),
            r["sku_key"],
            r["product_name"],
            r["uom"],
            float(r["qty"] or 0),
            float(r["cost"] or 0),
            int(r["batches"] or 0),
        )
        for r in rows
    ]

    org_ids = sorted({r["ad_org_id"] for r in rows})
    orgs = await db.fetch(extract.ORG_NAMES_SQL, org_ids) if org_ids else []

    conn = warehouse.connect()
    try:
        n = warehouse.replace_period(conn, "feed_fact", year, FEED_COLUMNS, facts)
        with conn:
            conn.executemany(
                "INSERT OR REPLACE INTO dim_org (ad_org_id, name) VALUES (?,?)",
                [(o["ad_org_id"], o["name"]) for o in orgs],
            )
        ms = int((time.monotonic() - start) * 1000)
        warehouse.record_sync(conn, "feed", year, n, ms)
    finally:
        conn.close()

    log.info("feed %s: %s fact rows in %.1fs", year, n, (time.monotonic() - start))
    return n


async def available_years() -> list[int]:
    row = await db.fetchrow(extract.FEED_RANGE_SQL, FEED_CATEGORY_IDS)
    if not row or not row["min_date"]:
        return []
    return list(range(row["min_date"].year, row["max_date"].year + 1))


async def run(years: list[int] | None, domains: set[str]) -> None:
    warehouse.init()
    await db.connect()
    try:
        targets = years or await available_years()
        log.info("Syncing %s for years %s", ", ".join(sorted(domains)), targets)

        for year in targets:
            if "feed" in domains:
                await sync_feed(year)
            if "logistics" in domains:
                from .extract_logistics import sync_logistics

                await sync_logistics(year)
            if "inventory" in domains:
                from .extract_inventory import sync_inventory

                await sync_inventory(year)
    finally:
        await db.disconnect()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s"
    )
    ap = argparse.ArgumentParser(description="Sync iDempiere cost facts into the warehouse")
    ap.add_argument("--year", type=int, help="A single year to sync")
    ap.add_argument("--years", type=int, nargs="+", help="Several years to sync")
    ap.add_argument(
        "--domain",
        choices=["feed", "logistics", "inventory", "all"],
        default="all",
        help="Which fact table to refresh",
    )
    args = ap.parse_args()

    years = args.years or ([args.year] if args.year else None)
    domains = {"feed", "logistics", "inventory"} if args.domain == "all" else {args.domain}

    asyncio.run(run(years, domains))


if __name__ == "__main__":
    main()
