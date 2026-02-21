#!/usr/bin/env bash
# Start the Overmind Mission Control backend
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Activate virtual environment
source .venv/bin/activate

# Run uvicorn
exec uvicorn app.main:app \
    --host "${OVERMIND_DASHBOARD_HOST:-127.0.0.1}" \
    --port "${OVERMIND_DASHBOARD_PORT:-8788}" \
    --reload \
    --log-level info
