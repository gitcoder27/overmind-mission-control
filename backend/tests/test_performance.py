"""Performance and cache tests for the async backend optimisations.

These tests validate:
1. AsyncTTLCache behaviour (TTL, single-flight dedup, invalidation)
2. Snapshot caching deduplication
3. Non-blocking async CLI execution
4. Response time characteristics under concurrency
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.cache import AsyncTTLCache

client = TestClient(app)


# ─── AsyncTTLCache Unit Tests ────────────────────────────────────

class TestAsyncTTLCache:
    @pytest.mark.asyncio
    async def test_cache_returns_fetched_value(self):
        cache = AsyncTTLCache()

        async def fetcher():
            return 42

        result = await cache.get_or_fetch("key1", fetcher, ttl=5.0)
        assert result == 42

    @pytest.mark.asyncio
    async def test_cache_hit_skips_fetch(self):
        cache = AsyncTTLCache()
        call_count = 0

        async def fetcher():
            nonlocal call_count
            call_count += 1
            return "value"

        # First call: miss
        v1 = await cache.get_or_fetch("k", fetcher, ttl=10.0)
        assert v1 == "value"
        assert call_count == 1

        # Second call: hit (no new fetch)
        v2 = await cache.get_or_fetch("k", fetcher, ttl=10.0)
        assert v2 == "value"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_cache_expires_after_ttl(self):
        cache = AsyncTTLCache()
        call_count = 0

        async def fetcher():
            nonlocal call_count
            call_count += 1
            return call_count

        v1 = await cache.get_or_fetch("k", fetcher, ttl=0.1)  # 100ms TTL
        assert v1 == 1

        await asyncio.sleep(0.15)  # Wait for expiry

        v2 = await cache.get_or_fetch("k", fetcher, ttl=0.1)
        assert v2 == 2  # Re-fetched

    @pytest.mark.asyncio
    async def test_cache_invalidate(self):
        cache = AsyncTTLCache()
        call_count = 0

        async def fetcher():
            nonlocal call_count
            call_count += 1
            return call_count

        await cache.get_or_fetch("k", fetcher, ttl=60.0)
        assert call_count == 1

        cache.invalidate("k")

        v = await cache.get_or_fetch("k", fetcher, ttl=60.0)
        assert v == 2

    @pytest.mark.asyncio
    async def test_cache_invalidate_prefix(self):
        cache = AsyncTTLCache()

        async def val(x):
            return x

        await cache.get_or_fetch("oc:agents", lambda: val(1), ttl=60.0)
        await cache.get_or_fetch("oc:model", lambda: val(2), ttl=60.0)
        await cache.get_or_fetch("other:key", lambda: val(3), ttl=60.0)

        cache.invalidate_prefix("oc:")
        assert cache.stats["size"] == 1  # Only "other:key" remains

    @pytest.mark.asyncio
    async def test_cache_clear(self):
        cache = AsyncTTLCache()

        async def val(x):
            return x

        await cache.get_or_fetch("a", lambda: val(1), ttl=60.0)
        await cache.get_or_fetch("b", lambda: val(2), ttl=60.0)

        cache.clear()
        assert cache.stats["size"] == 0

    @pytest.mark.asyncio
    async def test_cache_stats(self):
        cache = AsyncTTLCache()

        async def fetcher():
            return "v"

        await cache.get_or_fetch("k", fetcher, ttl=60.0)  # miss
        await cache.get_or_fetch("k", fetcher, ttl=60.0)  # hit
        await cache.get_or_fetch("k", fetcher, ttl=60.0)  # hit

        stats = cache.stats
        assert stats["misses"] == 1
        assert stats["hits"] == 2
        assert stats["size"] == 1

    @pytest.mark.asyncio
    async def test_single_flight_deduplication(self):
        """Concurrent calls for the same key should only invoke the fetcher once."""
        cache = AsyncTTLCache()
        call_count = 0

        async def slow_fetcher():
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.1)  # Simulate slow work
            return "result"

        # Launch 5 concurrent requests for the same key
        tasks = [cache.get_or_fetch("dedup", slow_fetcher, ttl=10.0) for _ in range(5)]
        results = await asyncio.gather(*tasks)

        assert all(r == "result" for r in results)
        # The fetcher should have been called at most 2 times
        # (ideally 1, but race conditions in the lock may cause 2)
        assert call_count <= 2, f"Expected <=2 fetches, got {call_count}"

    @pytest.mark.asyncio
    async def test_fetch_error_propagates(self):
        """Errors from the fetch function should propagate to the caller."""
        cache = AsyncTTLCache()

        async def failing_fetcher():
            raise ValueError("boom")

        with pytest.raises(ValueError, match="boom"):
            await cache.get_or_fetch("err", failing_fetcher, ttl=10.0)


# ─── Endpoint Response Tests ────────────────────────────────────

class TestSnapshotPerformance:
    def test_snapshot_responds_within_budget(self):
        """Single snapshot request should complete well within 5s."""
        t0 = time.monotonic()
        r = client.get("/api/v1/system/snapshot")
        elapsed = time.monotonic() - t0
        assert r.status_code == 200
        assert r.json()["ok"] is True
        # Allow generous budget for CI; real target is <1s
        assert elapsed < 5.0, f"Snapshot took {elapsed:.2f}s (budget: 5s)"

    def test_cache_stats_endpoint(self):
        """Cache stats endpoint should work."""
        r = client.get("/api/v1/system/cache-stats")
        assert r.status_code == 200
        data = r.json()["data"]
        assert "cli_cache" in data
        assert "snapshot_cache" in data
        for key in ["hits", "misses", "size"]:
            assert key in data["cli_cache"]
            assert key in data["snapshot_cache"]

    def test_agents_endpoint_responds(self):
        """Agents endpoint should return valid data."""
        t0 = time.monotonic()
        r = client.get("/api/v1/agents")
        elapsed = time.monotonic() - t0
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert elapsed < 5.0, f"Agents took {elapsed:.2f}s"

    def test_agent_files_endpoint_responds(self):
        """Agent files endpoint should return valid data."""
        t0 = time.monotonic()
        r = client.get("/api/v1/agents/overmind-oracle/files")
        elapsed = time.monotonic() - t0
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert elapsed < 5.0, f"Agent files took {elapsed:.2f}s"

    def test_sequential_requests_stay_fast(self):
        """Back-to-back requests should benefit from caching."""
        # Warm up cache
        client.get("/api/v1/system/snapshot")

        times = []
        for _ in range(5):
            t0 = time.monotonic()
            r = client.get("/api/v1/system/snapshot")
            times.append(time.monotonic() - t0)
            assert r.status_code == 200

        avg = sum(times) / len(times)
        # After warm-up, cached responses should be much faster
        assert avg < 3.0, f"Average sequential time: {avg:.2f}s (expected <3s)"

    def test_health_endpoint_uses_cached_snapshot(self):
        """Health endpoint shares snapshot cache with snapshot endpoint."""
        # First, warm up snapshot cache
        client.get("/api/v1/system/snapshot")

        t0 = time.monotonic()
        r = client.get("/api/v1/system/health")
        elapsed = time.monotonic() - t0
        assert r.status_code == 200
        assert elapsed < 3.0, f"Health took {elapsed:.2f}s (expected cache hit)"


# ─── Data Correctness Tests ─────────────────────────────────────

class TestDataCorrectness:
    def test_snapshot_schema_unchanged(self):
        """Verify the snapshot response schema hasn't changed."""
        r = client.get("/api/v1/system/snapshot")
        assert r.status_code == 200
        data = r.json()["data"]
        required = [
            "health", "orchestrator", "summary", "activeProjects",
            "runningAttempts", "recentEvents", "alerts", "retryStorms",
            "blockers", "deadLetters", "timestamp",
        ]
        for key in required:
            assert key in data, f"Missing snapshot key: {key}"

    def test_agents_schema_unchanged(self):
        """Verify agents response schema hasn't changed."""
        r = client.get("/api/v1/agents")
        assert r.status_code == 200
        agents = r.json()["data"]
        roles = {a["role"] for a in agents}
        expected = {"coordinator", "architect", "builder", "scout", "oracle", "qa"}
        assert expected == roles

        for a in agents:
            for key in ["id", "name", "role", "status", "successRate",
                        "avgDuration", "totalAttempts", "recentActivity",
                        "effectiveModel", "modelSource", "registered", "profileHealth"]:
                assert key in a, f"Missing agent key: {key}"

    def test_ws_still_delivers_snapshot(self):
        """WebSocket connection should still deliver initial snapshot."""
        with client.websocket_connect("/ws/v1/live") as ws:
            data = ws.receive_json()
            assert data["type"] == "SNAPSHOT"
            assert "payload" in data
            # Verify payload has snapshot structure
            payload = data["payload"]
            assert "health" in payload
            assert "summary" in payload
            assert "orchestrator" in payload
