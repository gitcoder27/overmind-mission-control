# Overmind Mission Control

A local web dashboard for monitoring and operating an **Overmind / OpenClaw** agent runtime. It replaces an older dashboard on `:8787`. A FastAPI backend reads the Overmind SQLite DB and runtime files and runs mutations through the Overmind and OpenClaw CLIs. A React frontend talks only to that backend.

For the dev-stack scripts (lifecycle, preflight, readiness probes, logs, smoke checks), see **[README-dev-stack.md](README-dev-stack.md)**.

## What it does

- **Overview** (`/`): a system snapshot and a live event feed over WebSocket.
- **Control** (`/control`): project intake, plus chat with the Overmind "manager" (streamed replies, session history).
- **Projects** (`/projects`, `/projects/:id`): list, detail, tasks and attempts. Approve, request changes, or set status.
- **Agents** (`/agents`, `/agents/:id`): agent list and detail, agent files, sessions, messages and transcripts.
- **Live** (`/live`): an event stream with expandable payloads.
- **Cron** (`/scheduling/cron`): list jobs, enable/disable them, or run one now.
- **System** (`/system`, `/system/health`): health, orchestrator pause/resume/restart, cache stats, and live host metrics (`/api/v1/ws/metrics`).
- **Optional API-key auth**: login page, `POST /api/v1/auth/login`, `/verify`. Auth is on only when `OVERMIND_API_KEY` is set; otherwise it is off. (`docs/known-gaps.md` still says auth isn't implemented, which is out of date.)

Every API response uses one envelope: `{ ok, data | error, meta: { timestamp, request_id } }`.

## Tech stack

- **Backend:** Python 3.11, FastAPI, uvicorn, pydantic 2, aiosqlite, websockets, psutil; pytest and pytest-asyncio.
- **Frontend:** React 19, TypeScript, Vite, Tailwind 4, TanStack Router and Query, zustand, React Flow (`@xyflow/react`) with dagre, recharts, react-markdown; Vitest and Testing Library, ESLint.
- **CI:** `.github/workflows/production-readiness.yml` runs bash syntax checks, backend tests, frontend lint/test/build, and the smoke check.

## Project structure

```
backend/app/routers/    API routes: system, projects, agents, cron, events, control, auth, ws
backend/app/services/   overmind.py / openclaw.py CLI wrappers, snapshot, cache, transcript parser
backend/app/config.py   paths, host/port, CORS, timeouts (env overrides)
backend/tests/          pytest suite
frontend/src/routes/    page components (overview, control, projects, agents, live, cron, system, login)
frontend/src/providers/data/  data-provider layer: api | legacy | mock
frontend/src/{components,queries,hooks,stores,lib}/
dev-stack.sh, Makefile, scripts/   dev-stack lifecycle, doctor, smoke (see README-dev-stack.md)
docs/                   architecture, provider contract, specs, implementation logs, known gaps
```

## Running locally

```bash
# install
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd ../frontend && npm ci

# run both services (from repo root)
make dev-up        # runs scripts/dev-doctor.sh, then ./dev-stack.sh start
make dev-status    # or ./dev-stack.sh status
make dev-logs
make dev-down
```

| Service | URL |
|---|---|
| Frontend | http://127.0.0.1:5173 |
| Backend API | http://127.0.0.1:8788/api/v1 (Swagger at `/docs`) |
| Live WebSocket | ws://127.0.0.1:8788/ws/v1/live |
| Legacy dashboard (separate service, not in this repo) | http://127.0.0.1:8787 |

To run the services separately: `cd backend && ./run.sh` (it sources `.venv`) and `cd frontend && npm run dev`.

Tests and build:

```bash
cd backend && pytest -q
cd frontend && npm run lint && npm run test:run && npm run build
make smoke
```

## Current status

The main build happened 2026-02-21. Dev-stack tooling was added 2026-04-13, and agent-instruction docs were updated 2026-11-21. All pages above are implemented against the real backend. Known gaps (`docs/known-gaps.md`): no pagination, no persisted filters, desktop-first layout, no keyboard shortcuts, no runtime schema validation, and only partial data in `legacy` provider mode.

**Blocker to running it on this VPS:** the backend depends on the `overmind_hq` core runtime, and as of 2026-11-21 that runtime is **missing** at its default path (`~/.openclaw/workspace/overmind_hq/` does not exist). The backend needs these artifacts:

- `overmind_hq/data/overmind_hq.db`
- `overmind_hq/run/orchestrator.heartbeat` and `overmind_hq/run/overmind_orchestrator.pid`
- `overmind_hq/src/overmind_hq/cli.py`, run as `python3 -m overmind_hq.cli`

They are used from `backend/app/config.py` and `backend/app/services/overmind.py`. Without them, Overmind views and mutations will fail. `~/.openclaw` itself and the `openclaw` CLI are present. Point the backend at a runtime with `OPENCLAW_ROOT` or `OVERMIND_DB_PATH`. Don't archive these runtime pieces while the backend depends on them.

The frontend's legacy provider (`frontend/src/providers/data/legacy/`) is an optional fallback for the old `:8787` `/api/snapshot`. It can be removed if `legacy` mode is never used.

## Configuration

- **Backend env:** `OPENCLAW_ROOT`, `OVERMIND_DB_PATH`, `OVERMIND_DASHBOARD_HOST`, `OVERMIND_DASHBOARD_PORT`, `OVERMIND_ENV`, `CORS_ORIGINS`, `OVERMIND_INVOCATION_TIMEOUT_SECONDS`, `OVERMIND_API_KEY` (optional; turns auth on).
- **dev-stack.sh:** `FRONTEND_HOST`, `FRONTEND_PORT`, plus the backend host/port vars above.
- **Frontend** (`frontend/.env`, template in `frontend/.env.example`): `VITE_DATA_PROVIDER` (`api` | `legacy` | `mock`; the example defaults to `mock`, and the local `.env` uses `api`), `VITE_API_BASE_URL`, `VITE_LEGACY_BASE_URL`, `VITE_WS_URL`.
- **Rules (AGENTS.md):** never write to the Overmind/OpenClaw DB or files directly. Operator actions go only through the CLI wrappers.
