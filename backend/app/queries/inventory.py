"""Inventory cost reads, served from the local warehouse."""

from __future__ import annotations

import datetime as dt

from ..params import Period
from ..taxonomy import INVENTORY_BUCKETS
from .. import warehouse
from ..extract_logistics import LOGISTICS_ORG_IDS as MILL_ORG_IDS

BUCKET_LABEL = {b["id"]: b["label"] for b in INVENTORY_BUCKETS}

# The figure is a within-period flow (material consumed), not a stock snapshot.
# The GL stock balance for raw materials does not reconcile to physical stock
# because roughly 56% of maize issues route through WIP, so a balance would be
# misleading; consumption is stable and reconciles.
BASIS = "consumption"


def _scope(period: Period, mill: int | None, month: int | None = None) -> tuple[str, list]:
    """Scope to the feed mills, matching the Feed and Logistics tabs.

    The inventory cube covers all 295 group orgs. Raw material is 99.9% consumed
    at the mills anyway, but packaging and spares are largely consumed at farms
    and hatcheries — so without this the mill filter would mean something
    different on this tab than on the others.
    """
    where = "year = ?"
    args: list = [period.year]

    m = month if month is not None else period.month
    if m is not None:
        where += " AND month = ?"
        args.append(m)

    if mill is not None:
        where += " AND ad_org_id = ?"
        args.append(mill)
    else:
        where += f" AND ad_org_id IN ({','.join('?' * len(MILL_ORG_IDS))})"
        args.extend(MILL_ORG_IDS)

    return where, args


def _is_partial(period: Period) -> bool:
    """The current calendar month is still being posted."""
    today = dt.date.today()
    return period.month is not None and period.year == today.year and period.month == today.month


async def _cube_note(period: Period) -> str | None:
    """Warn when the period runs past the source cube's high-water mark.

    `fact_acct_balance_kfg` is a refreshed snapshot, not a live view, so a month
    beyond its last refresh reads as near-zero rather than as missing.
    """
    raw = await warehouse.get_meta("inventory_cube_max_date")
    if not raw or period.month is None:
        return None
    try:
        cube_max = dt.date.fromisoformat(raw)
    except ValueError:
        return None
    if dt.date(period.year, period.month, 1) > cube_max.replace(day=1):
        return (
            f"The source inventory cube was last refreshed through "
            f"{cube_max:%B %Y}, so this period has little or no data yet."
        )
    return None


async def totals(period: Period, mill: int | None) -> dict:
    where, args = _scope(period, mill)

    rows = await warehouse.query(
        f"SELECT bucket, SUM(value) AS value FROM inventory_fact WHERE {where} GROUP BY bucket",
        args,
    )
    by_bucket = {r["bucket"]: (r["value"] or 0.0) for r in rows}
    total = sum(by_bucket.values())

    prev = period.previous()
    prev_where, prev_args = _scope(prev, mill)
    prev_total = await warehouse.scalar(
        f"SELECT SUM(value) FROM inventory_fact WHERE {prev_where}", prev_args
    )

    notes = [
        "Material consumed during the period, scoped to the feed mills — "
        "the same org scope as the Feed and Logistics tabs."
    ]
    if _is_partial(period):
        notes.append("This month is still being posted, so the figure is partial.")
    stale = await _cube_note(period)
    if stale:
        notes.append(stale)

    return {
        "period": {"year": period.year, "month": period.month},
        "basis": BASIS,
        "partial": _is_partial(period),
        "note": " ".join(notes),
        "buckets": [
            {
                "key": b["id"],
                "label": b["label"],
                "value": by_bucket.get(b["id"], 0.0),
                "share": (by_bucket.get(b["id"], 0.0) / total * 100) if total else 0.0,
            }
            for b in INVENTORY_BUCKETS
        ],
        "total": total,
        "prev_total": prev_total,
    }


async def trend(year: int, mill: int | None) -> dict:
    where, args = _scope(Period(year, None), mill)

    rows = await warehouse.query(
        f"SELECT month, bucket, SUM(value) AS value FROM inventory_fact WHERE {where} GROUP BY month, bucket",
        args,
    )
    by_month: dict[int, dict[str, float]] = {}
    for r in rows:
        by_month.setdefault(r["month"], {})[r["bucket"]] = r["value"] or 0.0

    today = dt.date.today()
    months = [
        {
            "month": m,
            "raw_material": by_month.get(m, {}).get("raw_material"),
            "packaging": by_month.get(m, {}).get("packaging"),
            "spare_parts": by_month.get(m, {}).get("spare_parts"),
            "partial": year == today.year and m == today.month,
        }
        for m in range(1, 13)
    ]
    return {"year": year, "basis": BASIS, "months": months}
