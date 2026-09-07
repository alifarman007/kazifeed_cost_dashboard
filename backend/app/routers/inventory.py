"""Inventory cost endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..cache import cached
from ..params import Period, parse_mill, period_params
from ..queries import inventory as q

router = APIRouter()


@router.get("")
@cached("inventory.totals")
async def totals(
    period: Period = Depends(period_params),
    mill: str | None = Query(None),
) -> dict:
    """Raw material, packaging and spare-part cost for the period."""
    return await q.totals(period, parse_mill(mill))


@router.get("/trend")
@cached("inventory.trend")
async def trend(
    year: int = Query(..., ge=2000, le=2100),
    mill: str | None = Query(None),
) -> dict:
    """Twelve-month series for the three inventory buckets."""
    return await q.trend(year, parse_mill(mill))
