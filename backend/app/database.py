"""Async SQLite database access layer (read-only to Overmind DB)."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from typing import Any

from app.config import OVERMIND_DB_PATH


def _row_factory(cursor: sqlite3.Cursor, row: tuple) -> dict[str, Any]:
    """Convert rows to dicts keyed by column name."""
    cols = [col[0] for col in cursor.description]
    return dict(zip(cols, row))


@contextmanager
def get_db():
    """Context manager that yields a read-only DB connection."""
    conn = sqlite3.connect(
        f"file:{OVERMIND_DB_PATH}?mode=ro",
        uri=True,
        timeout=5,
        check_same_thread=False,
    )
    conn.row_factory = _row_factory
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
    finally:
        conn.close()


# ─── Query helpers ───────────────────────────────────────────────

def fetch_all(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Execute SQL and return all rows as dicts."""
    with get_db() as conn:
        return conn.execute(sql, params).fetchall()


def fetch_one(sql: str, params: tuple = ()) -> dict[str, Any] | None:
    """Execute SQL and return a single row or None."""
    with get_db() as conn:
        return conn.execute(sql, params).fetchone()


def parse_json_field(value: str | None) -> Any:
    """Safely parse a JSON text field, returning {} on failure."""
    if not value:
        return {}
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return {}
