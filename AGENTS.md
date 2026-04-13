# Repository Guidelines

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
- Use shared provider layer in frontend (`frontend/src/providers/data`) instead of direct API calls in route components.
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
- Never commit secrets, local DB paths, or runtime tokens.
- Backend requires an activated virtual environment before running (`backend/run.sh` sources `backend/.venv/bin/activate`).
- Frontend behavior depends on `.env`; base config is documented in `frontend/.env.example` and `README.md`.
