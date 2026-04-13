# Overmind Mission Control (New Dashboard)

## Project Overview
This repository contains the new Overmind Mission Control dashboard stack. It is a full-stack web application designed to monitor and manage an `overmind_hq` core runtime (OpenClaw/Overmind). The application communicates with legacy components while providing a modern web interface.

## Tech Stack
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, TanStack Router, TanStack Query, Zustand.
- **Backend:** FastAPI (Python), Uvicorn, SQLite (read-focused via raw SQL), Pydantic models, WebSockets.

## Architecture
- `frontend/`: The Vite/React web application. It uses a provider-based architecture for data fetching (currently configured to use the new backend API). Direct endpoint calls in route/page components are forbidden; instead, provider adapters (`src/providers/data/*`) are used.
- `backend/`: The FastAPI backend serving as the API and WebSocket provider for the frontend. It reads from the OpenClaw DB and interacts with the Overmind/OpenClaw CLI for mutations.

## Building and Running

A helper script `dev-stack.sh` is provided in the root directory to manage both services simultaneously.

### Start the entire stack
```bash
./dev-stack.sh start
```
- **Frontend** runs on `http://127.0.0.1:5173`
- **Backend API** runs on `http://127.0.0.1:8789` (or `8788` depending on config overrides)
- **Backend Docs (Swagger)** is available at `http://127.0.0.1:<PORT>/docs`

### View status & logs
```bash
./dev-stack.sh status
./dev-stack.sh logs
```

### Stop the stack
```bash
./dev-stack.sh stop
```

### Manual Service Execution

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# Run tests: npm run test:run
# Build: npm run build
```

**Backend:**
```bash
cd backend
source .venv/bin/activate
./run.sh
# Run tests: pytest -q
```

## Development Conventions & Safety Rules

### Frontend Rules
- **Provider Adapters:** Use provider adapters only (found in `frontend/src/providers/data/`). Do not add direct endpoint calls in route/page components.
- **Real-time:** Use existing hooks (`useWebSocket.ts`) for real-time WebSocket logic.
- **Contract Fidelity:** Maintain contract fidelity with backend envelopes/fields. Ensure mutation capabilities remain aware of their statuses.

### Backend Rules
- **Safety First:** Do **not** directly mutate Overmind/OpenClaw DB/files for operator actions. Always use the CLI wrappers (`app/services/overmind.py`, `app/services/openclaw.py`).
- **Secrets:** Never log or expose OpenClaw secrets (auth/config files).
- **Response Envelopes:** Keep the response envelope contract stable:
  - Success: `{ "ok": true, "data": {}, "meta": { "timestamp": "...", "request_id": "..." } }`
  - Error: `{ "ok": false, "error": { "code": "...", "message": "...", "details": {} }, "meta": { "timestamp": "...", "request_id": "..." } }`

### Legacy Dependencies
The new backend still requires artifacts from the `overmind_hq` core runtime (e.g., SQLite DB, heartbeat/pid files, CLI module). Do not archive or remove these core pieces while the backend still relies on them.
