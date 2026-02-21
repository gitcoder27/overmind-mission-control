"""Project endpoints: list, detail, tasks, approve, request-changes, set-status."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.database import fetch_all, fetch_one, parse_json_field
from app.models.responses import success, error, cli_error_status_code
from app.services.snapshot import _project_from_row, _attempt_from_row
from app.services.overmind import (
    project_approve as ovm_approve,
    project_request_changes as ovm_request_changes,
    project_set_status as ovm_set_status,
    OvmCliError,
)

router = APIRouter(prefix="/projects", tags=["projects"])


# ─── SQL ─────────────────────────────────────────────────────────

PROJECTS_LIST_SQL = """
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
{where}
GROUP BY p.id
ORDER BY p.priority DESC, p.updated_at DESC
LIMIT ? OFFSET ?
"""

PROJECT_DETAIL_SQL = """
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
WHERE p.id = ?
GROUP BY p.id
"""

TASKS_FOR_PROJECT_SQL = """
SELECT t.*,
    (SELECT COUNT(*) FROM task_attempts ta WHERE ta.task_id = t.id) AS attempt_count
FROM tasks t
WHERE t.project_id = ?
ORDER BY t.priority DESC, t.created_at ASC
"""

LATEST_ATTEMPT_SQL = """
SELECT ta.*, t.title AS task_title, t.project_id, p.goal AS project_goal
FROM task_attempts ta
JOIN tasks t ON ta.task_id = t.id
JOIN projects p ON t.project_id = p.id
WHERE ta.task_id = ?
ORDER BY ta.attempt_no DESC
LIMIT 1
"""

ALL_ATTEMPTS_FOR_PROJECT_SQL = """
SELECT ta.*, t.title AS task_title, t.project_id, p.goal AS project_goal
FROM task_attempts ta
JOIN tasks t ON ta.task_id = t.id
JOIN projects p ON t.project_id = p.id
WHERE t.project_id = ?
ORDER BY ta.started_at DESC, ta.attempt_no DESC
"""


# ─── Request bodies ──────────────────────────────────────────────

class ApproveBody(BaseModel):
    notes: Optional[str] = None


class RequestChangesBody(BaseModel):
    notes: Optional[str] = None


class SetStatusBody(BaseModel):
    status: str
    reason: Optional[str] = None


# ─── Endpoints ───────────────────────────────────────────────────

@router.get("")
async def list_projects(
    status: Optional[str] = Query(None),
    route_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List projects with optional filters."""
    conditions = []
    params: list = []

    if status:
        conditions.append("p.status = ?")
        params.append(status)
    if route_type:
        conditions.append("p.route_type = ?")
        params.append(route_type)
    if search:
        conditions.append("p.goal LIKE ?")
        params.append(f"%{search}%")

    where = ""
    if conditions:
        where = "WHERE " + " AND ".join(conditions)

    params.extend([limit, offset])
    sql = PROJECTS_LIST_SQL.format(where=where)
    rows = fetch_all(sql, tuple(params))
    projects = [_project_from_row(r) for r in rows]
    return success([p.model_dump() for p in projects])


@router.get("/{project_id}")
async def get_project(project_id: str):
    """Get a single project with task summary."""
    row = fetch_one(PROJECT_DETAIL_SQL, (project_id,))
    if not row:
        body, sc = error("NOT_FOUND", f"Project {project_id} not found", status=404)
        return JSONResponse(content=body, status_code=sc)
    return success(_project_from_row(row).model_dump())


@router.get("/{project_id}/tasks")
async def get_project_tasks(project_id: str):
    """Get tasks for a project, each with latest attempt."""
    # Guard: 404 when project itself does not exist
    project_row = fetch_one("SELECT id FROM projects WHERE id = ?", (project_id,))
    if not project_row:
        body, sc = error("NOT_FOUND", f"Project {project_id} not found", status=404)
        return JSONResponse(content=body, status_code=sc)

    rows = fetch_all(TASKS_FOR_PROJECT_SQL, (project_id,))
    tasks = []
    for r in rows:
        latest = fetch_one(LATEST_ATTEMPT_SQL, (r["id"],))
        task = {
            "id": r["id"],
            "projectId": r["project_id"],
            "title": r["title"],
            "description": r.get("description"),
            "role": r["role"],
            "status": r["status"],
            "priority": r.get("priority", 1),
            "retryCount": r.get("retry_count", 0),
            "maxRetries": r.get("max_retries", 3),
            "leaseExpiresAt": r.get("lease_expires_at"),
            "claimedBy": r.get("claimed_by"),
            "taskKind": r.get("task_kind", "execution"),
            "createdAt": r.get("created_at", ""),
            "updatedAt": r.get("updated_at", ""),
            "attemptCount": r.get("attempt_count", 0),
            "latestAttempt": _attempt_from_row(latest).model_dump() if latest else None,
        }
        tasks.append(task)
    return success(tasks)


@router.get("/{project_id}/attempts")
async def get_project_attempts(project_id: str):
    """Get all attempts (agent activity history) for a project."""
    project_row = fetch_one("SELECT id FROM projects WHERE id = ?", (project_id,))
    if not project_row:
        body, sc = error("NOT_FOUND", f"Project {project_id} not found", status=404)
        return JSONResponse(content=body, status_code=sc)

    rows = fetch_all(ALL_ATTEMPTS_FOR_PROJECT_SQL, (project_id,))
    attempts = [_attempt_from_row(r).model_dump() for r in rows]
    return success(attempts)


# ─── Mutations ─────────────────────────────────────────────────

@router.post("/{project_id}/approve")
async def approve_project(project_id: str, body: ApproveBody = ApproveBody()):
    """Approve a project via Overmind CLI."""
    try:
        await ovm_approve(project_id, body.notes or "")
        return success({"approved": True, "projectId": project_id})
    except OvmCliError as exc:
        sc = cli_error_status_code(exc.code, exc.message)
        body_resp, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body_resp, status_code=sc)


@router.post("/{project_id}/request-changes")
async def request_changes(project_id: str, body: RequestChangesBody = RequestChangesBody()):
    """Request changes on a project via Overmind CLI."""
    try:
        await ovm_request_changes(project_id, body.notes or "")
        return success({"changesRequested": True, "projectId": project_id})
    except OvmCliError as exc:
        sc = cli_error_status_code(exc.code, exc.message)
        body_resp, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body_resp, status_code=sc)


@router.post("/{project_id}/set-status")
async def set_project_status(project_id: str, body: SetStatusBody):
    """Set project status via Overmind CLI."""
    try:
        await ovm_set_status(project_id, body.status, body.reason or "")
        return success({"status": body.status, "projectId": project_id})
    except OvmCliError as exc:
        sc = cli_error_status_code(exc.code, exc.message)
        body_resp, _ = error(exc.code, exc.message, exc.details, sc)
        return JSONResponse(content=body_resp, status_code=sc)
