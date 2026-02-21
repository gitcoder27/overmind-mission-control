#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/Development/overmind-mission-control"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

BACKEND_PORT="8788"
FRONTEND_PORT="5173"

BACKEND_LOG="$BACKEND_DIR/backend.log"
FRONTEND_LOG="$FRONTEND_DIR/frontend.log"

backend_pattern='uvicorn app.main:app --host 127.0.0.1 --port 8788'
frontend_pattern='vite --host 127.0.0.1 --port 5173'

status() {
  echo "\n== Listening ports =="
  ss -ltnp | grep ":$FRONTEND_PORT\|:$BACKEND_PORT\|:8787" || true

  echo "\n== Process matches =="
  pgrep -af "$backend_pattern" || echo "backend: not running"
  pgrep -af "$frontend_pattern" || echo "frontend: not running"
}

start() {
  echo "Starting backend + frontend in background..."

  # Clean stale processes first (safe if not running)
  pgrep -f "$backend_pattern" >/dev/null && pkill -f "$backend_pattern" || true
  pgrep -f "$frontend_pattern" >/dev/null && pkill -f "$frontend_pattern" || true

  nohup bash -lc "cd '$BACKEND_DIR' && ./run.sh" >"$BACKEND_LOG" 2>&1 &
  nohup bash -lc "cd '$FRONTEND_DIR' && npm run dev -- --host 127.0.0.1 --port 5173" >"$FRONTEND_LOG" 2>&1 &

  sleep 2
  status

  echo "\nFrontend: http://127.0.0.1:$FRONTEND_PORT"
  echo "Backend : http://127.0.0.1:$BACKEND_PORT"
  echo "Backend docs: http://127.0.0.1:$BACKEND_PORT/docs"
}

stop() {
  echo "Stopping backend + frontend..."
  pgrep -f "$backend_pattern" >/dev/null && pkill -f "$backend_pattern" || true
  pgrep -f "$frontend_pattern" >/dev/null && pkill -f "$frontend_pattern" || true
  sleep 1
  status
}

logs() {
  echo "\n--- backend log ($BACKEND_LOG) ---"
  tail -n 80 "$BACKEND_LOG" 2>/dev/null || echo "no backend log yet"
  echo "\n--- frontend log ($FRONTEND_LOG) ---"
  tail -n 80 "$FRONTEND_LOG" 2>/dev/null || echo "no frontend log yet"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  logs) logs ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
