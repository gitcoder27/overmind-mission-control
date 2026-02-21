"""Async subprocess wrappers for Overmind HQ CLI commands.

Safety rule: mutations go through CLI only – never write directly to DB.

Performance notes (v2):
- Mutation commands use ``loop.run_in_executor`` to avoid blocking the
  FastAPI event loop while the subprocess runs.
- Read commands also offloaded via executor.
"""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
from typing import Any

from app.config import (
    OVERMIND_CLI_ENV,
    OVERMIND_CLI_PREFIX,
    CLI_STATUS_TIMEOUT,
    CLI_MUTATION_TIMEOUT,
)

logger = logging.getLogger(__name__)


class OvmCliError(Exception):
    """Raised when an Overmind CLI command fails."""

    def __init__(self, code: str, message: str, details: dict | None = None):
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


def _run_ovm_sync(args: list[str], timeout: int = CLI_STATUS_TIMEOUT) -> str:
    """Run an Overmind CLI command synchronously and return stdout."""
    cmd = OVERMIND_CLI_PREFIX + args
    logger.debug("Running: %s", " ".join(cmd))
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=OVERMIND_CLI_ENV,
        )
        if result.returncode != 0:
            raise OvmCliError(
                code="OVERMIND_CLI_ERROR",
                message=f"overmind cli failed: {result.stderr.strip() or result.stdout.strip()}",
                details={"returncode": result.returncode, "stderr": result.stderr.strip()},
            )
        return result.stdout
    except subprocess.TimeoutExpired:
        raise OvmCliError(
            code="OVERMIND_CLI_TIMEOUT",
            message=f"overmind cli timed out after {timeout}s",
        )
    except FileNotFoundError:
        raise OvmCliError(
            code="OVERMIND_CLI_NOT_FOUND",
            message="python3 not found in PATH",
        )


async def _run_ovm(args: list[str], timeout: int = CLI_STATUS_TIMEOUT) -> str:
    """Run an Overmind CLI command via executor (non-blocking)."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _run_ovm_sync(args, timeout))


def _parse_json(raw: str, label: str) -> Any:
    """Parse JSON from CLI output."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise OvmCliError(
            code="OVERMIND_PARSE_ERROR",
            message=f"Failed to parse {label}: {exc}",
            details={"raw": raw[:500]},
        )


# ─── Read Commands ───────────────────────────────────────────────

async def status() -> dict[str, Any]:
    """Get Overmind status snapshot."""
    raw = await _run_ovm(["status"])
    return _parse_json(raw, "status")


async def health() -> dict[str, Any]:
    """Get Overmind health."""
    raw = await _run_ovm(["health"])
    return _parse_json(raw, "health")


async def orchestrator_status() -> dict[str, Any]:
    """Get orchestrator runtime status."""
    raw = await _run_ovm(["orchestrator", "status"])
    return _parse_json(raw, "orchestrator status")


async def mission_control_snapshot() -> dict[str, Any]:
    """Get full mission-control snapshot (same as legacy /api/snapshot)."""
    raw = await _run_ovm(["mission-control"])
    return _parse_json(raw, "mission-control")


# ─── Mutation Commands ───────────────────────────────────────────

async def project_approve(project_id: str, notes: str = "") -> str:
    """Approve a project."""
    cmd = ["project", "approve", "--project-id", project_id, "--reviewer", "dashboard"]
    if notes:
        cmd += ["--notes", notes]
    return await _run_ovm(cmd, timeout=CLI_MUTATION_TIMEOUT)


async def project_request_changes(project_id: str, notes: str = "") -> str:
    """Request changes on a project."""
    cmd = ["project", "request-changes", "--project-id", project_id, "--reviewer", "dashboard"]
    if notes:
        cmd += ["--notes", notes]
    return await _run_ovm(cmd, timeout=CLI_MUTATION_TIMEOUT)


async def project_set_status(project_id: str, to_status: str, reason: str = "") -> str:
    """Set a project status."""
    cmd = ["project", "set-status", "--project-id", project_id, "--to", to_status]
    if reason:
        cmd += ["--reason", reason]
    return await _run_ovm(cmd, timeout=CLI_MUTATION_TIMEOUT)


async def orchestrator_pause() -> str:
    """Pause the orchestrator."""
    return await _run_ovm(["orchestrator", "pause"], timeout=CLI_MUTATION_TIMEOUT)


async def orchestrator_resume() -> str:
    """Resume the orchestrator."""
    return await _run_ovm(["orchestrator", "resume"], timeout=CLI_MUTATION_TIMEOUT)
