# Frontend Implementation Brief (For AI Agents)

Path: `/home/ubuntu/Development/overmind-mission-control/frontend`

## Stack
- React + TypeScript + Vite
- TanStack Router + TanStack Query
- Zustand
- Tailwind CSS

## Core Rule
Use provider adapters only. Do not add direct endpoint calls in route/page components.

Provider contract files:
- `src/providers/data/types.ts`
- `src/providers/data/mock/index.ts`
- `src/providers/data/legacy/index.ts`
- `src/providers/data/api/index.ts`

## Current Runtime Mode
Configured by `.env`:
- `VITE_DATA_PROVIDER=api` (currently active)
- `VITE_API_BASE_URL=http://127.0.0.1:8788`
- `VITE_WS_URL=ws://127.0.0.1:8788/ws/v1/live`

## Important Files
- `src/types/domain.ts` — canonical frontend types
- `src/queries/useSnapshot.ts` — query hooks
- `src/queries/useMutations.ts` — mutation hooks
- `src/lib/useWebSocket.ts` + `src/lib/websocket.ts` — realtime logic
- `src/routes/*` — route-level page composition

## OpenClaw/Backend Integration Notes
- Frontend talks to backend API/WS only.
- Frontend should **not** connect to OpenClaw gateway directly.
- Unsupported v1 actions should remain disabled with explicit UX messaging:
  - kill running attempt
  - dead-letter retry/bulk retry

## Commands
```bash
npm install
npm run dev
npm run lint
npm run test:run
npm run build
```

## Acceptance Expectations
- No contract drift from backend envelope/fields
- Mutation buttons remain capability-aware
- Loading/error/empty states preserved
- No regressions in lint/tests/build
