"""Control surface endpoints: project intake + manager chat.

These endpoints wrap Overmind CLI and OpenClaw CLI commands so the
Mission Control dashboard can drive workflows without Telegram.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.responses import success, error, cli_error_status_code
from app.services.overmind import (
    project_create as ovm_project_create,
    OvmCliError,
)
from app.services.openclaw import (
    manager_send_message as oc_manager_send,
    manager_session_history as oc_manager_history,
    CliError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/control", tags=["control"])


# ─── Request / Response Models ───────────────────────────────────

class ProjectIntakeBody(BaseModel):
    """Request body for creating a new project."""
    goal: str = Field(..., min_length=1, max_length=2000, description="Project goal")
    routeType: str = Field("auto", pattern=r"^(auto|coding|research|hybrid)$")
    priority: int = Field(3, ge=1, le=5)
    notes: Optional[str] = Field(None, max_length=5000)


class ManagerMessageBody(BaseModel):
    """Request body for sending a message to the coordinator."""
    sessionKey: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=10000)


# ─── Project Intake ──────────────────────────────────────────────

@router.post("/projects")
async def create_project(body: ProjectIntakeBody):
    """Create a new project via Overmind CLI wrapper.

    Triggers the normal orchestrator lifecycle (route → plan → execute).
    """
    logger.info(
        "Control: project create request — goal=%s route=%s priority=%d",
        body.goal[:80],
        body.routeType,
        body.priority,
    )
    try:
        result = await ovm_project_create(
            goal=body.goal,
            route_type=body.routeType,
            priority=body.priority,
            notes=body.notes or "",
        )
        # result is the parsed JSON from CLI — usually {projectId, status, ...}
        project_id = result.get("projectId", result.get("project_id", result.get("id", "unknown")))
        return success({
            "projectId": project_id,
            "status": result.get("status", "QUEUED"),
            "routeType": body.routeType,
            "priority": body.priority,
            "raw": result,
        })
    except OvmCliError as exc:
        logger.warning("Control: project create failed — %s", exc.message)
        sc = cli_error_status_code(exc.code, exc.message)
        body_resp, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body_resp, status_code=sc)


# ─── Manager Chat ────────────────────────────────────────────────

@router.post("/manager/message")
async def send_manager_message(body: ManagerMessageBody):
    """Send a user message to overmind-coordinator and return the response.

    Uses OpenClaw ``agent turn`` to relay the message to the coordinator
    agent session displayed on the dashboard.
    """
    logger.info(
        "Control: manager message — session=%s len=%d",
        body.sessionKey,
        len(body.message),
    )
    try:
        result = await oc_manager_send(
            session_key=body.sessionKey,
            message=body.message,
        )
        # Normalise response shape
        response_text = ""
        if isinstance(result, dict):
            response_text = result.get("response", result.get("content", result.get("text", "")))
        elif isinstance(result, str):
            response_text = result

        return success({
            "response": response_text,
            "sessionKey": body.sessionKey,
            "model": result.get("model") if isinstance(result, dict) else None,
            "usage": result.get("usage") if isinstance(result, dict) else None,
            "raw": result,
        })
    except CliError as exc:
        logger.warning("Control: manager message failed — %s", exc.message)
        sc = cli_error_status_code(exc.code, exc.message)
        body_resp, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body_resp, status_code=sc)


@router.get("/manager/session/{session_key}")
async def get_manager_session(session_key: str, limit: int = 50):
    """Retrieve recent messages for a coordinator chat session.

    Returns messages in chronological order for chat replay.
    """
    try:
        messages = await oc_manager_history(
            session_key=session_key,
            limit=limit,
        )
        return success({
            "sessionKey": session_key,
            "messages": messages,
            "count": len(messages),
        })
    except CliError as exc:
        logger.warning("Control: session history failed — %s", exc.message)
        sc = cli_error_status_code(exc.code, exc.message)
        body_resp, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body_resp, status_code=sc)
