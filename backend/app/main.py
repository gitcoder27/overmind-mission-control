"""Overmind Mission Control — FastAPI application entry point."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import CORS_ORIGINS, ENV
from app.models.responses import get_request_id, set_request_id
from app.routers import system, projects, events, agents, cron, ws
from app.routers import auth as auth_router
from app.routers import control
from app.routers import system_metrics_ws
from app.auth import require_auth

# ── Logging ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if ENV == "development" else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
)
logger = logging.getLogger("overmind.api")

# ── App ──────────────────────────────────────────────────────────
app = FastAPI(
    title="Overmind Mission Control API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
)

# ── CORS ─────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global error handler ────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Wrap unhandled errors in the standard error envelope."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    rid = get_request_id()
    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": str(exc),
                "details": {},
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "request_id": rid,
            },
        },
    )


# ── Request-ID middleware ────────────────────────────────────────
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    set_request_id(request_id)
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response


# ── Routers ──────────────────────────────────────────────────────
# Auth router is public (login/verify do their own checks)
app.include_router(auth_router.router, prefix="/api/v1")
# Protected routers – require_auth is a no-op when OVERMIND_API_KEY is unset
app.include_router(system.router, prefix="/api/v1", dependencies=[Depends(require_auth)])
app.include_router(projects.router, prefix="/api/v1", dependencies=[Depends(require_auth)])
app.include_router(events.router, prefix="/api/v1", dependencies=[Depends(require_auth)])
app.include_router(agents.router, prefix="/api/v1", dependencies=[Depends(require_auth)])
app.include_router(cron.router, prefix="/api/v1", dependencies=[Depends(require_auth)])
app.include_router(control.router, prefix="/api/v1", dependencies=[Depends(require_auth)])
app.include_router(ws.router)  # WebSocket at root (WS auth via query param)
app.include_router(system_metrics_ws.router, prefix="/api/v1")  # Live system metrics WS


# ── Root health ──────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"service": "overmind-mission-control", "version": "1.0.0", "status": "ok"}
