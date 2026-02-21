# Implementation Log

## Session 2 — Fix Pass: Wiring, Mapping, Mutations, Resilience

### Fix 1: WebSocket Lifecycle
- Created `useWebSocket.ts` hook — connects `WebSocketManager` to React lifecycle
- Wires connection status changes into Zustand `uiStore`
- Maps incoming WS event types to specific TanStack Query key invalidations (SNAPSHOT, TASK_UPDATE, AGENT_UPDATE, CRON_UPDATE, etc.)
- Falls back to polling when WS is disabled (provider doesn't claim realtime)
- Extracted `AppShell` component to satisfy ESLint fast-refresh rules
- Connected at the app root via `main.tsx` → `AppShell.tsx`

### Fix 2: Legacy Provider Mapping
- Rewrote `legacy/index.ts` with correct mappings from the **actual** `/api/snapshot` response shape
- Mapped `orchestrator.process.{pid, running}`, `orchestrator.cursor.{rowid, lag_events, cursor_stagnant_for_seconds}`, `orchestrator.heartbeat.{age_seconds}`
- Built `mapHealth()` from both `health.state` and `health_snapshot.{database, orchestrator}` sections
- `mapAlerts()` merges `alerts[]` and `stuck_signals.alerts[]`
- `mapEvent()` handles both `events_readable[]` (rich) and `events[]` (raw), parses `payload_json` strings
- `mapAttempt()` for `attempts.running[]`
- Summary KPIs derived from `summary.projects`, `summary.tasks`, `dead_letters.global_open`, `retry_storm.active`
- Added 1.5s response cache to avoid redundant fetches within the same render cycle
- Exported `_testExports` for unit testing individual mappers

### Fix 3: Project Detail Depth
- Added **Attempt History** section with full DataTable (ID, task, agent, status, attempt#, started, duration, error)
- `useProjectAttempts()` hook derives attempts from snapshot running + task latestAttempt fields
- Per-section error/loading/empty states: Tasks, Attempts, Events each have independent skeleton/error/empty rendering
- Empty states use contextual icons and descriptions (ClipboardList for tasks, RotateCcw for attempts, AlertTriangle for events)

### Fix 4: Mutation UX Hardening
- Created `useMutations.ts` with 7 mutation hooks:
  - `useApproveProject()` — optimistic status update, rollback on error
  - `useRequestChanges()` — toast on success/error
  - `useSetProjectStatus()` — confirmation dialog before destructive changes
  - `usePauseOrchestrator()` — confirmation required
  - `useResumeOrchestrator()` — immediate execution
  - `useToggleCronJob()` — optimistic toggle with rollback, confirmation before disable
  - `useRunCronJob()` — confirmation before trigger
- Created toast system (`toastStore.ts` + `Toast.tsx` + `lib/toast.ts`):
  - 4 types: success, error, info, warning
  - Auto-dismiss with configurable duration
  - Stacking, manual dismiss
- Created confirmation dialog system (`lib/confirm.ts` + `ConfirmDialog.tsx`):
  - Returns Promise<boolean>, integrates with mutation flow
  - 3 variants: danger, warning, default
  - Modal with backdrop blur, keyboard-friendly
- Updated project-detail, cron, and system pages to use mutation hooks
- All mutation buttons show spinner while pending, disable during in-flight requests
- Capability-aware: buttons only render when provider supports the action

### Fix 5: Contract Consistency
- Verified all domain types align across providers, hooks, and components
- Confirmed `WsEvent`, `Task.latestAttempt`, `DataProvider` interface consistency
- Validated query key factory covers all invalidation paths

### Fix 6: Production Readiness
- Created `ErrorBoundary` component (class component for `componentDidCatch`)
  - Catches render errors, shows graceful fallback with error details and retry button
  - Logs errors to console (extensible to telemetry)
- Wrapped `<Outlet />` in RootLayout with ErrorBoundary
- Confirmed ESLint fast-refresh compliance across all files

### Quality Gate Results
- TypeScript strict: **PASS** (zero errors)
- ESLint: **PASS** (zero errors, zero warnings)
- Vite production build: **PASS** (754 KB JS, 30 KB CSS)

### Files Created (9)
- `src/AppShell.tsx` — root component with WebSocket wiring
- `src/lib/useWebSocket.ts` — WebSocket lifecycle hook
- `src/lib/toast.ts` — imperative toast function
- `src/lib/confirm.ts` — imperative confirm dialog function
- `src/stores/toastStore.ts` — toast state management
- `src/components/ui/Toast.tsx` — toast notification UI
- `src/components/ui/ConfirmDialog.tsx` — confirmation dialog UI
- `src/components/common/ErrorBoundary.tsx` — error boundary
- `src/queries/useMutations.ts` — TanStack Query mutation hooks

### Files Modified (8)
- `src/main.tsx` — extracted AppShell, simplified entry
- `src/routes/project-detail.tsx` — rewritten with attempt history, mutation hooks, per-section states
- `src/routes/cron.tsx` — uses mutation hooks with spinners
- `src/routes/system.tsx` — uses mutation hooks for orchestrator control
- `src/queries/useSnapshot.ts` — added `useProjectAttempts` hook
- `src/providers/data/legacy/index.ts` — complete rewrite with correct field mappings
- `src/components/layout/RootLayout.tsx` — added Toast, ConfirmDialog, ErrorBoundary

---

## Session 1 — Initial Build

### Phase 1: Project Scaffold
- Scaffolded Vite + React + TypeScript project at `frontend/`
- Installed all dependencies: TanStack Query, TanStack Router, Zustand, Recharts, Lucide React, Tailwind CSS v4, clsx, tailwind-merge, class-variance-authority
- Configured Vite with Tailwind v4 plugin, `@` path alias, proxy for `/api` and `/ws`
- Set up TypeScript strict mode with `erasableSyntaxOnly: true` (no enums), `verbatimModuleSyntax: true`
- Created `.env` with `VITE_DATA_PROVIDER=mock`, API/WS URLs
- Set up Tailwind v4 theme via CSS `@theme` blocks with full custom color palette

### Phase 2: Core Architecture (parallel)
Built in 4 parallel tracks:

**Track A — Type System & Data Layer**
- Created canonical domain types (`domain.ts`): Project, Task, Attempt, EventItem, Agent, CronJob, etc.
- All status types are string literal unions (not enums, per `erasableSyntaxOnly`)
- API envelope types (`api.ts`): `ApiResponse<T>`, `ApiError`
- Utility library with `cn()`, time formatters, status-to-color mappers
- WebSocket manager with exponential backoff reconnection
- Zustand UI store for sidebar state, connection status
- Query key factory and TanStack Query hooks

**Track B — Data Provider Adapter**
- Defined `DataProvider` interface with read + write methods
- Defined `ProviderCapabilities` for feature detection
- Mock provider: comprehensive fixtures (6 projects, 15 tasks, 7 attempts, 6 agents, 5 cron jobs, 10 events), simulated async delays
- Legacy provider: reads from `/api/snapshot`, transforms snake_case → camelCase
- API provider: full REST v1 endpoints, all mutations
- Factory pattern: env var selects provider, React context distributes it

**Track C — UI Components (11 components)**
- StatusBadge: colored dot + label, optional pulse
- KPICard: large metric with icon and color theme
- HealthPill: healthy/degraded/unhealthy indicator
- EmptyState: centered guidance with optional action
- ErrorState: error display with retry
- Skeleton: loading placeholders (base, card, table variants)
- TimeAgo: live-updating relative timestamps
- ConnectionIndicator: WebSocket status display
- EventFeed: scrollable event list with level icons
- JsonInspector: collapsible JSON viewer with copy
- DataTable: generic typed table with column definitions

**Track D — Layout & Routes (7 pages)**
- Sidebar: collapsible, OVERMIND branding, 6 nav items with active highlighting
- TopNav: sticky bar with health pill, connection indicator, cursor count
- RootLayout: shell composing sidebar + topnav + outlet with grid background
- Overview (`/`): orchestrator status bar, alert banners, 6 KPI cards, event feed, active projects
- Projects (`/projects`): search + status filter tabs, data table with progress bars
- Project Detail (`/projects/$projectId`): header with actions, progress bar, tasks tab, events tab
- Live (`/live`): 3-column layout — running attempts with elapsed time, event stream, recent results
- Agents (`/agents`): card grid with Recharts sparkline bar charts
- Cron (`/scheduling/cron`): data table with enable/disable/trigger actions
- System (`/system`): health cards, orchestrator control, diagnostics JSON inspector

### Phase 3: Validation
- Removed Vite scaffold files (`App.tsx`, `App.css`)
- TypeScript strict: **PASS** (zero errors)
- ESLint: found 1 error (`Date.now()` in render path of `live.tsx`)
- Fixed by extracting `useNow()` hook with `setInterval`
- ESLint re-run: **PASS**
- Vite production build: **PASS** (729 KB JS, 25 KB CSS)

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Font | Plus Jakarta Sans | Distinctive, avoids generic Inter (per SKILLS.md) |
| Color scheme | Deep space navy | Dark-first, high contrast, professional |
| State types | String literal unions | `erasableSyntaxOnly: true` prevents enums |
| Provider pattern | Factory + Context | Clean DI, easy to swap, testable |
| Mock data | Static fixtures | Deterministic dev experience, no external deps |
| Tailwind config | CSS `@theme` blocks | Tailwind v4 native approach, no JS config |
| Route definitions | Code-based | TanStack Router v1 pattern, full type safety |
| Charts | Recharts bar sparklines | Lightweight per-agent activity visualization |

### Files Created
- 37 source files across 8 directories
- 5 documentation files
- Config: `vite.config.ts`, `tsconfig.app.json`, `.env`, `.env.example`, `index.html`, `index.css`

## Session 3 — Basic Issues Closure (main session)

### Completed
- Added test tooling and scripts:
  - `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
  - scripts: `test`, `test:run`
- Added tests:
  - `src/lib/utils.test.ts`
  - `src/providers/data/legacy/mappers.test.ts`
  - `src/routes/overview.smoke.test.tsx`
- Replaced frontend README with project-specific runbook.
- Updated docs for contract consistency:
  - `docs/provider-contract.md`
  - `docs/integration-checklist.md`
- Updated `docs/known-gaps.md` to remove already-fixed items.
- Bundle optimization applied via manual chunking in `vite.config.ts`.
- Fixed optimistic approve status to `COMPLETED` in `src/queries/useMutations.ts`.
- Added `vitest.config.ts` + `src/test/setup.ts`.

### Validation Outputs
- `npm run lint` → PASS
- `npm run test:run` → PASS (3 files, 6 tests)
- `npm run build` → PASS
  - New split chunks:
    - `index-C8SUmBB_.js` 307.49 kB (gzip 89.94 kB)
    - `charts-DU0vQFvF.js` 316.55 kB (gzip 96.56 kB)
    - `tanstack-DlJlw7xS.js` 128.84 kB (gzip 40.44 kB)

---

## Session 3 — Agents Page Upgrade (v1.1)

**Date:** 2026-02-18

### Feature: Agents Grid Upgrades
- Each agent card now shows `effectiveModel` with model source badge (`primary` / `default` / `unknown`)
- Registration chip: shows ✓ Registered or ⚠ Unregistered
- Profile health chip: shows "Profile OK" or count of missing files
- Cards are now clickable — navigate to `/agents/:agentId` detail page

### Feature: Agent Detail Page (`/agents/:agentId`)
- New route added to `router.tsx`
- Header section: name, role, id (with copy button), status, effective model + source badge, registration badge
- Stats row: model, success rate, avg duration, total attempts, profile health
- Profile files panel: tabbed file selector showing all 5 allowlisted MD files with exists/missing indicators
- Integrated markdown viewer for selected file content with readable typography
- Recent sessions panel: shows session key (copyable), message count, relative timestamp

### Feature: New Query Hooks
- `useAgent(id)` — single agent detail
- `useAgentFiles(id)` — profile file index
- `useAgentFileContent(id, fileKey)` — markdown file content
- `useAgentSessions(id)` — recent sessions list

### Feature: Provider Contract Updates
- Extended `DataProvider` interface with 4 new methods: `getAgent`, `getAgentFiles`, `getAgentFileContent`, `getAgentSessions`
- Updated API, mock, and legacy providers
- Added new query key entries: `agent`, `agentFiles`, `agentFileContent`, `agentSessions`
- Extended `Agent` type with `effectiveModel`, `modelSource`, `registered`, `workspace`, `profileHealth`
- Added new types: `ProfileHealth`, `AgentFileInfo`, `AgentFileContent`, `AgentSession`

### Files Changed
- `frontend/src/types/domain.ts` — extended Agent, new types
- `frontend/src/queries/keys.ts` — new query keys
- `frontend/src/queries/useSnapshot.ts` — new hooks
- `frontend/src/providers/data/types.ts` — extended DataProvider interface
- `frontend/src/providers/data/api/index.ts` — new API methods
- `frontend/src/providers/data/mock/index.ts` — new mock methods
- `frontend/src/providers/data/legacy/index.ts` — stub methods
- `frontend/src/router.tsx` — added agent detail route
- `frontend/src/routes/agents.tsx` — upgraded grid with model/health badges, clickable cards
- `frontend/src/routes/agent-detail.tsx` — **new file** — full agent detail page

### Validation Outputs
- `npm run lint` → PASS (0 errors)
- `npm run test:run` → PASS (3 files, 6 tests)
- `npm run build` → PASS
