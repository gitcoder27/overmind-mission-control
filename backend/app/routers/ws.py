"""WebSocket endpoint with event-cursor watcher and broadcast-on-change."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.snapshot import build_snapshot, snapshot_hash
from app.auth import ws_verify_token
from app.database import fetch_all, fetch_one

router = APIRouter()
logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts updates."""

    def __init__(self):
        self.active: list[WebSocket] = []
        self._seq: int = 0
        self._seq_lock = threading.Lock()
        self._last_hash: str = ""
        self._last_snapshot: dict[str, Any] | None = None
        self._poll_task: asyncio.Task | None = None
        self._event_cursor_task: asyncio.Task | None = None
        self._last_event_cursor: int = 0

    def _next_seq(self) -> int:
        """Return a monotonically-increasing sequence number (thread-safe)."""
        with self._seq_lock:
            self._seq += 1
            return self._seq

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        logger.info("WS client connected (%d total)", len(self.active))
        # Send immediate snapshot
        snap = await build_snapshot()
        self._last_snapshot = snap.model_dump()
        self._last_hash = snapshot_hash(snap)
        await self._send(ws, "SNAPSHOT", self._last_snapshot)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        logger.info("WS client disconnected (%d remaining)", len(self.active))

    async def _send(self, ws: WebSocket, msg_type: str, payload: Any = None):
        msg = {
            "type": msg_type,
            "seq": self._next_seq(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        try:
            await ws.send_json(msg)
        except Exception:
            self.disconnect(ws)

    async def broadcast(self, msg_type: str, payload: Any = None):
        """Broadcast a message to all connected clients."""
        seq = self._next_seq()
        msg = {
            "type": msg_type,
            "seq": seq,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        dead: list[WebSocket] = []
        for ws in self.active:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def start_event_cursor_watcher(self, interval: float = 2.0):
        """Watch the event_log table for new events and broadcast them individually.

        This provides granular real-time updates without full snapshot rebuilds.
        """
        # Initialize cursor to latest event
        try:
            row = fetch_one("SELECT MAX(ROWID) as max_id FROM events")
            if row and row["max_id"]:
                self._last_event_cursor = int(row["max_id"])
        except Exception:
            pass

        while True:
            await asyncio.sleep(interval)
            if not self.active:
                continue
            try:
                new_events = fetch_all(
                    "SELECT ROWID, * FROM events WHERE ROWID > ? ORDER BY ROWID ASC LIMIT 50",
                    (self._last_event_cursor,),
                )
                for evt in new_events:
                    self._last_event_cursor = int(evt.get("rowid", evt.get("ROWID", self._last_event_cursor)))
                    event_type = evt.get("event_type", "EVENT_NEW")
                    payload_raw = evt.get("payload_json", "{}")
                    try:
                        payload_data = json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw
                    except (json.JSONDecodeError, TypeError):
                        payload_data = {}

                    # Map to granular WS event types
                    ws_type = self._map_event_type(event_type)
                    broadcast_payload = {
                        "eventId": evt.get("id"),
                        "eventType": event_type,
                        "projectId": evt.get("project_id"),
                        "taskId": evt.get("task_id"),
                        "level": evt.get("level", "INFO"),
                        **payload_data,
                    }
                    await self.broadcast(ws_type, broadcast_payload)
            except Exception:
                logger.exception("Event cursor watcher error")

    @staticmethod
    def _map_event_type(event_type: str) -> str:
        """Map DB event types to granular WS event types."""
        mapping = {
            "TASK_STATUS_CHANGED": "TASK_STATUS_CHANGED",
            "TASK_CREATED": "TASK_CREATED",
            "ATTEMPT_STARTED": "ATTEMPT_STARTED",
            "ATTEMPT_COMPLETED": "ATTEMPT_COMPLETED",
            "PROJECT_TRANSITION": "PROJECT_TRANSITION",
            "ALERT_TRIGGERED": "ALERT_TRIGGERED",
            "SYSTEM_HEARTBEAT": "SYSTEM_HEARTBEAT",
        }
        return mapping.get(event_type, "EVENT_NEW")

    async def start_poll_loop(self, interval: float = 30.0):
        """Background task: poll snapshot every N seconds as heartbeat.

        Interval increased to 30s since individual events are now pushed
        by the event-cursor watcher. This serves as a fallback heartbeat.
        """
        while True:
            await asyncio.sleep(interval)
            if not self.active:
                continue
            try:
                snap = await build_snapshot()
                h = snapshot_hash(snap)
                if h != self._last_hash:
                    self._last_hash = h
                    self._last_snapshot = snap.model_dump()
                    await self.broadcast("SNAPSHOT", self._last_snapshot)
            except Exception:
                logger.exception("Snapshot poll error")

    def ensure_poll_loop(self):
        """Start the poll loop and event cursor watcher if not already running."""
        if self._poll_task is None or self._poll_task.done():
            loop = asyncio.get_event_loop()
            self._poll_task = loop.create_task(self.start_poll_loop())
        if self._event_cursor_task is None or self._event_cursor_task.done():
            loop = asyncio.get_event_loop()
            self._event_cursor_task = loop.create_task(self.start_event_cursor_watcher())


manager = ConnectionManager()


@router.websocket("/ws/v1/live")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket endpoint for live dashboard updates."""
    # Check auth token from query params
    if not await ws_verify_token(ws):
        await ws.close(code=4001, reason="Unauthorized")
        return
    await manager.connect(ws)
    manager.ensure_poll_loop()
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            msg_type = data.get("type", "")
            if msg_type == "PING":
                await manager._send(ws, "PONG")
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)
