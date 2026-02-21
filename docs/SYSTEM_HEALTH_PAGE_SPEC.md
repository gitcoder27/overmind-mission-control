# System Health Live Dashboard — Implementation Spec

## Overview

A new **System Health** page in the Overmind Mission Control dashboard that displays real-time VM metrics (CPU, RAM, disk, network, processes, uptime, etc.) streamed via a dedicated WebSocket endpoint. The design must impose **near-zero overhead** on the VM.

---

## Architecture

```
┌─────────────┐    WS /api/v1/ws/metrics    ┌───────────────┐
│  Frontend   │◄──────────────────────────── │   Backend     │
│  React page │   JSON every 2s             │   FastAPI WS  │
│  (gauges,   │                              │   psutil      │
│   charts)   │                              │   (< 0.1% CPU)│
└─────────────┘                              └───────────────┘
```

### Why near-zero load

- **psutil** reads directly from `/proc` and `/sys` — no subprocesses, no shell commands
- Single `psutil` snapshot takes <1ms on modern Linux
- 2-second interval = ~0.05% CPU for the collection loop
- Only one WebSocket client expected (the dashboard viewer)
- No database writes, no polling, no temp files

---

## Backend

### Dependencies

- `psutil` — already available or `pip install psutil` into the backend venv

### New WebSocket endpoint

**File:** `backend/app/routers/system_metrics_ws.py`

**Route:** `GET /api/v1/ws/metrics` (WebSocket)

**Auth:** Same token check as existing WS (`?token=` query param)

**Protocol:**
1. Client connects
2. Server immediately sends a full snapshot
3. Every 2 seconds, server sends a delta/full snapshot
4. Client can send `{"type": "ping"}`, server responds `{"type": "pong"}`
5. On disconnect, cleanup (cancel asyncio task)

**Payload shape:**

```json
{
  "type": "metrics",
  "timestamp": "2026-02-18T20:30:00Z",
  "cpu": {
    "percent": 12.3,
    "perCore": [10.1, 14.5, 11.0, 13.6],
    "coreCount": 4,
    "loadAvg": [0.5, 0.8, 0.7],
    "frequency": { "current": 2400, "min": 800, "max": 3600 }
  },
  "memory": {
    "total": 8589934592,
    "available": 4294967296,
    "used": 3865470566,
    "percent": 45.0,
    "swap": { "total": 2147483648, "used": 104857600, "percent": 4.9 }
  },
  "disk": {
    "partitions": [
      {
        "device": "/dev/sda1",
        "mountpoint": "/",
        "fstype": "ext4",
        "total": 107374182400,
        "used": 42949672960,
        "free": 64424509440,
        "percent": 40.0
      }
    ],
    "io": { "readBytes": 123456789, "writeBytes": 987654321, "readCount": 5000, "writeCount": 3000 }
  },
  "network": {
    "bytesSent": 123456789,
    "bytesRecv": 987654321,
    "packetsSent": 50000,
    "packetsRecv": 60000,
    "connections": 42
  },
  "system": {
    "hostname": "openclaw-vm",
    "platform": "linux",
    "platformVersion": "Ubuntu 22.04.3 LTS",
    "kernelVersion": "5.15.0-91-generic",
    "architecture": "x86_64",
    "uptime": 864000,
    "bootTime": "2026-02-08T20:30:00Z",
    "pythonVersion": "3.12.3"
  },
  "processes": {
    "total": 142,
    "running": 3,
    "sleeping": 138,
    "zombie": 0,
    "topCpu": [
      { "pid": 1234, "name": "uvicorn", "cpu": 2.1, "memory": 1.5 }
    ],
    "topMemory": [
      { "pid": 5678, "name": "node", "cpu": 0.5, "memory": 4.2 }
    ]
  },
  "temperatures": [
    { "label": "coretemp-core0", "current": 55.0, "high": 80.0, "critical": 100.0 }
  ]
}
```

### Registration

Add to `backend/app/main.py`:
```python
from app.routers.system_metrics_ws import router as metrics_ws_router
app.include_router(metrics_ws_router, prefix="/api/v1")
```

---

## Frontend

### New Route

**Path:** `/system/health`

**Nav label:** "Health" (under System, or as a sub-nav tab on the System page)

**File:** `frontend/src/routes/system-health.tsx`

### UI Components to Create

1. **`SystemHealthPage`** — main page component  
2. **`MetricGauge`** — circular gauge (CPU %, RAM %, Disk %)  
3. **`SparklineChart`** — tiny inline time-series chart (last 60 readings = 2 min history)  
4. **`ProcessTable`** — top processes by CPU/RAM  
5. **`NetworkCard`** — live throughput display  
6. **`SystemInfoCard`** — static info (hostname, OS, kernel, uptime)  
7. **`TemperatureBar`** — horizontal bar with color zones  

### Layout (Desktop)

```
┌──────────────────────────────────────────────────────────────┐
│  System Health                    ● Live  · Updated 2s ago  │
├────────────┬────────────┬────────────┬───────────────────────┤
│  CPU Gauge │  RAM Gauge │ Disk Gauge │   System Info Card    │
│  + spark   │  + spark   │  + spark   │   hostname, OS, up…   │
├────────────┴────────────┴────────────┴───────────────────────┤
│  CPU Per-Core Bars          │  Memory Breakdown              │
│  ████░░ core0  10%          │  ████████░░ 4.0/8.0 GB used    │
│  ██████░ core1  15%         │  Swap: ██░░ 100M/2G            │
├─────────────────────────────┼────────────────────────────────┤
│  Network I/O                │  Disk I/O                      │
│  ↑ 1.2 MB/s  ↓ 3.4 MB/s    │  R: 500 KB/s  W: 200 KB/s     │
│  Connections: 42            │  /dev/sda1: 40% used           │
├─────────────────────────────┴────────────────────────────────┤
│  Top Processes (by CPU)     │  Top Processes (by Memory)     │
│  PID   Name       CPU  MEM │  PID   Name       CPU  MEM     │
│  1234  uvicorn    2.1  1.5 │  5678  node       0.5  4.2     │
├─────────────────────────────┴────────────────────────────────┤
│  Temperatures (if available)                                 │
│  core0  ██████████████░░░░  55°C / 80°C high                │
└──────────────────────────────────────────────────────────────┘
```

### WebSocket Hook

**File:** `frontend/src/lib/useMetricsSocket.ts`

- Dedicated hook that connects to `ws://HOST/api/v1/ws/metrics?token=XXX`
- Maintains a circular buffer of last 60 snapshots (2 min history for sparklines)
- Returns `{ current, history, connected, latency }`
- Auto-reconnects with exponential backoff
- Pauses when tab is hidden (`document.visibilityState`)

### Data Flow

```
useMetricsSocket() → returns { current, history, connected }
    ↓
SystemHealthPage
    ↓ passes slices to child components
MetricGauge(value, max, history[])
SparklineChart(dataPoints[])
ProcessTable(processes[])
```

### Design Notes

- Follow existing dark theme (void/abyss/surface palette)
- Gauges: SVG-based circular arcs, accent color for CPU, info for RAM, warn for disk
- Sparklines: Tiny SVG polylines, 120px wide, last 60 data points
- Per-core bars: Horizontal bars with gradient fill
- Network/Disk I/O: Show rate (bytes/sec) computed from delta between snapshots
- All numbers: Use `Intl.NumberFormat` and human-readable byte formatting
- Connection status indicator: green dot + "Live" or red dot + "Disconnected"
- Process table: Sortable, max 8 rows, alternating row colors

---

## Router Update

In `frontend/src/router.tsx`, add:

```tsx
import { SystemHealthPage } from '@/routes/system-health';

const systemHealthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/system/health',
  component: SystemHealthPage,
});

// Add to routeTree children
```

Also add a nav link in the Sidebar under System, or add a tab bar on the System page.

---

## Files to Create/Modify

### Create (Backend)
- `backend/app/routers/system_metrics_ws.py`

### Modify (Backend)
- `backend/app/main.py` — register new router
- `backend/requirements.txt` — add `psutil` if not present

### Create (Frontend)
- `frontend/src/routes/system-health.tsx`
- `frontend/src/lib/useMetricsSocket.ts`
- `frontend/src/components/system/MetricGauge.tsx`
- `frontend/src/components/system/SparklineChart.tsx`
- `frontend/src/components/system/CpuCoreBar.tsx`
- `frontend/src/components/system/ProcessTable.tsx`
- `frontend/src/components/system/NetworkCard.tsx`
- `frontend/src/components/system/DiskCard.tsx`
- `frontend/src/components/system/SystemInfoCard.tsx`
- `frontend/src/components/system/TemperatureBar.tsx`

### Modify (Frontend)
- `frontend/src/router.tsx` — add route
- `frontend/src/components/layout/Sidebar.tsx` — add nav link

---

## Testing

### Backend
- Unit test: metric collection returns expected shape
- WS test: connect, receive at least 2 frames, verify schema

### Frontend
- `useMetricsSocket` hook: mock WS, verify circular buffer
- `MetricGauge`: renders with 0%, 50%, 100%
- `ProcessTable`: renders mock process list
- `SystemHealthPage`: smoke test renders without crash

---

## Implementation Order

1. Backend: Install psutil, create WS endpoint, register router
2. Frontend: Create `useMetricsSocket` hook
3. Frontend: Create gauge + sparkline components
4. Frontend: Create the page layout with all cards
5. Frontend: Add route + nav link
6. Test everything
