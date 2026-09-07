"""Logistics cost reads, served from the local warehouse."""

from __future__ import annotations

from ..params import Period
from ..taxonomy import (
    LOGISTICS_DIRECTIONS,
    LOGISTICS_LINE_KEYS,
    LOGISTICS_LINES,
    RECOVERABLE_LINES,
)
from .. import warehouse

LINE_LABEL = {l["id"]: l["label"] for l in LOGISTICS_LINES}
DIRECTIONS = [d["id"] for d in LOGISTICS_DIRECTIONS]

# Lines the extractor emits that roll up into the presentation "other" bucket.
_OTHER_SOURCES = {"insurance", "lc_bank_charges", "other"}


def _line_of(raw: str) -> str | None:
    """Map an extracted cost line onto a presentation line, or None to drop it."""
    if raw in RECOVERABLE_LINES:
        return None
    if raw in LOGISTICS_LINE_KEYS:
        return raw
    return "other" if raw in _OTHER_SOURCES else "other"


def _empty_leg() -> dict:
    return {**{k: 0.0 for k in LOGISTICS_LINE_KEYS}, "total": 0.0}


def _scope(period: Period, mill: int | None) -> tuple[str, list]:
    where = "year = ?"
    args: list = [period.year]
    if period.month is not None:
        where += " AND month = ?"
        args.append(period.month)
    if mill is not None:
        where += " AND ad_org_id = ?"
        args.append(mill)
    return where, args


async def totals(period: Period, mill: int | None) -> dict:
    where, args = _scope(period, mill)

    rows = await warehouse.query(
        f"""
        SELECT direction, cost_line, SUM(amount) AS amount
        FROM logistics_fact
        WHERE {where}
        GROUP BY direction, cost_line
        """,
        args,
    )

    legs = {d: _empty_leg() for d in DIRECTIONS}
    recoverable = 0.0

    for r in rows:
        amount = r["amount"] or 0.0
        if r["cost_line"] in RECOVERABLE_LINES:
            recoverable += amount
            continue
        leg = legs.get(r["direction"])
        if leg is None:
            continue
        line = _line_of(r["cost_line"])
        if line:
            leg[line] += amount

    for leg in legs.values():
        leg["total"] = sum(leg[k] for k in LOGISTICS_LINE_KEYS)

    grand = sum(leg["total"] for leg in legs.values())

    available = {
        k: any(legs[d][k] != 0 for d in DIRECTIONS) for k in LOGISTICS_LINE_KEYS
    }

    notes: list[str] = []
    if not rows:
        notes.append(
            "No logistics cost has been synced for this period yet — "
            "run `python -m app.sync --domain logistics`."
        )
    else:
        notes.append(
            "Loading and unloading are booked together in the ledger and cannot be "
            "separated, so they are shown as one line. The at-mill wages that cover "
            "both raw-material unloading and feed loading are reported under “At mill” "
            "rather than assigned to a leg."
        )
        if recoverable:
            notes.append(
                f"Excludes {recoverable / 1e7:,.1f} crore of advance income tax and VAT "
                "on imports — these are recoverable prepayments, not logistics cost."
            )

    return {
        "period": {"year": period.year, "month": period.month},
        "inbound": legs["inbound"],
        "outbound": legs["outbound"],
        "internal": legs["internal"],
        "grand_total": grand,
        "recoverable_taxes": recoverable,
        "available": available,
        "note": " ".join(notes) if notes else None,
    }


async def trend(year: int, mill: int | None) -> dict:
    where = "year = ?"
    args: list = [year]
    if mill is not None:
        where += " AND ad_org_id = ?"
        args.append(mill)

    placeholders = ",".join("?" * len(RECOVERABLE_LINES))
    rows = await warehouse.query(
        f"""
        SELECT month, direction, SUM(amount) AS amount
        FROM logistics_fact
        WHERE {where} AND cost_line NOT IN ({placeholders})
        GROUP BY month, direction
        """,
        [*args, *RECOVERABLE_LINES],
    )

    by_month: dict[int, dict[str, float]] = {}
    for r in rows:
        by_month.setdefault(r["month"], {})[r["direction"]] = r["amount"] or 0.0

    months = [
        {
            "month": m,
            "inbound": by_month.get(m, {}).get("inbound"),
            "outbound": by_month.get(m, {}).get("outbound"),
            "internal": by_month.get(m, {}).get("internal"),
        }
        for m in range(1, 13)
    ]
    return {"year": year, "months": months}
