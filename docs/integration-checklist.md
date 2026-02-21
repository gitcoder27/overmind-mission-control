# Backend Integration Checklist (v2.1 aligned)

Target backend base: `http://127.0.0.1:8788`

## Prerequisites
- [ ] Backend running on `:8788`
- [ ] WS endpoint running on `/ws/v1/live`
- [ ] CORS allows `http://127.0.0.1:5173`

## Required Read Endpoints
- [ ] `GET /api/v1/system/health`
- [ ] `GET /api/v1/system/snapshot`
- [ ] `GET /api/v1/projects`
- [ ] `GET /api/v1/projects/{id}`
- [ ] `GET /api/v1/projects/{id}/tasks`
- [ ] `GET /api/v1/events`
- [ ] `GET /api/v1/agents`
- [ ] `GET /api/v1/cron/jobs`

## Required Mutation Endpoints
- [ ] `POST /api/v1/projects/{id}/approve`
- [ ] `POST /api/v1/projects/{id}/request-changes`
- [ ] `POST /api/v1/projects/{id}/set-status`
- [ ] `POST /api/v1/system/orchestrator/pause`
- [ ] `POST /api/v1/system/orchestrator/resume`
- [ ] `POST /api/v1/cron/jobs/{id}/enable`
- [ ] `POST /api/v1/cron/jobs/{id}/disable`
- [ ] `POST /api/v1/cron/jobs/{id}/run`

## Response Envelope
Expected by API provider:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "timestamp": "...",
    "request_id": "..."
  }
}
```

Error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "...",
    "message": "...",
    "details": {}
  },
  "meta": {
    "timestamp": "...",
    "request_id": "..."
  }
}
```

## WebSocket
- [ ] `ws://127.0.0.1:8788/ws/v1/live`
- [ ] Supports `PING`/`PONG`
- [ ] Emits events that drive query invalidation (`SNAPSHOT`, `TASK_*`, `AGENT_UPDATE`, `CRON_UPDATE`, etc.)

## Frontend Env for API Mode
```bash
VITE_DATA_PROVIDER=api
VITE_API_BASE_URL=http://127.0.0.1:8788
VITE_WS_URL=ws://127.0.0.1:8788/ws/v1/live
```

## Verification
- [ ] `npm run dev` loads Overview with real data
- [ ] Connection indicator becomes `Connected`
- [ ] Project actions (approve/request changes/set status) work
- [ ] Cron actions (enable/disable/run) work
- [ ] Pause/resume orchestrator works
- [ ] WS disconnect/reconnect updates indicator and data recovers via polling
