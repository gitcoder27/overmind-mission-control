# Overmind Mission Control (New Dashboard)

This repository contains the **new** Overmind Mission Control dashboard stack:

- **Frontend (Vite/React):** `http://127.0.0.1:5173`
- **Backend API (FastAPI):** `http://127.0.0.1:8788`
- **Backend docs:** `http://127.0.0.1:8788/docs`

---

## Quick Answer: “Am I on the right app?”

Yes — if you are on `http://localhost:5173` (same as `127.0.0.1:5173`), you are using the **new Mission Control frontend**.

Expected title in page HTML:
- `Overmind Mission Control`

The old/legacy dashboard is a separate service on `:8787`.

---

## Port Map

| Service | URL | Purpose |
|---|---|---|
| New frontend | `http://127.0.0.1:5173` | Main UI you should use |
| New backend API | `http://127.0.0.1:8788/api/v1` | API consumed by new frontend |
| New backend WS | `ws://127.0.0.1:8788/ws/v1/live` | Realtime updates |
| Legacy dashboard | `http://127.0.0.1:8787` | Old UI + old `/api/snapshot` |

---

## Runtime Mode in this repo

Current frontend env (`frontend/.env`):

```env
VITE_DATA_PROVIDER=api
VITE_API_BASE_URL=http://127.0.0.1:8788
VITE_LEGACY_BASE_URL=http://127.0.0.1:8787
VITE_WS_URL=ws://127.0.0.1:8788/ws/v1/live
```

Because `VITE_DATA_PROVIDER=api`, the active app path is:

`frontend (5173)` → `new backend (8788)`

The legacy provider code still exists as fallback, but is not selected in current mode.

---

## Legacy Dependency Clarification

### A) Legacy artifacts still required by the **new** backend (do not archive)

These are from `overmind_hq` core runtime and are still used by the new backend:

- `/home/ubuntu/.openclaw/workspace/overmind_hq/data/overmind_hq.db`
- `/home/ubuntu/.openclaw/workspace/overmind_hq/run/orchestrator.heartbeat`
- `/home/ubuntu/.openclaw/workspace/overmind_hq/run/overmind_orchestrator.pid`
- `/home/ubuntu/.openclaw/workspace/overmind_hq/src/overmind_hq/cli.py`

Referenced by:
- `backend/app/config.py`
- `backend/app/services/overmind.py`

### B) Legacy dashboard-only files (candidate for archive)

These are tied to old service `:8787`:

- `/home/ubuntu/.openclaw/workspace/overmind_hq/src/overmind_hq/dashboard.py`
- `/home/ubuntu/.openclaw/workspace/overmind_hq/src/overmind_hq/dashboard_static/index.html`
- `/home/ubuntu/.openclaw/workspace/overmind_hq/src/overmind_hq/dashboard_static/app.js`
- `/home/ubuntu/.openclaw/workspace/overmind_hq/src/overmind_hq/dashboard_static/styles.css`
- `/home/ubuntu/.openclaw/workspace/overmind_hq/run/overmind_dashboard.pid`

### C) Legacy adapter code inside this new repo (optional fallback)

- `frontend/src/providers/data/legacy/index.ts`
- `frontend/src/providers/data/index.ts` (provider switch)

If you never plan to run `VITE_DATA_PROVIDER=legacy`, this adapter can be removed later.

---

## Start / Stop

From repo root:

```bash
./dev-stack.sh start
./dev-stack.sh status
./dev-stack.sh logs
./dev-stack.sh stop
```

---

## Archival Guidance

You can archive the **legacy dashboard service/UI** on `:8787`, but keep `overmind_hq` core runtime pieces (DB, heartbeat/pid files, CLI module) unless and until the new backend is migrated off them.
