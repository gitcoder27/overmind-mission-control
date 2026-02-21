"""TTL cache with single-flight request coalescing.

Prevents redundant subprocess calls and event-loop blocking by:
1. Caching results with a configurable TTL.
2. Coalescing concurrent requests for the same key into a single in-flight
   computation (single-flight / request deduplication).

Thread-safe for reads; async-safe for concurrent coroutines.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CacheEntry:
    """A single cached value with expiry metadata."""

    __slots__ = ("value", "expires_at", "created_at")

    def __init__(self, value: Any, ttl: float):
        now = time.monotonic()
        self.value = value
        self.created_at = now
        self.expires_at = now + ttl

    @property
    def expired(self) -> bool:
        return time.monotonic() >= self.expires_at


class AsyncTTLCache:
    """Async-aware TTL cache with single-flight deduplication.

    Usage::

        cache = AsyncTTLCache()

        async def get_agents():
            return await cache.get_or_fetch(
                "agents_list", fetch_fn=_async_agents_list, ttl=10.0
            )

    If two coroutines call ``get_or_fetch("agents_list", ...)`` concurrently
    before the first one resolves, they will share the same awaitable and
    only one subprocess will be spawned.
    """

    def __init__(self):
        self._store: dict[str, CacheEntry] = {}
        self._in_flight: dict[str, asyncio.Future] = {}
        self._lock = asyncio.Lock()
        self._hits = 0
        self._misses = 0

    async def get_or_fetch(
        self,
        key: str,
        fetch_fn: Callable[[], Awaitable[T]],
        ttl: float = 10.0,
    ) -> T:
        """Return cached value or await *fetch_fn* (with dedup).

        Parameters
        ----------
        key:
            Cache key identifying the resource.
        fetch_fn:
            Async callable that produces the value on miss.
        ttl:
            Time-to-live in seconds.
        """
        # Fast path: cache hit (no lock needed for read)
        entry = self._store.get(key)
        if entry is not None and not entry.expired:
            self._hits += 1
            return entry.value

        async with self._lock:
            # Re-check after acquiring lock (another coroutine may have populated)
            entry = self._store.get(key)
            if entry is not None and not entry.expired:
                self._hits += 1
                return entry.value

            # Single-flight: if already in-flight, wait for it
            if key in self._in_flight:
                logger.debug("cache: coalescing request for %s", key)
                future = self._in_flight[key]
                # Release lock while waiting
        # If there's an in-flight future, await outside the lock
        if key in self._in_flight:
            try:
                return await self._in_flight[key]
            except Exception:
                # In-flight failed; we'll retry below
                pass

        # Need to fetch — set up single-flight future
        loop = asyncio.get_running_loop()
        future: asyncio.Future[T] = loop.create_future()

        async with self._lock:
            # Final re-check
            entry = self._store.get(key)
            if entry is not None and not entry.expired:
                self._hits += 1
                return entry.value

            if key in self._in_flight:
                # Another coroutine beat us; await theirs
                pass
            else:
                self._in_flight[key] = future

        if key in self._in_flight and self._in_flight[key] is not future:
            # Someone else's future
            try:
                return await self._in_flight[key]
            except Exception:
                pass

        # We own the future — actually run the fetch
        self._misses += 1
        try:
            t0 = time.monotonic()
            result = await fetch_fn()
            elapsed = (time.monotonic() - t0) * 1000
            logger.debug("cache: fetched %s in %.1fms", key, elapsed)
            self._store[key] = CacheEntry(result, ttl)
            if not future.done():
                future.set_result(result)
            return result
        except Exception as exc:
            if not future.done():
                future.set_exception(exc)
            raise
        finally:
            self._in_flight.pop(key, None)

    def invalidate(self, key: str) -> None:
        """Remove a specific key from the cache."""
        self._store.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> None:
        """Remove all keys starting with *prefix*."""
        to_remove = [k for k in self._store if k.startswith(prefix)]
        for k in to_remove:
            del self._store[k]

    def clear(self) -> None:
        """Flush all cached entries."""
        self._store.clear()

    @property
    def stats(self) -> dict[str, int]:
        """Return hit/miss counts for instrumentation."""
        return {"hits": self._hits, "misses": self._misses, "size": len(self._store)}


# ── Module-level singleton ───────────────────────────────────────
cli_cache = AsyncTTLCache()
snapshot_cache = AsyncTTLCache()
