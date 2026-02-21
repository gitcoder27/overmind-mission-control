# Data Provider Contract (Current)

Canonical interface source: `frontend/src/providers/data/types.ts`

## Interface Summary

Providers must implement:
- `getSnapshot()`
- `getProjects(filters?)`
- `getProject(id)`
- `getProjectTasks(id)`
- `getEvents(filters?)`
- `getAgents()`
- `getCronJobs()`
- `getSystemHealth()`
- mutations: `approveProject`, `requestChanges`, `setProjectStatus`, `pauseOrchestrator`, `resumeOrchestrator`, `enableCronJob`, `disableCronJob`, `runCronJob`

## Capabilities

```ts
{
  realtime: boolean,
  mutations: boolean,
  approveProject: boolean,
  requestChanges: boolean,
  setProjectStatus: boolean,
  pauseOrchestrator: boolean,
  resumeOrchestrator: boolean,
  cronActions: boolean,
}
```

## Provider Modes

### 1) mock
- Source: in-memory fixtures
- realtime: false
- mutations: false
- Purpose: UI development/demo

### 2) legacy
- Source: `GET {VITE_LEGACY_BASE_URL}/api/snapshot`
- realtime: false
- mutations: false
- Purpose: bridge to legacy dashboard payload
- Notes:
  - Derived mapping for health/orchestrator/events/attempts
  - Some domains (agents/cron/blockers) are not fully available from legacy endpoint

### 3) api
- Source: `{VITE_API_BASE_URL}/api/v1/*`
- realtime: true
- mutations: true
- Purpose: full integration mode

## API Provider Endpoint Contract (v2.1 aligned)

Read:
- `GET /api/v1/system/snapshot`
- `GET /api/v1/system/health`
- `GET /api/v1/projects`
- `GET /api/v1/projects/{id}`
- `GET /api/v1/projects/{id}/tasks`
- `GET /api/v1/events`
- `GET /api/v1/agents`
- `GET /api/v1/cron/jobs`

Mutations:
- `POST /api/v1/projects/{id}/approve`
- `POST /api/v1/projects/{id}/request-changes`
- `POST /api/v1/projects/{id}/set-status`
- `POST /api/v1/system/orchestrator/pause`
- `POST /api/v1/system/orchestrator/resume`
- `POST /api/v1/cron/jobs/{id}/enable`
- `POST /api/v1/cron/jobs/{id}/disable`
- `POST /api/v1/cron/jobs/{id}/run`

WebSocket:
- `ws://127.0.0.1:8788/ws/v1/live`

## UI Behavior by Capability

- Mutation controls only enabled when capabilities allow.
- Realtime indicator reflects WS status when realtime is enabled.
- Polling remains active as fallback.
