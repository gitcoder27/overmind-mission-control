# Development Stack Readiness Pack

This repository ships a hardened local orchestrator for backend + frontend with reliable lifecycle commands and health checks.

## Quickstart for new devs

1. Install dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../frontend
npm ci
```

2. Validate environment

```bash
./scripts/dev-doctor.sh
```

3. Start stack

```bash
make dev-up
```

4. Verify

```bash
make dev-status
make dev-logs
```

5. Stop when done

```bash
make dev-down
```

## Runtime command matrix

| Action | Direct command | Make target | Behavior |
|---|---|---|---|
| Start | `./dev-stack.sh start` | `make dev-up` | Start backend + frontend with preflight + readiness probes |
| Stop | `./dev-stack.sh stop` | `make dev-down` | Graceful TERM then fallback KILL |
| Restart | `./dev-stack.sh restart` | `make dev-down && make dev-up` | Stop then start |
| Status | `./dev-stack.sh status` | `make dev-status` | Show matching listeners + process matches |
| Logs | `./dev-stack.sh logs` | `make dev-logs` | Tail recent logs |
| Doctor | `./scripts/dev-doctor.sh` | `make dev-doctor` | Env/files/ports/deps checks |
| Smoke | `./scripts/smoke-dev-stack.sh` | `make smoke` | Syntax + dry-run + optional live boot check |

## One-command UX notes

Use make targets for stable day-to-day ergonomics:

```bash
make dev-up       # full start flow
make dev-status   # live view of stack state
make dev-logs     # show last lines from logs
make dev-down     # stop both services
make dev-doctor   # preflight checks and remediation tips
make smoke        # smoke checks
```

## dev-stack behavior flags

`./dev-stack.sh` supports:

- `start|stop|restart|status|logs` command
- `--dry-run` print actions without side effects
- `--verbose` print internal steps and decision points
- `--timeout <seconds>` for readiness waits (default 60)
- `--help`

## Preflight checks

`start` preflight validates:

- Commands: `bash`, `ss`, `pgrep`, `pkill`, `curl`, `node`, `npm`
- Directories: `backend/`, `frontend/`
- Required files: `backend/run.sh`, `backend/.venv/bin/activate`, `frontend/package.json`
- Process port collisions on expected backend/frontend ports
- Runtime dependencies are surfaced with recommended fixes.
Missing optional files are logged (with `--verbose`) but do not block start unless required.

`make dev-doctor` and `./scripts/dev-doctor.sh` surface all required and optional dependencies with exact fix commands.

## Readiness probes and timeouts

`start` waits for:

- Backend: `http://127.0.0.1:8788/docs`
- Frontend: `http://127.0.0.1:5173/`

Default timeout is 60 seconds for start flows (override with `--timeout`).

`status` shows whether backend/frontend listeners are present and process matches are active.

## Deterministic logs

Logs are written to:

- `.dev-stack-logs/backend.log`
- `.dev-stack-logs/frontend.log`

Use:

```bash
make dev-logs
# or
./dev-stack.sh logs
```

## Scripted reliability checks

### `scripts/dev-doctor.sh`

Validates:

- tool availability
- runtime files and executables
- required directories
- venv presence
- frontend/backend dependencies presence
- port ownership and conflicts
- log directory writeability

Output is explicit `[PASS|WARN|FAIL]` with remediation lines.

### `scripts/smoke-dev-stack.sh`

Smoke flow:

1. bash syntax checks for shell scripts
2. `./dev-stack.sh --help` and dry-run start path
3. runs `scripts/dev-doctor.sh`
4. by default: non-destructive endpoint probe (if services already running)
5. with `SMOKE_LIVE=1` or `--live`: starts stack, verifies readiness, then stops it

## Health check and timeout checklist

- Backend/Frontend processes should be present in `status`
- Port `8788` and `5173` should be listening for healthy start
- `/docs` should return quickly for backend URL
- `/` should return quickly for frontend URL

## Common failures and exact remediation

- Missing backend venv
  - `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- Missing frontend dependencies
  - `cd frontend && npm ci`
- Port in use by unknown process
  - `ss -ltnp | rg ":8788|:5173"`
  - Stop conflicting process and retry
- Process start fails repeatedly
  - `tail -n 80 .dev-stack-logs/backend.log` or `.dev-stack-logs/frontend.log`

## Expected defaults and overrides

Default host/port assumptions:

- Backend host: `127.0.0.1`
- Backend port: `8788`
- Frontend host: `127.0.0.1`
- Frontend port: `5173`

Override with:

```bash
OVERMIND_DASHBOARD_HOST=127.0.0.1 OVERMIND_DASHBOARD_PORT=8788 FRONTEND_PORT=5173 ./dev-stack.sh start
```

(`OVERMIND_DASHBOARD_PORT` is also respected by `backend/run.sh`.)

## CI workflow

Repository workflow `/.github/workflows/production-readiness.yml` runs:

- shell syntax checks for all scripts
- backend pytest
- frontend lint + tests
- `./scripts/dev-doctor.sh`
- `./scripts/smoke-dev-stack.sh`
