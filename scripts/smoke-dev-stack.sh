#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_STACK_SCRIPT="$ROOT_DIR/dev-stack.sh"
DOCTOR_SCRIPT="$ROOT_DIR/scripts/dev-doctor.sh"

LIVE_SMOKE="${SMOKE_LIVE:-0}"
MAX_STARTUP_WAIT_SECONDS="${SMOKE_STARTUP_TIMEOUT:-45}"

BACKEND_HOST="${OVERMIND_DASHBOARD_HOST:-127.0.0.1}"
BACKEND_PORT="${OVERMIND_DASHBOARD_PORT:-8788}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

BACKEND_URL="http://$BACKEND_HOST:$BACKEND_PORT/docs"
FRONTEND_URL="http://$FRONTEND_HOST:$FRONTEND_PORT/"

LIVE_STARTED=false

log() {
  printf '[%s] %s\n' "$(date +'%Y-%m-%d %H:%M:%S%:z')" "$*"
}

run_step() {
  local name=$1
  log "== ${name} =="
}

require() {
  local cmd=$1
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log "Missing command: $cmd"
    exit 1
  fi
}

wait_for_http() {
  local name=$1
  local url=$2
  local timeout=$3
  local attempts_left=$((timeout / 2))

  while ((attempts_left > 0)); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      log "✓ ${name} reachable: $url"
      return 0
    fi
    sleep 2
    ((attempts_left--))
  done

  log "Timed out waiting for ${name}: $url"
  return 1
}

cleanup_live_stack() {
  if [[ "$LIVE_STARTED" == "true" ]]; then
    "$DEV_STACK_SCRIPT" --verbose stop || true
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --live)
        LIVE_SMOKE=1
        ;;
      --timeout)
        if [[ $# -lt 2 ]]; then
          log "Missing argument for --timeout"
          exit 1
        fi
        MAX_STARTUP_WAIT_SECONDS="$2"
        shift
        ;;
      --help|-h)
        cat <<'EOF_SMOKE_HELP'
Usage:
  ./scripts/smoke-dev-stack.sh [--live] [--timeout seconds]

--live       start services for a real readiness check (starts and stops stack)
--timeout    readiness timeout for live flow (default 45)
EOF_SMOKE_HELP
        exit 0
        ;;
      *)
        log "Unknown argument: $1"
        exit 1
        ;;
    esac
    shift
  done
}

main() {
  parse_args "$@"

  run_step "syntax checks"
  require bash
  bash -n "$DEV_STACK_SCRIPT"
  bash -n "$DOCTOR_SCRIPT"
  bash -n "$0"

  run_step "help + dry-run path"
  "$DEV_STACK_SCRIPT" --help >/dev/null
  "$DEV_STACK_SCRIPT" --dry-run --verbose start

  run_step "doctor parity"
  "$DOCTOR_SCRIPT"

  if [[ "$LIVE_SMOKE" == "1" ]]; then
    run_step "live boot and readiness"
    trap cleanup_live_stack EXIT
    "$DEV_STACK_SCRIPT" --verbose stop || true
    "$DEV_STACK_SCRIPT" --timeout "$MAX_STARTUP_WAIT_SECONDS" --verbose start
    LIVE_STARTED=true
    wait_for_http "backend" "$BACKEND_URL" "$MAX_STARTUP_WAIT_SECONDS"
    wait_for_http "frontend" "$FRONTEND_URL" "$MAX_STARTUP_WAIT_SECONDS"
    "$DEV_STACK_SCRIPT" --verbose status
    log "Smoke live check complete"
  else
    run_step "non-destructive readiness probe"
    if ! wait_for_http "backend" "$BACKEND_URL" 3; then
      log "Backend not currently reachable in non-destructive mode; use --live or SMOKE_LIVE=1 for boot check"
    fi
    if ! wait_for_http "frontend" "$FRONTEND_URL" 3; then
      log "Frontend not currently reachable in non-destructive mode; use --live or SMOKE_LIVE=1 for boot check"
    fi
  fi

  run_step "smoke complete"
  log "Smoke checks completed"
}

main "$@"
