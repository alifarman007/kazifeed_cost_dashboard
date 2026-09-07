# Kazifeed Cost Dashboard

Feed production, logistics and inventory cost for the Kazi Farms group, read from
the live iDempiere (ADempiere) ERP.

- **Backend** — FastAPI, read-only over PostgreSQL, serving pre-aggregated facts
  from a local SQLite warehouse.
- **Frontend** — Next.js 15 + React 19 + TypeScript, with hand-built SVG/CSS charts.

---

## Quick start

Two processes. The API first:

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env            # edit if the ERP credentials differ

.venv/bin/python -m app.sync    # first run: pulls every year (~5 min)
.venv/bin/python -m uvicorn app.main:app --port 8010
```

Then the dashboard:

```bash
cd frontend
npm install
npm run dev                     # http://localhost:3010
```

Ports 8010/3010 are used because 8000/3000 were already occupied on the build
machine. Change them in `frontend/package.json`, `frontend/.env.local` and
`backend/.env` (`CORS_ORIGINS`) if you prefer others.

---

## Why there is a sync step

The ERP is a ~300 GB production instance and the tables this dashboard needs are
not indexed for it:

| Table | Size | Problem |
|---|---|---|
| `fact_acct` | 282 GB / 636 M rows | only usable index leads on `ad_org_id` |
| `m_costdetail` | 62 GB | — |
| `pp_cost_collector` | 25 GB | date index is an *expression* index |
| `pp_order` | 2 GB / 4.1 M rows | **no index** on `datefinish`, `ad_org_id` or `m_product_id` |

A single month of feed cost aggregates in ~2 s and a full year in ~38 s. Serving
that per page view would be unusable and unkind to a production ERP.

So `app/sync.py` runs the heavy aggregation once per year and stores the result
as a few thousand fact rows in `backend/data/warehouse.db` (about 2 MB for five
years). The API then answers from SQLite in microseconds and the ERP sees one
query per sync instead of one per chart.

```bash
.venv/bin/python -m app.sync                          # everything
.venv/bin/python -m app.sync --year 2026              # one year
.venv/bin/python -m app.sync --year 2026 --domain feed
```

Re-running a year replaces it atomically. Schedule the current year nightly:

```cron
30 2 * * *  cd /Data/kazifeed_cost_dashboard/backend && .venv/bin/python -m app.sync --year $(date +\%Y)
```

### Indexes worth adding (DBA task)

The sync would drop from ~38 s to seconds per year with these. They are **not**
created by this project — it only ever reads:

```sql
CREATE INDEX CONCURRENTLY pp_order_datefinish_org ON pp_order (datefinish, ad_org_id);
CREATE INDEX CONCURRENTLY pp_order_product        ON pp_order (m_product_id);
```

---

## How each number is built

### Feed cost

Feed is manufactured through `pp_order`; its cost is carried by
`pp_cost_collector` rows of type `'100'` (the finished-goods receipt) joined to
`m_costdetail` — the same basis as the existing `BatchCostSummaryReport.jasper`
`stdrate` column.

Three rules make this correct rather than merely plausible:

1. **Only loose products count.** A product value ending in `L` is the loose
   (bulk) milled feed. The same code without the `L` is the bagged repack, and
   its bill of materials literally consumes the loose product plus a sack —
   `GJ1055` = `GJ1055L` + `68002`. Counting both double-counts every kilogram
   (+62% on cost, +59% on volume for June 2026). Detected on `m_product.value`,
   never on the name: 78 loose products have no "Loose" in their name.

2. **Quantity and cost aggregate separately.** Each cost collector has one
   `m_costdetail` row per cost element, so summing `movementqty` across that
   join inflates tonnage roughly threefold.

3. **The simple aggregate, not the Jasper variance formula.** Booked COGS for
   `GJ1055` in June 2026 is ৳61.884/kg; the type-100 receipt value gives
   ৳61.885/kg. The Jasper `actualAmt` (standard + `t_costvariancedetail`
   variances) gives ৳52.41/kg — a variance-analysis figure that never reaches
   inventory or COGS.

The query drives from `pp_cost_collector`, never touching `pp_order`. Verified
against the `pp_order` form: both return 691,747,129.7704 kg and
৳34,468,167,212.62 for FY2025, to the last decimal.

**Known limitations**, both quantified rather than hand-waved:

- Because only loose production is counted, the figure is feed *manufacturing*
  cost — about 1.1% below fully-packaged COGS, the difference being sacks and
  bagging overhead (~৳3 crore/month across all groups). This is stated on the
  Feed tab rather than buried here.
- A small residual double-count survives the loose filter: some loose orders
  consume other finished feed as rework (a loose SKU produced 1:1 from another).
  Measured at 907 receipts / 1,630 t over twelve months, or **~0.3%**. Full
  quantity-netting — subtracting each product's consumption by other feed orders
  — was evaluated as an alternative and lands at 55,105,286 kg for August 2026
  against this project's 55,185,937 kg, a 0.15% difference. The loose filter was
  kept because it is far cheaper to compute and the gap is immaterial.

#### Feed taxonomy

Nine categories are genuinely finished feed, rolling up to six species groups —
Broiler, Layer, Breeder, Fish, Cattle, Duck. Two data problems are corrected in
`app/taxonomy.py`:

- The three loose Duck products (`BP3010L`, `GJ3010L`, `TH3010L`) are
  miscategorised into *Commercial Layer Feed* while their bagged twins sit in
  *Duck Feed*. Without the override the Duck tab is empty and ~726 t of duck
  feed is reported as Layer.
- *Breeder Feed* contains two non-feed strays (`KZ125L` corn grits,
  `KZ1921L` plant flashing), excluded explicitly.

Product values are `<2-letter mill prefix><SKU>[L]`, so the same recipe exists
once per mill. Stripping the prefix collapses 260 mill-SKUs to 129 SKU keys and
makes the charts readable. Fish (39) and Breeder (48) still exceed a chartable
count, so those two show the top 15 by cost with the remainder in the table view.

### Logistics

Two separate, non-overlapping mechanisms, both included:

1. **Domestic** — GL expense accounts under `600205 Transportation Expenses`.
   The account carries the direction: `60020501 Carrying Expense In` is inbound,
   `60020502 Carrying Expense Out` is outbound.
2. **Import landed cost** — AP invoice lines carrying the "L-series" service
   products (custom duty, C&F, port charges, container freight, LC charges).
   These post to a balance-sheet staging account, not to `600205`, so combining
   the two does not double count.

Three filters are mandatory:

- `postingtype = 'A'` — `fact_acct` mixes **budget** rows in with actuals.
  Without it, July 2026 inbound transport reads ৳110,972,063 instead of the true
  ৳72,465,218: a 53% overstatement.
- `c_acctschema_id = 1000000` — four schemas exist, including OMR and USD ones.
- An explicit `ad_org_id` list — 17 orgs takes 1.5 s, all 471 takes 26 s.

Direction comes from the account/product identity, **never** from
`c_invoice.issotrx`: both "Carrying Expense In" and "Carrying Expense Out" are
booked on AP invoices, so `issotrx` would file 100% of logistics under one leg.

Two honest limitations are shown in the UI rather than papered over:

- **Loading and unloading cannot be split.** Every source object names them
  jointly ("Wages-Loading & Unloading"), so they are one line.
- **At-mill wages belong to neither leg.** The gate-wages account covers both
  raw-material unloading and finished-feed loading, so it is reported as its own
  "At mill" direction instead of being guessed into one.

Advance income tax and VAT on imports (~৳12.6 crore in August 2026) are
**excluded** from the total — they are recoverable prepayments, not logistics
cost. True customs duty is genuinely small (৳9.0 M over 12 months).

Two corrections that adversarial verification against the ledger turned up:

- **AP credit memos store `linenetamt` positive** in this schema, so they are
  negated by `docbasetype`. Left unsigned, October 2025 import cost reads
  ৳108,084,125 instead of the true ৳105,377,933.
- **Account 60020504 "Packing, Posting & Shipping" is excluded** despite its
  name. It is 99.997% `M_Inventory` issues — white bags, sewing thread, sutli
  rope — i.e. packaging material consumed out of stock, which the Inventory tab
  already reports from the credit side of `10050102`. Counting it here too would
  double-count the same event across two tabs.

**Known gap:** own-fleet running cost is not captured. Roughly ৳13 M a year sits
in "Fuel Consumption-Vehicle", vehicle rental and vehicle depreciation. Nothing
in the data attributes it to inbound or outbound, so it is left out rather than
guessed into a leg.

### Inventory

Bucket classification comes from the ERP's own ledger, not a name regex:
`M_Product_Category_Acct.P_Asset_Acct` maps each category to an inventory
account, and three of them are exactly the buckets needed —
`10050101 Raw Materials`, `10050102 Packing Materials`, `10050502 Spares`.
A name heuristic misses 40 spares categories that are not named "Spares" and
wrongly sweeps Medicine and Vaccine into raw materials.

The figure is the **monthly flow** (material consumed), not a stock snapshot:
a month-by-month chart wants a flow, and the GL stock balance for raw materials
does not reconcile to physical stock (৳2,650 crore GL vs ৳1,320 crore physical)
because ~56% of maize issues route through WIP.

Source is `fact_acct_balance_kfg`, a KFG-custom month-end pre-aggregation that
reproduces `fact_acct` to the paisa but slices a month in ~1.5 s instead of ~14 s.
Two traps: rows are stamped at the **last day** of their month, and
`ad_table_id <> 323` is mandatory (M_Movement inter-org transfers post debit and
credit in identical amounts and would roughly triple both figures).

Scoped to the feed mills, matching the other two tabs. Raw material is 99.9%
consumed at the mills anyway, but packaging and spares are largely consumed at
farms, so the scope is stated on the tab.

---

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/meta` | Years, mills, feed groups, currency — everything the filters need |
| `GET /api/health` | Liveness plus a real database round trip |
| `GET /api/feed/summary?year&month&mill` | Headline feed cost, split by species group |
| `GET /api/feed/products?year&month&group&mill` | Cost per product within a group |
| `GET /api/feed/trend?year&group&mill` | Twelve-month cost / volume / unit-cost series |
| `GET /api/logistics?year&month&mill` | Inbound, outbound and at-mill cost by line |
| `GET /api/logistics/trend?year&mill` | Twelve-month series per leg |
| `GET /api/inventory?year&month&mill` | The three buckets for a period |
| `GET /api/inventory/trend?year&mill` | Twelve-month series per bucket |
| `POST /api/cache/clear` | Drop the in-process response cache |

Interactive docs at `http://localhost:8010/docs`.

`month` is optional everywhere — omit it for a full-year figure. `mill` is an
`ad_org_id`; omit it for all mills.

---

## Design notes

Charts follow a validated categorical palette (worst adjacent colour-vision
separation ΔE 9.1 light / 8.4 dark, normal-vision floor 19.6 / 19.3). Three
light-mode slots sit below 3:1 contrast, so **every chart ships both visible
direct labels and a table view** — the documented relief. Dark mode is a
separately chosen set of steps for the dark surface, not an automatic flip.

Deliberate choices worth knowing:

- **No dual-axis charts anywhere.** Cost and volume get their own charts rather
  than two y-scales, which would invent a correlation that is not in the data.
- **Unit cost gets a zoomed axis.** Kazi uses standard costing, so unit cost
  moves within ~0.3% across a year. On a zero baseline that renders as a dead
  flat line, so the axis starts near the data and says so underneath.
- **Inventory trend uses small multiples.** Raw material runs ~67× packaging and
  spares; one shared linear axis would flatten two of the three series into
  nothing.
- **One money unit per chart.** Auto-compacting each bar would put "৳59 Cr" next
  to "৳13.7 L" in the same column.
- **Money reads in lakh/crore**, the South Asian convention, and feed weight in
  tonnes rather than kilograms.
- **Colour follows the entity, never its rank**, so filtering to one mill never
  repaints the survivors. The Feed product chart is a *single series*, so every
  bar shares one hue — shading products by size would double-encode length as
  colour and burn the only free channel. What carries the visual interest
  instead is material, not extra hues: a rail each bar is measured along, a
  sheen across the bar's **thickness** (never along its length, where it would
  shade by magnitude), a lift in the bar's own hue, and a rank column. Measured
  on the rendered pixels, the sheen moves the fill from `#2a78d6` to `#327cd6`
  at the bar's centre and every point still clears 3:1 on the light surface
  (lightest edge 3.21:1).
- **Tick density follows the plot width** — three legs side by side leave a
  narrow plot, and five money labels there collide into `৳0.2 C৳0.4 C…`. Never
  fewer than two ticks, since a lone `0` says nothing about the scale.
- Partial months (the running calendar month) are labelled, so a short bar is
  not misread as a collapse in output.
- **Motion is restrained and informative.** Marks ease in once when the data
  changes — columns rise from the baseline they are measured against, bars
  extend from the axis, lines draw along their own path — so the eye is drawn to
  the chart rather than entertained by it. Entry animations are keyed to the
  data, so hovering never replays them, and nothing loops. Every keyframe uses
  `both` fill mode, so under `prefers-reduced-motion: reduce` marks snap
  straight to their final state instead of never arriving.

---

## Layout

```
backend/
  app/
    main.py                 FastAPI app, CORS, error handling
    config.py  db.py        Settings; read-only asyncpg pool
    cache.py                TTL cache with in-flight de-duplication
    warehouse.py            SQLite fact store
    sync.py                 ETL entry point
    extract.py              Feed extraction SQL
    extract_logistics.py    Logistics extraction SQL
    extract_inventory.py    Inventory extraction SQL
    taxonomy.py             Feed groups, mills, buckets, cost lines
    params.py               Period handling
    queries/                Warehouse reads per domain
    routers/                HTTP endpoints per domain
  data/warehouse.db         Generated by sync (git-ignored)

frontend/
  app/                      Layout, page, design tokens
  components/charts/        BarChart, ColumnChart, LineChart, Donut, Sparkline,
                            Tooltip, Legend, TableView
  components/tabs/          FeedTab, LogisticsTab, InventoryTab
  components/ui/            ChartCard, StatTile, FilterBar, Tabs, Select, Header
  lib/                      API client, formatting, theme
```

## MCP

`postgres-mcp` is registered for this project only. Because the config carries
the ERP password inline, `.mcp.json` is **git-ignored** and only
`.mcp.json.example` is committed — this repo has a GitHub remote, and the
credential must not go there.

To set it up on a new machine:

```bash
cp .mcp.json.example .mcp.json     # then fill in USER / PASSWORD
```

It runs in `--access-mode=restricted`, and the dashboard's own connections open
read-only with a statement timeout, so neither path can write to the ERP.
