"""Logistics cost extraction.

Logistics lives in two separate, non-overlapping mechanisms in this instance,
and the dashboard needs both:

1. DOMESTIC — GL expense accounts under summary account 600205 "Transportation
   Expenses", read from `fact_acct`. The account itself carries the direction:
   60020501 "Carrying Expense In" is inbound, 60020502 "Carrying Expense Out" is
   outbound.

2. IMPORT LANDED COST — AP invoice lines carrying the "L-series" service
   products (custom duty, C&F, port charges, container freight, LC charges).
   These post to a balance-sheet staging account, not to 600205, so adding the
   two sources together does not double count.

Three filters are mandatory and each was verified to matter:

* `postingtype = 'A'` — `fact_acct` mixes BUDGET rows in with actuals. Without
  this, July 2026 inbound transport reads 110,972,063 instead of the true
  72,465,218: a 53% overstatement.
* `c_acctschema_id = 1000000` — four accounting schemas exist, including an
  Omani rial and a USD one.
* An explicit `ad_org_id` list — `fact_acct` is 636M rows and its only usable
  index leads on `ad_org_id`. 17 orgs takes 1.5s; all 471 takes 26s.

Direction is taken from the account/product identity, never from
`c_invoice.issotrx`: both "Carrying Expense In" and "Carrying Expense Out" are
booked on AP invoices, so issotrx would file 100% of logistics under one leg.

Loading and unloading are NOT separable. Every source object in this database
names them jointly ("Wages-Loading & Unloading", "Wages - Loading and unloading
(LC)"), so they are reported as one combined line rather than a fabricated
split. The at-the-gate wages account covers both raw-material unloading and
finished-feed loading, so it is reported as direction 'internal' rather than
being guessed into a leg.

Two corrections found by verifying against the ledger a second way:

* AP credit memos store `linenetamt` POSITIVE in this schema, so they are negated
  by `docbasetype`. Left unsigned, October 2025 import cost reads 108,084,125
  instead of the true 105,377,933.
* Account 60020504 "Packing, Posting & Shipping" is excluded despite its name.
  It is 99.997% M_Inventory issues (white bags, sewing thread, sutli rope), i.e.
  packaging material consumed out of stock — the same event the Inventory tab
  already reports from the credit side of 10050102.

KNOWN GAP: own-fleet running cost is not captured. Roughly 13 M BDT a year sits
in "Fuel Consumption-Vehicle" (s1138), vehicle rental (60013011) and vehicle
depreciation. Nothing in the data attributes it to inbound or outbound, so it is
left out rather than guessed into a leg.
"""

from __future__ import annotations

import datetime as dt
import logging
import time

from . import db, warehouse
from .taxonomy import FEED_MILL_IDS

log = logging.getLogger("kfg.sync")

# Historical mills included so past years reconcile, even though they are hidden
# from the live mill filter.
LOGISTICS_ORG_IDS = sorted(set(FEED_MILL_IDS) | {1000223, 1000509, 1000459, 1000425, 1000401})

LOGISTICS_YEAR_SQL = """
WITH gl AS (
    SELECT EXTRACT(MONTH FROM fa.dateacct)::int AS month,
           fa.ad_org_id,
           CASE fa.account_id
               WHEN 1000308 THEN 'outbound'   -- 60020502 Carrying Expense Out
               WHEN 1000231 THEN 'internal'   -- 60020503 loading & unloading at the gate
               ELSE 'inbound'
           END AS direction,
           CASE fa.account_id
               WHEN 1000307 THEN 'transport'
               WHEN 1000308 THEN 'transport'
               WHEN 1000231 THEN 'loading_unloading'
               ELSE 'other'                   -- 60019004 tolls, 50260101 demurrage
           END AS cost_line,
           SUM(fa.amtacctdr - fa.amtacctcr) AS amount
    FROM fact_acct fa
    WHERE fa.ad_org_id = ANY($1::numeric[])
      -- 60020504 "Packing, Posting & Shipping" (1000311) is deliberately NOT here.
      -- Despite the name it is 99.997% M_Inventory issues — white bags, sewing
      -- thread, inkjet ink, sutli rope — i.e. packaging material consumed out of
      -- stock, not an outbound freight bill. The Inventory tab already reports
      -- that same consumption from the credit side of 10050102, so counting it
      -- here too would double-count it across two tabs.
      AND fa.account_id IN (1000307, 1000308, 1000231, 1000339, 1001521)
      AND fa.postingtype = 'A'
      AND fa.c_acctschema_id = 1000000
      AND fa.isactive = 'Y'
      AND fa.dateacct >= $2
      AND fa.dateacct <  $3
    GROUP BY 1, 2, 3, 4
),
imp AS (
    SELECT EXTRACT(MONTH FROM i.dateacct)::int AS month,
           i.ad_org_id,
           'inbound'::text AS direction,
           CASE
               WHEN p.value IN ('L3001','L3002','L3003') THEN 'custom_duty'
               WHEN p.m_product_category_id = 1000911    THEN 'import_taxes'
               WHEN p.value IN ('L5001','L5002','L5003') THEN 'transport'
               WHEN p.value IN ('L5004','L4010')         THEN 'loading_unloading'
               WHEN p.m_product_category_id = 1000916    THEN 'clearing_port'
               WHEN p.m_product_category_id = 1000910    THEN 'insurance'
               WHEN p.m_product_category_id = 1000912    THEN 'lc_bank_charges'
               ELSE 'other'
           END AS cost_line,
           -- AP credit memos store linenetamt POSITIVE in this schema, so they
           -- must be negated or refunds inflate the cost they were reversing.
           SUM(il.linenetamt * CASE WHEN dt.docbasetype = 'APC' THEN -1 ELSE 1 END) AS amount
    FROM c_invoiceline il
    JOIN m_product p ON p.m_product_id = il.m_product_id
    JOIN c_invoice  i ON i.c_invoice_id = il.c_invoice_id
    JOIN c_doctype dt ON dt.c_doctype_id = i.c_doctype_id
    WHERE p.m_product_category_id IN (1000911, 1000916, 1000917, 1000910, 1000912)
      AND i.dateacct >= $2
      AND i.dateacct <  $3
      AND i.docstatus IN ('CO', 'CL')
      AND i.isactive = 'Y'
      AND il.isactive = 'Y'
      AND i.ad_org_id = ANY($1::numeric[])
    GROUP BY 1, 2, 3, 4
)
SELECT month, ad_org_id, direction, cost_line, SUM(amount) AS amount
FROM (SELECT * FROM gl UNION ALL SELECT * FROM imp) u
GROUP BY 1, 2, 3, 4
HAVING SUM(amount) <> 0
ORDER BY 1, 2, 3, 4
"""

LOGISTICS_COLUMNS = ("year", "month", "ad_org_id", "direction", "cost_line", "amount")


async def sync_logistics(year: int) -> int:
    start = time.monotonic()
    log.info("logistics %s: querying iDempiere…", year)

    rows = await db.fetch(
        LOGISTICS_YEAR_SQL,
        [float(o) for o in LOGISTICS_ORG_IDS],
        dt.date(year, 1, 1),
        dt.date(year + 1, 1, 1),
    )

    facts = [
        (
            year,
            r["month"],
            int(r["ad_org_id"]),
            r["direction"],
            r["cost_line"],
            float(r["amount"] or 0),
        )
        for r in rows
    ]

    conn = warehouse.connect()
    try:
        n = warehouse.replace_period(conn, "logistics_fact", year, LOGISTICS_COLUMNS, facts)
        warehouse.record_sync(
            conn, "logistics", year, n, int((time.monotonic() - start) * 1000)
        )
    finally:
        conn.close()

    log.info("logistics %s: %s fact rows in %.1fs", year, n, time.monotonic() - start)
    return n
