"""Auth router – login / verify endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.auth import verify_key, auth_enabled
from app.models.responses import success

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    key: str


@router.post("/login")
async def login(body: LoginBody):
    """Exchange an API key for a token (which is the key itself for v1)."""
    if not auth_enabled():
        return success({"token": "", "authEnabled": False})

    if not verify_key(body.key):
        return JSONResponse(
            status_code=401,
            content={
                "ok": False,
                "error": {"code": "INVALID_KEY", "message": "Invalid API key", "details": {}},
            },
        )

    return success({"token": body.key, "authEnabled": True})


@router.get("/verify")
async def verify(request: Request):
    """Public endpoint – reports whether auth is required and validates token if present.

    When auth is disabled this always returns ok.
    """
    if not auth_enabled():
        return success({"authEnabled": False, "valid": True})

    auth_header = request.headers.get("Authorization", "")
    valid = False
    if auth_header.startswith("Bearer "):
        valid = verify_key(auth_header[7:])

    return success({"authEnabled": True, "valid": valid})
