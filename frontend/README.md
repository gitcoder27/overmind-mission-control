# Overmind Mission Control Frontend

Frontend dashboard for Overmind/OpenClaw operations.

## Stack
- React + TypeScript + Vite
- TanStack Router + TanStack Query
- Zustand
- Tailwind CSS
- Recharts

## Paths
- Project root: `/home/ubuntu/Development/overmind-mission-control/frontend`
- Frontend dev server: `http://127.0.0.1:5173`
- New backend API base: `http://127.0.0.1:8788/api/v1`
- New backend WS: `ws://127.0.0.1:8788/ws/v1/live`
- Legacy dashboard API: `http://127.0.0.1:8787/api/snapshot`

## Current Active Mode (important)
Current `.env` is set to:

```env
VITE_DATA_PROVIDER=api
```

So when you open `http://localhost:5173`, you are on the **new dashboard app** and it talks to the **new backend (`:8788`)**.

Legacy mode exists only as a provider fallback and is used only if you switch to:

```env
VITE_DATA_PROVIDER=legacy
```

## Data Provider Modes
Set in `.env` (`VITE_DATA_PROVIDER`):
- `mock` (default): local fixtures, no mutations
- `legacy`: reads legacy `/api/snapshot`, read-only
- `api`: reads/writes new backend contract

```bash
VITE_DATA_PROVIDER=mock
VITE_API_BASE_URL=http://127.0.0.1:8788
VITE_LEGACY_BASE_URL=http://127.0.0.1:8787
VITE_WS_URL=ws://127.0.0.1:8788/ws/v1/live
```

## Install
```bash
cd /home/ubuntu/Development/overmind-mission-control/frontend
npm install
```

## Run
```bash
npm run dev
```
Dev server: `http://127.0.0.1:5173`

## Quality Checks
```bash
npm run lint
npm run test:run
npm run build
```

## Realtime Behavior
- WebSocket is enabled when provider capability `realtime=true` (API mode).
- Incoming WS events invalidate relevant TanStack Query keys.
- If WS is unavailable/disconnected, polling continues via query `refetchInterval`.

## Notes
- Legacy dashboard on `:8787` is not modified by this frontend.
- Mutation buttons are capability-aware and disabled in read-only providers.
- For full legacy dependency mapping (what can/can’t be archived), see repo root `README.md`.
