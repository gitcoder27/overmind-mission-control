Implement the System Health live dashboard page for the Overmind Mission Control app. The full spec is at `~/Development/overmind-mission-control/docs/SYSTEM_HEALTH_PAGE_SPEC.md` — read it first.

**Context:**
- This is a FastAPI + React/TypeScript dashboard (Vite, TailwindCSS v4, TanStack Router, Zustand)
- Backend is at `~/Development/overmind-mission-control/backend/` (Python, FastAPI, uses a `.venv`)
- Frontend is at `~/Development/overmind-mission-control/frontend/`
- The app runs on a cloud VM (the one you're SSH'd into). We want to show THIS machine's live system metrics
- Backend runs on port 8788. Start with: `cd backend && source .venv/bin/activate && OVERMIND_API_KEY=letsdo123 uvicorn app.main:app --host 127.0.0.1 --port 8788 --log-level warning`
- Frontend dev server: `cd frontend && npm run dev`
- Auth is enabled — WebSocket endpoints require `?token=letsdo123` query param. See `backend/app/auth.py` and `backend/app/routers/ws.py` for existing WS auth pattern
- Existing theme uses CSS variables defined in `frontend/src/index.css` (void/abyss/surface dark palette, accent=#22d3a7)
- Existing components are in `frontend/src/components/ui/` — reuse StatusBadge, Skeleton, etc. where applicable
- Router is at `frontend/src/router.tsx`, sidebar nav at `frontend/src/components/layout/Sidebar.tsx`

**What to build:**

1. **Backend** — `backend/app/routers/system_metrics_ws.py`: A WebSocket endpoint at `/api/v1/ws/metrics` that uses `psutil` to stream system metrics (CPU, RAM, disk, network, processes, temperatures, system info) as JSON every 2 seconds. Install psutil into the backend venv. Register the router in `main.py`. Use the same WS auth pattern as the existing `ws.py`.

2. **Frontend** — `frontend/src/lib/useMetricsSocket.ts`: Custom hook that connects to the metrics WS, maintains a circular buffer of the last 60 readings (2 min history for sparklines), auto-reconnects, pauses on tab hidden. Returns `{ current, history, connected }`.

3. **Frontend** — UI components in `frontend/src/components/system/`:
   - `MetricGauge.tsx` — SVG circular gauge with animated arc (for CPU%, RAM%, Disk%)
   - `SparklineChart.tsx` — tiny SVG polyline sparkline showing history
   - `CpuCoreBar.tsx` — horizontal bar per CPU core
   - `ProcessTable.tsx` — top processes by CPU and memory
   - `NetworkCard.tsx` — live network throughput (bytes/sec deltas)
   - `DiskCard.tsx` — disk partitions + I/O rates
   - `SystemInfoCard.tsx` — hostname, OS, kernel, uptime, architecture
   - `TemperatureBar.tsx` — horizontal bars with color zones

4. **Frontend** — `frontend/src/routes/system-health.tsx`: The page combining all components in a responsive grid layout. Show a live indicator (green dot + "Live" or red + "Disconnected") in the header.

5. **Frontend** — Register route at `/system/health` in router.tsx and add "System Health" nav link in Sidebar.tsx (use the Activity or HeartPulse lucide icon).

6. **Tests** — Write tests for the hook, gauge, and page smoke test.

**Design requirements:**
- Follow the existing dark theme exactly (void bg, glass cards, accent color, Plus Jakarta Sans + JetBrains Mono)
- Gauges: SVG circular arcs, accent for CPU, info (#3b82f6) for RAM, warn (#f59e0b) for disk
- Sparklines: tiny SVG polylines, smooth, last 60 data points
- All byte values formatted human-readable (KB/MB/GB)
- Network & disk I/O: compute rate per second from consecutive snapshot deltas
- Process table: max 8 rows, sortable columns
- The page must look polished, production-grade, and match the rest of the dashboard's aesthetic
- Use stagger animations on initial load like other pages

**Key constraint:** The metric collection must use near-zero CPU. `psutil` reads from `/proc` directly — no subprocess calls, no shell commands. A 2s interval collection loop uses <0.1% CPU.

After implementing, run `npm run lint`, `npx tsc --noEmit`, and `npx vitest run` to verify everything passes. Also restart the backend and confirm the WS endpoint works with: `wscat -c "ws://127.0.0.1:8788/api/v1/ws/metrics?token=letsdo123"`
