"""A tiny async-aware TTL cache.

Dashboard queries aggregate millions of ERP rows, so results are memoised for
`CACHE_TTL` seconds. In-flight de-duplication means a burst of identical
requests (three charts mounting at once) costs exactly one database round trip.
"""

from __future__ import annotations

import asyncio
import functools
import hashlib
import json
import time
from typing import Any, Awaitable, Callable, TypeVar

from .config import get_settings

T = TypeVar("T")

_store: dict[str, tuple[float, Any]] = {}
_inflight: dict[str, asyncio.Task] = {}


def _key(prefix: str, args: tuple, kwargs: dict) -> str:
    payload = json.dumps([args, sorted(kwargs.items())], default=str, sort_keys=True)
    digest = hashlib.sha1(payload.encode()).hexdigest()[:16]
    return f"{prefix}:{digest}"


def cached(prefix: str) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
    """Memoise an async function on its arguments for the configured TTL."""

    def decorator(fn: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            ttl = get_settings().cache_ttl
            if ttl <= 0:
                return await fn(*args, **kwargs)

            key = _key(prefix, args, kwargs)
            now = time.monotonic()

            hit = _store.get(key)
            if hit and hit[0] > now:
                return hit[1]

            existing = _inflight.get(key)
            if existing is not None:
                return await asyncio.shield(existing)

            task = asyncio.create_task(fn(*args, **kwargs))
            _inflight[key] = task
            try:
                value = await task
            finally:
                _inflight.pop(key, None)

            _store[key] = (time.monotonic() + ttl, value)
            return value

        return wrapper

    return decorator


def clear() -> int:
    """Drop every cached entry. Returns how many were removed."""
    n = len(_store)
    _store.clear()
    return n


def stats() -> dict[str, int]:
    now = time.monotonic()
    live = sum(1 for expiry, _ in _store.values() if expiry > now)
    return {"entries": len(_store), "live": live, "inflight": len(_inflight)}
