"""Tests for app.services.overmind wrappers."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.services.overmind import project_create


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
