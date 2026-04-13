# Overmind Mission Control Dashboard Improvement Roadmap

## Scope
This roadmap captures practical, high-leverage improvements for the Mission Control dashboard based on the current frontend implementation.

## Priority Legend
- **P0** – Must have
- **P1** – Should have
- **P2** – Nice to have
- **Effort** estimates: S (small), M (medium), L (large)

---

## P0 (Foundational)

### 1) Deep-linkable UI state across core flows
- **What to do**: Persist tab/filter/search/workspace UI state in query params.
- **Where**:
  - `src/routes/control.tsx` (intake/chat tab)
  - `src/routes/projects-list.tsx` (status + search)
  - `src/routes/overview.tsx` (New Project CTA target maybe via query)
- **Why**: Improves troubleshooting continuity and team collaboration.
- **Effort**: M
- **Acceptance**:
  - Reload keeps active section
  - Copy/paste URL recreates current view
  - Browser back/forward behaves predictably

### 2) Action mutation reliability and observability hardening
- **What to do**: Improve mutation UX with explicit pending states, optimistic rollback safety, and clear failure recovery messages.
- **Where**:
  - `src/queries/useMutations.ts`
  - `src/components/OrchestratorControls.tsx`
  - `src/routes/project-detail.tsx`
  - `src/routes/cron.tsx`
- **Why**: Reduces accidental duplicate actions and makes operational failures actionable.
- **Effort**: M
- **Acceptance**:
  - Buttons disable during in-flight operation
  - Error banners/toasts include operation + reason
  - Optimistic updates never leave invalid states

### 3) Real-time + query invalidation optimization
- **What to do**: Apply targeted cache updates for websocket event types; avoid broad invalidation unless needed.
- **Where**:
  - `src/lib/useWebSocket.ts`
- **Why**: Better responsiveness, fewer re-renders, less perceived lag on active screens.
- **Effort**: M
- **Acceptance**:
  - Snapshot-critical pages update within one cycle
  - Non-affected sections remain stable during high event volume

---

## P1 (Operational value)

### 4) Alert center + acknowledgment workflow
- **What to do**: Add alert stream filters (severity/time/project), ack state, and optional notification batching so critical events don’t get lost in full feed.
- **Where**:
  - `src/components/ui/EventFeed.tsx`
  - `src/routes/overview.tsx`
  - `src/routes/system-health.tsx`
  - `src/types/domain.ts` (extend alert metadata if needed)
- **Effort**: L
- **Acceptance**:
  - Users can filter alerts by severity/time range
  - Acknowledged alerts stay visible but de-emphasized
  - Critical alerts remain discoverable

### 5) Scale lists for production volume
- **What to do**: Add pagination or virtualization to long tables/feeds.
- **Where**:
  - `src/components/ui/DataTable.tsx`
  - `src/components/ui/EventFeed.tsx`
  - `src/routes/project-detail.tsx`
  - `src/routes/live.tsx`
- **Effort**: M/L
- **Acceptance**:
  - No noticeable input lag with 500+ rows
  - “Load more / next page” pattern available where applicable

### 6) Control intake productivity upgrades
- **What to do**: Add reusable mission templates, last-run restore, and draft autosave.
- **Where**:
  - `src/routes/control.tsx`
- **Effort**: M
- **Acceptance**:
  - Operators can launch from template in <=2 clicks
  - Draft text survives refresh

### 7) Live operations observability boosts
- **What to do**: Add attempt throughput, backlog/lag trend, and attempt failure reason surfacing.
- **Where**:
  - `src/routes/live.tsx`
  - `src/routes/system-health.tsx`
- **Effort**: M
- **Acceptance**:
  - Trend cards update in near real-time
  - Failed attempts show grouped cause summary

---

## P2 (Polish + experience)

### 8) Accessibility and keyboard workflow
- **What to do**: Improve keyboard navigation, focus states, skip links, and screen-reader announcements.
- **Where**:
  - `src/components/layout/Sidebar.tsx`
  - `src/components/layout/TopNav.tsx`
  - `src/routes/overview.tsx`
  - `src/components/ui/DataTable.tsx`
- **Effort**: M
- **Acceptance**:
  - Primary actions reachable without mouse
  - Contrast and focus visibility pass through visual checks

### 9) Configurable dashboard density/layout profiles
- **What to do**: Add compact/elevated layouts and per-role presets (operator, investigator, SRE).
- **Where**:
  - `src/components/layout/RootLayout.tsx`
  - `src/stores/uiStore.ts`
  - Route-level page containers
- **Effort**: L
- **Acceptance**:
  - Layout memory persists across sessions
  - Users can switch density in one click

### 10) Security and session posture improvements
- **What to do**: Improve auth state handling and expiration messaging; optional silent refresh path if backend supports it.
- **Where**:
  - `src/stores/authStore.ts`
  - `src/lib/websocket.ts`
- **Effort**: M/L
- **Acceptance**:
  - Expired session prompts clear recovery path
  - WS and API sessions re-authenticate predictably

### 11) Command surface simplification and policy enforcement
- **What to do**: Centralize capability checks into reusable helpers and gate advanced controls consistently.
- **Where**:
  - `src/providers/data/types.ts`
  - `src/routes/project-detail.tsx`
  - `src/components/OrchestratorControls.tsx`
  - `src/routes/cron.tsx`
- **Effort**: M
- **Acceptance**:
  - No action renders when not supported
  - Unsupported provider actions show consistent “unavailable” messaging

---

## Suggested rollout order

1. **Phase 1 (P0)**: #1, #2, #3
2. **Phase 2 (P1)**: #4, #5, #6, #7
3. **Phase 3 (P2)**: #8, #9, #10, #11

## Success metrics

- Time to recover from incident view refresh: **reduce by 30%+**
- Failed action retries from same button: **reduce by 40%+**
- Alert triage time: **reduce by 20%+**
- UI responsiveness under heavy event load: **no major frame drops**
