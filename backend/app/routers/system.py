"""System endpoints: health, snapshot, orchestrator controls, cache stats."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.models.responses import success, error, cli_error_status_code
from app.services.snapshot import build_snapshot
from app.services.cache import cli_cache, snapshot_cache
from app.services.overmind import (
    orchestrator_pause as ovm_pause,
    orchestrator_resume as ovm_resume,
    orchestrator_restart as ovm_restart,
    OvmCliError,
)

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health")
async def system_health():
    """Composite health check: API + DB + OpenClaw + orchestrator."""
    snap = await build_snapshot()
    return success(snap.health.model_dump())


@router.get("/snapshot")
async def system_snapshot():
    """Full dashboard snapshot — powers the overview page."""
    snap = await build_snapshot()
    return success(snap.model_dump())


@router.post("/orchestrator/pause")
async def orchestrator_pause():
    """Pause the orchestrator via CLI wrapper."""
    try:
        await ovm_pause()
        return success({"paused": True})
    except OvmCliError as exc:
        sc = cli_error_status_code(exc.code, exc.message)
        body, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body, status_code=sc)


@router.post("/orchestrator/resume")
async def orchestrator_resume():
    """Resume the orchestrator via CLI wrapper."""
    try:
        await ovm_resume()
        return success({"paused": False})
    except OvmCliError as exc:
        sc = cli_error_status_code(exc.code, exc.message)
        body, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body, status_code=sc)


@router.post("/orchestrator/restart")
async def orchestrator_restart():
    """Restart the orchestrator via framework restart script.

    Runs preflight checks, stops existing orchestrator, and starts fresh.
    """
    try:
        result = await ovm_restart()
        return success({"restarted": True, "output": result.get("output", "")})
    except OvmCliError as exc:
        sc = cli_error_status_code(exc.code, exc.message)
        body, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body, status_code=sc)


@router.get("/cache-stats")
async def cache_stats():
    """Return cache hit/miss statistics for instrumentation."""
    return success({
        "cli_cache": cli_cache.stats,
        "snapshot_cache": snapshot_cache.stats,
    })
