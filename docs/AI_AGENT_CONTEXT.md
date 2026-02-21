# Overmind Mission Control — AI Agent Context (Fresh Session)

Use this as the **single bootstrap doc** for any new AI coding session.

## 1) Mission
Build and evolve a local-first Mission Control dashboard for Overmind/OpenClaw.

- Frontend: `http://127.0.0.1:5173`
- New backend API: `http://127.0.0.1:8788`
- Legacy dashboard (must remain untouched): `http://127.0.0.1:8787`

Project root (actual on this host):
`/home/ubuntu/Development/overmind-mission-control`

---

## 2) Host Reality vs Older Docs (important)
Some upstream docs mention `/home/ubuntu/.openclaw/workspace/overmind-mission-control`.
For this implementation, **use the actual root above** (`/home/ubuntu/Development/overmind-mission-control`).

OpenClaw/Overmind source roots:
- OpenClaw root: `/home/ubuntu/.openclaw`
- Overmind root: `/home/ubuntu/.openclaw/workspace/overmind_hq`
- Overmind DB: `/home/ubuntu/.openclaw/workspace/overmind_hq/data/overmind_hq.db`

---

## 3) Mandatory Read Order

### Product/Handoff source docs
1. `/home/ubuntu/.openclaw/workspace/docs/overmind-dashboard-prd-v2.md`
2. `/home/ubuntu/.openclaw/workspace/docs/overmind-dashboard-prd-v2.1-handoff.md`
3. `/home/ubuntu/.openclaw/workspace/docs/overmind-dashboard-frontend-prd-v1.md`
4. `/home/ubuntu/.openclaw/workspace/docs/overmind-dashboard-backend-prd-v1.md`
5. `/home/ubuntu/.openclaw/workspace/docs/overmind-dashboard-backend-api-contract-v1.md`
6. `/home/ubuntu/.openclaw/workspace/docs/OVERMIND_HQ_V1_RUNBOOK.md`

### Local implementation docs
7. `docs/frontend-architecture.md`
8. `docs/provider-contract.md`
9. `docs/integration-checklist.md`
10. `docs/implementation-log.md`
11. `docs/backend-implementation-log.md`
12. `docs/known-gaps.md`

---

## 4) Architecture Summary

### Frontend (`frontend/`)
- React + TypeScript + Vite
- TanStack Router + TanStack Query
- Provider adapter pattern: `mock | legacy | api`
- Canonical domain types: `frontend/src/types/domain.ts`
- API provider: `frontend/src/providers/data/api/index.ts`

### Backend (`backend/`)
- FastAPI + Uvicorn
- Raw SQL + Pydantic response models
- Read-only SQLite for reads
- Mutation safety via CLI wrappers
- WebSocket live endpoint: `/ws/v1/live`

---

## 5) OpenClaw / Overmind Preflight (run before major work)

```bash
openclaw --version
openclaw gateway status --json
openclaw health --json
openclaw agents list --json
openclaw sessions --active 120 --json
openclaw cron list --all --json

PYTHONPATH=/home/ubuntu/.openclaw/workspace/overmind_hq/src python3 -m overmind_hq.cli --help
PYTHONPATH=/home/ubuntu/.openclaw/workspace/overmind_hq/src python3 -m overmind_hq.cli status
PYTHONPATH=/home/ubuntu/.openclaw/workspace/overmind_hq/src python3 -m overmind_hq.cli health
```

---

## 6) Non-Negotiables

1. **Never modify legacy dashboard service** (`:8787`).
2. **Never expose secrets** from OpenClaw auth/config files.
3. **No direct operator-state writes to Overmind/OpenClaw DB/files.**
   - Use CLI wrappers for mutating actions.
4. Keep API envelope stable:
   - success: `{ ok, data, meta }`
   - error: `{ ok:false, error, meta }`
5. Keep frontend contract-driven; no ad-hoc direct endpoint calls in page components.
6. Frontend realtime should use backend WS, not direct OpenClaw gateway WS.

---

## 7) Mutation Action Contract (v1)

### Overmind actions (via module CLI)
```bash
PYTHONPATH=/home/ubuntu/.openclaw/workspace/overmind_hq/src python3 -m overmind_hq.cli project approve --project-id <id> --reviewer dashboard --notes "..."
PYTHONPATH=/home/ubuntu/.openclaw/workspace/overmind_hq/src python3 -m overmind_hq.cli project request-changes --project-id <id> --reviewer dashboard --notes "..."
PYTHONPATH=/home/ubuntu/.openclaw/workspace/overmind_hq/src python3 -m overmind_hq.cli project set-status --project-id <id> --to <STATUS> --reason "..."
PYTHONPATH=/home/ubuntu/.openclaw/workspace/overmind_hq/src python3 -m overmind_hq.cli orchestrator pause
PYTHONPATH=/home/ubuntu/.openclaw/workspace/overmind_hq/src python3 -m overmind_hq.cli orchestrator resume
```

### OpenClaw cron actions
```bash
openclaw cron enable <jobId>
openclaw cron disable <jobId>
openclaw cron run <jobId>
```

### Explicitly unsupported in v1 UI
- Kill running attempt
- Dead-letter retry/bulk retry

---

## 8) Backend API Contract (locked)
Base: `/api/v1`

Read:
- `/system/health`
- `/system/snapshot`
- `/projects`
- `/projects/{id}`
- `/projects/{id}/tasks`
- `/events`
- `/agents`
- `/cron/jobs`

Mutations:
- `/projects/{id}/approve`
- `/projects/{id}/request-changes`
- `/projects/{id}/set-status`
- `/system/orchestrator/pause`
- `/system/orchestrator/resume`
- `/cron/jobs/{id}/enable`
- `/cron/jobs/{id}/disable`
- `/cron/jobs/{id}/run`

Realtime:
- WS `/ws/v1/live`

---

## 9) DB Schema Authority Notes
If uncertain, trust migrations under:
`/home/ubuntu/.openclaw/workspace/overmind_hq/migrations/`

Important corrections from handoff docs:
- `blockers` shape differs from early PRD assumptions (use real migration columns)
- `dead_letters` shape differs from early PRD assumptions
- `approvals` table exists and matters for approval lifecycle

---

## 10) Start/Stop Stack

```bash
cd /home/ubuntu/Development/overmind-mission-control
./dev-stack.sh start
./dev-stack.sh status
./dev-stack.sh logs
./dev-stack.sh stop
./dev-stack.sh restart
```

---

## 11) Validation After Any Change

### Frontend
```bash
cd frontend
npm run lint
npm run test:run
npm run build
```

### Backend
```bash
cd backend
. .venv/bin/activate
pytest -q
```

### Integration smoke
- Frontend loads at `:5173`
- Backend `/api/v1/system/snapshot` returns `ok: true`
- Mutation endpoints preserve envelope and meaningful HTTP statuses
- WS connects and emits events

---

## 12) Current Known Caveat
WebSocket ordering/sequence behavior can still show occasional out-of-order delivery under concurrent sends.
If changing realtime reliability, inspect `backend/app/routers/ws.py` first.

---

## 13) Delivery Pattern for AI Agents
1. Read this file + mandatory docs.
2. State plan and exact files to edit.
3. Make minimal targeted changes.
4. Run validations.
5. Update logs:
   - frontend work → `docs/implementation-log.md`
   - backend work → `docs/backend-implementation-log.md`
6. Report changed files + command outputs + remaining gaps.
