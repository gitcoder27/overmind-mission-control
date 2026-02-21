# Overmind Mission Control — v2 Feature Sprint

## Implementation Spec for 5 Features

**Date:** February 18, 2026
**Project:** /home/ubuntu/Development/overmind-mission-control
**Frontend:** React 19 + TanStack Router + TanStack Query + Zustand + Tailwind v4
**Backend:** Python FastAPI + SQLite (aiosqlite) + WebSocket

---

## Current Architecture Summary

### Frontend Stack
- **Framework:** React 19, Vite 7, TypeScript 5.9
- **Router:** @tanstack/react-router (file-based routes in `src/routes/`)
- **State:** @tanstack/react-query (server state), zustand (UI state)
- **Styling:** Tailwind CSS v4 (custom theme in `src/index.css` `@theme` block)
- **Charts:** recharts
- **Icons:** lucide-react
- **Test:** vitest + @testing-library/react + jsdom

### Backend Stack
- **Framework:** FastAPI
- **DB:** SQLite via aiosqlite (path: `~/.openclaw/workspace/overmind_hq/data/overmind_hq.db`)
- **WS:** WebSocket at `/ws/v1/live` with poll-and-broadcast pattern
- **API prefix:** `/api/v1`

### Key Files & Patterns

**Data flow:**
```
DataProvider (interface) → useDataProvider() hook → useQuery hooks → Components
    ↑
    ├── mock/    (VITE_DATA_PROVIDER=mock, default)
    ├── api/     (VITE_DATA_PROVIDER=api, hits /api/v1/*)
    └── legacy/  (VITE_DATA_PROVIDER=legacy, hits /api/snapshot)
```

**Existing routes (router.tsx):**
- `/` → OverviewPage
- `/projects` → ProjectsListPage
- `/projects/$projectId` → ProjectDetailPage
- `/live` → LiveOpsPage
- `/agents` → AgentsPage (recently upgraded to hierarchy board)
- `/agents/$agentId` → AgentDetailPage
- `/scheduling/cron` → CronPage
- `/system` → SystemPage

**Design tokens (index.css @theme):**
- Backgrounds: `void (#04060e)`, `abyss (#080c1a)`, `surface (#0c1121)`, `surface-elevated (#131c33)`
- Accents: `accent (#22d3a7)`, `info (#3b82f6)`, `warn (#f59e0b)`, `danger (#ef4444)`, `purple (#a78bfa)`
- Text: `text-primary (#e2e8f0)`, `text-secondary (#94a3b8)`, `text-muted (#64748b)`
- Borders: `border (rgba(99,123,184,0.12))`, `border-strong`, `border-focus`
- Utility classes: `.glass`, `.bg-grid`, `.glow-accent`, `.glow-info`, `.glow-danger`
- Animations: `fade-in`, `pulse-dot`, `fadeSlideIn`, `.stagger-children`

**Zustand stores:**
- `uiStore.ts` — sidebarCollapsed, connectionStatus, lastUpdated
- `toastStore.ts` — toast notification queue

**Provider types (src/providers/data/types.ts):**
```typescript
interface DataProvider {
  name: string;
  capabilities: ProviderCapabilities;
  // Queries
  getSnapshot(): Promise<SystemSnapshot>;
  getProjects(filters?): Promise<Project[]>;
  getProject(id): Promise<Project>;
  getProjectTasks(id): Promise<Task[]>;
  getEvents(filters?): Promise<EventItem[]>;
  getAgents(): Promise<Agent[]>;
  getAgent(id): Promise<Agent>;
  getAgentFiles(id): Promise<AgentFileInfo[]>;
  getAgentFileContent(id, fileKey): Promise<AgentFileContent>;
  getAgentSessions(id): Promise<AgentSession[]>;
  getCronJobs(): Promise<CronJob[]>;
  getSystemHealth(): Promise<HealthState>;
  // Mutations
  approveProject(id, notes?): Promise<void>;
  requestChanges(id, notes?): Promise<void>;
  setProjectStatus(id, status, reason?): Promise<void>;
  pauseOrchestrator(): Promise<void>;
  resumeOrchestrator(): Promise<void>;
  enableCronJob(id): Promise<void>;
  disableCronJob(id): Promise<void>;
  runCronJob(id): Promise<void>;
}
```

**Key domain types (src/types/domain.ts):**
- `Agent { id, name, role, status, successRate, avgDuration, totalAttempts, recentActivity, effectiveModel, modelSource, registered, workspace, profileHealth }`
- `AgentSession { sessionKey, agentId, updatedAt, createdAt, messageCount }`
- `Task { id, projectId, title, description, role, status, priority, retryCount, maxRetries, leaseExpiresAt, claimedBy, taskKind, latestAttempt, attemptCount }`
- `Attempt { id, taskId, agentRole, status, attemptNo, startedAt, endedAt, errorCode, errorMessage, invocationMode, sessionKey }`
- `WsEvent { type, seq, timestamp, payload }`
- `SystemSnapshot { health, orchestrator, summary, activeProjects, runningAttempts, recentEvents, alerts, retryStorms, blockers, deadLetters }`
- `TaskStatus = 'TODO' | 'READY' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED' | 'FAILED' | 'CANCELLED'`
- `AgentRole = 'coordinator' | 'architect' | 'builder' | 'scout' | 'oracle' | 'qa'`

**WebSocket (already exists):**
- Backend: `backend/app/routers/ws.py` — ConnectionManager with poll-and-broadcast at 5s
- Frontend: `src/lib/websocket.ts` — WebSocketManager class with reconnect + ping/pong
- Frontend: `src/lib/useWebSocket.ts` — React hook that invalidates TanStack Query caches on WS events
- WS URL: `ws://127.0.0.1:8788/ws/v1/live` (configurable via `VITE_WS_URL`)

**Backend config (backend/app/config.py):**
- `OPENCLAW_ROOT = ~/.openclaw`
- `OVERMIND_DB_PATH` env override available
- `HOST/PORT` via `OVERMIND_DASHBOARD_HOST/PORT`
- CORS origins configurable

---

## Feature 1: Real-Time WebSocket Push (Upgrade)

### Current State
- WebSocket exists but uses poll-and-broadcast: backend polls snapshot every 5s, diffs hash, broadcasts full SNAPSHOT if changed.
- Frontend connects via `useWebSocketConnection()` in AppShell.
- Query invalidation already maps event types → query keys.
- Frontend also polls via `refetchInterval` on queries (5-10s) as fallback.

### What to Build

**Backend changes:**
1. Add **event-driven broadcast** alongside the poll loop:
   - In `backend/app/services/snapshot.py`, after any state change function, call `manager.broadcast("EVENT_TYPE", payload)`.
   - For v1, hook into the event log table: after inserting an event, publish it.
   - Add a new background task that watches the event_log table cursor for new events (WAL mode SELECT since last cursor) and broadcasts individual events.

2. **Granular event types** instead of full SNAPSHOT dumps:
   - `TASK_STATUS_CHANGED { taskId, projectId, newStatus, oldStatus }`
   - `AGENT_UPDATE { agentId, status }`
   - `ATTEMPT_STARTED / ATTEMPT_COMPLETED { attemptId, taskId, status }`
   - `PROJECT_TRANSITION { projectId, newStatus }`
   - Fall back to SNAPSHOT broadcast for full-state events or every 30s as heartbeat.

3. **Reduce poll interval** to 15-30s (heartbeat only), since individual events are pushed.

**Frontend changes:**
1. Update `useWebSocket.ts` `invalidateByEventType()` to handle granular events by:
   - **Directly updating query cache** (optimistic) for common events instead of invalidating.
   - Only invalidate when necessary (new project, schema-changing events).

2. Show real-time connection status indicator in TopNav (already tracked in `uiStore.connectionStatus`), make it more prominent with colored dot.

3. Add **live event toast** for critical events (ATTEMPT_COMPLETED with failure, ALERT_TRIGGERED).

### Files to Modify
- `backend/app/routers/ws.py` — add event-cursor watcher
- `backend/app/services/snapshot.py` — add broadcast hooks
- `frontend/src/lib/useWebSocket.ts` — direct cache updates
- `frontend/src/components/layout/TopNav.tsx` — connection indicator

### Dependencies
- None (existing WebSocket infrastructure)

---

## Feature 2: Project Kanban Board

### Current State
- `ProjectDetailPage` (`src/routes/project-detail.tsx`) shows tasks in a `<DataTable>` with columns: role, title, status, retries, attempts, updated.
- Tasks have `status: TaskStatus` (TODO, READY, IN_PROGRESS, REVIEW, DONE, BLOCKED, FAILED, CANCELLED).
- `useProjectTasks(projectId)` returns `Task[]`.

### What to Build

**New components:**
1. `src/components/projects/KanbanBoard.tsx` — Main board layout
   - Columns: TODO → READY → IN_PROGRESS → REVIEW → DONE (+ collapsed FAILED/CANCELLED lane)
   - Each column: header with count badge, scrollable card list.
   - No drag-and-drop for v1 (would require backend mutations). Visual only.

2. `src/components/projects/KanbanColumn.tsx` — Single column
   - Status-colored header (use `getStatusColor()` from utils)
   - Staggered card reveal animation

3. `src/components/projects/KanbanTaskCard.tsx` — Task card within column
   - Shows: title, role icon, priority pip, retry count, assigned agent, time in status
   - Click → expand inline or link to task detail (v1: inline expand showing description + latest attempt)

**Route changes:**
- Update `project-detail.tsx` to add a toggle: Table view ↔ Board view
- Default to Board view on desktop, Table on mobile
- Persist preference in localStorage

### Visual Spec
```
┌─ TODO (2) ──┬─ READY (1) ─┬─ IN PROGRESS (1)─┬─ REVIEW (1) ─┬─ DONE (3) ──┐
│             │             │                   │              │              │
│ ┌─────────┐ │ ┌─────────┐ │ ┌───────────────┐ │ ┌──────────┐ │ ┌──────────┐ │
│ │ Task A  │ │ │ Task C  │ │ │ Task D        │ │ │ Task E   │ │ │ Task F   │ │
│ │ 🔨 build│ │ │ 🏗 arch │ │ │ 🔨 builder    │ │ │ 🔨 build │ │ │ ✅       │ │
│ │ P:2     │ │ │ P:1     │ │ │ ⏱ 32m running│ │ │ submitted│ │ │          │ │
│ └─────────┘ │ └─────────┘ │ └───────────────┘ │ └──────────┘ │ └──────────┘ │
│ ┌─────────┐ │             │                   │              │ ┌──────────┐ │
│ │ Task B  │ │             │                   │              │ │ Task G   │ │
│ │ 🔍 scout│ │             │                   │              │ │ ✅       │ │
│ └─────────┘ │             │                   │              │ └──────────┘ │
└─────────────┴─────────────┴───────────────────┴──────────────┴──────────────┘
```

### Styling
- Column backgrounds: slight gradient per status color (very subtle)
- Cards: `.glass` or `bg-surface` with `border-border` edges
- Active column (IN_PROGRESS): subtle glow
- Status badges reuse `<StatusBadge>` component
- Hover: card elevates slightly

### Files to Create
- `frontend/src/components/projects/KanbanBoard.tsx`
- `frontend/src/components/projects/KanbanColumn.tsx`
- `frontend/src/components/projects/KanbanTaskCard.tsx`

### Files to Modify
- `frontend/src/routes/project-detail.tsx` — add board/table toggle

---

## Feature 3: Authentication & Access Control

### Current State
- No auth at all. Backend serves freely on localhost.
- Listed as known gap #1 in docs.

### What to Build

**Backend:**
1. `backend/app/auth.py` — Auth module
   - API key-based auth for v1 (single user)
   - Read API key from env var: `OVERMIND_API_KEY`
   - If env var is not set, auth is DISABLED (backward compat)
   - FastAPI `Depends()` middleware to check `Authorization: Bearer <key>` header
   - WebSocket auth: check `?token=<key>` query param on WS connect

2. Apply auth dependency to all routers in `main.py`

3. Login endpoint for frontend token exchange:
   - `POST /api/v1/auth/login` — body: `{ key: string }` → response: `{ ok: true, token: string }`
   - Token = the API key itself for v1 (no JWT complexity needed)
   - `GET /api/v1/auth/verify` — checks if token is valid

**Frontend:**
1. `src/stores/authStore.ts` — Zustand store
   - `token: string | null`
   - `authenticated: boolean`
   - `login(key): Promise<boolean>` — calls `/api/v1/auth/login`
   - `logout()`
   - Persist token in `localStorage`

2. `src/routes/login.tsx` — Login page
   - Clean, dark-themed single input field for API key
   - "Enter your API key" form
   - Error message on wrong key
   - Redirect to `/` on success

3. `src/providers/data/api/index.ts` — Attach auth header
   - Read token from authStore
   - Add `Authorization: Bearer <token>` to all `apiFetch()` calls
   - On 401 response, clear auth store and redirect to login

4. `src/lib/useWebSocket.ts` — Attach token to WS URL
   - Append `?token=<key>` when connecting

5. `src/router.tsx` — Route guard
   - If auth is required (backend returns 401), redirect unauthenticated users to `/login`
   - Login route is always public

6. Auth check on app load:
   - On mount, if token exists in localStorage, verify via `GET /api/v1/auth/verify`
   - If invalid, clear and show login

### Files to Create
- `backend/app/auth.py`
- `backend/app/routers/auth.py`
- `frontend/src/stores/authStore.ts`
- `frontend/src/routes/login.tsx`

### Files to Modify
- `backend/app/main.py` — register auth router, apply middleware
- `backend/app/routers/ws.py` — WS token check
- `frontend/src/providers/data/api/index.ts` — attach Bearer header
- `frontend/src/lib/useWebSocket.ts` — append token to URL
- `frontend/src/router.tsx` — add login route + guard
- `frontend/src/main.tsx` or `AppShell.tsx` — auth check on mount

---

## Feature 4: Agent Conversation Replay

### Current State
- `AgentSession { sessionKey, agentId, updatedAt, createdAt, messageCount }` type exists
- `useAgentSessions(agentId)` query hook exists, returns session list
- `AgentDetailPage` shows sessions as a simple list (SessionRow component: session key, message count, time)
- Mock provider returns 3 fake sessions per agent
- Backend has `GET /api/v1/agents/{id}/sessions` endpoint

### What to Build

**Backend:**
1. New endpoint: `GET /api/v1/agents/{agentId}/sessions/{sessionKey}/messages`
   - Returns ordered list of messages from the session
   - Source: read from openclaw session storage (likely file-based in `~/.openclaw/sessions/`)
   - Response type: `{ ok: true, data: SessionMessage[] }`

2. `SessionMessage` schema:
   ```python
   class SessionMessage(BaseModel):
       role: str  # "user" | "assistant" | "system" | "tool"
       content: str
       timestamp: str | None
       tokenCount: int | None
   ```

**Frontend:**
1. New type in `domain.ts`:
   ```typescript
   interface SessionMessage {
     role: 'user' | 'assistant' | 'system' | 'tool';
     content: string;
     timestamp: string | null;
     tokenCount: number | null;
   }
   ```

2. Add to DataProvider interface:
   - `getSessionMessages(agentId: string, sessionKey: string): Promise<SessionMessage[]>`

3. Add query hook:
   - `useSessionMessages(agentId, sessionKey)` in `useSnapshot.ts`

4. New component: `src/components/agents/ConversationReplay.tsx`
   - Chat-like UI showing messages in chronological order
   - Role-specific styling:
     - **system**: muted gray banner
     - **user**: right-aligned blue bubble (agent's instruction)
     - **assistant**: left-aligned green/white bubble (agent's response)
     - **tool**: collapsible code block with tool name
   - Token count indicator per message
   - Scroll to bottom by default
   - Search/filter within conversation

5. Integrate into `AgentDetailPage`:
   - Click a session row → expand inline or open a slide-over panel showing `ConversationReplay`
   - Add a "Replay" button on each session row

### Visual Spec
```
┌──────────────────────────────────────────────┐
│  Session: sess-abc123   │  42 messages  │ ↕  │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─ SYSTEM ────────────────────────────────┐ │
│  │ You are the Architect agent...          │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│                ┌─ USER ──────────────────┐   │
│                │ Plan task breakdown for │   │
│                │ project: Build API...   │   │
│                └─────────────────────────┘   │
│                                              │
│  ┌─ ASSISTANT ─────────────────────────────┐ │
│  │ I'll create 4 tasks:                    │ │
│  │ 1. Design API schema                   │ │
│  │ 2. Implement endpoints                 │ │
│  │ ...                                     │ │
│  └────────────── 847 tokens ───────────────┘ │
│                                              │
│  ▸ TOOL CALL: create_task [expand]           │
│                                              │
└──────────────────────────────────────────────┘
```

### Files to Create
- `backend/app/routers/sessions.py` (or extend `agents.py`)
- `frontend/src/components/agents/ConversationReplay.tsx`

### Files to Modify
- `backend/app/main.py` — register sessions router (if separate)
- `frontend/src/types/domain.ts` — add SessionMessage type
- `frontend/src/providers/data/types.ts` — add getSessionMessages
- `frontend/src/providers/data/api/index.ts` — implement getSessionMessages
- `frontend/src/providers/data/mock/index.ts` — mock session messages
- `frontend/src/queries/useSnapshot.ts` — add useSessionMessages hook
- `frontend/src/queries/keys.ts` — add sessionMessages key
- `frontend/src/routes/agent-detail.tsx` — integrate replay viewer

---

## Feature 5: Topology / Dependency Visualization

### Current State
- Tasks have `projectId`, `role`, `status`, `claimedBy` fields
- No explicit dependency tracking between tasks (no `dependsOn` field in Task type)
- Attempts link to tasks via `taskId` and to agents via `agentRole`

### What to Build

**Strategy:** Build a flow graph from implicit relationships since explicit task dependencies don't exist yet in the schema. The graph shows:
- Nodes = tasks, color-coded by status
- Edges = sequential order (by creation time), role grouping, and agent connections
- Agent nodes on the side showing who is working on what
- Project as the root node

**New dependency to install:**
```bash
cd frontend && npm install @xyflow/react
```
(`@xyflow/react` is the React 19-compatible version of reactflow)

**Frontend components:**
1. `src/components/projects/TopologyGraph.tsx` — Main graph container
   - Uses `@xyflow/react` (ReactFlow)
   - Custom dark theme matching design system
   - Layout: dagre or elkjs auto-layout (install `dagre` or `@dagrejs/dagre`)
   - Zoom, pan, minimap

2. `src/components/projects/TaskNode.tsx` — Custom ReactFlow node
   - Shows task title, role icon, status badge
   - Color border by status
   - Glow if IN_PROGRESS

3. `src/components/projects/AgentNode.tsx` — Custom node for agent
   - Shows agent name, role, busy/idle indicator

4. `src/lib/graphLayout.ts` — Layout computation helper
   - Takes tasks + agents, computes node positions
   - Groups tasks by role lane
   - Connects tasks to claiming agents

**Route integration:**
- Add topology tab/toggle to `ProjectDetailPage`
- Or create a new route: `/projects/$projectId/topology`

**New route option:**
- Add to router: `/projects/$projectId/topology` → TopologyPage

### Visual Spec
```
┌──────────────────────────────────────────────────────────────┐
│  Project: Build API Server    [Table] [Board] [Topology]     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│    ┌──────────┐                                              │
│    │ PROJECT  │                                              │
│    │ Build API│                                              │
│    └────┬─────┘                                              │
│         │                                                    │
│    ┌────┴────┐                                               │
│    │         │                                               │
│ ┌──▼───┐ ┌──▼───┐                                           │
│ │Task 1│ │Task 2│──── 🤖 Architect (idle)                   │
│ │DONE ✓│ │DONE ✓│                                           │
│ └──┬───┘ └──┬───┘                                           │
│    │         │                                               │
│ ┌──▼───┐ ┌──▼───┐                                           │
│ │Task 3│ │Task 4│──── 🔨 Builder (busy)                     │
│ │ACTIVE│ │READY │                                           │
│ └──────┘ └──────┘                                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Files to Create
- `frontend/src/components/projects/TopologyGraph.tsx`
- `frontend/src/components/projects/TaskNode.tsx`
- `frontend/src/components/projects/AgentNode.tsx`
- `frontend/src/lib/graphLayout.ts`

### Files to Modify
- `frontend/src/routes/project-detail.tsx` — add topology view toggle
- `frontend/package.json` — add @xyflow/react, @dagrejs/dagre deps

---

## Quality Requirements

### For All Features
- `npm run lint` must pass
- `npm run test:run` must pass (all existing + new tests)
- Use existing design tokens — no new color palette
- Dark theme only (matches current dashboard)
- Responsive: graceful degradation on mobile
- Keyboard accessible (focus rings, button semantics)
- Match the "premium cinematic dashboard" aesthetic established by the agents hierarchy page

### Testing
- Unit tests for pure logic (layout computation, auth helpers, grouping)
- Integration tests for new pages (render test with mock provider)
- At least 1 test per new feature

### Commit Strategy
- Implement features in order of dependency:
  1. Auth (needed by WS upgrade)
  2. WebSocket Push (builds on auth for WS token)
  3. Kanban Board (independent)
  4. Conversation Replay (independent)
  5. Topology Graph (independent, needs npm install)

---

## Implementation Checklist

### Feature 1: Real-Time WebSocket Push
- [ ] Backend: Add event-cursor watcher to ws.py
- [ ] Backend: Broadcast granular events on state changes
- [ ] Backend: Reduce poll interval to 15-30s heartbeat
- [ ] Frontend: Update useWebSocket.ts with direct cache updates
- [ ] Frontend: Add prominent connection status indicator in TopNav
- [ ] Frontend: Add live toast notifications for critical events
- [ ] Test: Verify WS reconnect behavior still works
- [ ] Test: Verify query cache updates correctly on events

### Feature 2: Project Kanban Board
- [ ] Create KanbanBoard.tsx component
- [ ] Create KanbanColumn.tsx component
- [ ] Create KanbanTaskCard.tsx component
- [ ] Update project-detail.tsx with board/table toggle
- [ ] Add localStorage persistence for view preference
- [ ] Style columns with status-colored gradients
- [ ] Add staggered card animations
- [ ] Test: Render test with tasks in correct columns
- [ ] Test: Toggle between views works

### Feature 3: Authentication & Access Control
- [ ] Backend: Create auth.py module with API key check
- [ ] Backend: Create auth router with login/verify endpoints
- [ ] Backend: Apply auth dependency to all routers
- [ ] Backend: Add WS token check in ws.py
- [ ] Frontend: Create authStore.ts (zustand)
- [ ] Frontend: Create login.tsx page
- [ ] Frontend: Update api provider to attach Bearer token
- [ ] Frontend: Update useWebSocket.ts to append token
- [ ] Frontend: Add login route + auth guard to router.tsx
- [ ] Frontend: Auth check on app mount
- [ ] Test: Auth middleware blocks without key
- [ ] Test: Auth passes with correct key
- [ ] Test: Login page renders and handles error

### Feature 4: Agent Conversation Replay
- [ ] Backend: Add session messages endpoint
- [ ] Backend: Read messages from openclaw session storage
- [ ] Frontend: Add SessionMessage type to domain.ts
- [ ] Frontend: Add getSessionMessages to DataProvider
- [ ] Frontend: Add useSessionMessages query hook
- [ ] Frontend: Create ConversationReplay.tsx component
- [ ] Frontend: Add mock session messages to mock provider
- [ ] Frontend: Integrate into agent-detail.tsx
- [ ] Style: Chat bubbles with role-specific colors
- [ ] Style: Collapsible tool call blocks
- [ ] Test: Conversation renders with mixed message types
- [ ] Test: Empty session shows appropriate state

### Feature 5: Topology / Dependency Visualization
- [ ] Install @xyflow/react and @dagrejs/dagre
- [ ] Create graphLayout.ts helper
- [ ] Create TaskNode.tsx custom node
- [ ] Create AgentNode.tsx custom node
- [ ] Create TopologyGraph.tsx main component
- [ ] Integrate into project-detail.tsx as view toggle
- [ ] Style nodes with design system tokens
- [ ] Add zoom/pan/minimap controls
- [ ] Test: Graph renders with correct node count
- [ ] Test: Layout positions nodes without overlap

### Final Validation
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes (all tests)
- [ ] All 5 features work in browser
- [ ] Mobile responsive behavior verified
- [ ] No console errors
