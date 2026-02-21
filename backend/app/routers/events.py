"""Events endpoint."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from app.database import fetch_all, parse_json_field
from app.models.responses import success

router = APIRouter(prefix="/events", tags=["events"])


@router.get("")
async def list_events(
    project_id: Optional[str] = Query(None),
    task_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List events with optional filters."""
    conditions: list[str] = []
    params: list = []

    if project_id:
        conditions.append("project_id = ?")
        params.append(project_id)
    if task_id:
        conditions.append("task_id = ?")
        params.append(task_id)
    if event_type:
        conditions.append("event_type = ?")
        params.append(event_type)

    where = ""
    if conditions:
        where = "WHERE " + " AND ".join(conditions)

    sql = f"""
        SELECT * FROM events
        {where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])
    rows = fetch_all(sql, tuple(params))

    events = []
    for r in rows:
        events.append({
            "id": r["id"],
            "projectId": r.get("project_id"),
            "taskId": r.get("task_id"),
            "eventType": r.get("event_type", ""),
            "level": r.get("level", "INFO"),
            "source": r.get("source", "orchestrator"),
            "payload": parse_json_field(r.get("payload_json")),
            "createdAt": r.get("created_at", ""),
        })

    return success(events)
