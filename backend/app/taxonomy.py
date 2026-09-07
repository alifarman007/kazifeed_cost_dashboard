"""Feed, mill and inventory taxonomy.

Every constant here was derived from the live database and cross-checked, not
assumed. The comments record *why*, because several of these rules exist to work
around real data problems in the ERP.
"""

from __future__ import annotations

# --------------------------------------------------------------------- feed

# The nine categories that are genuinely finished feed. Verified by listing all
# 108 feed-sounding categories and keeping only those with real production at a
# feed mill. Deliberately EXCLUDED:
#   1000004 Feed RM-Base  - in-house raw-material intermediate (extruded soya)
#   1000194 / 1000268 / 1000001 / 1000090 / 1000094 / 1001133  - zero production
#   Broiler*/Layer*/Fish Commercial*  - live-bird and hatchery growing orders
FEED_CATEGORY_GROUP: dict[int, str] = {
    1000002: "broiler",  # Broiler Feed
    1000003: "breeder",  # Breeder Feed
    1000099: "layer",  # Commercial Layer Feed
    1000193: "layer",  # MBM-free Commercial Layer Feed
    1000225: "fish",  # Fish Feed - Floating
    1000199: "fish",  # Fish Feed - Sinking
    1001065: "fish",  # Fish Feed (Floating - Oil Coated)
    1000948: "cattle",  # Cattle Feed
    1001020: "duck",  # Duck Feed
}

FEED_CATEGORY_IDS: list[int] = sorted(FEED_CATEGORY_GROUP)

# Display order for the sub-tabs, biggest business first.
FEED_GROUPS: list[dict] = [
    {"key": "broiler", "label": "Broiler"},
    {"key": "layer", "label": "Layer"},
    {"key": "breeder", "label": "Breeder"},
    {"key": "fish", "label": "Fish"},
    {"key": "cattle", "label": "Cattle"},
    {"key": "duck", "label": "Duck"},
]

FEED_GROUP_LABEL = {g["key"]: g["label"] for g in FEED_GROUPS}

# The three loose Duck products are miscategorised into Commercial Layer Feed
# while their bagged twins sit in Duck Feed. Without this override the Duck tab
# is empty and ~726 t of duck feed is reported as Layer.
DUCK_OVERRIDE_VALUES = ("BP3010L", "GJ3010L", "TH3010L")

# Non-feed strays that live inside Breeder Feed and would otherwise show as bars.
EXCLUDED_PRODUCT_VALUES = ("KZ125L", "TH125L", "GJ125L", "KZ1921L")

# Groups with more SKUs than a chart can carry get a Top-N + "Others" roll-up.
# Top 15 covers 94.8% of Breeder tonnage and 89.2% of Fish.
CHART_TOP_N = 15
GROUPS_NEEDING_ROLLUP = {"fish", "breeder"}

# --------------------------------------------------------------------- mills

# The 11 orgs that actually produce loose feed, confirmed by aggregating cost
# collectors for loose feed products with no org filter. Gopalgonj (1000223) and
# Sirajganj (1000509) have never produced; Miraj (1000401) stopped in 2022 and
# Shah Amla (1000425) in 2023 — all four are omitted so the filter has no dead
# entries.
FEED_MILLS: list[dict] = [
    {"id": 1000049, "label": "Gojaria Feed Mill"},
    {"id": 1000134, "label": "Sagorika Poultry Feed Mill"},
    {"id": 1000141, "label": "Kazi Feeds - Feed Mill"},
    {"id": 1000336, "label": "Sreemangal Feed Mill"},
    {"id": 1000028, "label": "Thakurgaon Feed Mill"},
    {"id": 1000364, "label": "Lion Feed Mill (Rental)"},
    {"id": 1000393, "label": "Jayson Feed Mill (Rental)"},
    {"id": 1000371, "label": "Gojaria Fish Feed Mill"},
    {"id": 1000468, "label": "Begumgonj Feed Mill (Rental)"},
    {"id": 1000200, "label": "Sagorika Fish Feed Mill"},
    {"id": 1000417, "label": "Paradise Feed Mill (Rental)"},
    {"id": 1000472, "label": "Aristocrat Feed Mill (Rental)"},
]

FEED_MILL_IDS: list[int] = [m["id"] for m in FEED_MILLS]
FEED_MILL_LABEL = {m["id"]: m["label"] for m in FEED_MILLS}

# ---------------------------------------------------------------- inventory

INVENTORY_BUCKETS: list[dict] = [
    {"id": "raw_material", "label": "Raw material"},
    {"id": "packaging", "label": "Packaging material"},
    {"id": "spare_parts", "label": "Spare parts"},
]

# ---------------------------------------------------------------- logistics

# Loading and unloading are deliberately ONE line. Every source object in this
# database names them jointly ("Wages-Loading & Unloading", "Wages - Loading and
# unloading (LC)") and nothing separates them, so splitting would be invention.
LOGISTICS_LINES: list[dict] = [
    {"id": "transport", "label": "Transport"},
    {"id": "loading_unloading", "label": "Loading & unloading"},
    {"id": "custom_duty", "label": "Custom duty"},
    {"id": "clearing_port", "label": "Clearing & port"},
    {"id": "other", "label": "Other handling"},
]

LOGISTICS_LINE_KEYS = [l["id"] for l in LOGISTICS_LINES]

# Advance Income Tax and VAT booked against imports are recoverable prepayments,
# not a cost of moving goods. They are reported separately and kept out of the
# logistics total — folding 640M BDT of recoverable AIT into "custom duty" would
# overstate duty roughly seventyfold.
RECOVERABLE_LINES = ("import_taxes",)

# The at-the-gate loading/unloading wages account covers both raw-material
# unloading and finished-feed loading, and nothing in the data attributes it to
# a leg. It is reported as its own direction rather than guessed into one.
LOGISTICS_DIRECTIONS: list[dict] = [
    {"id": "inbound", "label": "Inbound"},
    {"id": "outbound", "label": "Outbound"},
    {"id": "internal", "label": "At mill"},
]


def group_for(category_id: int, product_value: str) -> str:
    """Species group for a product, applying the Duck miscategorisation fix."""
    if product_value in DUCK_OVERRIDE_VALUES:
        return "duck"
    return FEED_CATEGORY_GROUP.get(category_id, "other")
