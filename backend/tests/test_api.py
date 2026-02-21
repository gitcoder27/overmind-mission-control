"""Tests for the Overmind Mission Control backend.

Mutation CLI calls are monkeypatched to avoid real side-effects.
"""

from __future__ import annotations

from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.openclaw import CliError
from app.services.overmind import OvmCliError

client = TestClient(app)


# ─── Helpers ─────────────────────────────────────────────────────

def _noop(*_a, **_kw):
    return ""


async def _async_noop(*_a, **_kw):
    return ""


# ─── Health ──────────────────────────────────────────────────────

class TestSystemHealth:
    def test_health_returns_ok_envelope(self):
        r = client.get("/api/v1/system/health")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert "data" in body
        assert "meta" in body
        assert "timestamp" in body["meta"]
        assert "request_id" in body["meta"]

    def test_health_has_components(self):
        r = client.get("/api/v1/system/health")
        data = r.json()["data"]
        assert "overall" in data
        assert "components" in data
        assert isinstance(data["components"], list)
        names = {c["name"] for c in data["components"]}
        assert "api" in names
        assert "database" in names


# ─── Snapshot ────────────────────────────────────────────────────

class TestSystemSnapshot:
    def test_snapshot_returns_ok_envelope(self):
        r = client.get("/api/v1/system/snapshot")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True

    def test_snapshot_has_required_keys(self):
        r = client.get("/api/v1/system/snapshot")
        data = r.json()["data"]
        required = [
            "health", "orchestrator", "summary", "activeProjects",
            "runningAttempts", "recentEvents", "alerts", "retryStorms",
            "blockers", "deadLetters", "timestamp",
        ]
        for key in required:
            assert key in data, f"Missing key: {key}"

    def test_snapshot_summary_shape(self):
        r = client.get("/api/v1/system/snapshot")
        summary = r.json()["data"]["summary"]
        for key in ["activeProjects", "waitingApproval", "runningAttempts",
                     "blockedTasks", "deadLetters", "retryStorms",
                     "totalProjects", "totalTasks"]:
            assert key in summary, f"Missing summary key: {key}"

    def test_snapshot_orchestrator_shape(self):
        r = client.get("/api/v1/system/snapshot")
        orch = r.json()["data"]["orchestrator"]
        for key in ["running", "pid", "cursorPosition", "cursorLag",
                     "lastHeartbeat", "stagnant", "uptimeSeconds"]:
            assert key in orch, f"Missing orchestrator key: {key}"


# ─── Projects ───────────────────────────────────────────────────

class TestProjects:
    def test_list_projects_returns_list(self):
        r = client.get("/api/v1/projects")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert isinstance(body["data"], list)

    def test_get_nonexistent_project(self):
        r = client.get("/api/v1/projects/nonexistent-id")
        assert r.status_code == 404
        body = r.json()
        assert body["ok"] is False
        assert body["error"]["code"] == "NOT_FOUND"

    def test_tasks_nonexistent_project_returns_404(self):
        """GET /projects/{id}/tasks must 404 when project doesn't exist."""
        r = client.get("/api/v1/projects/no-such-project/tasks")
        assert r.status_code == 404
        body = r.json()
        assert body["ok"] is False
        assert body["error"]["code"] == "NOT_FOUND"


# ─── Events ─────────────────────────────────────────────────────

class TestEvents:
    def test_list_events_returns_list(self):
        r = client.get("/api/v1/events")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert isinstance(body["data"], list)

    def test_events_have_required_fields(self):
        r = client.get("/api/v1/events")
        data = r.json()["data"]
        if len(data) > 0:
            event = data[0]
            for key in ["id", "eventType", "level", "source", "payload", "createdAt"]:
                assert key in event, f"Missing event key: {key}"


# ─── Agents ──────────────────────────────────────────────────────

class TestAgents:
    def test_list_agents_returns_list(self):
        r = client.get("/api/v1/agents")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert isinstance(body["data"], list)

    def test_agents_have_required_roles(self):
        r = client.get("/api/v1/agents")
        roles = {a["role"] for a in r.json()["data"]}
        expected = {"coordinator", "architect", "builder", "scout", "oracle", "qa"}
        assert expected == roles

    def test_agent_shape(self):
        r = client.get("/api/v1/agents")
        agents = r.json()["data"]
        if agents:
            a = agents[0]
            for key in ["id", "name", "role", "status", "successRate",
                        "avgDuration", "totalAttempts", "recentActivity"]:
                assert key in a, f"Missing agent key: {key}"

    def test_agents_have_model_fields(self):
        """Agents list should include effectiveModel, modelSource, registered, profileHealth."""
        r = client.get("/api/v1/agents")
        assert r.status_code == 200
        agents = r.json()["data"]
        if agents:
            a = agents[0]
            for key in ["effectiveModel", "modelSource", "registered", "profileHealth"]:
                assert key in a, f"Missing agent key: {key}"
            assert a["modelSource"] in ("primary", "default", "unknown")
            assert isinstance(a["registered"], bool)
            assert isinstance(a["profileHealth"], dict)
            assert "ok" in a["profileHealth"]
            assert "missingFiles" in a["profileHealth"]

    def test_get_single_agent(self):
        """GET /agents/{agentId} should return a single agent."""
        r = client.get("/api/v1/agents/overmind-builder")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["data"]["id"] == "overmind-builder"
        assert body["data"]["role"] == "builder"

    def test_get_agent_not_found(self):
        """GET /agents/{agentId} should 400 for unknown role."""
        r = client.get("/api/v1/agents/overmind-nonexistent")
        body = r.json()
        assert body["ok"] is False

    def test_list_agent_files(self):
        """GET /agents/{agentId}/files should return file list."""
        r = client.get("/api/v1/agents/overmind-builder/files")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert isinstance(body["data"], list)
        keys = {f["key"] for f in body["data"]}
        assert keys == {"agents", "soul", "identity", "user", "tools"}

    def test_get_agent_file_invalid_key(self):
        """GET /agents/{agentId}/files/{fileKey} rejects non-allowlisted keys."""
        r = client.get("/api/v1/agents/overmind-builder/files/secrets")
        body = r.json()
        assert body["ok"] is False
        assert "INVALID_FILE_KEY" in body["error"]["code"]

    def test_list_agent_sessions(self):
        """GET /agents/{agentId}/sessions should return list."""
        r = client.get("/api/v1/agents/overmind-builder/sessions")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert isinstance(body["data"], list)

    @patch("app.routers.agents.oc_sessions_for_agent", new_callable=AsyncMock)
    def test_list_agent_sessions_maps_openclaw_key_shape(self, mock_sessions):
        mock_sessions.return_value = [
            {
                "key": "agent:overmind-scout:main",
                "sessionId": "overmind-ad3c7fd3-126d-4a1d-aff7-7b5ad364c806",
                "updatedAt": 1771150413608,
                "model": "gpt-5.3-codex",
            }
        ]

        r = client.get("/api/v1/agents/overmind-scout/sessions")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert len(body["data"]) == 1

        row = body["data"][0]
        assert row["sessionKey"] == "overmind-ad3c7fd3-126d-4a1d-aff7-7b5ad364c806"
        assert row["agentId"] == "overmind-scout"
        assert isinstance(row["updatedAt"], str)
        assert row["updatedAt"].startswith("2026-")


# ─── Cron ────────────────────────────────────────────────────────

class TestCron:
    def test_list_cron_jobs_returns_list(self):
        r = client.get("/api/v1/cron/jobs")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert isinstance(body["data"], list)

    @patch("app.routers.cron.cron_list_all", new_callable=AsyncMock)
    def test_list_cron_jobs_normalizes_structured_schedule(self, mock_cron_list):
        mock_cron_list.return_value = {
            "jobs": [
                {
                    "id": "job-structured",
                    "name": "daily-update-check",
                    "enabled": True,
                    "schedule": {
                        "kind": "cron",
                        "expr": "40 23 * * *",
                        "tz": "Asia/Kolkata",
                    },
                    "state": {
                        "nextRunAtMs": 1771697400000,
                        "lastRunAtMs": 1771611000000,
                        "lastStatus": "success",
                    },
                    "payload": {"kind": "agentTurn"},
                }
            ]
        }

        r = client.get("/api/v1/cron/jobs")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert len(body["data"]) == 1

        job = body["data"][0]
        assert isinstance(job["schedule"], str)
        assert job["schedule"] == "40 23 * * *"
        assert isinstance(job["scheduleHuman"], str)
        assert "Asia/Kolkata" in job["scheduleHuman"]
        assert isinstance(job["nextRun"], str)
        assert job["nextRun"].startswith("2026-")
        assert isinstance(job["lastRun"], str)
        assert job["lastRunStatus"] == "success"


# ─── Mutations (monkeypatched — no real side-effects) ────────────

class TestMutations:
    @patch("app.routers.projects.ovm_approve", new_callable=AsyncMock, side_effect=OvmCliError(
        code="OVERMIND_CLI_ERROR",
        message='overmind cli failed: {"ok": false, "error": "Project not found: fake-id"}',
        details={"returncode": 1},
    ))
    def test_approve_nonexistent_returns_404(self, _mock):
        r = client.post("/api/v1/projects/fake-id/approve", json={"notes": "test"})
        body = r.json()
        assert body["ok"] is False
        assert r.status_code == 404
        assert "code" in body["error"]

    @patch("app.routers.system.ovm_pause", new_callable=AsyncMock, side_effect=_async_noop)
    def test_orchestrator_pause_mocked(self, _mock):
        r = client.post("/api/v1/system/orchestrator/pause")
        assert r.json()["ok"] is True

    @patch("app.routers.system.ovm_resume", new_callable=AsyncMock, side_effect=_async_noop)
    def test_orchestrator_resume_mocked(self, _mock):
        r = client.post("/api/v1/system/orchestrator/resume")
        assert r.json()["ok"] is True

    @patch("app.routers.projects.ovm_approve", new_callable=AsyncMock, side_effect=_async_noop)
    def test_approve_success_mocked(self, _mock):
        r = client.post("/api/v1/projects/some-id/approve", json={"notes": "ok"})
        assert r.json()["ok"] is True

    @patch("app.routers.projects.ovm_set_status", new_callable=AsyncMock, side_effect=OvmCliError(
        code="OVERMIND_CLI_ERROR",
        message="cannot transition from COMPLETED to ACTIVE",
        details={"returncode": 1},
    ))
    def test_set_status_validation_error_maps_to_422(self, _mock):
        r = client.post(
            "/api/v1/projects/some-id/set-status",
            json={"status": "ACTIVE"},
        )
        assert r.status_code == 422
        assert r.json()["ok"] is False

    @patch("app.routers.system.ovm_pause", new_callable=AsyncMock, side_effect=OvmCliError(
        code="OVERMIND_CLI_TIMEOUT",
        message="timed out after 20s",
    ))
    def test_timeout_maps_to_504(self, _mock):
        r = client.post("/api/v1/system/orchestrator/pause")
        assert r.status_code == 504
        assert r.json()["ok"] is False

    @patch("app.routers.system.ovm_pause", new_callable=AsyncMock, side_effect=OvmCliError(
        code="OVERMIND_CLI_NOT_FOUND",
        message="python3 not found in PATH",
    ))
    def test_cli_not_found_maps_to_503(self, _mock):
        r = client.post("/api/v1/system/orchestrator/pause")
        assert r.status_code == 503
        assert r.json()["ok"] is False


# ─── Request-ID parity ──────────────────────────────────────────

class TestRequestIdParity:
    def test_request_id_header_matches_meta(self):
        """X-Request-Id header must equal meta.request_id in JSON body."""
        r = client.get("/api/v1/system/health")
        header_id = r.headers["x-request-id"]
        meta_id = r.json()["meta"]["request_id"]
        assert header_id == meta_id

    def test_request_id_parity_on_404_error(self):
        """Parity holds for error envelopes too."""
        r = client.get("/api/v1/projects/nonexistent-id")
        assert r.status_code == 404
        header_id = r.headers["x-request-id"]
        meta_id = r.json()["meta"]["request_id"]
        assert header_id == meta_id

    def test_request_id_parity_on_snapshot(self):
        r = client.get("/api/v1/system/snapshot")
        header_id = r.headers["x-request-id"]
        meta_id = r.json()["meta"]["request_id"]
        assert header_id == meta_id


# ─── Error Envelope ──────────────────────────────────────────────

class TestErrorEnvelope:
    def test_404_project_has_envelope(self):
        r = client.get("/api/v1/projects/does-not-exist")
        assert r.status_code == 404
        body = r.json()
        assert body["ok"] is False
        assert "meta" in body
        assert "error" in body

    def test_request_id_in_header(self):
        r = client.get("/api/v1/system/health")
        assert "x-request-id" in r.headers


# ─── WebSocket ───────────────────────────────────────────────────

class TestWebSocket:
    def test_ws_connect_receives_snapshot(self):
        with client.websocket_connect("/ws/v1/live") as ws:
            data = ws.receive_json()
            assert data["type"] == "SNAPSHOT"
            assert "payload" in data
            assert "seq" in data
            assert data["seq"] >= 1
            assert "timestamp" in data

    def test_ws_ping_pong(self):
        with client.websocket_connect("/ws/v1/live") as ws:
            # Drain initial snapshot
            snap = ws.receive_json()
            snap_seq = snap["seq"]
            # Send ping
            ws.send_json({"type": "PING"})
            pong = ws.receive_json()
            assert pong["type"] == "PONG"
            assert pong["seq"] > snap_seq  # monotonic

    def test_ws_ping_pong_multiple(self):
        """Sequence numbers must be strictly monotonic across messages."""
        with client.websocket_connect("/ws/v1/live") as ws:
            snap = ws.receive_json()
            prev_seq = snap["seq"]
            for _ in range(3):
                ws.send_json({"type": "PING"})
                pong = ws.receive_json()
                assert pong["type"] == "PONG"
                assert pong["seq"] > prev_seq
                prev_seq = pong["seq"]
