"""Feed cost reads, served from the local warehouse."""

from __future__ import annotations

import datetime as dt

from ..params import Period
from ..taxonomy import CHART_TOP_N, FEED_GROUPS, FEED_GROUP_LABEL, GROUPS_NEEDING_ROLLUP
from .. import warehouse


def _period_clause(period: Period, alias: str = "") -> tuple[str, list]:
    p = f"{alias}." if alias else ""
    sql = f"{p}year = ?"
    args: list = [period.year]
    if period.month is not None:
        sql += f" AND {p}month = ?"
        args.append(period.month)
    return sql, args


def _mill_clause(mill: int | None, alias: str = "") -> tuple[str, list]:
    if mill is None:
        return "", []
    p = f"{alias}." if alias else ""
    return f" AND {p}ad_org_id = ?", [mill]


async def products(period: Period, species: str, mill: int | None) -> dict:
    """Cost per feed product for the selected period.

    Groups with a long tail (Fish, Breeder) are capped at the top N by cost and
    the remainder folded into a single "Others" bar — never a generated colour,
    and the full list stays available in the table view.
    """
    where, args = _period_clause(period)
    mill_sql, mill_args = _mill_clause(mill)

    rows = await warehouse.query(
        f"""
        SELECT sku_key,
               product_name,
               uom,
               SUM(qty)     AS qty,
               SUM(cost)    AS cost,
               SUM(batches) AS batches,
               COUNT(DISTINCT ad_org_id) AS mills
        FROM feed_fact
        WHERE {where} AND species = ?{mill_sql}
        GROUP BY sku_key, product_name, uom
        HAVING SUM(cost) > 0
        ORDER BY cost DESC
        """,
        [*args, species, *mill_args],
    )

    # Long-tailed groups (Fish, Breeder) roll their tail into a single "Others"
    # bar rather than dropping it. The chart then still sums to the true total,
    # and the tail keeps one colour instead of inventing new hues.
    truncated = 0
    if species in GROUPS_NEEDING_ROLLUP and len(rows) > CHART_TOP_N:
        head, tail = rows[:CHART_TOP_N], rows[CHART_TOP_N:]
        truncated = len(tail)
        rows = head + [
            {
                "sku_key": "__others__",
                "product_name": f"Others ({truncated} products)",
                "uom": head[0]["uom"] if head else "Kilogram",
                "qty": sum(t["qty"] for t in tail),
                "cost": sum(t["cost"] for t in tail),
                "batches": sum(t["batches"] for t in tail),
                "mills": max((t["mills"] for t in tail), default=0),
            }
        ]

    total_cost = sum(r["cost"] for r in rows)
    total_qty = sum(r["qty"] for r in rows)

    return {
        "period": {"year": period.year, "month": period.month},
        "group": species,
        "basis_note": (
            "Loose (bulk) production valued at batch cost. Bagging is a separate "
            "production step, so this is feed manufacturing cost — about 1.1% below "
            "fully-packaged COGS, which adds roughly ৳3 crore a month of sacks and "
            "bagging overhead across all groups."
        ),
        "total_cost": total_cost,
        "total_qty": total_qty,
        "avg_rate": (total_cost / total_qty) if total_qty else None,
        "truncated": truncated,
        "rows": [
            {
                "product_code": r["sku_key"],
                "product_name": r["product_name"],
                "uom": r["uom"],
                "qty": r["qty"],
                "cost": r["cost"],
                "rate": (r["cost"] / r["qty"]) if r["qty"] else None,
                "orders": r["batches"],
                "mills": r["mills"],
            }
            for r in rows
        ],
    }


async def trend(year: int, species: str, mill: int | None) -> dict:
    """A full twelve-month series, with absent months returned as null."""
    mill_sql, mill_args = _mill_clause(mill)
    rows = await warehouse.query(
        f"""
        SELECT month, SUM(qty) AS qty, SUM(cost) AS cost
        FROM feed_fact
        WHERE year = ? AND species = ?{mill_sql}
        GROUP BY month
        """,
        [year, species, *mill_args],
    )
    by_month = {r["month"]: r for r in rows}

    today = dt.date.today()
    months = []
    for m in range(1, 13):
        r = by_month.get(m)
        qty = r["qty"] if r else None
        cost = r["cost"] if r else None
        months.append(
            {
                "month": m,
                "qty": qty,
                "cost": cost,
                "rate": (cost / qty) if (cost and qty) else None,
                # The running month is only partly posted; a short bar there is
                # an artefact of the calendar, not a fall in production.
                "partial": year == today.year and m == today.month,
            }
        )

    return {"year": year, "group": species, "months": months}


async def summary(period: Period, mill: int | None) -> dict:
    """Headline totals plus a per-group breakdown, with a comparison period."""
    where, args = _period_clause(period)
    mill_sql, mill_args = _mill_clause(mill)

    rows = await warehouse.query(
        f"""
        SELECT species, SUM(qty) AS qty, SUM(cost) AS cost
        FROM feed_fact
        WHERE {where}{mill_sql}
        GROUP BY species
        """,
        [*args, *mill_args],
    )
    by_species = {r["species"]: r for r in rows}

    prev = period.previous()
    prev_where, prev_args = _period_clause(prev)
    prev_cost = await warehouse.scalar(
        f"SELECT SUM(cost) FROM feed_fact WHERE {prev_where}{mill_sql}",
        [*prev_args, *mill_args],
    )

    total_cost = sum(r["cost"] for r in rows)
    total_qty = sum(r["qty"] for r in rows)

    groups = [
        {
            "key": g["key"],
            "label": g["label"],
            "cost": by_species.get(g["key"], {}).get("cost", 0.0) or 0.0,
            "qty": by_species.get(g["key"], {}).get("qty", 0.0) or 0.0,
        }
        for g in FEED_GROUPS
        if g["key"] in by_species
    ]

    return {
        "period": {"year": period.year, "month": period.month},
        "total_cost": total_cost,
        "prev_cost": prev_cost,
        "total_qty": total_qty,
        "avg_rate": (total_cost / total_qty) if total_qty else None,
        "groups": sorted(groups, key=lambda g: g["cost"], reverse=True),
    }


async def mills_for_period(period: Period) -> list[int]:
    where, args = _period_clause(period)
    rows = await warehouse.query(
        f"SELECT DISTINCT ad_org_id FROM feed_fact WHERE {where}", args
    )
    return [r["ad_org_id"] for r in rows]
