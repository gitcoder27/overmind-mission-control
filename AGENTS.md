# Repository Guidelines

Overmind Mission Control is a full-stack dashboard that monitors and manages an `overmind_hq` core runtime (OpenClaw/Overmind). The backend reads the OpenClaw SQLite DB and calls the Overmind/OpenClaw CLI for mutations; the frontend talks only to the backend. Agents in this repo are Claude Fable 5.2 (planning, review, leading rounds) and Claude Opus 5.5 (implementation, evidence-gathering, review). No other models work here.

## Project Structure & Module Organization
The repository is a monorepo split by service:
- `backend/` — FastAPI application.
  - `backend/app/routers/` for API routes
  - `backend/app/services/` for business logic and CLI integrations
  - `backend/app/models/` for domain types and response contracts
  - `backend/tests/` for backend test suite (`test_*.py`)
- `frontend/` — React + TypeScript dashboard.
  - `frontend/src/components/`, `routes/`, `queries/`, `hooks/`, `stores/`, `providers/`
  - `frontend/src/routes/*` contains page-level composition
  - `frontend/src/test/` contains Vitest setup utilities
  - `frontend/src/components|lib` contain reusable UI and utility modules
- `scripts/` — local tooling (e.g. `smoke-dev-stack.sh`)
- `docs/` and implementation briefs for architecture notes

## Build, Test, and Development Commands
- `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- `cd backend && pytest -q`  
  Runs backend tests via `pytest` (configured in `backend/pyproject.toml`).
- `cd backend && ./run.sh`  
  Starts the API on `127.0.0.1:8788` (or overridden by `OVERMIND_DASHBOARD_PORT`).
- `cd frontend && npm install`
- `cd frontend && npm run dev`
- `cd frontend && npm run lint`
- `cd frontend && npm run test:run`
- `cd frontend && npm run build`
- `./dev-stack.sh [start|stop|restart|status|logs]`  
  Boots/stops both services together and performs preflight checks.

## Coding Style & Naming Conventions
- Backend Python follows PEP 8 style with 4-space indentation, snake_case for functions/modules, and PascalCase for classes.
- Frontend TypeScript uses the Vite + React conventions: 2-space indentation, semicolons, single-quoted strings.
- Naming:
  - React components: `PascalCase` (`SystemHealthCard`)
  - Hooks: `useSomething` (`useMetricsSocket`)
  - Route files: `kebab-or-camel-case` as currently used (`system-health` route folder, `LoginPage`)
  - Tests: `*.test.ts` / `*.test.tsx`
- Use the shared provider layer in the frontend (`frontend/src/providers/data`) instead of direct endpoint calls in route or page components. Keep contract fidelity with backend envelopes and fields, and keep mutation capabilities aware of their statuses.
- Use the existing WebSocket hook (`frontend/src/lib/useWebSocket.ts`) for real-time data.
- Linting: `frontend/eslint.config.js` (run with `npm run lint`).

## Testing Guidelines
- Backend tests: `backend/tests/test_*.py` (e.g. `pytest -q`).
- Frontend tests: `frontend/src/**/*.{test.ts,test.tsx}` (run with `npm run test:run`).
- Place new tests beside related code and keep async behavior explicit (`async/await` + mocked APIs).
- Prefer stable names that mirror the module under test (e.g. `routes/login.test.tsx`).

## Commit & Pull Request Guidelines
- Commit message pattern in this repo is conventional and imperative: `feat: ...`, `fix: ...`, `style: ...`.
- Use short, scoped summaries and include behavior impact.
- PR checklist:
  - What changed and why
  - Commands run (`pytest`, `npm run lint`, `npm run test:run`, `npm run build`)
  - Config/env assumptions (`OPENCLAW_ROOT`, `OVERMIND_DASHBOARD_PORT`, provider mode)
  - Screenshots/videos for UI-affecting changes

## Security & Configuration Notes
- Never commit secrets, local DB paths, or runtime tokens, and never log or expose OpenClaw secrets (auth and config files).
- Operator actions go through the CLI wrappers (`backend/app/services/overmind.py`, `backend/app/services/openclaw.py`). Never write to the Overmind/OpenClaw DB or files directly: they are the live runtime's state, and the wrappers keep its own checks in the path.
- Keep the backend response envelope stable. Success: `{ "ok": true, "data": {}, "meta": { "timestamp": "...", "request_id": "..." } }`. Error: `{ "ok": false, "error": { "code": "...", "message": "...", "details": {} }, "meta": { "timestamp": "...", "request_id": "..." } }`.
- The backend still needs artifacts from the `overmind_hq` core runtime (SQLite DB, heartbeat/pid files, CLI module). Don't archive or remove them while the backend relies on them.
- `./dev-stack.sh` starts the frontend on `127.0.0.1:5173` and the backend on `127.0.0.1:8788` (override with `OVERMIND_DASHBOARD_PORT` and `FRONTEND_PORT`); Swagger docs are at `/docs`. Start or stop the stack only when the task needs a running app, and use free ports if another project holds these.
- Backend requires an activated virtual environment before running (`backend/run.sh` sources `backend/.venv/bin/activate`).
- Frontend behavior depends on `.env`; base config is documented in `frontend/.env.example` and `README.md`.
