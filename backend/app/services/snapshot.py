"""Snapshot builder – assembles SystemSnapshot from DB + CLI sources.

Used by GET /system/snapshot and the WebSocket broadcast loop.

Performance notes (v2):
- ``build_snapshot()`` is now async, using ``asyncio.gather`` to run the
  OpenClaw gateway health check concurrently with DB queries.
- Snapshot results are cached with a short TTL (2s) + single-flight dedup
  via ``snapshot_cache`` to prevent redundant work under concurrent load
  (HTTP + WS polls hitting within the same window).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from app.database import fetch_all, fetch_one, parse_json_field
from app.models.domain import (
    Alert,
    Attempt,
    Blocker,
    DeadLetter,
    EventItem,
    HealthComponent,
    HealthState,
    OrchestratorStatus,
    Project,
    RetryStorm,
    SnapshotSummary,
    SystemSnapshot,
    TaskSummary,
)
from app.config import OVERMIND_HEARTBEAT, OVERMIND_PID_FILE
from app.services.cache import snapshot_cache

logger = logging.getLogger(__name__)

# ── Snapshot TTL for cache ──────────────────────────────────────
_SNAPSHOT_TTL = 2.0  # seconds


# ─── Row→Model mappers ──────────────────────────────────────────

def _project_from_row(row: dict[str, Any]) -> Project:
    ts = TaskSummary()
    if "total_tasks" in row:
        ts = TaskSummary(
            total=row.get("total_tasks", 0) or 0,
            done=row.get("done_tasks", 0) or 0,
            inProgress=row.get("in_progress_tasks", 0) or 0,
            blocked=row.get("blocked_tasks", 0) or 0,
            failed=row.get("failed_tasks", 0) or 0,
            todo=row.get("todo_tasks", 0) or 0,
            ready=row.get("ready_tasks", 0) or 0,
            review=row.get("review_tasks", 0) or 0,
            cancelled=row.get("cancelled_tasks", 0) or 0,
        )
    return Project(
        id=row["id"],
        goal=row["goal"],
        status=row["status"],
        priority=row.get("priority", 1),
        routeType=row.get("route_type"),
        activePlanVersion=row.get("active_plan_version", 1),
        maxReplanCycles=row.get("max_replan_cycles", 3),
        replanCount=row.get("replan_count", 0),
        createdBy=row.get("created_by", "coordinator"),
        metadata=parse_json_field(row.get("metadata_json")),
        createdAt=row.get("created_at", ""),
        updatedAt=row.get("updated_at", ""),
        taskSummary=ts,
    )


def _attempt_from_row(row: dict[str, Any]) -> Attempt:
    return Attempt(
        id=row["id"],
        taskId=row["task_id"],
        agentRole=row["agent_role"],
        status=row["status"],
        attemptNo=row.get("attempt_no", 1),
        startedAt=row.get("started_at"),
        endedAt=row.get("ended_at"),
        errorCode=row.get("error_code"),
        errorMessage=row.get("error_message"),
        invocationMode=row.get("invocation_mode", "mock"),
        sessionKey=row.get("session_key"),
        taskTitle=row.get("task_title"),
        projectId=row.get("project_id"),
        projectGoal=row.get("project_goal"),
    )


def _event_from_row(row: dict[str, Any]) -> EventItem:
    return EventItem(
        id=row["id"],
        projectId=row.get("project_id"),
        taskId=row.get("task_id"),
        eventType=row.get("event_type", ""),
        level=row.get("level", "INFO"),
        source=row.get("source", "orchestrator"),
        payload=parse_json_field(row.get("payload_json")),
        createdAt=row.get("created_at", ""),
    )


def _blocker_from_row(row: dict[str, Any]) -> Blocker:
    return Blocker(
        id=row["id"],
        projectId=row.get("project_id"),
        taskId=row.get("task_id"),
        sourceRole=row.get("source_role", ""),
        question=row.get("question", ""),
        impact=row.get("impact"),
        suggestedAction=row.get("suggested_action"),
        status=row.get("status", "OPEN"),
        createdAt=row.get("created_at", ""),
    )


def _dead_letter_from_row(row: dict[str, Any]) -> DeadLetter:
    return DeadLetter(
        id=row["id"],
        projectId=row.get("project_id"),
        taskId=row.get("task_id"),
        attemptId=row.get("attempt_id"),
        reason=row.get("reason", ""),
        status=row.get("status", "OPEN"),
        createdAt=row.get("created_at", ""),
        projectGoal=row.get("project_goal"),
        taskTitle=row.get("task_title"),
        taskRole=row.get("task_role"),
    )


# ─── Orchestrator status from files ─────────────────────────────

def _get_orchestrator_status() -> OrchestratorStatus:
    running = False
    pid = None
    heartbeat_ts = None
    stagnant = False
    uptime = None

    # PID
    try:
        pid_text = OVERMIND_PID_FILE.read_text().strip()
        pid = int(pid_text)
        # Check if process exists
        import os
        try:
            os.kill(pid, 0)
            running = True
        except OSError:
            running = False
    except (FileNotFoundError, ValueError):
        pass

    # Heartbeat
    try:
        stat = OVERMIND_HEARTBEAT.stat()
        heartbeat_ts = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        age = time.time() - stat.st_mtime
        stagnant = age > 30  # stagnant if heartbeat > 30s old
    except FileNotFoundError:
        stagnant = True

    # Cursor from runtime_state
    cursor_pos = 0
    cursor_lag = 0
    try:
        row = fetch_one("SELECT value FROM runtime_state WHERE key = 'cursor_position'")
        if row:
            cursor_pos = int(row["value"])
        latest = fetch_one("SELECT MAX(ROWID) as max_id FROM events")
        if latest and latest["max_id"]:
            cursor_lag = int(latest["max_id"]) - cursor_pos
    except Exception:
        pass

    return OrchestratorStatus(
        running=running,
        pid=pid,
        cursorPosition=cursor_pos,
        cursorLag=cursor_lag,
        lastHeartbeat=heartbeat_ts,
        stagnant=stagnant,
        uptimeSeconds=uptime,
    )


# ─── Full snapshot builder ──────────────────────────────────────

PROJECT_WITH_TASKS_SQL = """
SELECT p.*,
    COUNT(t.id)                                                    AS total_tasks,
    SUM(CASE WHEN t.status = 'DONE' THEN 1 ELSE 0 END)           AS done_tasks,
    SUM(CASE WHEN t.status = 'IN_PROGRESS' THEN 1 ELSE 0 END)    AS in_progress_tasks,
    SUM(CASE WHEN t.status = 'BLOCKED' THEN 1 ELSE 0 END)        AS blocked_tasks,
    SUM(CASE WHEN t.status = 'FAILED' THEN 1 ELSE 0 END)         AS failed_tasks,
    SUM(CASE WHEN t.status = 'TODO' THEN 1 ELSE 0 END)           AS todo_tasks,
    SUM(CASE WHEN t.status = 'READY' THEN 1 ELSE 0 END)          AS ready_tasks,
    SUM(CASE WHEN t.status = 'REVIEW' THEN 1 ELSE 0 END)         AS review_tasks,
    SUM(CASE WHEN t.status = 'CANCELLED' THEN 1 ELSE 0 END)      AS cancelled_tasks
FROM projects p
LEFT JOIN tasks t ON p.id = t.project_id
WHERE p.status IN ('ACTIVE', 'WAITING_USER_APPROVAL', 'QUEUED', 'BLOCKED')
GROUP BY p.id
ORDER BY p.priority DESC, p.updated_at DESC
"""

RUNNING_ATTEMPTS_SQL = """
SELECT ta.*, t.title AS task_title, t.project_id, p.goal AS project_goal
FROM task_attempts ta
JOIN tasks t ON ta.task_id = t.id
JOIN projects p ON t.project_id = p.id
WHERE ta.status = 'RUNNING'
ORDER BY ta.started_at DESC
"""

RECENT_EVENTS_SQL = """
SELECT * FROM events
ORDER BY created_at DESC
LIMIT 50
"""

OPEN_BLOCKERS_SQL = """
SELECT * FROM blockers
WHERE status = 'OPEN'
ORDER BY created_at DESC
"""

OPEN_DEAD_LETTERS_SQL = """
SELECT dl.*, p.goal AS project_goal, t.title AS task_title, t.role AS task_role
FROM dead_letters dl
LEFT JOIN projects p ON dl.project_id = p.id
LEFT JOIN tasks t ON dl.task_id = t.id
WHERE dl.status = 'OPEN'
ORDER BY dl.created_at DESC
"""

RETRY_STORMS_SQL = """
SELECT t.id AS task_id, t.title AS task_title, t.project_id,
       t.retry_count AS fail_count,
       COUNT(ta.id) AS total_attempts
FROM tasks t
JOIN task_attempts ta ON t.id = ta.task_id
WHERE t.retry_count >= 3
  AND t.status IN ('FAILED', 'IN_PROGRESS', 'BLOCKED')
GROUP BY t.id
HAVING COUNT(ta.id) >= 3
ORDER BY t.retry_count DESC
"""

SUMMARY_SQL = """
SELECT
    (SELECT COUNT(*) FROM projects WHERE status IN ('ACTIVE','QUEUED','BLOCKED'))  AS active_projects,
    (SELECT COUNT(*) FROM projects WHERE status = 'WAITING_USER_APPROVAL')         AS waiting_approval,
    (SELECT COUNT(*) FROM task_attempts WHERE status = 'RUNNING')                  AS running_attempts,
    (SELECT COUNT(*) FROM tasks WHERE status = 'BLOCKED')                          AS blocked_tasks,
    (SELECT COUNT(*) FROM dead_letters WHERE status = 'OPEN')                      AS dead_letters,
    (SELECT COUNT(*) FROM projects)                                                AS total_projects,
    (SELECT COUNT(*) FROM tasks)                                                   AS total_tasks
"""


async def _fetch_gateway_status_safe() -> tuple[str, str | None]:
    """Fetch gateway status without blocking; return (status, message)."""
    try:
        from app.services.openclaw import gateway_status
        await gateway_status()
        return ("healthy", "gateway reachable")
    except Exception:
        return ("degraded", "gateway unreachable")


def _build_db_snapshot() -> dict[str, Any]:
    """Collect all DB data in one synchronous call (fast – ~1ms range).

    Grouped into a single function so it can be offloaded to a thread
    if needed, or called inline when the DB path is fast.
    """
    t0 = time.monotonic()

    summary_row = fetch_one(SUMMARY_SQL)
    db_ms = (time.monotonic() - t0) * 1000

    return {
        "summary_row": summary_row or {},
        "db_ms": round(db_ms, 1),
        "active_projects": fetch_all(PROJECT_WITH_TASKS_SQL),
        "running_attempts": fetch_all(RUNNING_ATTEMPTS_SQL),
        "recent_events": fetch_all(RECENT_EVENTS_SQL),
        "blockers": fetch_all(OPEN_BLOCKERS_SQL),
        "dead_letters": fetch_all(OPEN_DEAD_LETTERS_SQL),
        "retry_storms": fetch_all(RETRY_STORMS_SQL),
    }


async def _build_snapshot_impl() -> SystemSnapshot:
    """Internal snapshot builder — always creates a fresh snapshot.

    The expensive gateway_status call and DB reads run concurrently via
    ``asyncio.gather``.
    """
    t0 = time.monotonic()
    now = datetime.now(timezone.utc).isoformat()

    # Orchestrator status (file reads – fast)
    orch = _get_orchestrator_status()

    # Run gateway check and DB queries concurrently
    loop = asyncio.get_running_loop()
    gw_task = asyncio.ensure_future(_fetch_gateway_status_safe())
    db_task = loop.run_in_executor(None, _build_db_snapshot)

    gw_result, db = await asyncio.gather(gw_task, db_task)

    gw_status, gw_message = gw_result

    # Health components
    components: list[HealthComponent] = []
    components.append(HealthComponent(name="api", status="healthy", latencyMs=0, message="ok"))
    components.append(HealthComponent(
        name="database", status="healthy", latencyMs=db["db_ms"], message="ok"
    ))

    # Orchestrator health
    if orch.running and not orch.stagnant:
        components.append(HealthComponent(name="orchestrator", status="healthy", latencyMs=None, message="running"))
    elif orch.running and orch.stagnant:
        components.append(HealthComponent(name="orchestrator", status="degraded", latencyMs=None, message="stagnant heartbeat"))
    else:
        components.append(HealthComponent(name="orchestrator", status="unhealthy", latencyMs=None, message="not running"))

    components.append(HealthComponent(name="openclaw", status=gw_status, latencyMs=None, message=gw_message))

    overall = "healthy"
    if any(c.status == "unhealthy" for c in components):
        overall = "unhealthy"
    elif any(c.status == "degraded" for c in components):
        overall = "degraded"

    health = HealthState(overall=overall, components=components, timestamp=now)

    # Summary
    sr = db["summary_row"]
    summary = SnapshotSummary(
        activeProjects=sr.get("active_projects", 0) or 0,
        waitingApproval=sr.get("waiting_approval", 0) or 0,
        runningAttempts=sr.get("running_attempts", 0) or 0,
        blockedTasks=sr.get("blocked_tasks", 0) or 0,
        deadLetters=sr.get("dead_letters", 0) or 0,
        retryStorms=0,
        totalProjects=sr.get("total_projects", 0) or 0,
        totalTasks=sr.get("total_tasks", 0) or 0,
    )

    active_projects = [_project_from_row(r) for r in db["active_projects"]]
    running_attempts = [_attempt_from_row(r) for r in db["running_attempts"]]
    recent_events = [_event_from_row(r) for r in db["recent_events"]]
    blockers = [_blocker_from_row(r) for r in db["blockers"]]
    dead_letters = [_dead_letter_from_row(r) for r in db["dead_letters"]]

    retry_storms = []
    for r in db["retry_storms"]:
        retry_storms.append(RetryStorm(
            taskId=r["task_id"],
            taskTitle=r["task_title"],
            failCount=r["fail_count"],
            totalAttempts=r["total_attempts"],
            projectId=r["project_id"],
        ))
    summary.retryStorms = len(retry_storms)

    # Alerts
    alerts: list[Alert] = []
    if orch.stagnant:
        alerts.append(Alert(
            id="alert-orch-stagnant",
            severity="warning",
            title="Orchestrator Stagnant",
            message="Orchestrator heartbeat is stale (>30s).",
            source="orchestrator",
            timestamp=now,
            acknowledged=False,
        ))
    if len(dead_letters) > 0:
        alerts.append(Alert(
            id="alert-dead-letters",
            severity="warning",
            title=f"{len(dead_letters)} Open Dead Letter(s)",
            message="Tasks have failed permanently and need triage.",
            source="reliability",
            timestamp=now,
            acknowledged=False,
        ))
    if len(retry_storms) > 0:
        alerts.append(Alert(
            id="alert-retry-storms",
            severity="critical",
            title=f"{len(retry_storms)} Retry Storm(s)",
            message="Tasks are failing repeatedly.",
            source="reliability",
            timestamp=now,
            acknowledged=False,
        ))

    elapsed = (time.monotonic() - t0) * 1000
    logger.debug("snapshot built in %.1fms (db=%.1fms)", elapsed, db["db_ms"])

    return SystemSnapshot(
        health=health,
        orchestrator=orch,
        summary=summary,
        activeProjects=active_projects,
        runningAttempts=running_attempts,
        recentEvents=recent_events,
        alerts=alerts,
        retryStorms=retry_storms,
        blockers=blockers,
        deadLetters=dead_letters,
        timestamp=now,
    )


async def build_snapshot() -> SystemSnapshot:
    """Build the full system snapshot (cached + deduplicated).

    Multiple concurrent callers (HTTP endpoints, WS poll loop) will share
    the same in-flight computation within the TTL window.
    """
    return await snapshot_cache.get_or_fetch(
        "snapshot", _build_snapshot_impl, ttl=_SNAPSHOT_TTL
    )


def snapshot_hash(snap: SystemSnapshot) -> str:
    """Deterministic hash of the snapshot for change detection."""
    raw = json.dumps(snap.model_dump(), sort_keys=True, default=str)
    return hashlib.md5(raw.encode()).hexdigest()
