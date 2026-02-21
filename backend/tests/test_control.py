"""Tests for the /api/v1/control/* endpoints."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.overmind import OvmCliError
from app.services.openclaw import CliError

client = TestClient(app)


# ──────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────

def _assert_envelope(body: dict, *, ok: bool = True):
    """Assert standard envelope structure."""
    assert "ok" in body
    assert body["ok"] is ok
    assert "meta" in body
    assert "timestamp" in body["meta"]
    assert "request_id" in body["meta"]
    if ok:
        assert "data" in body
    else:
        assert "error" in body


# ──────────────────────────────────────────────────────────────────
# POST /control/projects  — Project Intake
# ──────────────────────────────────────────────────────────────────

class TestProjectIntake:
    """Tests for the project creation endpoint."""

    @patch("app.routers.control.ovm_project_create", new_callable=AsyncMock)
    def test_create_project_success(self, mock_create):
        """Happy path: valid intake creates a project."""
        mock_create.return_value = {
            "projectId": "proj_abc123",
            "status": "QUEUED",
        }
        resp = client.post(
            "/api/v1/control/projects",
            json={"goal": "Build a REST API for widget management"},
        )
        assert resp.status_code == 200
        body = resp.json()
        _assert_envelope(body, ok=True)
        assert body["data"]["projectId"] == "proj_abc123"
        assert body["data"]["status"] == "QUEUED"
        assert body["data"]["routeType"] == "auto"
        assert body["data"]["priority"] == 3
        mock_create.assert_awaited_once()

    @patch("app.routers.control.ovm_project_create", new_callable=AsyncMock)
    def test_create_project_with_options(self, mock_create):
        """Create project with explicit route/priority/notes."""
        mock_create.return_value = {"projectId": "proj_xyz", "status": "QUEUED"}
        resp = client.post(
            "/api/v1/control/projects",
            json={
                "goal": "Research competitive landscape",
                "routeType": "research",
                "priority": 5,
                "notes": "Focus on pricing models",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        _assert_envelope(body, ok=True)
        assert body["data"]["routeType"] == "research"
        assert body["data"]["priority"] == 5
        args = mock_create.call_args
        assert args.kwargs["route_type"] == "research"
        assert args.kwargs["priority"] == 5
        assert args.kwargs["notes"] == "Focus on pricing models"

    def test_create_project_missing_goal(self):
        """Validation: goal is required."""
        resp = client.post("/api/v1/control/projects", json={})
        assert resp.status_code == 422

    def test_create_project_empty_goal(self):
        """Validation: goal cannot be empty."""
        resp = client.post(
            "/api/v1/control/projects",
            json={"goal": ""},
        )
        assert resp.status_code == 422

    def test_create_project_invalid_route_type(self):
        """Validation: route type must be one of the allowed values."""
        resp = client.post(
            "/api/v1/control/projects",
            json={"goal": "Test", "routeType": "invalid"},
        )
        assert resp.status_code == 422

    @patch("app.routers.control.ovm_project_create", new_callable=AsyncMock)
    def test_create_project_cli_error(self, mock_create):
        """CLI error returns appropriate error envelope."""
        mock_create.side_effect = OvmCliError(
            code="OVERMIND_CLI_ERROR",
            message="database locked",
            details={"returncode": 1},
        )
        resp = client.post(
            "/api/v1/control/projects",
            json={"goal": "Test project"},
        )
        assert resp.status_code == 500
        body = resp.json()
        _assert_envelope(body, ok=False)
        assert "database locked" in body["error"]["message"]

    @patch("app.routers.control.ovm_project_create", new_callable=AsyncMock)
    def test_create_project_timeout(self, mock_create):
        """CLI timeout yields 504."""
        mock_create.side_effect = OvmCliError(
            code="OVERMIND_CLI_TIMEOUT",
            message="timed out after 20s",
        )
        resp = client.post(
            "/api/v1/control/projects",
            json={"goal": "Test project"},
        )
        assert resp.status_code == 504
        body = resp.json()
        _assert_envelope(body, ok=False)


# ──────────────────────────────────────────────────────────────────
# POST /control/manager/message  — Manager Chat
# ──────────────────────────────────────────────────────────────────

class TestManagerMessage:
    """Tests for the manager chat send endpoint."""

    @patch("app.routers.control.oc_manager_send", new_callable=AsyncMock)
    def test_send_message_success(self, mock_send):
        """Happy path: send message and receive response."""
        mock_send.return_value = {
            "response": "I'll look into that right away.",
            "model": "claude-sonnet-4-20250514",
            "usage": {"input_tokens": 50, "output_tokens": 30},
        }
        resp = client.post(
            "/api/v1/control/manager/message",
            json={
                "sessionKey": "dashboard:main",
                "message": "What projects are currently running?",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        _assert_envelope(body, ok=True)
        assert "look into that" in body["data"]["response"]
        assert body["data"]["sessionKey"] == "dashboard:main"
        assert body["data"]["model"] == "claude-sonnet-4-20250514"

    def test_send_message_missing_fields(self):
        """Validation: both sessionKey and message are required."""
        resp = client.post("/api/v1/control/manager/message", json={})
        assert resp.status_code == 422

    def test_send_message_empty_message(self):
        """Validation: message cannot be empty."""
        resp = client.post(
            "/api/v1/control/manager/message",
            json={"sessionKey": "dashboard:main", "message": ""},
        )
        assert resp.status_code == 422

    @patch("app.routers.control.oc_manager_send", new_callable=AsyncMock)
    def test_send_message_cli_error(self, mock_send):
        """CLI error returns error envelope."""
        mock_send.side_effect = CliError(
            code="OPENCLAW_CLI_ERROR",
            message="agent not found",
        )
        resp = client.post(
            "/api/v1/control/manager/message",
            json={"sessionKey": "dashboard:main", "message": "Hello"},
        )
        assert resp.status_code == 404
        body = resp.json()
        _assert_envelope(body, ok=False)

    @patch("app.routers.control.oc_manager_send", new_callable=AsyncMock)
    def test_send_message_timeout(self, mock_send):
        """CLI timeout yields 504."""
        mock_send.side_effect = CliError(
            code="OPENCLAW_CLI_TIMEOUT",
            message="timed out after 60s",
        )
        resp = client.post(
            "/api/v1/control/manager/message",
            json={"sessionKey": "dashboard:main", "message": "Hello"},
        )
        assert resp.status_code == 504


# ──────────────────────────────────────────────────────────────────
# GET /control/manager/session/{session_key}  — Session History
# ──────────────────────────────────────────────────────────────────

class TestManagerSessionHistory:
    """Tests for the session history replay endpoint."""

    @patch("app.routers.control.oc_manager_history", new_callable=AsyncMock)
    def test_get_session_history(self, mock_history):
        """Happy path: returns messages for the session."""
        mock_history.return_value = [
            {"role": "user", "content": "Hello", "timestamp": "2026-02-21T10:00:00Z"},
            {"role": "assistant", "content": "Hi there!", "timestamp": "2026-02-21T10:00:05Z"},
        ]
        resp = client.get("/api/v1/control/manager/session/dashboard:main")
        assert resp.status_code == 200
        body = resp.json()
        _assert_envelope(body, ok=True)
        assert body["data"]["sessionKey"] == "dashboard:main"
        assert body["data"]["count"] == 2
        assert len(body["data"]["messages"]) == 2

    @patch("app.routers.control.oc_manager_history", new_callable=AsyncMock)
    def test_get_session_history_empty(self, mock_history):
        """Empty session returns empty list."""
        mock_history.return_value = []
        resp = client.get("/api/v1/control/manager/session/new-session")
        assert resp.status_code == 200
        body = resp.json()
        _assert_envelope(body, ok=True)
        assert body["data"]["count"] == 0

    @patch("app.routers.control.oc_manager_history", new_callable=AsyncMock)
    def test_get_session_history_error(self, mock_history):
        """CLI error returns error envelope."""
        mock_history.side_effect = CliError(
            code="OPENCLAW_CLI_ERROR",
            message="session not found",
        )
        resp = client.get("/api/v1/control/manager/session/bad-key")
        assert resp.status_code == 404
        body = resp.json()
        _assert_envelope(body, ok=False)
