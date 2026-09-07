"""Inventory cost extraction.

Bucket classification comes from the ERP's own general ledger, not from a
name regex. `M_Product_Category_Acct.P_Asset_Acct` maps every product category
to an inventory account, and three of those accounts are exactly the three
buckets the dashboard needs:

    1001548  10050101  Inventories- Raw Materials     (42 categories, 533 products)
    1001549  10050102  Inventories- Packing Materials ( 8 categories, 323 products)
    1001555  10050502  Inventories- Spares            (176 categories, 30,822 products)

A name heuristic gets roughly 90% of the way but misses 40 spares categories
that are not named "Spares" (BIG Dutchman FMCFS, E/C System, Lab Equipment) and
wrongly sweeps Medicine and Vaccine into raw materials — the GL puts those in a
separate account entirely.

The figure reported is the MONTHLY FLOW (material consumed), not a stock
snapshot. Two reasons: a month-by-month chart wants a flow, and the GL stock
balance for raw materials does not reconcile to physical stock (2,650 crore GL
vs 1,320 crore physical) because ~56% of maize issues route through WIP.
Consumption is stable month to month while receipts are violently seasonal
(the maize harvest makes June receipts 925 crore against a 200 crore norm), so
consumption is the honest primary series.

Source is `fact_acct_balance_kfg`, a KFG-custom month-end pre-aggregation of
`fact_acct`. It reproduces `fact_acct` to the paisa but is indexed such that a
month slice costs ~1.5s instead of ~14s. Two traps:

* `ad_table_id <> 323` is mandatory. Table 323 is M_Movement — inter-org stock
  transfers that post debit and credit in identical amounts (406 crore each way
  in July 2026). Leaving them in roughly triples both figures with pure
  internal churn.
* Rows are stamped at the LAST DAY of their month, so a `>= first_of_month`
  predicate silently returns nothing.

Verified rather than assumed: for August 2026 the credits on the raw-material
account break down as 292.33 crore from Manufacturing Cost Collector (material
issued to feed production), 2.09 crore of physical-inventory adjustment, and
580.53 crore of Inventory Move. Excluding table 323 is therefore right *for
consumption* — those moves are stock changing hands between orgs, not material
consumed. (The same exclusion would badly understate *receipts* per org, which
is why this module reports consumption only.)

`fact_acct_balance_kfg` is a refreshed snapshot, not a live view. The sync
records its high-water mark so the dashboard can say when the cube is behind.
"""

from __future__ import annotations

import calendar
import datetime as dt
import logging
import time

from . import db, warehouse

log = logging.getLogger("kfg.sync")

BUCKET_ACCOUNTS = {
    1001548: "raw_material",
    1001549: "packaging",
    1001555: "spare_parts",
}

INVENTORY_YEAR_SQL = """
SELECT EXTRACT(MONTH FROM f.dateacct)::int AS month,
       f.ad_org_id,
       f.account_id,
       SUM(f.amtacctcr) AS consumed,
       SUM(f.amtacctdr) AS received
FROM fact_acct_balance_kfg f
WHERE f.account_id = ANY($1::int[])
  AND (f.dateacct)::date >= $2
  AND (f.dateacct)::date <= $3
  AND f.ad_table_id <> 323
GROUP BY 1, 2, 3
HAVING SUM(f.amtacctcr) <> 0
ORDER BY 1, 2, 3
"""

INVENTORY_COLUMNS = ("year", "month", "ad_org_id", "bucket", "value")

# The cube carries forward-dated rows out to 2027, so its raw MAX(dateacct) says
# nothing about freshness. Ask instead for the newest month-end that is not in
# the future and actually carries inventory postings.
FRESHNESS_SQL = """
SELECT MAX((f.dateacct)::date)
FROM fact_acct_balance_kfg f
WHERE f.account_id = ANY($1::int[])
  AND (f.dateacct)::date <= CURRENT_DATE
  AND f.amtacctcr <> 0
"""


async def sync_inventory(year: int) -> int:
    start = time.monotonic()
    log.info("inventory %s: querying iDempiere…", year)

    # Rows are month-end stamped, so bound the window on month-end dates.
    first_end = dt.date(year, 1, calendar.monthrange(year, 1)[1])
    last_end = dt.date(year, 12, 31)

    rows = await db.fetch(
        INVENTORY_YEAR_SQL, list(BUCKET_ACCOUNTS), first_end, last_end
    )

    facts = [
        (
            year,
            r["month"],
            int(r["ad_org_id"]),
            BUCKET_ACCOUNTS[int(r["account_id"])],
            float(r["consumed"] or 0),
        )
        for r in rows
        if int(r["account_id"]) in BUCKET_ACCOUNTS
    ]

    cube_max = await db.fetchval(FRESHNESS_SQL, list(BUCKET_ACCOUNTS))

    conn = warehouse.connect()
    try:
        n = warehouse.replace_period(conn, "inventory_fact", year, INVENTORY_COLUMNS, facts)
        if cube_max:
            warehouse.set_meta(conn, "inventory_cube_max_date", cube_max.isoformat())
        warehouse.record_sync(
            conn, "inventory", year, n, int((time.monotonic() - start) * 1000)
        )
    finally:
        conn.close()

    log.info("inventory %s: %s fact rows in %.1fs", year, n, time.monotonic() - start)
    return n
