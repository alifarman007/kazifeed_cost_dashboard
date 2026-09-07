"""Shared request parameters and period helpers."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from fastapi import HTTPException, Query

MIN_YEAR = 2021
MAX_YEAR = 2100


@dataclass(frozen=True)
class Period:
    year: int
    month: int | None  # None = the whole year

    @property
    def start(self) -> dt.date:
        return dt.date(self.year, self.month or 1, 1)

    @property
    def end_exclusive(self) -> dt.date:
        """First day after the period — every query filters `>= start AND < end`."""
        if self.month is None:
            return dt.date(self.year + 1, 1, 1)
        if self.month == 12:
            return dt.date(self.year + 1, 1, 1)
        return dt.date(self.year, self.month + 1, 1)

    def previous(self) -> "Period":
        """The comparison period for a delta: prior month, or prior year."""
        if self.month is None:
            return Period(self.year - 1, None)
        if self.month == 1:
            return Period(self.year - 1, 12)
        return Period(self.year, self.month - 1)

    @property
    def label(self) -> str:
        if self.month is None:
            return f"Full year {self.year}"
        return f"{dt.date(self.year, self.month, 1):%B %Y}"


def period_params(
    year: int = Query(..., ge=MIN_YEAR, le=MAX_YEAR, description="Calendar year"),
    month: int | None = Query(
        None, ge=1, le=12, description="Calendar month; omit for the whole year"
    ),
) -> Period:
    return Period(year=year, month=month)


def parse_mill(mill: str | None) -> int | None:
    """`mill` arrives as an ad_org_id string; empty means every mill."""
    if mill is None or mill == "":
        return None
    try:
        return int(mill)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid mill id: {mill!r}")
