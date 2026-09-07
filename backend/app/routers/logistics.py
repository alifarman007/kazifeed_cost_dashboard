"""Logistics cost endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..cache import cached
from ..params import Period, parse_mill, period_params
from ..queries import logistics as q

router = APIRouter()


@router.get("")
@cached("logistics.totals")
async def totals(
    period: Period = Depends(period_params),
    mill: str | None = Query(None),
) -> dict:
    """Inbound and outbound logistics cost, split by cost line."""
    return await q.totals(period, parse_mill(mill))


@router.get("/trend")
@cached("logistics.trend")
async def trend(
    year: int = Query(..., ge=2000, le=2100),
    mill: str | None = Query(None),
) -> dict:
    """Twelve-month inbound vs outbound series."""
    return await q.trend(year, parse_mill(mill))
