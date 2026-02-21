"""Pydantic response envelope models matching the frontend API contract."""

from __future__ import annotations

import re
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

# ── Per-request context var for a shared request_id ──────────────
_request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    """Return the current request's shared id (set by middleware)."""
    rid = _request_id_ctx.get()
    return rid if rid else str(uuid.uuid4())


def set_request_id(rid: str) -> None:
    """Set the request id for the current context."""
    _request_id_ctx.set(rid)


class Meta(BaseModel):
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    request_id: str = Field(default_factory=get_request_id)


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class SuccessEnvelope(BaseModel):
    ok: bool = True
    data: Any
    meta: Meta = Field(default_factory=Meta)


class ErrorEnvelope(BaseModel):
    ok: bool = False
    error: ErrorDetail
    meta: Meta = Field(default_factory=Meta)


def success(data: Any) -> dict:
    """Wrap arbitrary data in a success envelope."""
    return SuccessEnvelope(data=data).model_dump()


def error(code: str, message: str, details: dict | None = None, status: int = 400) -> tuple[dict, int]:
    """Return (body, status_code) for an error envelope."""
    body = ErrorEnvelope(
        error=ErrorDetail(code=code, message=message, details=details or {})
    ).model_dump()
    return body, status


# ── CLI error → HTTP status mapping ─────────────────────────────
_NOT_FOUND_RE = re.compile(r"not found|does not exist|no such|unknown", re.IGNORECASE)
_VALIDATION_RE = re.compile(
    r"invalid|cannot transition|already |illegal|bad request|validation|status",
    re.IGNORECASE,
)


def cli_error_status_code(code: str, message: str) -> int:
    """Map a CLI error code + message to an appropriate HTTP status."""
    upper = code.upper()
    if upper.endswith("_TIMEOUT"):
        return 504
    if upper.endswith("_NOT_FOUND"):
        return 503  # dependency binary missing
    if _NOT_FOUND_RE.search(message):
        return 404
    if _VALIDATION_RE.search(message):
        return 422
    return 500
