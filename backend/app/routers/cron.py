"""Cron jobs endpoint – proxies to OpenClaw CLI."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.models.responses import success, error, cli_error_status_code
from app.services.openclaw import (
    cron_list_all,
    cron_enable as oc_cron_enable,
    cron_disable as oc_cron_disable,
    cron_run as oc_cron_run,
    CliError,
)

router = APIRouter(prefix="/cron", tags=["cron"])
logger = logging.getLogger(__name__)


def _format_schedule(schedule: Any) -> tuple[str, str]:
    """Normalize OpenClaw schedule payload to frontend-safe strings."""
    if isinstance(schedule, str):
        text = schedule.strip()
        return text, text

    if isinstance(schedule, dict):
        kind = str(schedule.get("kind", "")).strip().lower()

        if kind == "cron":
            expr = str(schedule.get("expr", "")).strip()
            tz = str(schedule.get("tz", "")).strip()
            value = expr or "cron"
            human = f"{expr} ({tz})" if expr and tz else (expr or kind or "")
            return value, human

        if kind == "every":
            every = str(schedule.get("every", "")).strip()
            value = every or "every"
            human = f"Every {every}" if every else "Every interval"
            return value, human

        if kind == "once":
            at_ms = schedule.get("atMs")
            at_iso = _coerce_timestamp(at_ms)
            value = at_iso or "once"
            human = f"Once at {at_iso}" if at_iso else "One-time"
            return value, human

        # Unknown structured schedule: keep compact and always string.
        if kind:
            return kind, kind
        return "", ""

    return "", ""


def _coerce_timestamp(value: Any) -> str | None:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc).isoformat()
        except (OverflowError, OSError, ValueError):
            return None

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.isdigit():
            return _coerce_timestamp(int(raw))
        return raw

    return None


def _parse_job_name(name: str) -> tuple[str, str | None]:
    """Extract a human-friendly label and optional agent role from job name.

    Job names follow '{role}:{slug}' convention.  Returns (friendly_label, role).
    """
    role: str | None = None
    slug = name
    if ":" in name:
        parts = name.split(":", 1)
        role = parts[0].strip().lower() or None
        slug = parts[1].strip()
    # slug → Friendly Label: replace hyphens/underscores, title-case
    friendly = slug.replace("-", " ").replace("_", " ").strip().title()
    return friendly, role


def _format_job(raw: dict) -> dict:
    """Map OpenClaw cron job JSON to frontend CronJob shape."""
    schedule_value, schedule_human = _format_schedule(raw.get("schedule"))

    state = raw.get("state") if isinstance(raw.get("state"), dict) else {}

    next_run = (
        raw.get("nextRun")
        or raw.get("next_run")
        or _coerce_timestamp(state.get("nextRunAtMs"))
    )
    last_run = (
        raw.get("lastRun")
        or raw.get("last_run")
        or _coerce_timestamp(state.get("lastRunAtMs"))
    )

    raw_name = raw.get("name", raw.get("id", ""))
    friendly_label, parsed_role = _parse_job_name(raw_name)

    payload = raw.get("payload") if isinstance(raw.get("payload"), dict) else {}
    delivery = raw.get("delivery") if isinstance(raw.get("delivery"), dict) else {}

    return {
        "id": raw.get("id", raw.get("name", "")),
        "name": raw_name,
        "label": friendly_label,
        "schedule": schedule_value,
        "scheduleHuman": (
            raw.get("scheduleHuman")
            or raw.get("schedule_human")
            or schedule_human
            or schedule_value
        ),
        "enabled": raw.get("enabled", True),
        "nextRun": next_run,
        "lastRun": last_run,
        "lastRunStatus": raw.get("lastRunStatus", raw.get("last_run_status", state.get("lastStatus"))),
        "payload": raw.get("payload"),
        # enriched fields
        "agentRole": parsed_role or raw.get("agentRole") or raw.get("agent_role"),
        "payloadKind": payload.get("kind"),
        "description": payload.get("message") or payload.get("text") or raw.get("description"),
        "model": payload.get("model") or raw.get("model"),
        "thinking": payload.get("thinking") or raw.get("thinking"),
        "timeoutSeconds": payload.get("timeoutSeconds") or raw.get("timeoutSeconds"),
        "sessionTarget": raw.get("sessionTarget") or raw.get("session_target"),
        "deliveryMode": delivery.get("mode") or raw.get("deliveryMode"),
        "deliveryChannel": delivery.get("channel") or raw.get("deliveryChannel"),
    }


@router.get("/jobs")
async def list_cron_jobs():
    """List all cron jobs from OpenClaw."""
    try:
        data = await cron_list_all()
        # OpenClaw returns {"jobs": [...]} or a list
        jobs_raw = data if isinstance(data, list) else data.get("jobs", [])
        jobs = [_format_job(j) for j in jobs_raw]
        return success(jobs)
    except CliError as exc:
        sc = cli_error_status_code(exc.code, exc.message)
        body, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body, status_code=sc)


@router.post("/jobs/{job_id}/enable")
async def enable_cron_job(job_id: str):
    """Enable a cron job via OpenClaw CLI."""
    try:
        await oc_cron_enable(job_id)
        return success({"enabled": True, "jobId": job_id})
    except CliError as exc:
        sc = cli_error_status_code(exc.code, exc.message)
        body, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body, status_code=sc)


@router.post("/jobs/{job_id}/disable")
async def disable_cron_job(job_id: str):
    """Disable a cron job via OpenClaw CLI."""
    try:
        await oc_cron_disable(job_id)
        return success({"enabled": False, "jobId": job_id})
    except CliError as exc:
        sc = cli_error_status_code(exc.code, exc.message)
        body, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body, status_code=sc)


@router.post("/jobs/{job_id}/run")
async def run_cron_job(job_id: str):
    """Trigger a cron job via OpenClaw CLI."""
    try:
        await oc_cron_run(job_id)
        return success({"triggered": True, "jobId": job_id})
    except CliError as exc:
        sc = cli_error_status_code(exc.code, exc.message)
        body, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body, status_code=sc)
