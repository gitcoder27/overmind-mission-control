# Mission Control Dashboard - Phase 1 Implementation Plan

**Phase 1 Goals (P0):**
1. Deep-linkable state
2. Action mutation reliability hardening
3. Real-time + cache update optimization

**Target outcome:** Lower operator friction, fewer accidental retries, more stable live updates.

---

## 0) Pre-flight (shared)

- [ ] Create a branch (or feature branch naming: `enh/phase1-dashboard`)
- [ ] Confirm active provider settings (`VITE_DATA_PROVIDER` in `frontend/.env`)
- [ ] Run baseline smoke:
  - `cd frontend && npm run test:run`
  - `cd frontend && npm run build`

---

## 1) Deep-linkable UI State

### 1.1 Control page tab persistence
**Files**: `src/routes/control.tsx`

- [ ] Replace manual `searchParams` read/write with a stronger typed router search schema.
- [ ] Keep `tab` synced to URL and initialize from URL on mount.
- [ ] On tab switch, update URL without full reload (router `navigate` with `search`).
- [ ] Add URL fallback for unsupported values (`intake`|`chat`).

**Acceptance**
- Reload retains current tab.
- Refreshing with `?tab=chat` opens chat.

### 1.2 Projects list filters/search persistence
**Files**: `src/routes/projects-list.tsx`

- [ ] Read/write `statusFilter` and `search` from route search params.
- [ ] Debounce search updates before writing URL (e.g., 250ms).
- [ ] Preserve existing filtering behavior during local interactions.

**Acceptance**
- Copying a filtered URL reproduces same list view.
- URL updates are stable and human-readable.

### 1.3 Route-level optional enhancements (if needed)
**Files**: `src/routes/overview.tsx`

- [ ] Add `?alertSeverity=warning|critical` optional entry points for future alert filtering.
- [ ] Keep current behavior as fallback when params are absent.

**Acceptance**
- Existing links remain compatible.

### 1.4 Shared helper for search param sync
**Files**: `src/lib/utils.ts` (or new utility file)

- [ ] Add tiny helpers: read + normalize helpers for bounded enums/strings.
- [ ] Reuse across pages.

**Acceptance**
- Reduced duplicated parsing logic.
- Shared defaults documented in one place.

---

## 2) Mutation reliability and UX hardening

### 2.1 Project mutations: safer optimistic updates
**Files**: `src/queries/useMutations.ts`

- [ ] For `useApproveProject`:
  - Extend `onMutate` rollback context to include snapshot and projects cache snapshots.
  - On success refresh project-specific + project list + snapshot keys.
  - Avoid setting status to `COMPLETED` if snapshot shape indicates another terminal status may follow.
- [ ] For all mutating hooks:
  - Normalize cancel reason (`Cancelled`) handling to avoid toast spam.
  - Return explicit typed context.

**Acceptance**
- Failed approvals never leave UI in impossible state.
- No stale data after failed mutation.

### 2.2 Orchestrator controls reliability
**Files**: `src/queries/useMutations.ts`, `src/components/OrchestratorControls.tsx`

- [ ] Add guard so Pause/Resume/Restart are mutually exclusive while one request is in-flight.
- [ ] Include `isPending` visual states directly on each button with disabled + tooltip.
- [ ] Add error copy clarifying whether reconnect/state sync is expected to resolve.

**Acceptance**
- No duplicate pause/resume/restart requests from repeated clicks.
- Users get clear state after failure.

### 2.3 Cron job actions feedback
**Files**: `src/queries/useMutations.ts`, `src/routes/cron.tsx`

- [ ] Fix optimistic toggle context scoping for running mutations.
- [ ] Ensure toggle button state is derived from query cache, not stale closure.
- [ ] Add clear disabled visual state for provider capability mismatch.

**Acceptance**
- Toggle instantly reflects expected state.
- Rollback reliably occurs on error/cancel.

### 2.4 Uniform capability-based messaging
**Files**: `src/routes/project-detail.tsx`, `src/components/OrchestratorControls.tsx`, `src/routes/cron.tsx`

- [ ] Add a consistent inline disabled-state label (“Unavailable for <provider>”).
- [ ] Keep action buttons visually grouped with muted fallback states.

**Acceptance**
- Unsupported actions are obvious before click.

---

## 3) Real-time cache and query strategy

### 3.1 Event-driven targeted invalidation
**Files**: `src/lib/useWebSocket.ts`

- [ ] Improve event-to-key mapping:
  - `PROJECT_TRANSITION` -> invalidate project-level keys only when event has project id
  - `TASK_UPDATE` -> patch snapshot counters/tasks if possible
  - `SNAPSHOT_UPDATE` -> invalidate snapshot only
  - Keep `SNAPSHOT` as broad invalidation fallback
- [ ] Add safe JSON guard for payload type assertion.

**Acceptance**
- Updates remain correct with reduced unnecessary refreshes.

### 3.2 Optional cache patches (small wins)
**Files**: `src/lib/useWebSocket.ts`

- [ ] For event payloads including IDs, optionally patch:
  - snapshot timestamp
  - active events list prepend/trim
  - project list entries when status changed
- [ ] Fall back to query invalidation when patch shape is unknown.

**Acceptance**
- Visible panels feel near-instant for common events.

### 3.3 Query interval behavior alignment
**Files**: `src/queries/useSnapshot.ts`

- [ ] Keep `refetchInterval` only when realtime unavailable or degraded.
- [ ] If websocket is connected, reduce polling frequency as fallback safety net.

**Acceptance**
- Lower backend load under steady websocket connectivity.

---

## 4) Validation and rollout

### 4.1 Manual test checklist
- [ ] Control page with URL tab persistence
- [ ] Projects list deep link filter/search
- [ ] Approve/request status mutations under slow network and failure
- [ ] Orchestrator pause/resume/restart button state locking
- [ ] Cron toggle rollback on mocked failure
- [ ] WS event storm and mutation conflict scenario

### 4.2 Automated/CI checks
- [ ] `npm run test:run`
- [ ] `npm run build`
- [ ] Existing route/component tests updated/extended where practical

---

## 5) Estimated implementation sequence

1. Deep-linking (control + projects list)
2. Mutation guard/UX fixes
3. WS cache strategy + query interval tuning
4. Validation pass

---

## 6) Open questions / follow-up

- Do you want these Phase 1 items implemented as one PR with incremental commits, or split per theme?
- Do we need analytics events for operator actions in this phase (for audit/observability)?
- Confirm if websocket payload spec includes project/task IDs for all event types in your environment.
