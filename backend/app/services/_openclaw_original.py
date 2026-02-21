"""Subprocess wrappers for OpenClaw CLI commands.

Safety rule: only use validated commands, never write to config/auth files.
"""

from __future__ import annotations

import json
import logging
import subprocess
from typing import Any

from app.config import OPENCLAW_CLI, CLI_STATUS_TIMEOUT, CLI_MUTATION_TIMEOUT

logger = logging.getLogger(__name__)


class CliError(Exception):
    """Raised when a CLI command fails."""

    def __init__(self, code: str, message: str, details: dict | None = None):
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


def _run_openclaw(args: list[str], timeout: int = CLI_STATUS_TIMEOUT) -> str:
    """Run an OpenClaw CLI command and return stdout."""
    cmd = [OPENCLAW_CLI] + args
    logger.debug("Running: %s", " ".join(cmd))
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
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


# ─── Read Commands ───────────────────────────────────────────────

def agents_list() -> list[dict[str, Any]]:
    """List all OpenClaw agents."""
    raw = _run_openclaw(["agents", "list", "--json"])
    return _parse_json(raw, "agents list")


def sessions_active(minutes: int = 120) -> dict[str, Any]:
    """List active sessions."""
    raw = _run_openclaw(["sessions", "--active", str(minutes), "--json"])
    return _parse_json(raw, "sessions")


def cron_list_all() -> dict[str, Any]:
    """List all cron jobs (including disabled)."""
    raw = _run_openclaw(["cron", "list", "--all", "--json"])
    return _parse_json(raw, "cron list")


def cron_status() -> dict[str, Any]:
    """Get cron scheduler status."""
    raw = _run_openclaw(["cron", "status", "--json"])
    return _parse_json(raw, "cron status")


def gateway_status() -> dict[str, Any]:
    """Get gateway health status."""
    raw = _run_openclaw(["gateway", "status", "--json"])
    return _parse_json(raw, "gateway status")


def health_check() -> dict[str, Any]:
    """Get OpenClaw health."""
    raw = _run_openclaw(["health", "--json"])
    return _parse_json(raw, "health")


# ─── Mutation Commands ───────────────────────────────────────────

def sessions_for_agent(agent_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """List recent sessions filtered by agent id.

    Uses ``openclaw sessions --active 10080 --json`` (7-day window) and
    filters client-side by agent id.  The CLI doesn't expose a per-agent
    flag, so we fetch a broad window and trim.
    """
    raw = _run_openclaw(["sessions", "--active", "10080", "--json"])
    all_sessions = _parse_json(raw, "sessions")
    # The sessions payload may be a dict with a list, or a plain list.
    items: list[dict[str, Any]] = []
    if isinstance(all_sessions, list):
        items = all_sessions
    elif isinstance(all_sessions, dict):
        items = all_sessions.get("sessions", all_sessions.get("data", []))

    matched: list[dict[str, Any]] = []
    for s in items:
        sid = s.get("agentId", s.get("agent_id", ""))
        ident = s.get("identityId", s.get("identity_id", ""))
        if agent_id in str(sid) or agent_id in str(ident):
            matched.append(s)
    matched.sort(key=lambda s: s.get("updatedAt", s.get("updated_at", "")), reverse=True)
    return matched[:limit]


def get_default_model() -> str | None:
    """Read ``agents.defaults.model`` from the OpenClaw config.

    We use ``openclaw config get agents.defaults.model`` if available,
    otherwise fall back to reading the YAML config directly (safe field only).
    """
    try:
        raw = _run_openclaw(["config", "get", "agents.defaults.model"])
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


def cron_enable(job_id: str) -> str:
    """Enable a cron job."""
    return _run_openclaw(["cron", "enable", job_id], timeout=CLI_MUTATION_TIMEOUT)


def cron_disable(job_id: str) -> str:
    """Disable a cron job."""
    return _run_openclaw(["cron", "disable", job_id], timeout=CLI_MUTATION_TIMEOUT)


def cron_run(job_id: str) -> str:
    """Trigger a cron job."""
    return _run_openclaw(["cron", "run", job_id], timeout=CLI_MUTATION_TIMEOUT)
