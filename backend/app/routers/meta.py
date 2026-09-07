"""Dashboard bootstrap: what periods, mills and groups actually have data."""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter

from .. import warehouse
from ..cache import cached
from ..taxonomy import (
    FEED_GROUPS,
    FEED_MILL_LABEL,
    INVENTORY_BUCKETS,
    LOGISTICS_LINES,
)

router = APIRouter()


@router.get("/meta")
@cached("meta")
async def meta() -> dict:
    """Everything the frontend needs to render its filters before any chart loads.

    Years and mills come from what the warehouse actually holds, so the dropdowns
    can never offer a period that returns an empty chart.
    """
    years = await warehouse.covered_years("feed_fact")

    # Prefer the curated label, fall back to the org name captured at sync time.
    mill_rows = await warehouse.query(
        """
        SELECT f.ad_org_id, o.name
        FROM (SELECT DISTINCT ad_org_id FROM feed_fact) f
        LEFT JOIN dim_org o ON o.ad_org_id = f.ad_org_id
        """
    )
    mills = [
        {
            "id": str(r["ad_org_id"]),
            "label": FEED_MILL_LABEL.get(r["ad_org_id"])
            or r["name"]
            or f"Org {r['ad_org_id']}",
        }
        for r in mill_rows
    ]
    mills.sort(key=lambda m: m["label"])

    groups_present = {
        r["species"]
        for r in await warehouse.query("SELECT DISTINCT species FROM feed_fact")
    }

    rng = await warehouse.query(
        "SELECT MIN(year) AS y0, MAX(year) AS y1 FROM feed_fact"
    )
    y0 = rng[0]["y0"] if rng and rng[0]["y0"] else None
    y1 = rng[0]["y1"] if rng and rng[0]["y1"] else None

    latest = await warehouse.query(
        "SELECT year, MAX(month) AS m FROM feed_fact WHERE year = (SELECT MAX(year) FROM feed_fact) GROUP BY year"
    )
    default_year = latest[0]["year"] if latest else dt.date.today().year
    default_month = latest[0]["m"] if latest else dt.date.today().month

    # The newest month is usually mid-collection, so default one month back when
    # there is a completed month to show instead.
    if latest and default_month > 1:
        default_month -= 1

    min_month = await warehouse.scalar(
        "SELECT MIN(month) FROM feed_fact WHERE year = ?", [y0]
    ) if y0 else None
    max_month = await warehouse.scalar(
        "SELECT MAX(month) FROM feed_fact WHERE year = ?", [y1]
    ) if y1 else None

    return {
        "currency": "BDT",
        "currency_symbol": "৳",
        "years": sorted(years, reverse=True),
        "default_year": default_year,
        "default_month": default_month,
        "mills": mills,
        "feed_groups": [
            {"key": g["key"], "label": g["label"], "category_ids": []}
            for g in FEED_GROUPS
            if g["key"] in groups_present
        ],
        "inventory_buckets": INVENTORY_BUCKETS,
        "logistics_categories": LOGISTICS_LINES,
        "data_range": {
            "min": f"{y0}-{min_month:02d}" if y0 and min_month else "—",
            "max": f"{y1}-{max_month:02d}" if y1 and max_month else "—",
        },
        "warehouse": await warehouse.status(),
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
