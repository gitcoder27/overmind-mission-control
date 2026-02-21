"""Application configuration with environment-based overrides."""

from __future__ import annotations

import os
from pathlib import Path


# ── Canonical paths ──────────────────────────────────────────────
OPENCLAW_ROOT = Path(os.getenv("OPENCLAW_ROOT", "/home/ubuntu/.openclaw"))
WORKSPACE = OPENCLAW_ROOT / "workspace"
OVERMIND_ROOT = WORKSPACE / "overmind_hq"
OVERMIND_DB_PATH = Path(
    os.getenv(
        "OVERMIND_DB_PATH",
        str(OVERMIND_ROOT / "data" / "overmind_hq.db"),
    )
)
OVERMIND_SRC = OVERMIND_ROOT / "src"
OVERMIND_RUN = OVERMIND_ROOT / "run"
OVERMIND_HEARTBEAT = OVERMIND_RUN / "orchestrator.heartbeat"
OVERMIND_PID_FILE = OVERMIND_RUN / "overmind_orchestrator.pid"

# ── Server ───────────────────────────────────────────────────────
HOST = os.getenv("OVERMIND_DASHBOARD_HOST", "127.0.0.1")
PORT = int(os.getenv("OVERMIND_DASHBOARD_PORT", "8788"))
ENV = os.getenv("OVERMIND_ENV", "development")

# ── CORS ─────────────────────────────────────────────────────────
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3000,http://localhost:3000",
).split(",")

# ── CLI wrappers ─────────────────────────────────────────────────
OVERMIND_CLI_ENV = {
    **os.environ,
    "PYTHONPATH": str(OVERMIND_SRC),
}
OVERMIND_CLI_PREFIX = ["python3", "-m", "overmind_hq.cli"]
OPENCLAW_CLI = "openclaw"

# ── Timeouts ─────────────────────────────────────────────────────
CLI_STATUS_TIMEOUT = 10  # seconds – for read/status commands
CLI_MUTATION_TIMEOUT = 20  # seconds – for mutation commands

# ── Polling ──────────────────────────────────────────────────────
SNAPSHOT_POLL_INTERVAL = 2.5  # seconds
