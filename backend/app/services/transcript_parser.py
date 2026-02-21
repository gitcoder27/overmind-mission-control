"""OpenClaw session JSONL transcript parser.

OpenClaw session files are JSONL where each line is an event envelope:
  {"type": "session", "sessionId": "...", ...}
  {"type": "model_change", "model": "...", ...}
  {"type": "thinking_level_change", "level": "...", ...}
  {"type": "message", "message": {"role": "user", "content": [...], ...}, ...}

The `message` type contains nested payloads with structured content arrays:
  content: [
    {"type": "text", "text": "Hello"},
    {"type": "thinking", "thinking": "..."},
    {"type": "tool_use", "id": "...", "name": "...", "input": {...}},
    {"type": "tool_result", "tool_use_id": "...", "content": "...", "is_error": false},
  ]

This module normalizes raw JSONL into a typed transcript suitable for UI consumption.

v2 enhancements:
  - ``kind`` field: "chat" | "tool_call" | "tool_result" | "event"
  - ``summary``: short preview for tool calls/results
  - ``contentSize``: byte-size of full content (UI can show "12 KB result")
  - ``truncated``: True when content was truncated by maxContentSize
  - ``toolMeta``: structured tool metadata (name, callId, isError)
  - ``toolGroupId``: links paired tool_call → tool_result items
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# Default max content size for truncation (bytes).  Items whose text
# exceeds this are truncated and flagged; the full payload is still
# available via the /raw endpoint.
DEFAULT_MAX_CONTENT_SIZE = 500


# ── Content part types ──────────────────────────────────────────

def _extract_text_from_content(content: Any) -> str:
    """Flatten content to a readable text string for backward compatibility."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                ctype = item.get("type", "")
                if ctype == "text":
                    parts.append(item.get("text", ""))
                elif ctype == "thinking":
                    # Skip thinking in flat text — it's available as a structured part
                    pass
                elif ctype in ("tool_use", "toolCall"):
                    name = item.get("name", item.get("tool", "unknown"))
                    parts.append(f"[Tool call: {name}]")
                elif ctype in ("tool_result", "toolResult"):
                    tr_content = item.get("content", item.get("output", ""))
                    if isinstance(tr_content, str):
                        parts.append(f"[Tool result: {tr_content[:200]}]")
                    elif isinstance(tr_content, list):
                        # Nested content parts in tool results
                        for sub in tr_content:
                            if isinstance(sub, dict) and sub.get("type") == "text":
                                parts.append(f"[Tool result: {sub.get('text', '')[:200]}]")
                    else:
                        parts.append("[Tool result]")
        return "\n".join(parts)
    return str(content) if content else ""


def _normalize_content_parts(content: Any) -> list[dict]:
    """Normalize content into a list of structured content parts."""
    if isinstance(content, str):
        return [{"type": "text", "text": content}]

    if isinstance(content, list):
        parts: list[dict] = []
        for item in content:
            if isinstance(item, str):
                parts.append({"type": "text", "text": item})
            elif isinstance(item, dict):
                ctype = item.get("type", "text")
                if ctype == "text":
                    parts.append({
                        "type": "text",
                        "text": item.get("text", ""),
                    })
                elif ctype == "thinking":
                    parts.append({
                        "type": "thinking",
                        "text": item.get("thinking", item.get("text", "")),
                    })
                elif ctype in ("tool_use", "toolCall"):
                    parts.append({
                        "type": "tool_use",
                        "toolCallId": item.get("id", item.get("toolCallId", "")),
                        "toolName": item.get("name", item.get("tool", "unknown")),
                        "input": item.get("input", item.get("arguments", item.get("args", {}))),
                    })
                elif ctype in ("tool_result", "toolResult"):
                    raw_content = item.get("content", item.get("output", ""))
                    result_text = raw_content if isinstance(raw_content, str) else json.dumps(raw_content)
                    parts.append({
                        "type": "tool_result",
                        "toolCallId": item.get("tool_use_id", item.get("toolCallId", "")),
                        "text": result_text,
                        "isError": item.get("is_error", item.get("isError", False)),
                    })
                else:
                    # Unknown content type — pass through
                    parts.append({
                        "type": ctype,
                        "text": json.dumps(item),
                    })
        return parts if parts else [{"type": "text", "text": ""}]

    if content is None:
        return [{"type": "text", "text": ""}]

    return [{"type": "text", "text": str(content)}]


# ── v2 enrichment helpers ───────────────────────────────────────


def _derive_kind(event_type: str, role: str | None, content_parts: list[dict]) -> str:
    """Derive the high-level ``kind`` for a transcript item.

    Returns one of: "chat", "tool_call", "tool_result", "event".
    """
    if event_type != "message":
        return "event"

    has_tool_use = any(p.get("type") == "tool_use" for p in content_parts)
    has_tool_result = any(p.get("type") == "tool_result" for p in content_parts)

    # If the message contains only tool_result parts, classify as tool_result
    if has_tool_result and not has_tool_use:
        return "tool_result"
    # If the message contains tool_use parts (possibly alongside text/thinking)
    if has_tool_use:
        return "tool_call"
    # Messages with toolResult/tool role are tool results even if content
    # parts are plain text (OpenClaw puts toolCallId at the message level)
    if role in ("toolResult", "tool"):
        return "tool_result"
    return "chat"


def _derive_summary(kind: str, content_parts: list[dict], content_text: str) -> str:
    """Generate a short human-readable summary for quick scanning.

    Chat messages get first ~120 chars; tool calls/results get a descriptive one-liner.
    """
    if kind == "tool_call":
        tool_names = [p["toolName"] for p in content_parts if p.get("type") == "tool_use"]
        label = ", ".join(tool_names) if tool_names else "tool call"
        # Include first bit of input for context
        for p in content_parts:
            if p.get("type") == "tool_use":
                inp = p.get("input", {})
                if isinstance(inp, dict):
                    # Take first key=value pair for context
                    for k, v in inp.items():
                        snippet = str(v)[:60]
                        return f"⚡ {label}  →  {k}={snippet}"
                elif isinstance(inp, str) and inp:
                    return f"⚡ {label}  →  {inp[:60]}"
        return f"⚡ {label}"

    if kind == "tool_result":
        for p in content_parts:
            if p.get("type") == "tool_result":
                is_err = p.get("isError", False)
                text = p.get("text", "")
                size_label = _human_size(len(text))
                if is_err:
                    return f"✗ Error ({size_label}): {text[:80]}"
                return f"✓ Result ({size_label}): {text[:80]}"
        return "✓ Result"

    if kind == "event":
        return content_text[:120] if content_text else "[event]"

    # Chat
    return content_text[:120] if content_text else ""


def _derive_tool_meta(kind: str, content_parts: list[dict]) -> dict | None:
    """Extract structured tool metadata for tool_call / tool_result items."""
    if kind == "tool_call":
        for p in content_parts:
            if p.get("type") == "tool_use":
                return {
                    "toolName": p.get("toolName", "unknown"),
                    "toolCallId": p.get("toolCallId", ""),
                    "status": "called",
                }
    if kind == "tool_result":
        for p in content_parts:
            if p.get("type") == "tool_result":
                return {
                    "toolName": None,  # Will be filled during grouping
                    "toolCallId": p.get("toolCallId", ""),
                    "isError": p.get("isError", False),
                    "status": "error" if p.get("isError") else "success",
                }
    return None


def _compute_content_size(content_parts: list[dict]) -> int:
    """Compute total byte size of all content part text."""
    total = 0
    for p in content_parts:
        text = p.get("text", "")
        if isinstance(text, str):
            total += len(text.encode("utf-8", errors="replace"))
        inp = p.get("input")
        if inp is not None:
            s = inp if isinstance(inp, str) else json.dumps(inp)
            total += len(s.encode("utf-8", errors="replace"))
    return total


def _human_size(size: int) -> str:
    """Format byte count as human-readable string."""
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024 * 1024):.1f} MB"


def _truncate_content_parts(
    content_parts: list[dict],
    max_size: int,
) -> tuple[list[dict], bool]:
    """Truncate large text in tool_result parts beyond *max_size* bytes.

    Returns (new_parts_list, was_truncated).
    """
    truncated = False
    result: list[dict] = []
    for p in content_parts:
        if p.get("type") == "tool_result":
            text = p.get("text", "")
            if isinstance(text, str) and len(text) > max_size:
                truncated = True
                result.append({**p, "text": text[:max_size]})
                continue
        elif p.get("type") == "tool_use":
            inp = p.get("input")
            if isinstance(inp, str) and len(inp) > max_size:
                truncated = True
                result.append({**p, "input": inp[:max_size]})
                continue
            elif isinstance(inp, dict):
                s = json.dumps(inp)
                if len(s) > max_size:
                    truncated = True
                    result.append({**p, "input": s[:max_size]})
                    continue
        result.append(p)
    return result, truncated


def _assign_tool_groups(items: list[dict]) -> list[dict]:
    """Assign ``toolGroupId`` to pair tool_call → tool_result items.

    Uses toolCallId matching: a tool_result with a given toolCallId is paired
    with the preceding tool_call that produced that callId.
    """
    # Map toolCallId → group id (we use the toolCallId itself as group id)
    call_id_map: dict[str, str] = {}
    for item in items:
        kind = item.get("kind")
        if kind == "tool_call":
            for p in item.get("contentParts", []):
                if p.get("type") == "tool_use" and p.get("toolCallId"):
                    group_id = p["toolCallId"]
                    call_id_map[group_id] = group_id
                    item["toolGroupId"] = group_id
                    break
        elif kind == "tool_result":
            tm = item.get("toolMeta") or {}
            call_id = tm.get("toolCallId", "")
            if not call_id:
                for p in item.get("contentParts", []):
                    if p.get("type") == "tool_result" and p.get("toolCallId"):
                        call_id = p["toolCallId"]
                        break
            if call_id and call_id in call_id_map:
                item["toolGroupId"] = call_id_map[call_id]
                # Back-fill tool name from the call
                if item.get("toolMeta") and item["toolMeta"].get("toolName") is None:
                    # Find the call item to copy the name
                    for prev in items:
                        if prev.get("toolGroupId") == call_id and prev.get("kind") == "tool_call":
                            prev_meta = prev.get("toolMeta") or {}
                            item["toolMeta"]["toolName"] = prev_meta.get("toolName")
                            break
    return items


def _normalize_timestamp(value: Any) -> str | None:
    """Normalize a timestamp from various formats to ISO-8601."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        # Milliseconds epoch
        if value > 1e12:
            return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.isdigit():
            ts = int(raw)
            if ts > 1e12:
                return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).isoformat()
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        return raw
    return None


def _extract_usage(msg: dict) -> dict | None:
    """Extract token usage info from a message envelope."""
    usage = msg.get("usage", msg.get("tokenUsage", None))
    if usage and isinstance(usage, dict):
        return {
            "inputTokens": usage.get("input_tokens", usage.get("inputTokens", usage.get("prompt_tokens", 0))),
            "outputTokens": usage.get("output_tokens", usage.get("outputTokens", usage.get("completion_tokens", 0))),
            "cacheReadTokens": usage.get("cache_read_input_tokens", usage.get("cacheReadTokens", 0)),
            "cacheCreationTokens": usage.get("cache_creation_input_tokens", usage.get("cacheCreationTokens", 0)),
        }
    # Legacy single token count
    token_count = msg.get("tokenCount", msg.get("token_count", msg.get("tokens", None)))
    if token_count is not None:
        return {"inputTokens": 0, "outputTokens": int(token_count), "cacheReadTokens": 0, "cacheCreationTokens": 0}
    return None


# ── Main parser ─────────────────────────────────────────────────

def parse_envelope_line(line_data: dict, index: int) -> dict | None:
    """Parse a single JSONL envelope line into a normalized transcript item.

    Returns a dict with the shape:
    {
        "index": int,
        "eventType": str,         # "message" | "model_change" | "thinking_level_change" | "session" | ...
        "timestamp": str | None,  # ISO-8601
        "role": str | None,       # "user" | "assistant" | "system" | "tool" | None
        "contentText": str,       # Flattened text for backward compat / search
        "contentParts": [...],    # Structured content parts
        "usage": {...} | None,    # Token usage
        "model": str | None,      # Model used (from model_change or message)
        "metadata": {...},        # Extra fields depending on event type
    }
    """
    event_type = line_data.get("type", "unknown")
    timestamp = _normalize_timestamp(
        line_data.get("timestamp", line_data.get("created_at", line_data.get("createdAt")))
    )

    if event_type == "message":
        msg = line_data.get("message", line_data)
        role = msg.get("role", "user")
        raw_content = msg.get("content", msg.get("text", ""))
        content_text = _extract_text_from_content(raw_content)
        content_parts = _normalize_content_parts(raw_content)
        usage = _extract_usage(msg) or _extract_usage(line_data)
        model = msg.get("model", line_data.get("model"))

        # If content is all empty and we have tool_calls at message level
        tool_calls = msg.get("tool_calls", [])
        if tool_calls and isinstance(tool_calls, list):
            for tc in tool_calls:
                if isinstance(tc, dict):
                    content_parts.append({
                        "type": "tool_use",
                        "toolCallId": tc.get("id", ""),
                        "toolName": tc.get("function", {}).get("name", tc.get("name", "unknown")),
                        "input": tc.get("function", {}).get("arguments", tc.get("input", {})),
                    })
                    if not content_text:
                        name = tc.get("function", {}).get("name", tc.get("name", "unknown"))
                        content_text = f"[Tool call: {name}]"

        # Handle OpenClaw toolResult role: tool results arrive as
        # messages with role="toolResult" and toolCallId/toolName at
        # the message level, but the content array is plain text.
        # Convert text content parts into proper tool_result parts.
        if role == "toolResult":
            tool_call_id = msg.get("toolCallId", msg.get("tool_call_id", ""))
            tool_name = msg.get("toolName", msg.get("tool_name"))
            is_error = msg.get("isError", msg.get("is_error", False))
            # Collect all text from content parts into a single tool result
            result_text = "\n".join(
                p.get("text", "") for p in content_parts if p.get("type") == "text"
            )
            content_parts = [{
                "type": "tool_result",
                "toolCallId": tool_call_id,
                "text": result_text,
                "isError": is_error,
            }]
            content_text = f"[Tool result: {result_text[:200]}]" if result_text else "[Tool result]"
            # Normalize role to "tool" for consistent frontend handling
            role = "tool"

        result = {
            "index": index,
            "eventType": "message",
            "timestamp": timestamp,
            "role": role,
            "contentText": content_text,
            "contentParts": content_parts,
            "usage": usage,
            "model": model,
            "metadata": {},
            # v2 fields
            "kind": _derive_kind("message", role, content_parts),
            "summary": "",
            "contentSize": _compute_content_size(content_parts),
            "truncated": False,
            "toolMeta": None,
            "toolGroupId": None,
        }

        # Enrich summary and toolMeta now that kind is known
        result["summary"] = _derive_summary(result["kind"], content_parts, content_text)
        result["toolMeta"] = _derive_tool_meta(result["kind"], content_parts)
        # Backfill toolName from message-level metadata if not in content parts
        if result["toolMeta"] and result["toolMeta"].get("toolName") is None:
            result["toolMeta"]["toolName"] = msg.get("toolName", msg.get("tool_name"))
        return result

    elif event_type == "model_change":
        model = line_data.get("model", line_data.get("newModel", ""))
        old_model = line_data.get("oldModel", line_data.get("previousModel", ""))
        ct = f"Model changed: {old_model} → {model}" if old_model else f"Model set: {model}"
        return {
            "index": index,
            "eventType": "model_change",
            "timestamp": timestamp,
            "role": None,
            "contentText": ct,
            "contentParts": [{"type": "text", "text": ct}],
            "usage": None,
            "model": model,
            "metadata": {"oldModel": old_model, "newModel": model},
            "kind": "event",
            "summary": ct[:120],
            "contentSize": len(ct),
            "truncated": False,
            "toolMeta": None,
            "toolGroupId": None,
        }

    elif event_type == "thinking_level_change":
        level = line_data.get("level", line_data.get("thinkingLevel", ""))
        old_level = line_data.get("oldLevel", line_data.get("previousLevel", ""))
        ct = f"Thinking level: {old_level} → {level}" if old_level else f"Thinking level: {level}"
        return {
            "index": index,
            "eventType": "thinking_level_change",
            "timestamp": timestamp,
            "role": None,
            "contentText": ct,
            "contentParts": [{"type": "text", "text": ct}],
            "usage": None,
            "model": None,
            "metadata": {"oldLevel": old_level, "newLevel": level},
            "kind": "event",
            "summary": ct[:120],
            "contentSize": len(ct),
            "truncated": False,
            "toolMeta": None,
            "toolGroupId": None,
        }

    elif event_type == "session":
        session_id = line_data.get("sessionId", line_data.get("session_id", ""))
        ct = f"Session started: {session_id}" if session_id else "Session started"
        return {
            "index": index,
            "eventType": "session",
            "timestamp": timestamp,
            "role": None,
            "contentText": ct,
            "contentParts": [{"type": "text", "text": ct}],
            "usage": None,
            "model": line_data.get("model"),
            "metadata": {"sessionId": session_id},
            "kind": "event",
            "summary": ct[:120],
            "contentSize": len(ct),
            "truncated": False,
            "toolMeta": None,
            "toolGroupId": None,
        }

    else:
        # Generic event — pass through with best-effort extraction
        content = line_data.get("content", line_data.get("text", line_data.get("message", "")))
        content_text = content if isinstance(content, str) else json.dumps(content) if content else f"[{event_type} event]"
        return {
            "index": index,
            "eventType": event_type,
            "timestamp": timestamp,
            "role": line_data.get("role"),
            "contentText": content_text,
            "contentParts": [{"type": "text", "text": content_text}],
            "usage": None,
            "model": line_data.get("model"),
            "metadata": {"raw_type": event_type},
            "kind": "event",
            "summary": content_text[:120] if content_text else f"[{event_type}]",
            "contentSize": len(content_text) if content_text else 0,
            "truncated": False,
            "toolMeta": None,
            "toolGroupId": None,
        }


def parse_jsonl_transcript(
    raw_text: str,
    *,
    include_events: bool = True,
    include_thinking: bool = True,
    limit: int | None = None,
    offset: int = 0,
    max_content_size: int | None = None,
) -> dict:
    """Parse raw session JSONL text into a normalized transcript.

    Args:
        raw_text: Raw JSONL text from session file.
        include_events: Include non-message events (model_change, etc.).
        include_thinking: Include thinking content parts.
        limit: Max items to return (pagination).
        offset: Skip N items (pagination).
        max_content_size: Truncate tool result/input text beyond this many
            characters.  ``None`` means no truncation (full payload returned).

    Returns:
    {
        "items": [...],
        "totalEvents": int,
        "messageCount": int,
        "hasMore": bool,
        "sessionId": str | None,
        "model": str | None,
        "parseErrors": int,
        "toolCallCount": int,
    }
    """
    lines = raw_text.strip().split("\n") if raw_text.strip() else []
    all_items: list[dict] = []
    session_id: str | None = None
    model: str | None = None
    message_count = 0
    tool_call_count = 0
    parse_errors = 0

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError:
            parse_errors += 1
            logger.debug("Skipping malformed JSONL line %d", i)
            continue

        if not isinstance(data, dict):
            parse_errors += 1
            continue

        item = parse_envelope_line(data, i)
        if item is None:
            continue

        # Track session metadata
        if item["eventType"] == "session" and item["metadata"].get("sessionId"):
            session_id = item["metadata"]["sessionId"]
        if item.get("model"):
            model = item["model"]
        if item["eventType"] == "message":
            message_count += 1
        if item.get("kind") == "tool_call":
            tool_call_count += 1

        # Filter by include_events
        if not include_events and item["eventType"] != "message":
            continue

        # Filter out thinking parts if not requested
        if not include_thinking and item.get("contentParts"):
            item["contentParts"] = [
                p for p in item["contentParts"] if p.get("type") != "thinking"
            ]

        # Apply truncation to tool payloads
        if max_content_size is not None and item.get("kind") in ("tool_call", "tool_result"):
            parts, was_truncated = _truncate_content_parts(
                item["contentParts"], max_content_size,
            )
            if was_truncated:
                item["contentParts"] = parts
                item["truncated"] = True

        all_items.append(item)

    # Assign tool group ids (links call→result pairs)
    _assign_tool_groups(all_items)

    total = len(all_items)
    # Apply pagination
    paginated = all_items[offset:]
    if limit is not None:
        paginated = paginated[:limit]

    return {
        "items": paginated,
        "totalEvents": total,
        "messageCount": message_count,
        "hasMore": (offset + len(paginated)) < total,
        "sessionId": session_id,
        "model": model,
        "parseErrors": parse_errors,
        "toolCallCount": tool_call_count,
    }


def parse_legacy_messages(messages: list[dict]) -> list[dict]:
    """Convert simple message dicts ({role, content, ...}) to backward-compatible format.

    Used when session data is in plain JSON (not OpenClaw JSONL envelopes).
    """
    result = []
    for i, msg in enumerate(messages):
        role = msg.get("role", "user")
        raw_content = msg.get("content", msg.get("text", ""))
        result.append({
            "role": role,
            "content": _extract_text_from_content(raw_content),
            "timestamp": _normalize_timestamp(msg.get("timestamp", msg.get("created_at"))),
            "tokenCount": msg.get("tokenCount", msg.get("token_count", msg.get("tokens", None))),
        })
    return result
