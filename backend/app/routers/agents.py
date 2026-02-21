"""Agents endpoint – merges OpenClaw agent list with Overmind role context."""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.config import OPENCLAW_ROOT
from app.database import fetch_all
from app.models.responses import success, error
from app.services.openclaw import (
    agents_list as oc_agents_list,
    sessions_for_agent as oc_sessions_for_agent,
    get_default_model as oc_get_default_model,
    CliError,
)
from app.services.transcript_parser import (
    parse_jsonl_transcript,
    parse_legacy_messages,
    _extract_text_from_content,
    _normalize_timestamp as _parser_normalize_ts,
    DEFAULT_MAX_CONTENT_SIZE,
)

router = APIRouter(prefix="/agents", tags=["agents"])
logger = logging.getLogger(__name__)

# Canonical Overmind roles
OVERMIND_ROLES = [
    "coordinator",
    "architect",
    "builder",
    "scout",
    "oracle",
    "qa",
]

# Strict allowlist for profile file reads
PROFILE_FILE_ALLOWLIST: dict[str, str] = {
    "agents": "AGENTS.md",
    "soul": "SOUL.md",
    "identity": "IDENTITY.md",
    "user": "USER.md",
    "tools": "TOOLS.md",
}

# Maximum file size we will return (64 KiB)
MAX_FILE_SIZE = 64 * 1024

AGENT_STATS_SQL = """
SELECT agent_role,
    COUNT(*)                                                       AS total,
    SUM(CASE WHEN status = 'SUCCEEDED' THEN 1 ELSE 0 END)        AS succeeded,
    SUM(CASE WHEN status = 'RUNNING' THEN 1 ELSE 0 END)          AS running,
    AVG(CASE WHEN ended_at IS NOT NULL AND started_at IS NOT NULL
        THEN (julianday(ended_at) - julianday(started_at)) * 86400
        ELSE NULL END)                                             AS avg_duration
FROM task_attempts
GROUP BY agent_role
"""


# ── Helpers ──────────────────────────────────────────────────────

async def _get_oc_agents() -> list[dict]:
    """Fetch OpenClaw agents list with graceful degradation."""
    try:
        return await oc_agents_list()
    except CliError:
        logger.warning("OpenClaw agents list unavailable, using role defaults")
        return []


async def _get_default_model_cached() -> str | None:
    """Return the OpenClaw default model string (cached per call)."""
    try:
        return await oc_get_default_model()
    except Exception:
        return None


def _normalize_ts(value: str | int | float | None) -> str:
    """Normalize mixed timestamp shapes into ISO-8601 strings."""
    if value is None:
        return ""

    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc).isoformat()

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return ""
        if raw.isdigit():
            return datetime.fromtimestamp(int(raw) / 1000, tz=timezone.utc).isoformat()
        return raw

    return ""


def _resolve_agent_workspace(oc_match: dict | None) -> str | None:
    """Extract workspace path from OpenClaw agent data, sanitised."""
    if not oc_match:
        return None
    ws = oc_match.get("workspace", oc_match.get("workspacePath", None))
    if ws and isinstance(ws, str):
        # Return relative to home for safety – never expose full path
        home = str(Path.home())
        if ws.startswith(home):
            return "~" + ws[len(home):]
        return ws
    return None


def _profile_health(workspace_dir: Path | None) -> dict:
    """Check which profile markdown files exist."""
    missing: list[str] = []
    for key, fname in PROFILE_FILE_ALLOWLIST.items():
        if workspace_dir is None or not (workspace_dir / fname).is_file():
            missing.append(key)
    return {"ok": len(missing) == 0, "missingFiles": missing}


def _build_agent(
    role: str,
    oc_match: dict | None,
    stats: dict,
    default_model: str | None,
) -> dict:
    """Build a single agent dict with model visibility."""
    running = stats.get("running", 0)
    agent_status = "busy" if running > 0 else "idle"
    agent_id = f"overmind-{role}"
    agent_name = (
        oc_match.get("identityName", role.capitalize()) if oc_match else role.capitalize()
    )

    # Model resolution
    primary_model = oc_match.get("model") if oc_match else None
    if primary_model:
        effective_model = primary_model
        model_source = "primary"
    elif default_model:
        effective_model = default_model
        model_source = "default"
    else:
        effective_model = None
        model_source = "unknown"

    registered = oc_match is not None

    # Workspace path for profile file checks
    ws_raw = oc_match.get("workspace", oc_match.get("workspacePath")) if oc_match else None
    workspace_dir = Path(ws_raw) if ws_raw else None
    safe_workspace = _resolve_agent_workspace(oc_match)

    return {
        "id": agent_id,
        "name": agent_name,
        "role": role,
        "status": agent_status,
        "successRate": stats.get("rate", 0.0),
        "avgDuration": stats.get("avg_duration", 0.0),
        "totalAttempts": stats.get("total", 0),
        "recentActivity": [],
        # New fields
        "effectiveModel": effective_model,
        "modelSource": model_source,
        "registered": registered,
        "workspace": safe_workspace,
        "profileHealth": _profile_health(workspace_dir),
    }


def _find_oc_match(role: str, oc_agents: list[dict]) -> dict | None:
    """Find the OpenClaw agent record matching a role."""
    for a in oc_agents:
        aid = a.get("id", "")
        if role in aid.lower() or aid.lower().startswith(f"overmind-{role}"):
            return a
    return None


def _agent_workspace_path(oc_match: dict | None) -> Path | None:
    """Return the real workspace path for an agent (for file reads)."""
    if not oc_match:
        return None
    ws = oc_match.get("workspace", oc_match.get("workspacePath"))
    if ws and isinstance(ws, str):
        p = Path(ws)
        if p.is_dir():
            return p
    return None


# ── Endpoints ────────────────────────────────────────────────────

@router.get("")
async def list_agents():
    """Agent directory: merge OpenClaw agents with Overmind role stats."""
    stats_rows = fetch_all(AGENT_STATS_SQL)
    stats_by_role: dict = {}
    for r in stats_rows:
        role = r["agent_role"]
        total = r["total"] or 0
        succeeded = r["succeeded"] or 0
        stats_by_role[role] = {
            "total": total,
            "succeeded": succeeded,
            "running": r["running"] or 0,
            "rate": round(succeeded / total * 100, 1) if total > 0 else 0.0,
            "avg_duration": round(r["avg_duration"] or 0, 1),
        }

    oc_agents, default_model = await asyncio.gather(
        _get_oc_agents(), _get_default_model_cached()
    )

    agents = []
    for role in OVERMIND_ROLES:
        st = stats_by_role.get(role, {})
        oc_match = _find_oc_match(role, oc_agents)
        agents.append(_build_agent(role, oc_match, st, default_model))

    return success(agents)


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    """Single agent detail."""
    # Validate agent_id pattern
    role = agent_id.replace("overmind-", "") if agent_id.startswith("overmind-") else agent_id
    if role not in OVERMIND_ROLES:
        body, status = error("NOT_FOUND", f"Agent not found: {agent_id}")
        return JSONResponse(content=body, status_code=status)

    stats_rows = fetch_all(AGENT_STATS_SQL)
    stats_by_role: dict = {}
    for r in stats_rows:
        r_role = r["agent_role"]
        total = r["total"] or 0
        succeeded = r["succeeded"] or 0
        stats_by_role[r_role] = {
            "total": total,
            "succeeded": succeeded,
            "running": r["running"] or 0,
            "rate": round(succeeded / total * 100, 1) if total > 0 else 0.0,
            "avg_duration": round(r["avg_duration"] or 0, 1),
        }

    oc_agents, default_model = await asyncio.gather(
        _get_oc_agents(), _get_default_model_cached()
    )
    oc_match = _find_oc_match(role, oc_agents)
    st = stats_by_role.get(role, {})

    agent = _build_agent(role, oc_match, st, default_model)
    return success(agent)


@router.get("/{agent_id}/files")
async def list_agent_files(agent_id: str):
    """List profile files for an agent with existence/size metadata."""
    role = agent_id.replace("overmind-", "") if agent_id.startswith("overmind-") else agent_id
    if role not in OVERMIND_ROLES:
        body, status = error("NOT_FOUND", f"Agent not found: {agent_id}")
        return JSONResponse(content=body, status_code=status)

    oc_agents = await _get_oc_agents()
    oc_match = _find_oc_match(role, oc_agents)
    ws_path = _agent_workspace_path(oc_match)

    files = []
    for key, fname in PROFILE_FILE_ALLOWLIST.items():
        file_info: dict = {
            "name": fname,
            "key": key,
            "relativePath": fname,
            "exists": False,
            "size": None,
            "updatedAt": None,
        }
        if ws_path:
            fp = ws_path / fname
            if fp.is_file():
                stat = fp.stat()
                file_info["exists"] = True
                file_info["size"] = stat.st_size
                file_info["updatedAt"] = datetime.fromtimestamp(
                    stat.st_mtime, tz=timezone.utc
                ).isoformat()
        files.append(file_info)

    return success(files)


@router.get("/{agent_id}/files/{file_key}")
async def get_agent_file(agent_id: str, file_key: str):
    """Read a single profile file (strict allowlist)."""
    # Validate file key
    if file_key not in PROFILE_FILE_ALLOWLIST:
        body, status = error(
            "INVALID_FILE_KEY",
            f"File key '{file_key}' not allowed. Valid keys: {', '.join(PROFILE_FILE_ALLOWLIST.keys())}",
        )
        return JSONResponse(content=body, status_code=status)

    role = agent_id.replace("overmind-", "") if agent_id.startswith("overmind-") else agent_id
    if role not in OVERMIND_ROLES:
        body, status = error("NOT_FOUND", f"Agent not found: {agent_id}")
        return JSONResponse(content=body, status_code=status)

    oc_agents = await _get_oc_agents()
    oc_match = _find_oc_match(role, oc_agents)
    ws_path = _agent_workspace_path(oc_match)

    if not ws_path:
        body, status = error("NO_WORKSPACE", "Agent workspace not available")
        return JSONResponse(content=body, status_code=status)

    fname = PROFILE_FILE_ALLOWLIST[file_key]
    fp = (ws_path / fname).resolve()

    # Safety: ensure resolved path is inside the workspace
    try:
        fp.relative_to(ws_path.resolve())
    except ValueError:
        body, status = error("PATH_TRAVERSAL", "Invalid file path")
        return JSONResponse(content=body, status_code=status)

    if not fp.is_file():
        body, status = error("FILE_NOT_FOUND", f"{fname} does not exist for {agent_id}")
        return JSONResponse(content=body, status_code=status)

    if fp.stat().st_size > MAX_FILE_SIZE:
        body, status = error("FILE_TOO_LARGE", f"{fname} exceeds maximum size")
        return JSONResponse(content=body, status_code=status)

    content = fp.read_text(encoding="utf-8", errors="replace")
    return success({
        "key": file_key,
        "name": fname,
        "content": content,
        "size": len(content),
    })


@router.get("/{agent_id}/sessions")
async def list_agent_sessions(agent_id: str):
    """List recent sessions for an agent."""
    role = agent_id.replace("overmind-", "") if agent_id.startswith("overmind-") else agent_id
    if role not in OVERMIND_ROLES:
        body, status = error("NOT_FOUND", f"Agent not found: {agent_id}")
        return JSONResponse(content=body, status_code=status)

    sessions: list[dict] = []
    try:
        raw = await oc_sessions_for_agent(agent_id)
        for s in raw:
            # OpenClaw session schema currently uses `key` + `sessionId` + millisecond timestamps.
            session_key = (
                s.get("sessionId")
                or s.get("session_id")
                or s.get("key")
                or s.get("sessionKey")
                or s.get("id")
                or ""
            )
            updated = _normalize_ts(s.get("updatedAt", s.get("updated_at")))
            created = _normalize_ts(s.get("createdAt", s.get("created_at"))) or updated

            sessions.append({
                "sessionKey": session_key,
                "agentId": s.get("agentId", s.get("agent_id", agent_id)),
                "updatedAt": updated,
                "createdAt": created,
                "messageCount": s.get("messageCount", s.get("message_count", None)),
            })
    except CliError:
        logger.warning("OpenClaw sessions unavailable for %s", agent_id)

    return success(sessions)


@router.get("/{agent_id}/sessions/{session_key}/messages")
async def get_session_messages(agent_id: str, session_key: str):
    """Read messages from a session for conversation replay (backward-compatible).

    Returns flat message list with role/content/timestamp/tokenCount.
    For richer data, use the /transcript endpoint instead.
    """
    role = agent_id.replace("overmind-", "") if agent_id.startswith("overmind-") else agent_id
    if role not in OVERMIND_ROLES:
        body, status = error("NOT_FOUND", f"Agent not found: {agent_id}")
        return JSONResponse(content=body, status_code=status)

    raw_text, plain_messages = _read_session_file(agent_id, session_key)

    if raw_text is not None:
        # JSONL envelope format — use new parser
        transcript = parse_jsonl_transcript(raw_text, include_events=False, include_thinking=False)
        normalized = []
        for item in transcript["items"]:
            if item["eventType"] == "message":
                usage = item.get("usage")
                token_count = None
                if usage:
                    token_count = (usage.get("inputTokens", 0) or 0) + (usage.get("outputTokens", 0) or 0)
                normalized.append({
                    "role": item["role"] or "user",
                    "content": item["contentText"],
                    "timestamp": item["timestamp"],
                    "tokenCount": token_count,
                })
        return success(normalized)

    if plain_messages is not None:
        # Plain JSON format — use legacy parser
        return success(parse_legacy_messages(plain_messages))

    return success([])


@router.get("/{agent_id}/sessions/{session_key}/transcript")
async def get_session_transcript(
    agent_id: str,
    session_key: str,
    limit: int | None = None,
    offset: int = 0,
    includeEvents: bool = True,
    includeThinking: bool = True,
    maxContentSize: int | None = DEFAULT_MAX_CONTENT_SIZE,
):
    """Rich transcript endpoint for full session inspection.

    Returns structured transcript with content parts, usage, metadata, etc.
    Query params:
      - limit: max items to return
      - offset: skip N items (for pagination)
      - includeEvents: include non-message events (model_change, etc.) [default: true]
      - includeThinking: include thinking content parts [default: true]
      - maxContentSize: truncate tool payloads beyond this size (chars).
            Default 500.  Set to 0 or negative to disable truncation.
    """
    role = agent_id.replace("overmind-", "") if agent_id.startswith("overmind-") else agent_id
    if role not in OVERMIND_ROLES:
        body, status = error("NOT_FOUND", f"Agent not found: {agent_id}")
        return JSONResponse(content=body, status_code=status)

    effective_max = maxContentSize if (maxContentSize is not None and maxContentSize > 0) else None

    raw_text, plain_messages = _read_session_file(agent_id, session_key)

    if raw_text is not None:
        transcript = parse_jsonl_transcript(
            raw_text,
            include_events=includeEvents,
            include_thinking=includeThinking,
            limit=limit,
            offset=offset,
            max_content_size=effective_max,
        )
        return success(transcript)

    if plain_messages is not None:
        # Wrap legacy messages in transcript shape
        legacy = parse_legacy_messages(plain_messages)
        items = []
        for i, msg in enumerate(legacy):
            ct = msg.get("content", "")
            items.append({
                "index": i,
                "eventType": "message",
                "timestamp": msg.get("timestamp"),
                "role": msg.get("role", "user"),
                "contentText": ct,
                "contentParts": [{"type": "text", "text": ct}],
                "usage": {"inputTokens": 0, "outputTokens": msg.get("tokenCount", 0) or 0, "cacheReadTokens": 0, "cacheCreationTokens": 0} if msg.get("tokenCount") else None,
                "model": None,
                "metadata": {},
                "kind": "chat",
                "summary": ct[:120] if ct else "",
                "contentSize": len(ct) if ct else 0,
                "truncated": False,
                "toolMeta": None,
                "toolGroupId": None,
            })
        paginated = items[offset:]
        if limit is not None:
            paginated = paginated[:limit]
        return success({
            "items": paginated,
            "totalEvents": len(items),
            "messageCount": len(items),
            "hasMore": (offset + len(paginated)) < len(items),
            "sessionId": session_key,
            "model": None,
            "parseErrors": 0,
            "toolCallCount": 0,
        })

    return success({
        "items": [],
        "totalEvents": 0,
        "messageCount": 0,
        "hasMore": False,
        "sessionId": session_key,
        "model": None,
        "parseErrors": 0,
        "toolCallCount": 0,
    })


@router.get("/{agent_id}/sessions/{session_key}/transcript/item/{item_index}")
async def get_transcript_item_raw(
    agent_id: str,
    session_key: str,
    item_index: int,
):
    """Return a single transcript item with full (untruncated) content.

    Used by the frontend to lazily load the complete payload for items
    that were truncated in the main transcript response.
    """
    role = agent_id.replace("overmind-", "") if agent_id.startswith("overmind-") else agent_id
    if role not in OVERMIND_ROLES:
        body, status = error("NOT_FOUND", f"Agent not found: {agent_id}")
        return JSONResponse(content=body, status_code=status)

    raw_text, plain_messages = _read_session_file(agent_id, session_key)

    if raw_text is not None:
        # Parse without truncation to get the full item
        transcript = parse_jsonl_transcript(
            raw_text,
            include_events=True,
            include_thinking=True,
            max_content_size=None,  # No truncation
        )
        for item in transcript["items"]:
            if item["index"] == item_index:
                return success(item)
        body, status = error("NOT_FOUND", f"Item {item_index} not found in transcript")
        return JSONResponse(content=body, status_code=status)

    if plain_messages is not None:
        legacy = parse_legacy_messages(plain_messages)
        if 0 <= item_index < len(legacy):
            msg = legacy[item_index]
            ct = msg.get("content", "")
            return success({
                "index": item_index,
                "eventType": "message",
                "timestamp": msg.get("timestamp"),
                "role": msg.get("role", "user"),
                "contentText": ct,
                "contentParts": [{"type": "text", "text": ct}],
                "usage": None,
                "model": None,
                "metadata": {},
                "kind": "chat",
                "summary": ct[:120],
                "contentSize": len(ct),
                "truncated": False,
                "toolMeta": None,
                "toolGroupId": None,
            })
        body, status = error("NOT_FOUND", f"Item {item_index} not found")
        return JSONResponse(content=body, status_code=status)

    body, status = error("NOT_FOUND", "Session not found")
    return JSONResponse(content=body, status_code=status)


def _read_session_file(agent_id: str, session_key: str) -> tuple[str | None, list[dict] | None]:
    """Find and read session data. Returns (raw_jsonl_text, plain_messages).

    If raw JSONL is found, returns (text, None).
    If plain JSON messages are found, returns (None, messages).
    If nothing found, returns (None, None).
    """
    import json as _json

    agent_sessions_dir = OPENCLAW_ROOT / "agents" / agent_id / "sessions"
    legacy_sessions_dir = OPENCLAW_ROOT / "sessions"

    candidate_paths = [
        agent_sessions_dir / f"{session_key}.jsonl",
        agent_sessions_dir / f"{session_key}.json",
        agent_sessions_dir / session_key / "messages.json",
        legacy_sessions_dir / f"{session_key}.jsonl",
        legacy_sessions_dir / f"{session_key}.json",
        legacy_sessions_dir / session_key / "messages.json",
    ]

    for path in candidate_paths:
        if path.is_file():
            try:
                raw = path.read_text(encoding="utf-8", errors="replace")
                if path.suffix == ".jsonl":
                    return (raw, None)
                else:
                    data = _json.loads(raw)
                    if isinstance(data, list):
                        return (None, data)
                    elif isinstance(data, dict) and "messages" in data:
                        return (None, data["messages"])
                    # Might be a single envelope — treat as JSONL
                    return (raw, None)
            except Exception:
                logger.warning("Could not read session file: %s", path)

    return (None, None)
