# Backend Implementation Log

**Date:** 2026-02-17  
**Status:** Complete — all endpoints, WS, tests passing. Fix-pass applied.

---

## Architecture Summary

```
backend/
├── app/
│   ├── main.py                  # FastAPI app, CORS, error handler, router registration
│   ├── config.py                # Centralized config (paths, ports, timeouts)
│   ├── database.py              # Sync SQLite read-only access layer
│   ├── models/
│   │   ├── domain.py            # Pydantic models matching frontend TypeScript types (camelCase)
│   │   └── responses.py         # Success/Error envelope helpers
│   ├── routers/
│   │   ├── system.py            # GET /system/health, GET /system/snapshot, POST orchestrator pause/resume
│   │   ├── projects.py          # GET /projects, GET /projects/{id}, GET /projects/{id}/tasks, POST approve/request-changes/set-status
│   │   ├── events.py            # GET /events with filters
│   │   ├── agents.py            # GET /agents (merged OpenClaw + Overmind stats)
│   │   ├── cron.py              # GET /cron/jobs, POST enable/disable/run
│   │   └── ws.py                # WS /ws/v1/live with poll loop + broadcast
│   └── services/
│       ├── openclaw.py          # OpenClaw CLI subprocess wrapper
│       ├── overmind.py          # Overmind HQ CLI subprocess wrapper
│       └── snapshot.py          # Full SystemSnapshot builder from DB
├── tests/
│   └── test_api.py              # 20 tests covering all endpoints + WS
├── requirements.txt
├── pyproject.toml
└── run.sh                       # Start script
```

## Key Design Decisions

1. **Raw SQL + Pydantic** — No ORM. Direct SQLite queries with dict row factory, mapped to Pydantic models matching frontend TypeScript types.

2. **camelCase responses** — All JSON response fields use camelCase to match the frontend `domain.ts` types exactly (e.g., `routeType`, `taskSummary`, `createdAt`).

3. **CLI wrappers for mutations** — All operator mutations (approve, request-changes, set-status, pause, resume, cron enable/disable/run) go through subprocess calls to Overmind HQ CLI or OpenClaw CLI. Never direct DB writes.

4. **Read-only DB access** — SQLite connected with `?mode=ro` URI parameter.

5. **WebSocket** — On connect, sends immediate SNAPSHOT. Background poll loop every 2.5s computes snapshot hash; broadcasts only on change.

6. **Graceful degradation** — If OpenClaw gateway is unreachable, health shows "degraded" but API remains functional.

7. **Error envelopes** — Global exception handler wraps all unhandled errors in `{ok: false, error: {...}, meta: {...}}`.

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app entry point |
| `backend/app/config.py` | Environment config + canonical paths |
| `backend/app/database.py` | SQLite read-only access |
| `backend/app/models/domain.py` | Pydantic domain models |
| `backend/app/models/responses.py` | Response envelope helpers |
| `backend/app/services/openclaw.py` | OpenClaw CLI wrapper |
| `backend/app/services/overmind.py` | Overmind CLI wrapper |
| `backend/app/services/snapshot.py` | Snapshot builder |
| `backend/app/routers/system.py` | System endpoints |
| `backend/app/routers/projects.py` | Project endpoints |
| `backend/app/routers/events.py` | Events endpoint |
| `backend/app/routers/agents.py` | Agents endpoint |
| `backend/app/routers/cron.py` | Cron endpoints |
| `backend/app/routers/ws.py` | WebSocket endpoint |
| `backend/tests/test_api.py` | Test suite (20 tests) |
| `backend/requirements.txt` | Python dependencies |
| `backend/pyproject.toml` | Pytest config |
| `backend/run.sh` | Startup script |

---

## Test Results

```
20 passed in 29.54s
```

All tests cover:
- Health endpoint shape
- Snapshot endpoint shape + required keys
- Projects list + 404 handling
- Events list + field validation
- Agents list + all 6 roles present
- Cron jobs list
- Mutation error envelope (approve nonexistent)
- Orchestrator pause/resume
- Error envelope consistency
- Request-ID header
- WebSocket connect + initial snapshot
- WebSocket ping/pong

---

## Smoke Check Results

| Check | Status |
|-------|--------|
| `GET /api/v1/system/health` | ✅ ok=true, 4 components healthy |
| `GET /api/v1/system/snapshot` | ✅ ok=true, all 11 keys present |
| `GET /api/v1/projects` | ✅ ok=true, returns list |
| `GET /api/v1/events` | ✅ ok=true, 2 events returned |
| `GET /api/v1/agents` | ✅ ok=true, 6 roles |
| `GET /api/v1/cron/jobs` | ✅ ok=true, returns list |
| `POST /projects/{id}/approve` (nonexistent) | ✅ ok=false, error envelope |
| `POST /system/orchestrator/pause` | ✅ ok=true |
| `POST /system/orchestrator/resume` | ✅ ok=true |
| WebSocket connect + SNAPSHOT | ✅ received type=SNAPSHOT |
| WebSocket PING/PONG | ✅ received type=PONG |

---

## Run Instructions

### Start
```bash
cd /home/ubuntu/Development/overmind-mission-control/backend
./run.sh
# or:
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8788 --reload
```

### Stop
```bash
# Ctrl+C in the terminal, or:
kill $(lsof -ti :8788)
```

### Run Tests
```bash
cd /home/ubuntu/Development/overmind-mission-control/backend
source .venv/bin/activate
pytest tests/ -v
```

---

## Frontend Integration Notes

To switch the frontend to API mode:

```bash
cd /home/ubuntu/Development/overmind-mission-control/frontend
echo "VITE_DATA_PROVIDER=api" >> .env
# Backend must be running on http://127.0.0.1:8788
```

The frontend's `createApiProvider()` in `src/providers/data/api/index.ts` calls:
- `GET /api/v1/system/snapshot` → `SystemSnapshot`
- `GET /api/v1/projects` → `Project[]`
- `GET /api/v1/projects/{id}` → `Project`
- `GET /api/v1/projects/{id}/tasks` → `Task[]`
- `GET /api/v1/events` → `EventItem[]`
- `GET /api/v1/agents` → `Agent[]`
- `GET /api/v1/cron/jobs` → `CronJob[]`
- `GET /api/v1/system/health` → `HealthState`
- `POST /api/v1/projects/{id}/approve`
- `POST /api/v1/projects/{id}/request-changes`
- `POST /api/v1/projects/{id}/set-status`
- `POST /api/v1/system/orchestrator/pause`
- `POST /api/v1/system/orchestrator/resume`
- `POST /api/v1/cron/jobs/{id}/enable`
- `POST /api/v1/cron/jobs/{id}/disable`
- `POST /api/v1/cron/jobs/{id}/run`

All these paths are implemented and return the exact response shapes the frontend expects.

WebSocket at `ws://127.0.0.1:8788/ws/v1/live` sends `{type: "SNAPSHOT", seq, timestamp, payload}` matching the frontend's `WsEvent` type.

---

## Known Gaps

1. **Agent `recentActivity` sparkline data** — Returns empty array `[]`. Would need hourly-bucketed attempt counts to populate.
2. **Session log viewer** — Deep-debug session JSONL reading not exposed as endpoint (not required by frontend v1 contract).
3. **Dead letter retry/bulk retry** — No CLI command exists yet; UI correctly shows disabled state.
4. **Kill running attempt** — No safe command contract; UI shows disabled.
5. **No authentication** — Bind to `127.0.0.1` only; production deployment would need API key middleware.

---

## Fix-Pass (2026-02-17)

### Files Changed

| File | Change |
|------|--------|
| `app/models/responses.py` | Added `ContextVar`-based `get_request_id()`/`set_request_id()` so the middleware-generated request_id flows into all envelope `Meta` fields. Added `cli_error_status_code()` helper that maps CLI error codes/messages to appropriate HTTP statuses (404, 422, 503, 504, 500). |
| `app/main.py` | Middleware now calls `set_request_id()` into the context var. Global exception handler uses `get_request_id()` instead of generating a new UUID. |
| `app/routers/system.py` | Mutation error handlers use `cli_error_status_code()` instead of hardcoded 500. Removed inline `from fastapi.responses import JSONResponse`. |
| `app/routers/projects.py` | `GET /{id}/tasks` now guards with a project-existence check — returns 404 envelope when project doesn't exist, 200 `[]` when project exists but has no tasks. Mutation error handlers use `cli_error_status_code()`. |
| `app/routers/cron.py` | All mutation error handlers use `cli_error_status_code()` instead of hardcoded 500. |
| `app/routers/ws.py` | Sequence counter now uses `threading.Lock` for monotonic generation via `_next_seq()`. PONG responses go through `manager._send()` (centralized) instead of inline `ws.send_json` with a non-canonical seq calculation. |
| `tests/test_api.py` | All mutation tests now use `@patch` to monkeypatch CLI wrappers — no real side-effects. Added 10 new tests: request_id parity (header==meta) on success/error/snapshot, tasks 404 for nonexistent project, HTTP status mapping (404/422/504/503), WS monotonic seq across multiple pings. Total: 30 tests. |

### Why Each Fix

1. **request_id consistency** — Previously the middleware generated a UUID for the `X-Request-Id` header, but response envelope `Meta` generated its own separate UUID. Now a `ContextVar` shares one ID across both.

2. **HTTP status mapping** — CLI failures always returned 500. Now `cli_error_status_code()` inspects the error code suffix and message content to return semantically correct statuses: `_TIMEOUT` → 504, `_NOT_FOUND` (binary missing) → 503, message contains "not found" → 404, message contains "cannot transition" / "invalid" → 422, fallback → 500.

3. **Project tasks 404** — `GET /projects/{id}/tasks` returned 200 `[]` for nonexistent projects. Now it checks `SELECT id FROM projects WHERE id = ?` first, returning 404 if absent.

4. **WebSocket sequencing** — `_seq` counter had two problems: (a) `_send()` and `broadcast()` both did `self._seq += 1` without synchronization, (b) PONG used `manager._seq + 1` without actually incrementing. Now `_next_seq()` uses a `threading.Lock` and PONG goes through `_send()`.

5. **Test hardening** — Mutation tests previously called real `orchestrator pause/resume` and `project approve` CLIs. Now all mutations are `@patch`-ed with either `_noop` or specific `OvmCliError` side-effects, verifying status code mapping without side-effects.

### Validation Outputs

#### pytest -q
```
30 passed in 36.20s
```

#### Curl: /api/v1/system/health
```json
{
    "ok": true,
    "data": {
        "overall": "healthy",
        "components": [
            {"name": "api", "status": "healthy", "latencyMs": 0.0, "message": "ok"},
            {"name": "database", "status": "healthy", "latencyMs": 0.7, "message": "ok"},
            {"name": "orchestrator", "status": "healthy", "latencyMs": null, "message": "running"},
            {"name": "openclaw", "status": "healthy", "latencyMs": null, "message": "gateway reachable"}
        ],
        "timestamp": "2026-02-17T16:07:26.020951+00:00"
    },
    "meta": {
        "timestamp": "2026-02-17T16:07:28.344612+00:00",
        "request_id": "e8e502ee-ce1b-41fb-aa94-36368b4e99f6"
    }
}
```

#### Curl: /api/v1/projects/nonexistent-id/tasks (404)
```json
{
    "ok": false,
    "error": {
        "code": "NOT_FOUND",
        "message": "Project nonexistent-id not found",
        "details": {}
    },
    "meta": {
        "timestamp": "2026-02-17T16:07:53.997274+00:00",
        "request_id": "dbd08e5b-195c-41b9-b6d4-428bfb4b822a"
    }
}
```

#### Request-ID parity
```
Header X-Request-Id: 49c9f5d1-324d-41a3-a11d-39b522bb1d79
Meta request_id:    49c9f5d1-324d-41a3-a11d-39b522bb1d79
MATCH
```

#### WebSocket ping/pong
```
SNAPSHOT seq=1
PONG seq=2 (monotonic=True)
PONG2 seq=3 (monotonic=True)
WS smoke check PASSED
```

### Remaining Known Gaps

1. Agent `recentActivity` sparkline data — still returns `[]`.
2. Session log viewer — not exposed (not in frontend v1 contract).
3. Dead letter retry / kill attempt — no CLI commands exist yet.
4. No authentication — bound to `127.0.0.1` only.
5. `cli_error_status_code` relies on message-content heuristics for 404/422 mapping — could be improved if CLI adopts structured error codes.

---

## Session 3 — Agents Page Upgrade Backend (v1.1)

**Date:** 2026-02-18

### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/agents` | Extended with `effectiveModel`, `modelSource`, `registered`, `workspace`, `profileHealth` |
| GET | `/api/v1/agents/{agentId}` | Single agent detail (same shape as list item) |
| GET | `/api/v1/agents/{agentId}/files` | Profile file index (5 allowlisted MD files) with exists/size/updatedAt |
| GET | `/api/v1/agents/{agentId}/files/{fileKey}` | Read file content (strict allowlist: agents, soul, identity, user, tools) |
| GET | `/api/v1/agents/{agentId}/sessions` | Recent sessions for agent via OpenClaw CLI |

### Model Fallback Logic
- Primary model: from `openclaw agents list --json` per agent
- Default model: from `openclaw config get agents.defaults.model`
- Fallback to YAML config read of `agents.defaults.model` if CLI fails
- `modelSource`: `primary` → `default` → `unknown`

### Security
- File reads use strict allowlist of 5 keys mapping to specific filenames
- Path traversal protection via `resolve()` + `relative_to()` checks
- File size cap at 64 KiB
- No secret/config file exposure
- Agent ID validated against known Overmind roles

### New OpenClaw Service Functions
- `sessions_for_agent(agent_id, limit)` — fetches 7-day session window, filters by agent
- `get_default_model()` — reads default model from CLI or YAML config

### Files Changed
- `backend/app/routers/agents.py` — 5 endpoints, helper functions
- `backend/app/services/openclaw.py` — 2 new service functions
- `backend/tests/test_api.py` — 8 new tests (28 total, all passing)

### Smoke Test Results
All 5 endpoints return valid envelope responses:
- `GET /api/v1/agents` → 200, list with model and profile fields
- `GET /api/v1/agents/overmind-builder` → 200, single agent
- `GET /api/v1/agents/overmind-builder/files` → 200, 5 file entries
- `GET /api/v1/agents/overmind-builder/files/soul` → 200, markdown content
- `GET /api/v1/agents/overmind-builder/sessions` → 200, session list
- `GET /api/v1/agents/overmind-builder/files/secrets` → 400, INVALID_FILE_KEY (security check)

### Remaining Gaps
1. Agent `recentActivity` sparkline data — still returns `[]`
2. Session message count not always available from OpenClaw CLI
3. `get_default_model` YAML fallback requires PyYAML (optional dep)
