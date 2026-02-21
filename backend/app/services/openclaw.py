"""Async subprocess wrappers for OpenClaw CLI commands.

Safety rule: only use validated commands, never write to config/auth files.

Performance notes (v2):
- All read commands use ``asyncio.create_subprocess_exec`` to avoid blocking
  the FastAPI event loop.
- Expensive reads are cached via ``cli_cache`` with per-command TTL.
- Single-flight deduplication prevents redundant subprocess spawns under
  concurrent load.
- Mutation commands remain uncached and use threadpool fallback for safety.
"""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
import time
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.config import OPENCLAW_CLI, CLI_STATUS_TIMEOUT, CLI_MUTATION_TIMEOUT, OPENCLAW_ROOT
from app.services.cache import cli_cache

logger = logging.getLogger(__name__)

# ── Cache TTLs (seconds) ────────────────────────────────────────
_AGENTS_LIST_TTL = 10.0
_DEFAULT_MODEL_TTL = 30.0
# gateway status is relatively expensive (~2s CPU-heavy CLI call), so keep
# a slightly longer cache to avoid frequent polling spikes while preserving
# near-real-time health visibility.
_GATEWAY_STATUS_TTL = 30.0
_SESSIONS_TTL = 15.0
_HEALTH_TTL = 10.0
_CRON_TTL = 10.0


class CliError(Exception):
    """Raised when a CLI command fails."""

    def __init__(self, code: str, message: str, details: dict | None = None):
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


# ── Async subprocess runner ─────────────────────────────────────

async def _run_openclaw_async(args: list[str], timeout: int = CLI_STATUS_TIMEOUT) -> str:
    """Run an OpenClaw CLI command asynchronously and return stdout.

    Uses ``asyncio.create_subprocess_exec`` so the event loop is never blocked.
    """
    cmd = [OPENCLAW_CLI] + args
    label = " ".join(cmd)
    logger.debug("async-run: %s", label)
    t0 = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise CliError(
                code="OPENCLAW_CLI_TIMEOUT",
                message=f"openclaw {' '.join(args)} timed out after {timeout}s",
            )

        elapsed = (time.monotonic() - t0) * 1000
        stdout = stdout_bytes.decode() if stdout_bytes else ""
        stderr = stderr_bytes.decode() if stderr_bytes else ""

        if proc.returncode != 0:
            raise CliError(
                code="OPENCLAW_CLI_ERROR",
                message=f"openclaw {' '.join(args)} failed: {stderr.strip()}",
                details={"returncode": proc.returncode, "stderr": stderr.strip()},
            )

        logger.debug("async-run: %s completed in %.1fms", label, elapsed)
        return stdout

    except FileNotFoundError:
        raise CliError(
            code="OPENCLAW_CLI_NOT_FOUND",
            message="openclaw binary not found in PATH",
        )


def _run_openclaw_sync(args: list[str], timeout: int = CLI_STATUS_TIMEOUT) -> str:
    """Synchronous fallback for mutation commands and non-async contexts."""
    cmd = [OPENCLAW_CLI] + args
    logger.debug("sync-run: %s", " ".join(cmd))
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
        )
        if result.returncode != 0:
            raise CliError(
                code="OPENCLAW_CLI_ERROR",
                message=f"openclaw {' '.join(args)} failed: {result.stderr.strip()}",
                details={"returncode": result.returncode, "stderr": result.stderr.strip()},
            )
        return result.stdout
    except subprocess.TimeoutExpired:
        raise CliError(
            code="OPENCLAW_CLI_TIMEOUT",
            message=f"openclaw {' '.join(args)} timed out after {timeout}s",
        )
    except FileNotFoundError:
        raise CliError(
            code="OPENCLAW_CLI_NOT_FOUND",
            message="openclaw binary not found in PATH",
        )


def _parse_json(raw: str, label: str) -> Any:
    """Parse JSON from CLI output."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CliError(
            code="OPENCLAW_PARSE_ERROR",
            message=f"Failed to parse {label} JSON: {exc}",
            details={"raw": raw[:500]},
        )


# ─── Async Read Commands (cached + deduped) ─────────────────────

async def agents_list() -> list[dict[str, Any]]:
    """List all OpenClaw agents (cached)."""
    async def _fetch():
        raw = await _run_openclaw_async(["agents", "list", "--json"])
        return _parse_json(raw, "agents list")
    return await cli_cache.get_or_fetch("oc:agents_list", _fetch, ttl=_AGENTS_LIST_TTL)


async def sessions_active(minutes: int = 120) -> dict[str, Any]:
    """List active sessions (cached)."""
    async def _fetch():
        raw = await _run_openclaw_async(["sessions", "--active", str(minutes), "--json"])
        return _parse_json(raw, "sessions")
    return await cli_cache.get_or_fetch(
        f"oc:sessions_active:{minutes}", _fetch, ttl=_SESSIONS_TTL
    )


async def cron_list_all() -> dict[str, Any]:
    """List all cron jobs (cached)."""
    async def _fetch():
        raw = await _run_openclaw_async(["cron", "list", "--all", "--json"])
        return _parse_json(raw, "cron list")
    return await cli_cache.get_or_fetch("oc:cron_list", _fetch, ttl=_CRON_TTL)


async def cron_status() -> dict[str, Any]:
    """Get cron scheduler status (cached)."""
    async def _fetch():
        raw = await _run_openclaw_async(["cron", "status", "--json"])
        return _parse_json(raw, "cron status")
    return await cli_cache.get_or_fetch("oc:cron_status", _fetch, ttl=_CRON_TTL)


async def gateway_status() -> dict[str, Any]:
    """Get gateway health status (cached)."""
    async def _fetch():
        raw = await _run_openclaw_async(["gateway", "status", "--json"])
        return _parse_json(raw, "gateway status")
    return await cli_cache.get_or_fetch("oc:gateway_status", _fetch, ttl=_GATEWAY_STATUS_TTL)


async def health_check() -> dict[str, Any]:
    """Get OpenClaw health (cached)."""
    async def _fetch():
        raw = await _run_openclaw_async(["health", "--json"])
        return _parse_json(raw, "health")
    return await cli_cache.get_or_fetch("oc:health", _fetch, ttl=_HEALTH_TTL)


# ─── Async Read Commands (uncached — per-agent) ─────────────────

async def sessions_for_agent(agent_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """List recent sessions for a specific agent.

    OpenClaw session data is scoped per-agent under:
    ~/.openclaw/agents/<agent_id>/sessions/sessions.json

    We prefer that store first, then fall back to global active sessions filtering.
    """

    def _extract_items(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [x for x in payload if isinstance(x, dict)]
        if isinstance(payload, dict):
            rows = payload.get("sessions", payload.get("data", []))
            if isinstance(rows, list):
                return [x for x in rows if isinstance(x, dict)]
        return []

    def _updated_epoch_ms(session: dict[str, Any]) -> int:
        raw = session.get("updatedAt", session.get("updated_at"))
        if isinstance(raw, (int, float)):
            return int(raw)
        if isinstance(raw, str):
            value = raw.strip()
            if not value:
                return 0
            if value.isdigit():
                return int(value)
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return int(dt.timestamp() * 1000)
            except ValueError:
                return 0
        return 0

    store_path = OPENCLAW_ROOT / "agents" / agent_id / "sessions" / "sessions.json"

    # 1) Agent-scoped store (preferred)
    if store_path.exists():
        async def _fetch_agent_store():
            raw = await _run_openclaw_async(
                ["sessions", "--active", "10080", "--store", str(store_path), "--json"]
            )
            return _parse_json(raw, "sessions")

        payload = await cli_cache.get_or_fetch(
            f"oc:sessions_active:10080:{agent_id}", _fetch_agent_store, ttl=_SESSIONS_TTL
        )
        items = _extract_items(payload)
        items.sort(key=_updated_epoch_ms, reverse=True)
        return items[:limit]

    # 2) Fallback: global sessions + agent-key filter
    async def _fetch_global():
        raw = await _run_openclaw_async(["sessions", "--active", "10080", "--json"])
        return _parse_json(raw, "sessions")

    all_sessions = await cli_cache.get_or_fetch(
        "oc:sessions_active:10080", _fetch_global, ttl=_SESSIONS_TTL
    )
    items = _extract_items(all_sessions)

    prefix = f"agent:{agent_id}:"
    matched: list[dict[str, Any]] = []
    for s in items:
        key = str(s.get("key", ""))
        sid = str(s.get("agentId", s.get("agent_id", "")))
        ident = str(s.get("identityId", s.get("identity_id", "")))
        if key.startswith(prefix) or agent_id in sid or agent_id in ident:
            matched.append(s)

    matched.sort(key=_updated_epoch_ms, reverse=True)
    return matched[:limit]


async def get_default_model() -> str | None:
    """Read ``agents.defaults.model`` from the OpenClaw config (cached)."""
    async def _fetch():
        try:
            raw = await _run_openclaw_async(["config", "get", "agents.defaults.model"])
            value = raw.strip()
            if value:
                return value
        except CliError:
            pass

        # Fallback: read config YAML for the single field
        try:
            import yaml  # type: ignore[import-untyped]
            config_path = _find_openclaw_config()
            if config_path and config_path.exists():
                with open(config_path) as f:
                    cfg = yaml.safe_load(f)
                return (cfg.get("agents", {}) or {}).get("defaults", {}).get("model")
        except Exception:
            pass
        return None

    return await cli_cache.get_or_fetch("oc:default_model", _fetch, ttl=_DEFAULT_MODEL_TTL)


def _find_openclaw_config():
    """Locate the OpenClaw config file without exposing secrets."""
    from pathlib import Path
    candidates = [
        Path.home() / ".openclaw" / "config.yaml",
        Path.home() / ".openclaw" / "config.yml",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


# ─── Mutation Commands (sync, threadpool-offloaded, no cache) ───

async def cron_enable(job_id: str) -> str:
    """Enable a cron job."""
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None, lambda: _run_openclaw_sync(["cron", "enable", job_id], timeout=CLI_MUTATION_TIMEOUT)
    )
    cli_cache.invalidate("oc:cron_list")
    cli_cache.invalidate("oc:cron_status")
    return result


async def cron_disable(job_id: str) -> str:
    """Disable a cron job."""
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None, lambda: _run_openclaw_sync(["cron", "disable", job_id], timeout=CLI_MUTATION_TIMEOUT)
    )
    cli_cache.invalidate("oc:cron_list")
    cli_cache.invalidate("oc:cron_status")
    return result


async def cron_run(job_id: str) -> str:
    """Trigger a cron job."""
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None, lambda: _run_openclaw_sync(["cron", "run", job_id], timeout=CLI_MUTATION_TIMEOUT)
    )
    cli_cache.invalidate("oc:cron_list")
    cli_cache.invalidate("oc:cron_status")
    return result


# ─── Manager / Coordinator Commands ─────────────────────────────

_MANAGER_TURN_TIMEOUT = 60  # coordinator responses can be slow
_GATEWAY_STREAM_CONNECT_TIMEOUT = 10.0
_GATEWAY_STREAM_WRITE_TIMEOUT = 30.0
_GATEWAY_DEFAULT_PORT = 18789

async def manager_send_message(
    session_key: str,
    message: str,
    agent_id: str = "overmind-coordinator",
) -> dict[str, Any]:
    """Send a message to the manager agent and return the response.

    Uses ``openclaw agent turn`` which sends a user turn to the specified
    agent session and returns the assistant reply as JSON.
    """
    loop = asyncio.get_running_loop()

    def _run():
        return _run_openclaw_sync(
            [
                "agent",
                "--agent", agent_id,
                "--session-id", session_key,
                "--message", message,
                "--json",
            ],
            timeout=_MANAGER_TURN_TIMEOUT,
        )

    raw = await loop.run_in_executor(None, _run)
    return _parse_json(raw, "manager turn")


def _gateway_http_base_url() -> tuple[str, str | None, str]:
    """Resolve Gateway base URL + auth token from ``~/.openclaw/openclaw.json``.

    Falls back to loopback with the default gateway port when the config is
    missing fields.
    """
    cfg: dict[str, Any] = {}
    config_path = Path.home() / ".openclaw" / "openclaw.json"
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                raw_cfg = json.load(f)
            if isinstance(raw_cfg, dict):
                cfg = raw_cfg
        except Exception as exc:
            logger.warning("openclaw: failed to read %s (%s)", config_path, exc)

    gateway_cfg = cfg.get("gateway") if isinstance(cfg.get("gateway"), dict) else {}

    # Optional explicit URL support (convert WS schemes to HTTP for REST calls).
    raw_url = ""
    if isinstance(gateway_cfg, dict):
        value = gateway_cfg.get("url")
        if isinstance(value, str):
            raw_url = value.strip()

    if raw_url:
        if raw_url.startswith("ws://"):
            raw_url = "http://" + raw_url[5:]
        elif raw_url.startswith("wss://"):
            raw_url = "https://" + raw_url[6:]
        base_url = raw_url.rstrip("/")
    else:
        port_value = gateway_cfg.get("port") if isinstance(gateway_cfg, dict) else None
        try:
            port = int(port_value) if port_value is not None else _GATEWAY_DEFAULT_PORT
        except (TypeError, ValueError):
            port = _GATEWAY_DEFAULT_PORT
        base_url = f"http://127.0.0.1:{port}"

    token: str | None = None
    auth_mode = "token"
    auth_cfg = gateway_cfg.get("auth") if isinstance(gateway_cfg, dict) else None
    if isinstance(auth_cfg, dict):
        mode_value = auth_cfg.get("mode")
        if isinstance(mode_value, str) and mode_value.strip():
            auth_mode = mode_value.strip().lower()
        token_value = auth_cfg.get("token")
        if isinstance(token_value, str) and token_value.strip():
            token = token_value.strip()

    return base_url, token, auth_mode


def _extract_output_index(payload: dict[str, Any]) -> int:
    """Best-effort output index extraction from OpenResponses stream payloads."""
    for key in ("output_index", "outputIndex", "item_index", "itemIndex"):
        value = payload.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)

    item = payload.get("item")
    if isinstance(item, dict):
        for key in ("output_index", "outputIndex", "index"):
            value = item.get(key)
            if isinstance(value, int):
                return value
            if isinstance(value, str) and value.isdigit():
                return int(value)
    return 0


def _extract_delta_text(payload: dict[str, Any]) -> str | None:
    """Extract incremental assistant text from known stream payload shapes."""
    value = payload.get("delta")
    if isinstance(value, str) and value:
        return value

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            delta = first.get("delta")
            if isinstance(delta, dict):
                content = delta.get("content")
                if isinstance(content, str) and content:
                    return content
                if isinstance(content, list):
                    parts: list[str] = []
                    for part in content:
                        if isinstance(part, dict):
                            text = part.get("text")
                            if isinstance(text, str) and text:
                                parts.append(text)
                    if parts:
                        return "".join(parts)
    return None


def _extract_output_item_text(payload: dict[str, Any]) -> str | None:
    """Extract full output text from ``response.output_item.done`` style payloads."""
    item = payload.get("item")
    if not isinstance(item, dict):
        return None

    if isinstance(item.get("text"), str) and item.get("text"):
        return item["text"]

    content = item.get("content")
    if not isinstance(content, list):
        return None

    parts: list[str] = []
    for part in content:
        if isinstance(part, dict):
            text = part.get("text")
            if isinstance(text, str) and text:
                parts.append(text)
    if parts:
        return "".join(parts)
    return None


def _extract_error_message(payload: Any) -> str:
    """Extract a readable error message from gateway error payloads."""
    if isinstance(payload, dict):
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            message = error_obj.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        for key in ("message", "detail", "error"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    if isinstance(payload, str) and payload.strip():
        return payload.strip()
    return "Gateway stream error"


async def manager_stream_message(
    session_key: str,
    message: str,
    agent_id: str = "overmind-coordinator",
) -> AsyncIterator[dict[str, Any]]:
    """Stream manager responses from Gateway OpenResponses SSE.

    Yields normalized events:
      - ``{"event": "delta", "data": {"delta", "outputIndex", "sessionKey"}}``
      - ``{"event": "done", "data": {"sessionKey"}}``
      - ``{"event": "error", "data": {"message", "code", "details"}}``
    """
    base_url, token, auth_mode = _gateway_http_base_url()
    if auth_mode not in {"off", "none", "disabled"} and not token:
        raise CliError(
            code="OPENCLAW_GATEWAY_AUTH_ERROR",
            message="Gateway auth token missing in ~/.openclaw/openclaw.json",
        )
    endpoint = f"{base_url}/v1/responses"
    payload = {
        "agentId": agent_id,
        "sessionKey": session_key,
        "input": message,
        "stream": True,
    }
    headers = {
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    timeout = httpx.Timeout(
        connect=_GATEWAY_STREAM_CONNECT_TIMEOUT,
        write=_GATEWAY_STREAM_WRITE_TIMEOUT,
        read=None,
        pool=30.0,
    )

    seen_done = False
    emitted_delta_indexes: set[int] = set()

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", endpoint, json=payload, headers=headers) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", errors="ignore")
                    raise CliError(
                        code="OPENCLAW_GATEWAY_ERROR",
                        message=f"Gateway /v1/responses returned HTTP {resp.status_code}",
                        details={"status_code": resp.status_code, "body": body[:1000]},
                    )

                frame_event = "message"
                data_lines: list[str] = []

                async def _emit_frame(
                    event_name: str,
                    lines: list[str],
                ) -> AsyncIterator[dict[str, Any]]:
                    nonlocal seen_done
                    if not lines:
                        return

                    data_raw = "\n".join(lines).strip()
                    if not data_raw:
                        return

                    if data_raw == "[DONE]":
                        seen_done = True
                        yield {"event": "done", "data": {"sessionKey": session_key}}
                        return

                    try:
                        parsed = json.loads(data_raw)
                    except json.JSONDecodeError:
                        # Ignore non-JSON payload frames.
                        return

                    effective_event = event_name
                    if (
                        effective_event in ("", "message")
                        and isinstance(parsed, dict)
                        and isinstance(parsed.get("type"), str)
                    ):
                        effective_event = parsed["type"]

                    event_lower = effective_event.lower()
                    if event_lower in {"done", "response.completed", "completed"}:
                        seen_done = True
                        yield {
                            "event": "done",
                            "data": {"sessionKey": session_key, "raw": parsed},
                        }
                        return

                    if event_lower in {"error", "response.failed"} or event_lower.endswith(".failed"):
                        yield {
                            "event": "error",
                            "data": {
                                "code": "OPENCLAW_GATEWAY_STREAM_ERROR",
                                "message": _extract_error_message(parsed),
                                "details": parsed if isinstance(parsed, dict) else {},
                            },
                        }
                        return

                    if not isinstance(parsed, dict):
                        return

                    delta = _extract_delta_text(parsed)
                    if isinstance(delta, str) and delta:
                        output_index = _extract_output_index(parsed)
                        emitted_delta_indexes.add(output_index)
                        yield {
                            "event": "delta",
                            "data": {
                                "delta": delta,
                                "outputIndex": output_index,
                                "sessionKey": session_key,
                            },
                        }
                        return

                    # Some implementations only emit final output item text.
                    if event_lower in {"response.output_item.done", "output_item.done"}:
                        output_index = _extract_output_index(parsed)
                        if output_index in emitted_delta_indexes:
                            return
                        full_text = _extract_output_item_text(parsed)
                        if full_text:
                            emitted_delta_indexes.add(output_index)
                            yield {
                                "event": "delta",
                                "data": {
                                    "delta": full_text,
                                    "outputIndex": output_index,
                                    "sessionKey": session_key,
                                },
                            }

                async for line in resp.aiter_lines():
                    if line == "":
                        async for event in _emit_frame(frame_event, data_lines):
                            yield event
                        frame_event = "message"
                        data_lines = []
                        continue

                    if line.startswith(":"):
                        continue
                    if line.startswith("event:"):
                        frame_event = line[6:].strip() or "message"
                        continue
                    if line.startswith("data:"):
                        data_lines.append(line[5:].lstrip())

                # Flush any trailing frame not terminated with a blank line.
                async for event in _emit_frame(frame_event, data_lines):
                    yield event

    except httpx.TimeoutException as exc:
        raise CliError(
            code="OPENCLAW_GATEWAY_TIMEOUT",
            message="Timed out while connecting to OpenClaw Gateway stream",
            details={"error": str(exc)},
        )
    except httpx.RequestError as exc:
        raise CliError(
            code="OPENCLAW_GATEWAY_UNREACHABLE",
            message="Failed to reach OpenClaw Gateway stream endpoint",
            details={"error": str(exc)},
        )

    if not seen_done:
        yield {"event": "done", "data": {"sessionKey": session_key}}


async def manager_session_history(
    session_key: str,
    agent_id: str = "overmind-coordinator",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Retrieve recent messages for a manager session.
    
    Note: Session history is not available via CLI. The frontend should
    maintain local state or use the Gateway WebSocket for real-time updates.
    """
    # CLI does not support session-history; return empty for now.
    # Consider using Gateway WebSocket or maintaining local chat state.
    return []
