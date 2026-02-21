# Backend Implementation Brief (For AI Agents)

Path: `/home/ubuntu/Development/overmind-mission-control/backend`

## Stack
- FastAPI + Uvicorn
- SQLite (read-focused via raw SQL)
- Pydantic models
- WebSocket live updates

## Critical Safety Rules
- Do **not** directly mutate Overmind/OpenClaw DB/files for operator actions.
- Use CLI wrappers for mutations:
  - `app/services/overmind.py`
  - `app/services/openclaw.py`
- Keep response envelope contract stable.
- Never log/expose OpenClaw secrets (auth/config files).

## Important Files
- `app/main.py` — app boot, middleware, global errors
- `app/models/responses.py` — envelope + request_id + error status mapping
- `app/services/snapshot.py` — snapshot composition
- `app/services/overmind.py` — Overmind CLI wrappers
- `app/services/openclaw.py` — OpenClaw CLI wrappers
- `app/routers/system.py`
- `app/routers/projects.py`
- `app/routers/events.py`
- `app/routers/agents.py`
- `app/routers/cron.py`
- `app/routers/ws.py`
- `tests/test_api.py`

## API Contract
Base: `/api/v1`

Reads:
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

WebSocket:
- `/ws/v1/live`

Success envelope:
```json
{ "ok": true, "data": {}, "meta": { "timestamp": "...", "request_id": "..." } }
```

Error envelope:
```json
{ "ok": false, "error": { "code": "...", "message": "...", "details": {} }, "meta": { "timestamp": "...", "request_id": "..." } }
```

## Schema Authority
When in doubt, trust Overmind migrations:
`/home/ubuntu/.openclaw/workspace/overmind_hq/migrations/`

Notable schema notes:
- `blockers` differs from early PRD assumptions.
- `dead_letters` differs from early PRD assumptions.
- `approvals` table is part of approval lifecycle.

## Action Contract (v1)
Use module invocation for Overmind commands:
```bash
PYTHONPATH=/home/ubuntu/.openclaw/workspace/overmind_hq/src python3 -m overmind_hq.cli ...
```

Use OpenClaw CLI for cron:
```bash
openclaw cron enable|disable|run <jobId>
```

Unsupported v1 actions (keep disabled):
- kill running attempt
- dead-letter retry/bulk retry

## Commands
```bash
. .venv/bin/activate
pytest -q
./run.sh
```

## Current Caveat
WebSocket sequence/order under concurrent sends still needs hardening if doing realtime reliability work.
