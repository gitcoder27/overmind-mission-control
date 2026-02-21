"""Authentication module – API key-based auth for v1.

If OVERMIND_API_KEY env var is not set, auth is DISABLED (backward compat).
"""

from __future__ import annotations

import os
import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request, WebSocket, status

logger = logging.getLogger(__name__)

_API_KEY: Optional[str] = os.getenv("OVERMIND_API_KEY")


def auth_enabled() -> bool:
    """Return True if authentication is configured."""
    return _API_KEY is not None and len(_API_KEY) > 0


def verify_key(key: str) -> bool:
    """Check if the provided key matches the configured API key."""
    if not auth_enabled():
        return True
    return key == _API_KEY


async def require_auth(request: Request) -> None:
    """FastAPI dependency – enforces Bearer token auth.

    Skipped entirely if OVERMIND_API_KEY is not set.
    """
    if not auth_enabled():
        return

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    token = auth_header[7:]
    if not verify_key(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )


async def ws_verify_token(websocket: WebSocket) -> bool:
    """Check WebSocket query param ?token=<key>.

    Returns True if auth passes, False otherwise.
    Skipped if auth is not enabled.
    """
    if not auth_enabled():
        return True
    token = websocket.query_params.get("token", "")
    return verify_key(token)
