"""Tests for app.services.overmind wrappers."""

from __future__ import annotations

import asyncio
import os
import stat
import tempfile
from unittest.mock import AsyncMock, patch

import pytest

from app.services.overmind import project_create, orchestrator_restart, OvmCliError


@patch("app.services.overmind._run_ovm", new_callable=AsyncMock)
async def test_project_create_auto_route_omits_route_and_cli_notes_flag(mock_run):
    """route=auto should NOT pass --route; notes should be folded into goal text."""
    mock_run.return_value = '{"projectId":"proj_auto","status":"QUEUED"}'

    result = await project_create(
        goal="Smoke test",
        route_type="auto",
        priority=3,
        notes="Keep this minimal",
    )

    assert result["projectId"] == "proj_auto"

    cmd = mock_run.await_args.args[0]
    assert cmd[:2] == ["project", "create"]
    assert "--route" not in cmd
    assert "--notes" not in cmd

    goal_arg = cmd[cmd.index("--goal") + 1]
    assert "Smoke test" in goal_arg
    assert "Additional context:" in goal_arg
    assert "Keep this minimal" in goal_arg


@patch("app.services.overmind._run_ovm", new_callable=AsyncMock)
async def test_project_create_explicit_route_is_forwarded(mock_run):
    """Explicit supported route should be passed to CLI."""
    mock_run.return_value = '{"projectId":"proj_code","status":"QUEUED"}'

    result = await project_create(
        goal="Build API",
        route_type="coding",
        priority=5,
        notes="",
    )

    assert result["projectId"] == "proj_code"

    cmd = mock_run.await_args.args[0]
    assert "--route" in cmd
    route_value = cmd[cmd.index("--route") + 1]
    assert route_value == "coding"

    goal_arg = cmd[cmd.index("--goal") + 1]
    assert goal_arg == "Build API"


# ─── orchestrator_restart tests ──────────────────────────────────


async def test_restart_script_not_found():
    """Restart raises when the script doesn't exist."""
    with tempfile.TemporaryDirectory() as td:
        from pathlib import Path
        with patch("app.config.OVERMIND_ROOT", Path(td)):
            with pytest.raises(OvmCliError, match="Restart script not found"):
                await orchestrator_restart()


async def test_restart_returns_output_without_hanging():
    """Restart should return quickly even when the script spawns a background daemon.

    This is the core regression test: we simulate a script that echoes output
    and spawns a long-running background child (`sleep 300 &`).  Before the fix,
    proc.communicate() would hang forever because the sleep process inherited the
    pipe FDs.  After the fix (temp files + wait_for), it returns promptly.
    """
    with tempfile.TemporaryDirectory() as td:
        script_path = os.path.join(td, "scripts", "restart_framework.sh")
        os.makedirs(os.path.dirname(script_path))

        # Script: echo output, spawn a background daemon, then exit
        with open(script_path, "w") as f:
            f.write("#!/usr/bin/env bash\n")
            f.write('echo "[overmind] Preflight: config validate"\n')
            f.write('echo "[overmind] Orchestrator started: pid=$$"\n')
            f.write("sleep 300 &\n")  # long-running background child
            f.write("exit 0\n")
        os.chmod(script_path, stat.S_IRWXU)

        from pathlib import Path
        with patch("app.config.OVERMIND_ROOT", Path(td)):
            # Must complete within 5s — before the fix this would hang forever
            result = await asyncio.wait_for(orchestrator_restart(), timeout=5)

        assert result["restarted"] is True
        assert "Preflight: config validate" in result["output"]
        assert "Orchestrator started" in result["output"]


async def test_restart_nonzero_exit_raises():
    """Restart raises OvmCliError when script exits with non-zero."""
    with tempfile.TemporaryDirectory() as td:
        script_path = os.path.join(td, "scripts", "restart_framework.sh")
        os.makedirs(os.path.dirname(script_path))

        with open(script_path, "w") as f:
            f.write("#!/usr/bin/env bash\n")
            f.write('echo "fatal: migration failed" >&2\n')
            f.write("exit 1\n")
        os.chmod(script_path, stat.S_IRWXU)

        from pathlib import Path
        with patch("app.config.OVERMIND_ROOT", Path(td)):
            with pytest.raises(OvmCliError, match="migration failed"):
                await orchestrator_restart()
