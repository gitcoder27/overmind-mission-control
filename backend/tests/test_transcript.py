"""Tests for the OpenClaw JSONL transcript parser and transcript endpoint.

Covers:
- Envelope JSONL parsing with nested message payloads
- Content part normalization (text, thinking, tool_use, tool_result)
- Model change / thinking level change events
- Malformed line tolerance
- Legacy message format backward compatibility
- Transcript endpoint integration
"""

from __future__ import annotations

import json
import textwrap
from unittest.mock import patch, AsyncMock
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.transcript_parser import (
    parse_envelope_line,
    parse_jsonl_transcript,
    parse_legacy_messages,
    _extract_text_from_content,
    _normalize_content_parts,
    _normalize_timestamp,
    _derive_kind,
    _derive_summary,
    _derive_tool_meta,
    _compute_content_size,
    _truncate_content_parts,
    _assign_tool_groups,
    _human_size,
    DEFAULT_MAX_CONTENT_SIZE,
)

client = TestClient(app)


# ── Unit tests: transcript parser ────────────────────────────────


class TestExtractTextFromContent:
    def test_string_content(self):
        assert _extract_text_from_content("hello world") == "hello world"

    def test_list_with_text_parts(self):
        content = [
            {"type": "text", "text": "Hello"},
            {"type": "text", "text": "World"},
        ]
        assert _extract_text_from_content(content) == "Hello\nWorld"

    def test_list_with_thinking_excluded(self):
        content = [
            {"type": "thinking", "thinking": "internal reasoning"},
            {"type": "text", "text": "Visible answer"},
        ]
        result = _extract_text_from_content(content)
        assert "Visible answer" in result
        assert "internal reasoning" not in result

    def test_list_with_tool_use(self):
        content = [{"type": "tool_use", "name": "read_file", "id": "t1", "input": {"path": "/a"}}]
        result = _extract_text_from_content(content)
        assert "read_file" in result

    def test_list_with_tool_result(self):
        content = [{"type": "tool_result", "tool_use_id": "t1", "content": "file contents here"}]
        result = _extract_text_from_content(content)
        assert "file contents" in result

    def test_none_content(self):
        assert _extract_text_from_content(None) == ""

    def test_string_list_items(self):
        content = ["Hello", "World"]
        assert _extract_text_from_content(content) == "Hello\nWorld"


class TestNormalizeContentParts:
    def test_string_becomes_text_part(self):
        parts = _normalize_content_parts("hello")
        assert len(parts) == 1
        assert parts[0] == {"type": "text", "text": "hello"}

    def test_text_part(self):
        parts = _normalize_content_parts([{"type": "text", "text": "hi"}])
        assert parts[0]["type"] == "text"
        assert parts[0]["text"] == "hi"

    def test_thinking_part(self):
        parts = _normalize_content_parts([{"type": "thinking", "thinking": "reasoning"}])
        assert parts[0]["type"] == "thinking"
        assert parts[0]["text"] == "reasoning"

    def test_tool_use_part(self):
        parts = _normalize_content_parts([{
            "type": "tool_use",
            "id": "tc_1",
            "name": "grep_search",
            "input": {"query": "test"},
        }])
        assert parts[0]["type"] == "tool_use"
        assert parts[0]["toolName"] == "grep_search"
        assert parts[0]["toolCallId"] == "tc_1"
        assert parts[0]["input"] == {"query": "test"}

    def test_tool_result_part(self):
        parts = _normalize_content_parts([{
            "type": "tool_result",
            "tool_use_id": "tc_1",
            "content": "result text",
            "is_error": False,
        }])
        assert parts[0]["type"] == "tool_result"
        assert parts[0]["toolCallId"] == "tc_1"
        assert parts[0]["text"] == "result text"
        assert parts[0]["isError"] is False

    def test_none_content(self):
        parts = _normalize_content_parts(None)
        assert len(parts) == 1
        assert parts[0]["type"] == "text"

    def test_unknown_type_passthrough(self):
        parts = _normalize_content_parts([{"type": "image_url", "url": "x"}])
        assert parts[0]["type"] == "image_url"


class TestNormalizeTimestamp:
    def test_none(self):
        assert _normalize_timestamp(None) is None

    def test_epoch_ms(self):
        ts = _normalize_timestamp(1771150413608)
        assert ts is not None
        assert ts.startswith("2026-")

    def test_epoch_seconds(self):
        ts = _normalize_timestamp(1771150413)
        assert ts is not None
        assert "2026" in ts

    def test_iso_string(self):
        ts = _normalize_timestamp("2026-02-15T10:00:00Z")
        assert ts == "2026-02-15T10:00:00Z"

    def test_empty_string(self):
        assert _normalize_timestamp("") is None

    def test_digit_string(self):
        ts = _normalize_timestamp("1771150413608")
        assert ts is not None
        assert ts.startswith("2026-")


class TestParseEnvelopeLine:
    def test_message_with_nested_content(self):
        data = {
            "type": "message",
            "timestamp": 1771150413608,
            "message": {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Here is the answer"},
                    {"type": "thinking", "thinking": "Let me think..."},
                ],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            },
        }
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert result["eventType"] == "message"
        assert result["role"] == "assistant"
        assert "Here is the answer" in result["contentText"]
        assert len(result["contentParts"]) == 2
        assert result["usage"]["inputTokens"] == 100
        assert result["usage"]["outputTokens"] == 50

    def test_message_with_string_content(self):
        data = {
            "type": "message",
            "message": {"role": "user", "content": "What is 2+2?"},
        }
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert result["role"] == "user"
        assert result["contentText"] == "What is 2+2?"

    def test_message_with_tool_calls(self):
        data = {
            "type": "message",
            "message": {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {"id": "tc1", "function": {"name": "read_file", "arguments": '{"path": "/a"}'}}
                ],
            },
        }
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert any(p["type"] == "tool_use" for p in result["contentParts"])
        assert "read_file" in result["contentText"]

    def test_model_change(self):
        data = {
            "type": "model_change",
            "model": "claude-4-opus",
            "oldModel": "gpt-5.3",
            "timestamp": 1771150413608,
        }
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert result["eventType"] == "model_change"
        assert "claude-4-opus" in result["contentText"]
        assert result["model"] == "claude-4-opus"

    def test_thinking_level_change(self):
        data = {"type": "thinking_level_change", "level": "high", "oldLevel": "low"}
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert result["eventType"] == "thinking_level_change"
        assert "high" in result["contentText"]

    def test_session_event(self):
        data = {"type": "session", "sessionId": "sess-abc-123", "model": "gpt-5.3"}
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert result["eventType"] == "session"
        assert "sess-abc-123" in result["contentText"]

    def test_unknown_event_type(self):
        data = {"type": "custom_event", "content": "something happened"}
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert result["eventType"] == "custom_event"


class TestParseJsonlTranscript:
    def _make_jsonl(self, lines: list[dict]) -> str:
        return "\n".join(json.dumps(l) for l in lines)

    def test_full_conversation(self):
        lines = [
            {"type": "session", "sessionId": "s1", "model": "gpt-5.3"},
            {"type": "message", "message": {"role": "system", "content": "You are an assistant."}},
            {"type": "message", "message": {"role": "user", "content": "Hello"}},
            {"type": "message", "message": {"role": "assistant", "content": [
                {"type": "thinking", "thinking": "This is a greeting"},
                {"type": "text", "text": "Hello! How can I help?"},
            ]}},
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines))
        assert result["messageCount"] == 3
        assert result["totalEvents"] == 4  # session + 3 messages
        assert result["sessionId"] == "s1"
        assert result["model"] == "gpt-5.3"
        assert len(result["items"]) == 4

    def test_exclude_events(self):
        lines = [
            {"type": "session", "sessionId": "s1"},
            {"type": "model_change", "model": "claude-4"},
            {"type": "message", "message": {"role": "user", "content": "Hi"}},
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines), include_events=False)
        assert len(result["items"]) == 1
        assert result["items"][0]["role"] == "user"

    def test_exclude_thinking(self):
        lines = [
            {"type": "message", "message": {"role": "assistant", "content": [
                {"type": "thinking", "thinking": "secret"},
                {"type": "text", "text": "visible"},
            ]}},
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines), include_thinking=False)
        parts = result["items"][0]["contentParts"]
        assert not any(p["type"] == "thinking" for p in parts)
        assert any(p["type"] == "text" for p in parts)

    def test_pagination(self):
        lines = [
            {"type": "message", "message": {"role": "user", "content": f"msg-{i}"}}
            for i in range(10)
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines), limit=3, offset=2)
        assert len(result["items"]) == 3
        assert result["items"][0]["contentText"] == "msg-2"
        assert result["hasMore"] is True

    def test_malformed_lines_skipped(self):
        raw = '{"type":"message","message":{"role":"user","content":"ok"}}\nnot valid json\n{"type":"message","message":{"role":"assistant","content":"yes"}}'
        result = parse_jsonl_transcript(raw)
        assert result["messageCount"] == 2
        assert result["parseErrors"] == 1

    def test_empty_input(self):
        result = parse_jsonl_transcript("")
        assert result["items"] == []
        assert result["messageCount"] == 0
        assert result["totalEvents"] == 0

    def test_tool_use_and_result(self):
        lines = [
            {"type": "message", "message": {"role": "assistant", "content": [
                {"type": "text", "text": "Let me check the file."},
                {"type": "tool_use", "id": "tc1", "name": "read_file", "input": {"path": "/test.py"}},
            ]}},
            {"type": "message", "message": {"role": "tool", "content": [
                {"type": "tool_result", "tool_use_id": "tc1", "content": "file contents...", "is_error": False},
            ]}},
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines))
        assert result["messageCount"] == 2
        # First message should have text + tool_use parts
        parts0 = result["items"][0]["contentParts"]
        assert any(p["type"] == "tool_use" for p in parts0)
        # Second message should have tool_result
        parts1 = result["items"][1]["contentParts"]
        assert any(p["type"] == "tool_result" for p in parts1)


class TestParseLegacyMessages:
    def test_basic_messages(self):
        messages = [
            {"role": "user", "content": "Hello", "timestamp": "2026-02-15T10:00:00Z"},
            {"role": "assistant", "content": "Hi!", "tokenCount": 5},
        ]
        result = parse_legacy_messages(messages)
        assert len(result) == 2
        assert result[0]["role"] == "user"
        assert result[0]["content"] == "Hello"
        assert result[1]["tokenCount"] == 5

    def test_missing_fields_default(self):
        messages = [{"text": "fallback"}]
        result = parse_legacy_messages(messages)
        assert result[0]["role"] == "user"
        assert result[0]["content"] == "fallback"


# ── v2 enrichment unit tests ────────────────────────────────────


class TestDeriveKind:
    def test_chat_message(self):
        parts = [{"type": "text", "text": "hello"}]
        assert _derive_kind("message", "user", parts) == "chat"

    def test_tool_call_message(self):
        parts = [
            {"type": "text", "text": "Let me check"},
            {"type": "tool_use", "toolName": "read_file", "toolCallId": "tc1"},
        ]
        assert _derive_kind("message", "assistant", parts) == "tool_call"

    def test_tool_result_message(self):
        parts = [{"type": "tool_result", "toolCallId": "tc1", "text": "contents"}]
        assert _derive_kind("message", "tool", parts) == "tool_result"

    def test_event(self):
        parts = [{"type": "text", "text": "session started"}]
        assert _derive_kind("session", None, parts) == "event"

    def test_mixed_tool_use_and_result_prefers_call(self):
        """When both tool_use and tool_result are present, classify as tool_call."""
        parts = [
            {"type": "tool_use", "toolName": "x"},
            {"type": "tool_result", "toolCallId": "y"},
        ]
        assert _derive_kind("message", "assistant", parts) == "tool_call"


class TestDeriveSummary:
    def test_chat_summary_truncated(self):
        text = "A" * 200
        summary = _derive_summary("chat", [], text)
        assert len(summary) == 120

    def test_tool_call_summary(self):
        parts = [{"type": "tool_use", "toolName": "grep_search", "input": {"query": "hello"}}]
        summary = _derive_summary("tool_call", parts, "")
        assert "grep_search" in summary
        assert "query=hello" in summary

    def test_tool_result_success(self):
        parts = [{"type": "tool_result", "toolCallId": "tc1", "text": "found it", "isError": False}]
        summary = _derive_summary("tool_result", parts, "")
        assert "Result" in summary
        assert "found it" in summary

    def test_tool_result_error(self):
        parts = [{"type": "tool_result", "toolCallId": "tc1", "text": "not found", "isError": True}]
        summary = _derive_summary("tool_result", parts, "")
        assert "Error" in summary

    def test_event_summary(self):
        summary = _derive_summary("event", [], "Model changed: a → b")
        assert "Model changed" in summary


class TestDeriveToolMeta:
    def test_tool_call_meta(self):
        parts = [{"type": "tool_use", "toolName": "read_file", "toolCallId": "tc1"}]
        meta = _derive_tool_meta("tool_call", parts)
        assert meta is not None
        assert meta["toolName"] == "read_file"
        assert meta["toolCallId"] == "tc1"
        assert meta["status"] == "called"

    def test_tool_result_meta_success(self):
        parts = [{"type": "tool_result", "toolCallId": "tc1", "isError": False}]
        meta = _derive_tool_meta("tool_result", parts)
        assert meta is not None
        assert meta["status"] == "success"
        assert meta["isError"] is False

    def test_tool_result_meta_error(self):
        parts = [{"type": "tool_result", "toolCallId": "tc1", "isError": True}]
        meta = _derive_tool_meta("tool_result", parts)
        assert meta is not None
        assert meta["status"] == "error"
        assert meta["isError"] is True

    def test_chat_returns_none(self):
        parts = [{"type": "text", "text": "hello"}]
        assert _derive_tool_meta("chat", parts) is None


class TestComputeContentSize:
    def test_text_part(self):
        parts = [{"type": "text", "text": "hello"}]
        assert _compute_content_size(parts) == 5

    def test_tool_use_includes_input(self):
        parts = [{"type": "tool_use", "toolName": "read_file", "input": {"path": "/a/b"}}]
        size = _compute_content_size(parts)
        assert size > 0

    def test_empty_parts(self):
        assert _compute_content_size([{"type": "text", "text": ""}]) == 0


class TestHumanSize:
    def test_bytes(self):
        assert _human_size(500) == "500 B"

    def test_kilobytes(self):
        assert "KB" in _human_size(2048)

    def test_megabytes(self):
        assert "MB" in _human_size(2 * 1024 * 1024)


class TestTruncateContentParts:
    def test_no_truncation_needed(self):
        parts = [{"type": "tool_result", "text": "short"}]
        result, truncated = _truncate_content_parts(parts, 100)
        assert truncated is False
        assert result[0]["text"] == "short"

    def test_truncates_large_tool_result(self):
        long_text = "x" * 1000
        parts = [{"type": "tool_result", "text": long_text}]
        result, truncated = _truncate_content_parts(parts, 500)
        assert truncated is True
        assert len(result[0]["text"]) == 500

    def test_truncates_large_tool_input_string(self):
        parts = [{"type": "tool_use", "toolName": "x", "input": "a" * 1000}]
        result, truncated = _truncate_content_parts(parts, 200)
        assert truncated is True
        assert len(result[0]["input"]) == 200

    def test_truncates_large_tool_input_dict(self):
        big_dict = {"data": "v" * 1000}
        parts = [{"type": "tool_use", "toolName": "x", "input": big_dict}]
        result, truncated = _truncate_content_parts(parts, 100)
        assert truncated is True
        assert isinstance(result[0]["input"], str)  # Serialized + truncated

    def test_text_parts_not_truncated(self):
        parts = [{"type": "text", "text": "a" * 1000}]
        result, truncated = _truncate_content_parts(parts, 100)
        assert truncated is False
        assert len(result[0]["text"]) == 1000


class TestAssignToolGroups:
    def test_pairs_call_with_result(self):
        items = [
            {"kind": "tool_call", "contentParts": [{"type": "tool_use", "toolCallId": "tc1", "toolName": "read_file"}], "toolMeta": {"toolName": "read_file", "toolCallId": "tc1"}, "toolGroupId": None},
            {"kind": "tool_result", "contentParts": [{"type": "tool_result", "toolCallId": "tc1"}], "toolMeta": {"toolName": None, "toolCallId": "tc1"}, "toolGroupId": None},
        ]
        _assign_tool_groups(items)
        assert items[0]["toolGroupId"] == "tc1"
        assert items[1]["toolGroupId"] == "tc1"
        assert items[1]["toolMeta"]["toolName"] == "read_file"

    def test_unmatched_result_no_group(self):
        items = [
            {"kind": "tool_result", "contentParts": [{"type": "tool_result", "toolCallId": "orphan"}], "toolMeta": {"toolName": None, "toolCallId": "orphan"}, "toolGroupId": None},
        ]
        _assign_tool_groups(items)
        assert items[0]["toolGroupId"] is None

    def test_chat_items_unaffected(self):
        items = [
            {"kind": "chat", "contentParts": [{"type": "text", "text": "hi"}], "toolMeta": None, "toolGroupId": None},
        ]
        _assign_tool_groups(items)
        assert items[0]["toolGroupId"] is None


class TestParseEnvelopeLineV2Fields:
    """Verify that v2 enrichment fields are present on parsed items."""

    def test_chat_message_has_v2_fields(self):
        data = {"type": "message", "message": {"role": "user", "content": "Hello"}}
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert result["kind"] == "chat"
        assert result["summary"] == "Hello"
        assert result["contentSize"] == 5
        assert result["truncated"] is False
        assert result["toolMeta"] is None
        assert result["toolGroupId"] is None

    def test_tool_call_has_v2_fields(self):
        data = {
            "type": "message",
            "message": {
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": "tc1", "name": "grep_search", "input": {"query": "test"}},
                ],
            },
        }
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert result["kind"] == "tool_call"
        assert "grep_search" in result["summary"]
        assert result["toolMeta"]["toolName"] == "grep_search"
        assert result["toolMeta"]["toolCallId"] == "tc1"

    def test_tool_result_has_v2_fields(self):
        data = {
            "type": "message",
            "message": {
                "role": "tool",
                "content": [
                    {"type": "tool_result", "tool_use_id": "tc1", "content": "found 3 matches", "is_error": False},
                ],
            },
        }
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert result["kind"] == "tool_result"
        assert result["toolMeta"]["isError"] is False
        assert result["toolMeta"]["status"] == "success"
        assert result["contentSize"] > 0

    def test_event_has_v2_fields(self):
        data = {"type": "model_change", "model": "claude-4-opus"}
        result = parse_envelope_line(data, 0)
        assert result is not None
        assert result["kind"] == "event"
        assert "claude-4-opus" in result["summary"]
        assert result["toolMeta"] is None


class TestParseJsonlTranscriptV2:
    """Tests for v2 features in the full transcript parser."""

    def _make_jsonl(self, lines: list[dict]) -> str:
        return "\n".join(json.dumps(l) for l in lines)

    def test_tool_call_count(self):
        lines = [
            {"type": "message", "message": {"role": "assistant", "content": [
                {"type": "tool_use", "id": "tc1", "name": "read_file", "input": {"path": "/a"}},
            ]}},
            {"type": "message", "message": {"role": "tool", "content": [
                {"type": "tool_result", "tool_use_id": "tc1", "content": "file data"},
            ]}},
            {"type": "message", "message": {"role": "assistant", "content": [
                {"type": "tool_use", "id": "tc2", "name": "grep_search", "input": {"query": "x"}},
            ]}},
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines))
        assert result["toolCallCount"] == 2

    def test_tool_groups_assigned(self):
        lines = [
            {"type": "message", "message": {"role": "assistant", "content": [
                {"type": "tool_use", "id": "tc1", "name": "read_file", "input": {"path": "/test"}},
            ]}},
            {"type": "message", "message": {"role": "tool", "content": [
                {"type": "tool_result", "tool_use_id": "tc1", "content": "file contents", "is_error": False},
            ]}},
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines))
        items = result["items"]
        assert items[0]["toolGroupId"] == "tc1"
        assert items[1]["toolGroupId"] == "tc1"

    def test_truncation_with_max_content_size(self):
        long_result = "x" * 2000
        lines = [
            {"type": "message", "message": {"role": "tool", "content": [
                {"type": "tool_result", "tool_use_id": "tc1", "content": long_result},
            ]}},
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines), max_content_size=100)
        item = result["items"][0]
        assert item["truncated"] is True
        result_part = item["contentParts"][0]
        assert len(result_part["text"]) == 100

    def test_no_truncation_when_none(self):
        long_result = "x" * 2000
        lines = [
            {"type": "message", "message": {"role": "tool", "content": [
                {"type": "tool_result", "tool_use_id": "tc1", "content": long_result},
            ]}},
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines), max_content_size=None)
        item = result["items"][0]
        assert item["truncated"] is False
        result_part = item["contentParts"][0]
        assert len(result_part["text"]) == 2000

    def test_chat_not_truncated(self):
        long_text = "A" * 2000
        lines = [
            {"type": "message", "message": {"role": "user", "content": long_text}},
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines), max_content_size=100)
        item = result["items"][0]
        assert item["truncated"] is False
        assert item["kind"] == "chat"

    def test_all_items_have_kind(self):
        lines = [
            {"type": "session", "sessionId": "s1"},
            {"type": "message", "message": {"role": "user", "content": "Hi"}},
            {"type": "message", "message": {"role": "assistant", "content": [
                {"type": "tool_use", "id": "tc1", "name": "foo", "input": {}},
            ]}},
            {"type": "model_change", "model": "x"},
        ]
        result = parse_jsonl_transcript(self._make_jsonl(lines))
        for item in result["items"]:
            assert item["kind"] in ("chat", "tool_call", "tool_result", "event")
            assert isinstance(item["summary"], str)
            assert isinstance(item["contentSize"], int)
            assert isinstance(item["truncated"], bool)


# ── Integration: transcript endpoint ────────────────────────────

class TestTranscriptEndpoint:
    def test_unknown_agent_returns_error(self):
        r = client.get("/api/v1/agents/overmind-nonexistent/sessions/any-key/transcript")
        body = r.json()
        assert body["ok"] is False

    def test_missing_session_returns_empty(self):
        r = client.get("/api/v1/agents/overmind-builder/sessions/no-such-session/transcript")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        data = body["data"]
        assert data["items"] == []
        assert data["messageCount"] == 0

    def test_transcript_with_jsonl_file(self, tmp_path):
        """Test transcript endpoint reads a real JSONL session file."""
        jsonl_content = "\n".join([
            json.dumps({"type": "session", "sessionId": "test-sess"}),
            json.dumps({"type": "message", "message": {"role": "user", "content": "Hello"}}),
            json.dumps({"type": "message", "message": {"role": "assistant", "content": [
                {"type": "text", "text": "Hi there!"},
            ]}}),
        ])

        session_key = "test-session-key"
        session_dir = tmp_path / "agents" / "overmind-builder" / "sessions"
        session_dir.mkdir(parents=True)
        (session_dir / f"{session_key}.jsonl").write_text(jsonl_content)

        with patch("app.routers.agents.OPENCLAW_ROOT", tmp_path):
            r = client.get(f"/api/v1/agents/overmind-builder/sessions/{session_key}/transcript")
            assert r.status_code == 200
            body = r.json()
            assert body["ok"] is True
            data = body["data"]
            assert data["messageCount"] == 2
            assert len(data["items"]) == 3  # session + 2 messages
            assert data["items"][1]["role"] == "user"
            assert data["items"][2]["contentText"] == "Hi there!"

    def test_messages_endpoint_backward_compat(self, tmp_path):
        """GET /messages still returns flat message list."""
        jsonl_content = "\n".join([
            json.dumps({"type": "session", "sessionId": "test-sess"}),
            json.dumps({"type": "message", "message": {"role": "user", "content": "Hello"}}),
            json.dumps({"type": "message", "message": {"role": "assistant", "content": [
                {"type": "text", "text": "World"},
            ]}}),
        ])

        session_key = "back-compat-key"
        session_dir = tmp_path / "agents" / "overmind-builder" / "sessions"
        session_dir.mkdir(parents=True)
        (session_dir / f"{session_key}.jsonl").write_text(jsonl_content)

        with patch("app.routers.agents.OPENCLAW_ROOT", tmp_path):
            r = client.get(f"/api/v1/agents/overmind-builder/sessions/{session_key}/messages")
            assert r.status_code == 200
            body = r.json()
            assert body["ok"] is True
            messages = body["data"]
            assert len(messages) == 2  # Only messages, not session event
            assert messages[0]["role"] == "user"
            assert messages[0]["content"] == "Hello"
            assert messages[1]["content"] == "World"
            # Verify backward-compatible shape
            for msg in messages:
                assert "role" in msg
                assert "content" in msg
                assert "timestamp" in msg
                assert "tokenCount" in msg

    def test_transcript_pagination(self, tmp_path):
        """Test limit/offset on transcript endpoint."""
        lines = [json.dumps({"type": "message", "message": {"role": "user", "content": f"msg-{i}"}}) for i in range(10)]
        jsonl_content = "\n".join(lines)

        session_key = "paged-sess"
        session_dir = tmp_path / "agents" / "overmind-builder" / "sessions"
        session_dir.mkdir(parents=True)
        (session_dir / f"{session_key}.jsonl").write_text(jsonl_content)

        with patch("app.routers.agents.OPENCLAW_ROOT", tmp_path):
            r = client.get(f"/api/v1/agents/overmind-builder/sessions/{session_key}/transcript?limit=3&offset=2")
            assert r.status_code == 200
            data = r.json()["data"]
            assert len(data["items"]) == 3
            assert data["items"][0]["contentText"] == "msg-2"
            assert data["hasMore"] is True

    def test_transcript_exclude_events(self, tmp_path):
        """Test includeEvents=false filters non-message events."""
        jsonl_content = "\n".join([
            json.dumps({"type": "session", "sessionId": "s1"}),
            json.dumps({"type": "model_change", "model": "gpt-5"}),
            json.dumps({"type": "message", "message": {"role": "user", "content": "Hi"}}),
        ])

        session_key = "events-sess"
        session_dir = tmp_path / "agents" / "overmind-builder" / "sessions"
        session_dir.mkdir(parents=True)
        (session_dir / f"{session_key}.jsonl").write_text(jsonl_content)

        with patch("app.routers.agents.OPENCLAW_ROOT", tmp_path):
            r = client.get(f"/api/v1/agents/overmind-builder/sessions/{session_key}/transcript?includeEvents=false")
            assert r.status_code == 200
            data = r.json()["data"]
            assert len(data["items"]) == 1
            assert data["items"][0]["role"] == "user"

    def test_transcript_v2_fields_present(self, tmp_path):
        """Verify that v2 enrichment fields appear in API response."""
        jsonl_content = "\n".join([
            json.dumps({"type": "session", "sessionId": "v2-test"}),
            json.dumps({"type": "message", "message": {"role": "user", "content": "Hello"}}),
            json.dumps({"type": "message", "message": {"role": "assistant", "content": [
                {"type": "tool_use", "id": "tc1", "name": "read_file", "input": {"path": "/a"}},
            ]}}),
            json.dumps({"type": "message", "message": {"role": "tool", "content": [
                {"type": "tool_result", "tool_use_id": "tc1", "content": "file data here", "is_error": False},
            ]}}),
        ])

        session_key = "v2-fields"
        session_dir = tmp_path / "agents" / "overmind-builder" / "sessions"
        session_dir.mkdir(parents=True)
        (session_dir / f"{session_key}.jsonl").write_text(jsonl_content)

        with patch("app.routers.agents.OPENCLAW_ROOT", tmp_path):
            r = client.get(f"/api/v1/agents/overmind-builder/sessions/{session_key}/transcript")
            assert r.status_code == 200
            data = r.json()["data"]

            # Check v2 top-level fields
            assert "toolCallCount" in data
            assert data["toolCallCount"] == 1

            # Check each item has v2 fields
            for item in data["items"]:
                assert "kind" in item
                assert "summary" in item
                assert "contentSize" in item
                assert "truncated" in item
                assert "toolGroupId" in item

            # Session event
            assert data["items"][0]["kind"] == "event"

            # User message
            assert data["items"][1]["kind"] == "chat"

            # Tool call
            assert data["items"][2]["kind"] == "tool_call"
            assert data["items"][2]["toolMeta"]["toolName"] == "read_file"
            assert data["items"][2]["toolGroupId"] == "tc1"

            # Tool result (grouped)
            assert data["items"][3]["kind"] == "tool_result"
            assert data["items"][3]["toolGroupId"] == "tc1"

    def test_transcript_max_content_size(self, tmp_path):
        """Verify maxContentSize truncates large tool results."""
        long_result = "x" * 5000
        jsonl_content = "\n".join([
            json.dumps({"type": "message", "message": {"role": "tool", "content": [
                {"type": "tool_result", "tool_use_id": "tc1", "content": long_result},
            ]}}),
        ])

        session_key = "truncate-test"
        session_dir = tmp_path / "agents" / "overmind-builder" / "sessions"
        session_dir.mkdir(parents=True)
        (session_dir / f"{session_key}.jsonl").write_text(jsonl_content)

        with patch("app.routers.agents.OPENCLAW_ROOT", tmp_path):
            # With default maxContentSize (500)
            r = client.get(f"/api/v1/agents/overmind-builder/sessions/{session_key}/transcript")
            data = r.json()["data"]
            item = data["items"][0]
            assert item["truncated"] is True
            result_part = item["contentParts"][0]
            assert len(result_part["text"]) == 500

            # With no truncation
            r = client.get(f"/api/v1/agents/overmind-builder/sessions/{session_key}/transcript?maxContentSize=0")
            data = r.json()["data"]
            item = data["items"][0]
            assert item["truncated"] is False
            result_part = item["contentParts"][0]
            assert len(result_part["text"]) == 5000

    def test_transcript_item_raw_endpoint(self, tmp_path):
        """Test the raw item endpoint returns untruncated content."""
        long_result = "y" * 3000
        jsonl_content = "\n".join([
            json.dumps({"type": "message", "message": {"role": "user", "content": "Hello"}}),
            json.dumps({"type": "message", "message": {"role": "tool", "content": [
                {"type": "tool_result", "tool_use_id": "tc1", "content": long_result},
            ]}}),
        ])

        session_key = "raw-item"
        session_dir = tmp_path / "agents" / "overmind-builder" / "sessions"
        session_dir.mkdir(parents=True)
        (session_dir / f"{session_key}.jsonl").write_text(jsonl_content)

        with patch("app.routers.agents.OPENCLAW_ROOT", tmp_path):
            # Get full item at index 1
            r = client.get(f"/api/v1/agents/overmind-builder/sessions/{session_key}/transcript/item/1")
            assert r.status_code == 200
            item = r.json()["data"]
            assert item["index"] == 1
            assert item["truncated"] is False
            result_part = item["contentParts"][0]
            assert len(result_part["text"]) == 3000

    def test_transcript_item_raw_not_found(self, tmp_path):
        """Test raw item 404 for missing index."""
        jsonl_content = json.dumps({"type": "message", "message": {"role": "user", "content": "Hi"}})

        session_key = "raw-404"
        session_dir = tmp_path / "agents" / "overmind-builder" / "sessions"
        session_dir.mkdir(parents=True)
        (session_dir / f"{session_key}.jsonl").write_text(jsonl_content)

        with patch("app.routers.agents.OPENCLAW_ROOT", tmp_path):
            r = client.get(f"/api/v1/agents/overmind-builder/sessions/{session_key}/transcript/item/99")
            body = r.json()
            assert body["ok"] is False
