"""Source-of-truth extraction SQL against the iDempiere database.

Only `sync.py` runs these — the API never touches Postgres on a page view.

FEED COSTING NOTES
------------------
Feed is manufactured through `pp_order`, and its cost is carried by
`pp_cost_collector` rows of type '100' (the finished-goods receipt) joined to
`m_costdetail`. That is the same basis the existing BatchCostSummaryReport.jasper
uses for its `stdrate` column.

Two things make this query correct rather than merely plausible:

1. Only LOOSE products count. A product value ending in 'L' is the loose (bulk)
   milled feed; the same code without the L is the bagged repack, whose bill of
   materials literally consumes the loose product plus a bag. Summing both would
   double-count every kilogram of feed. Verified on GJ1055 -> GJ1055L + 68002.

2. Quantity and cost must be aggregated separately. Each cost collector has many
   `m_costdetail` rows (one per cost element), so summing `movementqty` across
   that join inflates quantity roughly threefold. Cost is summed over the detail
   rows; quantity is summed over the collectors, and the two are joined 1:1.

The query drives from `pp_cost_collector`, which is indexed on
`(movementdate::date)` and on `m_product_id` — unlike `pp_order`, which has no
usable index and forces a 3 s sequential scan. Cross-checked against the
pp_order-driven form: both return 691,747,129.7704 kg and 34,468,167,212.62 BDT
for FY2025, to the last decimal.
"""

from __future__ import annotations

FEED_YEAR_SQL = """
WITH prod AS (
    SELECT p.m_product_id,
           p.m_product_category_id,
           p.value,
           p.name,
           u.name AS uom,
           -- Strip the 2-letter mill prefix and the trailing L so the same
           -- recipe made at seven mills collapses to one SKU key.
           regexp_replace(regexp_replace(p.value, '^[A-Z]{2}', ''), 'L$', '') AS sku_key
    FROM m_product p
    JOIN c_uom u ON u.c_uom_id = p.c_uom_id
    WHERE p.m_product_category_id = ANY($1::int[])
      AND p.value ~ 'L$'
      AND p.value <> ALL($2::text[])
),
cc AS (
    SELECT c.pp_cost_collector_id,
           c.ad_org_id,
           c.m_product_id,
           c.movementqty,
           EXTRACT(MONTH FROM c.movementdate)::int AS mth
    FROM pp_cost_collector c
    WHERE c.costcollectortype = '100'
      AND (c.movementdate)::date >= $3
      AND (c.movementdate)::date <  $4
      AND c.docstatus IN ('CO', 'CL')
      AND c.m_product_id IN (SELECT m_product_id FROM prod)
),
cd AS (
    SELECT d.pp_cost_collector_id, SUM(d.amt) AS amt
    FROM m_costdetail d
    WHERE d.pp_cost_collector_id IN (SELECT pp_cost_collector_id FROM cc)
      -- Today every cost-collector row posts to schema 1000000 (BDT), but four
      -- accounting schemas exist including OMR and USD ones. Pinning the schema
      -- costs nothing and stops a future Oman rollout silently mixing currencies.
      AND d.c_acctschema_id = 1000000
    GROUP BY 1
)
SELECT cc.mth                                AS month,
       cc.ad_org_id,
       pr.m_product_category_id              AS category_id,
       pr.sku_key,
       -- Mills name the same recipe with and without a trailing " Loose";
       -- normalise so one SKU shows one name.
       MIN(regexp_replace(pr.name, '\\s*(\\(B\\))?\\s*Loose$', ''))  AS product_name,
       MIN(pr.value)                         AS sample_value,
       MIN(pr.uom)                           AS uom,
       COUNT(*)                              AS batches,
       SUM(cc.movementqty)                   AS qty,
       SUM(COALESCE(cd.amt, 0))              AS cost
FROM cc
JOIN prod pr ON pr.m_product_id = cc.m_product_id
LEFT JOIN cd ON cd.pp_cost_collector_id = cc.pp_cost_collector_id
GROUP BY 1, 2, 3, 4
HAVING SUM(cc.movementqty) <> 0 OR SUM(COALESCE(cd.amt, 0)) <> 0
ORDER BY 1, 2, 3
"""

# Which products carry the Duck override — resolved at sync time so the species
# mapping stays a pure function of data already fetched.
DUCK_PRODUCTS_SQL = """
SELECT value FROM m_product WHERE value = ANY($1::text[])
"""

ORG_NAMES_SQL = """
SELECT ad_org_id, name FROM ad_org WHERE ad_org_id = ANY($1::int[])
"""

CURRENCY_SQL = """
SELECT c.iso_code, c.cursymbol, c.description
FROM c_acctschema s
JOIN c_currency c ON c.c_currency_id = s.c_currency_id
WHERE s.ad_client_id = (SELECT MAX(ad_client_id) FROM ad_client WHERE ad_client_id > 0)
LIMIT 1
"""

FEED_RANGE_SQL = """
SELECT MIN((c.movementdate)::date) AS min_date,
       MAX((c.movementdate)::date) AS max_date
FROM pp_cost_collector c
WHERE c.costcollectortype = '100'
  AND c.m_product_id IN (
      SELECT p.m_product_id FROM m_product p
      WHERE p.m_product_category_id = ANY($1::int[]) AND p.value ~ 'L$'
  )
"""
