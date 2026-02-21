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


async def project_create(
    goal: str,
    route_type: str = "auto",
    priority: int = 3,
    notes: str = "",
) -> dict[str, Any]:
    """Create a new project via Overmind CLI.

    Notes:
    - Overmind CLI accepts ``--route`` only for coding/research/hybrid.
      Route ``auto`` should omit the flag and let framework intake classify.
    - Overmind CLI currently has no ``--notes`` flag. If notes are provided,
      append them to the goal so user context is not lost.

    Returns parsed JSON with projectId and status on success.
    """
    normalized_route = (route_type or "").strip().lower()

    effective_goal = goal
    if notes and notes.strip():
        effective_goal = f"{goal}\n\nAdditional context:\n{notes.strip()}"

    cmd = ["project", "create", "--goal", effective_goal, "--priority", str(priority)]

    if normalized_route in {"coding", "research", "hybrid"}:
        cmd += ["--route", normalized_route]

    raw = await _run_ovm(cmd, timeout=CLI_MUTATION_TIMEOUT)
    return _parse_json(raw, "project create")


async def orchestrator_restart() -> dict[str, Any]:
    """Restart the orchestrator via framework restart script.

    Uses scripts/restart_framework.sh which handles:
    1. Preflight (config validate + db migrate)
    2. Graceful stop of existing orchestrator
    3. Start of new orchestrator process

    Implementation note: The start script spawns the orchestrator as a
    background daemon (``nohup ... &``).  When we capture stdout/stderr via
    ``PIPE``, the daemon inherits the pipe file descriptors.  Even though
    its own output is redirected to a log file, the inherited FDs keep the
    pipe open, so ``proc.communicate()`` blocks forever waiting for EOF.

    Fix: we write script output to temporary files instead of using PIPE,
    and impose a timeout so we never block indefinitely.
    """
    import asyncio
    import tempfile
    from app.config import OVERMIND_ROOT

    RESTART_TIMEOUT = 60  # seconds – generous limit for preflight + stop + start

    script_path = OVERMIND_ROOT / "scripts" / "restart_framework.sh"
    if not script_path.exists():
        raise OvmCliError(
            code="RESTART_SCRIPT_NOT_FOUND",
            message=f"Restart script not found: {script_path}",
        )

    # Use temp files for stdout/stderr so the background daemon's inherited
    # FDs don't hold PIPE open and block communicate().
    with tempfile.TemporaryFile() as tmp_out, tempfile.TemporaryFile() as tmp_err:
        proc = await asyncio.create_subprocess_exec(
            str(script_path),
            stdout=tmp_out,
            stderr=tmp_err,
            cwd=str(OVERMIND_ROOT),
            start_new_session=True,
        )

        try:
            await asyncio.wait_for(proc.wait(), timeout=RESTART_TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            raise OvmCliError(
                code="ORCHESTRATOR_RESTART_TIMEOUT",
                message=f"Restart script timed out after {RESTART_TIMEOUT}s",
            )

        tmp_out.seek(0)
        tmp_err.seek(0)
        stdout_str = tmp_out.read().decode("utf-8", errors="replace")
        stderr_str = tmp_err.read().decode("utf-8", errors="replace")

    if proc.returncode != 0:
        raise OvmCliError(
            code="ORCHESTRATOR_RESTART_FAILED",
            message=f"Orchestrator restart failed: {stderr_str or stdout_str}",
            details={"returncode": proc.returncode, "stdout": stdout_str, "stderr": stderr_str},
        )

    return {"restarted": True, "output": stdout_str}


async def orchestrator_pause() -> str:
    """Pause the orchestrator."""
    return await _run_ovm(["orchestrator", "pause"], timeout=CLI_MUTATION_TIMEOUT)


async def orchestrator_resume() -> str:
    """Resume the orchestrator."""
    return await _run_ovm(["orchestrator", "resume"], timeout=CLI_MUTATION_TIMEOUT)
