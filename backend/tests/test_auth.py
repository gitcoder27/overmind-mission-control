"""Tests for the auth module and auth router."""

import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


# ── Auth module unit tests ───────────────────────────────────────

class TestAuthModule:
    """Tests for app.auth functions."""

    def test_auth_disabled_when_no_env(self):
        """Auth should be disabled when OVERMIND_API_KEY is not set."""
        with patch.dict(os.environ, {}, clear=True):
            # Reimport to pick up env change
            import importlib
            import app.auth as auth_mod
            importlib.reload(auth_mod)
            assert auth_mod.auth_enabled() is False

    def test_auth_enabled_when_key_set(self):
        """Auth should be enabled when OVERMIND_API_KEY is set."""
        with patch.dict(os.environ, {"OVERMIND_API_KEY": "test-key-123"}):
            import importlib
            import app.auth as auth_mod
            importlib.reload(auth_mod)
            assert auth_mod.auth_enabled() is True

    def test_verify_key_correct(self):
        """verify_key should return True for matching key."""
        with patch.dict(os.environ, {"OVERMIND_API_KEY": "secret123"}):
            import importlib
            import app.auth as auth_mod
            importlib.reload(auth_mod)
            assert auth_mod.verify_key("secret123") is True

    def test_verify_key_incorrect(self):
        """verify_key should return False for wrong key."""
        with patch.dict(os.environ, {"OVERMIND_API_KEY": "secret123"}):
            import importlib
            import app.auth as auth_mod
            importlib.reload(auth_mod)
            assert auth_mod.verify_key("wrong-key") is False

    def test_verify_key_when_disabled(self):
        """verify_key should return True when auth is disabled."""
        with patch.dict(os.environ, {}, clear=True):
            import importlib
            import app.auth as auth_mod
            importlib.reload(auth_mod)
            assert auth_mod.verify_key("anything") is True


# ── Auth router integration tests ────────────────────────────────

@pytest.fixture
def client_no_auth():
    """Test client with auth disabled."""
    with patch.dict(os.environ, {}, clear=False):
        # Remove OVERMIND_API_KEY if present
        env = dict(os.environ)
        env.pop("OVERMIND_API_KEY", None)
        with patch.dict(os.environ, env, clear=True):
            import importlib
            import app.auth
            importlib.reload(app.auth)
            from app.main import app
            yield TestClient(app)


@pytest.fixture
def client_with_auth():
    """Test client with auth enabled."""
    with patch.dict(os.environ, {"OVERMIND_API_KEY": "test-api-key-42"}):
        import importlib
        import app.auth
        importlib.reload(app.auth)
        from app.main import app
        yield TestClient(app)


class TestAuthRouter:
    """Integration tests for /api/v1/auth endpoints."""

    def test_verify_no_auth(self, client_no_auth):
        """GET /auth/verify should report auth not required."""
        resp = client_no_auth.get("/api/v1/auth/verify")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["data"]["authEnabled"] is False

    def test_login_no_auth_always_succeeds(self, client_no_auth):
        """POST /auth/login should succeed when auth is disabled."""
        resp = client_no_auth.post("/api/v1/auth/login", json={"key": "anything"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["data"]["authEnabled"] is False

    def test_login_correct_key(self, client_with_auth):
        """POST /auth/login should return token for valid key."""
        resp = client_with_auth.post(
            "/api/v1/auth/login", json={"key": "test-api-key-42"}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["data"]["token"] == "test-api-key-42"
        assert body["data"]["authEnabled"] is True

    def test_login_wrong_key(self, client_with_auth):
        """POST /auth/login should reject invalid key."""
        resp = client_with_auth.post(
            "/api/v1/auth/login", json={"key": "wrong-key"}
        )
        assert resp.status_code == 401
        body = resp.json()
        assert body["ok"] is False

    def test_protected_endpoint_without_token(self, client_with_auth):
        """Protected endpoints should reject requests without Bearer token."""
        resp = client_with_auth.get("/api/v1/system/health")
        assert resp.status_code == 401

    def test_protected_endpoint_with_valid_token(self, client_with_auth):
        """Protected endpoints should accept valid Bearer token."""
        resp = client_with_auth.get(
            "/api/v1/system/health",
            headers={"Authorization": "Bearer test-api-key-42"},
        )
        # May fail with 500 if DB not available, but should not be 401
        assert resp.status_code != 401

    def test_verify_with_valid_token(self, client_with_auth):
        """GET /auth/verify with valid token should show valid=True."""
        resp = client_with_auth.get(
            "/api/v1/auth/verify",
            headers={"Authorization": "Bearer test-api-key-42"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["valid"] is True

    def test_verify_with_invalid_token(self, client_with_auth):
        """GET /auth/verify with invalid token should show valid=False."""
        resp = client_with_auth.get(
            "/api/v1/auth/verify",
            headers={"Authorization": "Bearer wrong-key"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["valid"] is False
