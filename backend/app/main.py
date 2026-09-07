"""Kazifeed Cost Dashboard API.

A read-only reporting layer over the Kazi Farms iDempiere (ADempiere) database,
serving three cost domains: feed production, logistics and inventory.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import cache, db
from .config import get_settings
from .routers import feed, inventory, logistics, meta

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("kfg")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    log.info("Database pool ready")
    try:
        yield
    finally:
        await db.disconnect()
        log.info("Database pool closed")


app = FastAPI(
    title="Kazifeed Cost Dashboard API",
    version="1.0.0",
    description=(
        "Feed production, logistics and inventory cost for the Kazi Farms group. "
        "Read-only over iDempiere."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


app.include_router(meta.router, prefix="/api", tags=["meta"])
app.include_router(feed.router, prefix="/api/feed", tags=["feed"])
app.include_router(logistics.router, prefix="/api/logistics", tags=["logistics"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["inventory"])


@app.get("/api/health", tags=["meta"])
async def health() -> dict:
    """Liveness plus a real database round trip."""
    value = await db.fetchval("SELECT 1")
    return {"status": "ok" if value == 1 else "degraded", "cache": cache.stats()}


@app.post("/api/cache/clear", tags=["meta"])
async def clear_cache() -> dict:
    return {"cleared": cache.clear()}
