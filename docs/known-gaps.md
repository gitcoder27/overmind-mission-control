# Known Gaps (Current)

## 1) Auth not implemented
No login/token flow yet. When backend auth is enabled, add auth context + token attachment + 401 handling.

## 2) Legacy mode coverage limits
Legacy `/api/snapshot` does not provide complete agents/cron/blockers semantics; those views may be partial/empty in `legacy` mode.

## 3) Pagination not implemented
Lists are currently non-paginated. Needed for large datasets.

## 4) Search/filter persistence
Route/search filters are not persisted in URL/localStorage.

## 5) Mobile polish
Desktop-first layout works; full mobile navigation ergonomics still pending.

## 6) Keyboard shortcuts
No command palette/hotkeys yet.

## 7) Runtime schema validation
Adapters rely on structural assumptions; adding runtime schema validation (e.g., Zod) would harden integration safety.
