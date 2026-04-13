#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
DEV_STACK_SCRIPT="$ROOT_DIR/dev-stack.sh"
LOG_DIR="$ROOT_DIR/.dev-stack-logs"

BACKEND_HOST="${OVERMIND_DASHBOARD_HOST:-127.0.0.1}"
BACKEND_PORT="${OVERMIND_DASHBOARD_PORT:-8788}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

BACKEND_PATTERN="uvicorn app.main:app --host $BACKEND_HOST --port $BACKEND_PORT"
FRONTEND_PATTERN="vite --host $FRONTEND_HOST --port $FRONTEND_PORT"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

log() {
  printf '%s\n' "$*"
}

pass() {
  ((PASS_COUNT += 1))
  log "[PASS] $1"
}

warn() {
  ((WARN_COUNT += 1))
  log "[WARN] $1"
  if [[ -n "$2" ]]; then
    log "       Fix: $2"
  fi
}

fail() {
  ((FAIL_COUNT += 1))
  log "[FAIL] $1"
  if [[ -n "$2" ]]; then
    log "       Fix: $2"
  fi
}

check_command() {
  local name=$1
  if command -v "$name" >/dev/null 2>&1; then
    pass "command present: $name"
  else
    fail "missing command: $name" "Install and add '$name' to PATH"
  fi
}

check_dir() {
  local path=$1
  local label=$2
  if [[ -d "$path" ]]; then
    pass "directory present: $label ($path)"
  else
    fail "missing directory: $label ($path)" "Create or mount $path"
  fi
}

check_file() {
  local path=$1
  local label=$2
  local req=$3
  if [[ -e "$path" ]]; then
    pass "$req: $label"
    return 0
  fi
  if [[ "$req" == "required" ]]; then
    fail "missing required file: $label ($path)" "Create or copy $path"
    return 1
  else
    warn "missing optional file: $label ($path)" "Check env or docs for setup command"
    return 0
  fi
}

check_exec() {
  local path=$1
  local label=$2
  if [[ -x "$path" ]]; then
    pass "executable present: $label"
  else
    fail "missing executable: $label ($path)" "Run: chmod +x $path"
  fi
}

service_pids() {
  local pattern=$1
  pgrep -f -- "$pattern" 2>/dev/null || true
}

is_port_in_use() {
  local port=$1
  ss -ltnp 2>/dev/null | grep -qE ":${port}([[:space:]/]|$)"
}

check_port() {
  local port=$1
  local pattern=$2
  local name=$3
  local holders
  holders=$(service_pids "$pattern")

  if is_port_in_use "$port"; then
    if [[ -n "$holders" ]]; then
      pass "$name port $port is already served by expected process"
    else
      fail "$name port $port is in use by unknown process" "Stop conflicting process on $port or change ${name^^}_PORT"
    fi
  else
    pass "$name port $port is free"
  fi
}

main() {
  log "== dev-doctor =="
  check_command bash
  check_command ss
  check_command pgrep
  check_command pkill
  check_command curl
  check_command node
  check_command npm

  log "== layout checks =="
  check_file "$DEV_STACK_SCRIPT" "dev-stack script" "required"
  check_exec "$DEV_STACK_SCRIPT" "dev-stack"
  check_dir "$BACKEND_DIR" "backend"
  check_dir "$FRONTEND_DIR" "frontend"
  check_file "$BACKEND_DIR/run.sh" "backend/run.sh" "required"
  check_file "$BACKEND_DIR/requirements.txt" "backend/requirements.txt" "required"
  check_file "$FRONTEND_DIR/package.json" "frontend/package.json" "required"
  check_file "$FRONTEND_DIR/package-lock.json" "frontend/package-lock.json" "required"
  check_file "$BACKEND_DIR/.venv/bin/activate" "backend venv activate" "required"

  log "== dependency checks =="
  check_file "$BACKEND_DIR/node_modules" "backend dependencies" "optional"
  check_file "$FRONTEND_DIR/node_modules" "frontend dependencies" "optional"

  log "== env/checkpoint checks =="
  if [[ -f "$BACKEND_DIR/.env" ]]; then
    pass "backend env exists"
  else
    warn "backend .env missing" "Copy from .env.example if present"
  fi
  if [[ -f "$FRONTEND_DIR/.env" ]]; then
    pass "frontend env exists"
  else
    warn "frontend .env missing" "Copy from .env.example and adjust values"
  fi
  check_file "$BACKEND_DIR/.env.example" "backend .env.example" "optional"
  check_file "$FRONTEND_DIR/.env.example" "frontend .env.example" "optional"

  log "== port ownership checks =="
  check_port "$BACKEND_PORT" "$BACKEND_PATTERN" "backend"
  check_port "$FRONTEND_PORT" "$FRONTEND_PATTERN" "frontend"

  log "== log location checks =="
  if mkdir -p "$LOG_DIR"; then
    if touch "$LOG_DIR/.doctor-write-test" && rm -f "$LOG_DIR/.doctor-write-test"; then
      pass "log directory writable: $LOG_DIR"
    else
      fail "log directory not writable: $LOG_DIR" "Fix permissions or choose another location"
    fi
  else
    fail "log directory not creatable: $LOG_DIR" "Create .dev-stack-logs under repo root"
  fi

  if [[ $FAIL_COUNT -eq 0 ]]; then
    log "== summary =="
    log "PASS: $PASS_COUNT | WARN: $WARN_COUNT | FAIL: $FAIL_COUNT"
    log "Doctor completed with sufficient health for dev startup."
    return 0
  fi

  log "== summary =="
  log "PASS: $PASS_COUNT | WARN: $WARN_COUNT | FAIL: $FAIL_COUNT"
  log "Doctor found issues. Fix FAIL items before attempting stack start."
  return 1
}

main "$@"
