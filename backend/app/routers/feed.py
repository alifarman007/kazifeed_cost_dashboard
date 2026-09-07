"""Feed cost endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ..cache import cached
from ..params import Period, parse_mill, period_params
from ..queries import feed as q
from ..taxonomy import FEED_GROUP_LABEL

router = APIRouter()


def _check_group(group: str) -> str:
    if group not in FEED_GROUP_LABEL:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown feed group {group!r}. Expected one of: "
            + ", ".join(sorted(FEED_GROUP_LABEL)),
        )
    return group


@router.get("/summary")
@cached("feed.summary")
async def summary(
    period: Period = Depends(period_params),
    mill: str | None = Query(None, description="ad_org_id of a feed mill; omit for all"),
) -> dict:
    """Headline feed cost for the period, broken down by species group."""
    return await q.summary(period, parse_mill(mill))


@router.get("/products")
@cached("feed.products")
async def products(
    period: Period = Depends(period_params),
    group: str = Query(..., description="Feed species group, e.g. broiler"),
    mill: str | None = Query(None),
) -> dict:
    """Cost per feed product within one species group."""
    return await q.products(period, _check_group(group), parse_mill(mill))


@router.get("/trend")
@cached("feed.trend")
async def trend(
    year: int = Query(..., ge=2000, le=2100),
    group: str = Query(...),
    mill: str | None = Query(None),
) -> dict:
    """Twelve-month cost series for one species group."""
    return await q.trend(year, _check_group(group), parse_mill(mill))
