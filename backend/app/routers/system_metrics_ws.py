"""WebSocket endpoint for live system metrics using psutil.

Streams CPU, RAM, disk, network, process, temperature, and system info
as JSON every 2 seconds.  Reads from /proc directly — near-zero CPU overhead.
"""

from __future__ import annotations

import asyncio
import logging
import platform
import sys
from datetime import datetime, timezone

import psutil
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth import ws_verify_token

router = APIRouter()
logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 2.0


def _collect_metrics() -> dict:
    """Build a single metrics snapshot.  Pure psutil — no subprocess calls."""

    now = datetime.now(timezone.utc).isoformat()

    # ── CPU ──────────────────────────────────────────────────────
    cpu_percent = psutil.cpu_percent(interval=0)
    per_core = psutil.cpu_percent(interval=0, percpu=True)
    load_avg = list(psutil.getloadavg())
    freq = psutil.cpu_freq()
    frequency = (
        {"current": freq.current, "min": freq.min, "max": freq.max}
        if freq
        else None
    )

    # ── Memory ───────────────────────────────────────────────────
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()

    # ── Disk ─────────────────────────────────────────────────────
    partitions = []
    for p in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(p.mountpoint)
            partitions.append(
                {
                    "device": p.device,
                    "mountpoint": p.mountpoint,
                    "fstype": p.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent,
                }
            )
        except PermissionError:
            continue

    dio = psutil.disk_io_counters()
    disk_io = (
        {
            "readBytes": dio.read_bytes,
            "writeBytes": dio.write_bytes,
            "readCount": dio.read_count,
            "writeCount": dio.write_count,
        }
        if dio
        else {"readBytes": 0, "writeBytes": 0, "readCount": 0, "writeCount": 0}
    )

    # ── Network ──────────────────────────────────────────────────
    net = psutil.net_io_counters()
    try:
        connections = len(psutil.net_connections(kind="inet"))
    except (psutil.AccessDenied, PermissionError):
        connections = 0

    # ── System info ──────────────────────────────────────────────
    uname = platform.uname()
    boot = datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc)
    uptime = (datetime.now(timezone.utc) - boot).total_seconds()

    # Try to get a pretty platform version
    try:
        plat_version = platform.freedesktop_os_release().get(
            "PRETTY_NAME", platform.version()
        )
    except (OSError, AttributeError):
        plat_version = platform.version()

    # ── Processes ────────────────────────────────────────────────
    procs: list[dict] = []
    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent"]):
        try:
            info = proc.info  # type: ignore[attr-defined]
            procs.append(
                {
                    "pid": info["pid"],
                    "name": info["name"] or "",
                    "cpu": round(info.get("cpu_percent") or 0, 1),
                    "memory": round(info.get("memory_percent") or 0, 1),
                }
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    status_counts = {"total": 0, "running": 0, "sleeping": 0, "zombie": 0}
    for proc in psutil.process_iter(["status"]):
        try:
            s = proc.info["status"]  # type: ignore[attr-defined]
            status_counts["total"] += 1
            if s == psutil.STATUS_RUNNING:
                status_counts["running"] += 1
            elif s == psutil.STATUS_SLEEPING:
                status_counts["sleeping"] += 1
            elif s == psutil.STATUS_ZOMBIE:
                status_counts["zombie"] += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    top_cpu = sorted(procs, key=lambda p: p["cpu"], reverse=True)[:8]
    top_mem = sorted(procs, key=lambda p: p["memory"], reverse=True)[:8]

    # ── Temperatures ─────────────────────────────────────────────
    temps: list[dict] = []
    try:
        sensor_temps = psutil.sensors_temperatures()
        for chip, entries in (sensor_temps or {}).items():
            for entry in entries:
                temps.append(
                    {
                        "label": f"{chip}-{entry.label or 'temp'}",
                        "current": entry.current,
                        "high": entry.high,
                        "critical": entry.critical,
                    }
                )
    except (AttributeError, RuntimeError):
        pass  # sensors_temperatures not available on all platforms

    return {
        "type": "metrics",
        "timestamp": now,
        "cpu": {
            "percent": cpu_percent,
            "perCore": per_core,
            "coreCount": psutil.cpu_count(logical=True) or 1,
            "loadAvg": load_avg,
            "frequency": frequency,
        },
        "memory": {
            "total": mem.total,
            "available": mem.available,
            "used": mem.used,
            "percent": mem.percent,
            "swap": {
                "total": swap.total,
                "used": swap.used,
                "percent": swap.percent,
            },
        },
        "disk": {
            "partitions": partitions,
            "io": disk_io,
        },
        "network": {
            "bytesSent": net.bytes_sent,
            "bytesRecv": net.bytes_recv,
            "packetsSent": net.packets_sent,
            "packetsRecv": net.packets_recv,
            "connections": connections,
        },
        "system": {
            "hostname": uname.node,
            "platform": uname.system.lower(),
            "platformVersion": plat_version,
            "kernelVersion": uname.release,
            "architecture": uname.machine,
            "uptime": int(uptime),
            "bootTime": boot.isoformat(),
            "pythonVersion": sys.version.split()[0],
        },
        "processes": {
            **status_counts,
            "topCpu": top_cpu,
            "topMemory": top_mem,
        },
        "temperatures": temps,
    }


@router.websocket("/ws/metrics")
async def metrics_ws(websocket: WebSocket):
    """Stream system metrics over WebSocket at a 2-second interval."""

    # Auth check — mirrors the pattern in ws.py
    if not await ws_verify_token(websocket):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    logger.info("Metrics WS client connected")

    async def _sender():
        """Push metrics snapshots every INTERVAL_SECONDS."""
        try:
            while True:
                snapshot = await asyncio.to_thread(_collect_metrics)
                await websocket.send_json(snapshot)
                await asyncio.sleep(INTERVAL_SECONDS)
        except (WebSocketDisconnect, RuntimeError):
            pass

    sender_task = asyncio.create_task(_sender())

    try:
        # Listen for client messages (ping/pong)
        while True:
            data = await websocket.receive_json()
            if isinstance(data, dict) and data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        sender_task.cancel()
        try:
            await sender_task
        except asyncio.CancelledError:
            pass
        logger.info("Metrics WS client disconnected")
