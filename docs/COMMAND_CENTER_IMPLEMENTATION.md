# Command Center — Implementation Note

## Overview

New top-level Mission Control page at `/control` providing two workflow surfaces:

1. **Project Intake** — structured project creation form
2. **Manager Console** — Telegram-like chat with the Overmind coordinator

## Architecture Decisions

- **CLI wrapper pattern**: All mutations go through existing CLI wrappers (`overmind_hq.cli` and `openclaw`), never via direct DB writes. This preserves safety guarantees and orchestrator lifecycle triggers.
- **Session-based chat**: Manager console uses a stable session key (`dashboard:control`) by default. Messages persist through the OpenClaw agent session system and replay on page load.
- **Optimistic UI**: Chat messages appear instantly before server confirmation. Intake submission shows loading state and rolls back on error.
- **No breaking changes**: All existing API contracts, pages, and routes remain stable.

## Route / Navigation Changes

| Item | Path | Type |
|------|------|------|
| Command Center page | `/control` | New route |
| Intake deep-link | `/control?tab=intake` | Query param |
| Chat deep-link | `/control?tab=chat` | Query param |
| Overview CTA | "New Project" → `/control?tab=intake` | Deep-link button |
| Agent detail CTA | "Open Manager Console" → `/control?tab=chat` | Coordinator-only button |
| Sidebar nav | Added "Command Center" with Terminal icon, second position | Navigation item |

## API Additions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/control/projects` | POST | Create project via `overmind_hq.cli project create` |
| `/api/v1/control/manager/message` | POST | Send message via `openclaw agent turn` |
| `/api/v1/control/manager/session/{key}` | GET | Retrieve session history via `openclaw agent session-history` |

All endpoints use the standard `SuccessEnvelope`/`ErrorEnvelope` response format and respect auth middleware.

## Files Changed

### Backend
- `app/services/overmind.py` — Added `project_create()` wrapper
- `app/services/openclaw.py` — Added `manager_send_message()` and `manager_session_history()`
- `app/routers/control.py` — **NEW** — Control surface router with 3 endpoints
- `app/main.py` — Registered control router
- `tests/test_control.py` — **NEW** — 15 tests covering success/error/validation paths

### Frontend
- `src/types/domain.ts` — Added control surface types (IntakeRequest, ManagerMessageResult, etc.)
- `src/providers/data/types.ts` — Extended `ProviderCapabilities` and `DataProvider` interface
- `src/providers/data/api/index.ts` — Implemented control API methods
- `src/providers/data/mock/index.ts` — Added stub methods
- `src/providers/data/legacy/index.ts` — Added stub methods
- `src/queries/keys.ts` — Added `managerSession` query key
- `src/queries/useControl.ts` — **NEW** — `useCreateProject` + `useManagerChat` hooks
- `src/routes/control.tsx` — **NEW** — Command Center page (Intake + Chat tabs)
- `src/router.tsx` — Registered `/control` route with search validation
- `src/components/layout/Sidebar.tsx` — Added "Command Center" nav item
- `src/routes/overview.tsx` — Added "New Project" CTA button in header
- `src/routes/agent-detail.tsx` — Added "Open Manager Console" button for coordinator
- `src/routes/control.test.tsx` — **NEW** — 16 component tests
- `src/queries/useControl.test.tsx` — **NEW** — 6 hook tests

## Test Summary

| Suite | Tests | Status |
|-------|-------|--------|
| Backend control endpoints | 15 | ✅ All pass |
| Frontend control page | 16 | ✅ All pass |
| Frontend control hooks | 6 | ✅ All pass |
| Full frontend suite | 107 | ✅ All pass (0 regressions) |

## Known Limitations / Follow-ups

1. **Manager turn timeout**: Coordinator responses can take 30-60s. The UI shows a typing indicator but has no streaming/SSE support yet. A future WebSocket-based approach would improve perceived latency.
2. **Session management**: Uses a single hardcoded session key. Future work could support multiple named sessions or session creation.
3. **Chat history pagination**: Currently fetches last 50 messages. For long-running sessions, pagination or virtual scrolling would be needed.
4. **Orchestrator guard**: The intake tab shows a warning when the orchestrator is paused but still allows submission (projects queue correctly). A future option could block submission entirely if desired.
5. **Pre-existing test isolation issue**: Backend tests fail when run in sequence after `test_auth.py` due to environment variable leakage. Not introduced by this change.
