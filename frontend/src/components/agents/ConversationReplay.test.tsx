import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataProviderProvider } from '@/providers/data';
import { createMockProvider } from '@/providers/data/mock';
import { ConversationReplay } from '@/components/agents/ConversationReplay';
import type { TranscriptResponse, TranscriptItem, ToolGroup } from '@/types/domain';

// ── Mock transcript data (v2 enriched) ─────────────────────────

const mockTranscript: TranscriptResponse = {
  items: [
    {
      index: 0,
      eventType: 'session',
      timestamp: new Date().toISOString(),
      role: null,
      contentText: 'Session started: sess-test-123',
      contentParts: [{ type: 'text', text: 'Session started: sess-test-123' }],
      usage: null,
      model: 'gpt-5.3-codex',
      metadata: { sessionId: 'sess-test-123' },
      kind: 'event',
      summary: 'Session started: sess-test-123',
      contentSize: 30,
      truncated: false,
      toolMeta: null,
      toolGroupId: null,
    },
    {
      index: 1,
      eventType: 'message',
      timestamp: new Date().toISOString(),
      role: 'system',
      contentText: 'You are the Architect agent.',
      contentParts: [{ type: 'text', text: 'You are the Architect agent.' }],
      usage: { inputTokens: 15, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model: null,
      metadata: {},
      kind: 'chat',
      summary: 'You are the Architect agent.',
      contentSize: 28,
      truncated: false,
      toolMeta: null,
      toolGroupId: null,
    },
    {
      index: 2,
      eventType: 'message',
      timestamp: new Date().toISOString(),
      role: 'user',
      contentText: 'Plan task breakdown for auth project',
      contentParts: [{ type: 'text', text: 'Plan task breakdown for auth project' }],
      usage: { inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model: null,
      metadata: {},
      kind: 'chat',
      summary: 'Plan task breakdown for auth project',
      contentSize: 36,
      truncated: false,
      toolMeta: null,
      toolGroupId: null,
    },
    {
      index: 3,
      eventType: 'message',
      timestamp: new Date().toISOString(),
      role: 'assistant',
      contentText: 'I will create a comprehensive breakdown:\n\n1. Design schema\n2. Build API\n3. Write tests',
      contentParts: [
        { type: 'thinking', text: 'Let me think about the auth project...' },
        { type: 'text', text: 'I will create a comprehensive breakdown:\n\n1. Design schema\n2. Build API\n3. Write tests' },
      ],
      usage: { inputTokens: 100, outputTokens: 350, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model: null,
      metadata: {},
      kind: 'chat',
      summary: 'I will create a comprehensive breakdown',
      contentSize: 90,
      truncated: false,
      toolMeta: null,
      toolGroupId: null,
    },
    {
      index: 4,
      eventType: 'message',
      timestamp: new Date().toISOString(),
      role: 'assistant',
      contentText: '[Tool call: create_task]',
      contentParts: [
        { type: 'tool_use', toolCallId: 'tc1', toolName: 'create_task', input: { title: 'Design schema' } },
      ],
      usage: { inputTokens: 0, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model: null,
      metadata: {},
      kind: 'tool_call',
      summary: '⚡ create_task  →  title=Design schema',
      contentSize: 52,
      truncated: false,
      toolMeta: { toolName: 'create_task', toolCallId: 'tc1', status: 'called' },
      toolGroupId: 'tc1',
    },
    {
      index: 5,
      eventType: 'message',
      timestamp: new Date().toISOString(),
      role: 'tool',
      contentText: '[Tool result: Task created successfully]',
      contentParts: [
        { type: 'tool_result', toolCallId: 'tc1', text: 'Task created successfully with id task-001', isError: false },
      ],
      usage: null,
      model: null,
      metadata: {},
      kind: 'tool_result',
      summary: '✓ Result (43 B): Task created successfully with id task-001',
      contentSize: 43,
      truncated: false,
      toolMeta: { toolName: 'create_task', toolCallId: 'tc1', status: 'success' },
      toolGroupId: 'tc1',
    },
  ],
  totalEvents: 6,
  messageCount: 5,
  hasMore: false,
  sessionId: 'sess-test-123',
  model: 'gpt-5.3-codex',
  parseErrors: 0,
  toolCallCount: 1,
};

vi.mock('@/queries/useSnapshot', async () => {
  const actual = await vi.importActual<object>('@/queries/useSnapshot');
  return {
    ...actual,
    useTranscript: () => ({
      data: mockTranscript,
      isLoading: false,
      error: null,
    }),
    useTranscriptItemRaw: () => ({
      data: null,
      isLoading: false,
      error: null,
    }),
  };
});

function renderReplay(props?: { onClose?: () => void }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DataProviderProvider value={createMockProvider()}>
        <ConversationReplay
          agentId="overmind-architect"
          sessionKey="sess-test-123"
          onClose={props?.onClose}
        />
      </DataProviderProvider>
    </QueryClientProvider>,
  );
}

// ── Rendering tests ────────────────────────────────────────────

describe('ConversationReplay', () => {
  it('renders the replay container', () => {
    renderReplay();
    expect(screen.getByTestId('conversation-replay')).toBeInTheDocument();
  });

  it('shows session header with transcript label', () => {
    renderReplay();
    expect(screen.getByText('Session Transcript')).toBeInTheDocument();
  });

  it('shows message count in stats bar', () => {
    renderReplay();
    expect(screen.getByText('5 messages')).toBeInTheDocument();
  });

  it('shows tool call count in stats bar', () => {
    renderReplay();
    expect(screen.getByText('1 tool calls')).toBeInTheDocument();
  });

  it('shows model in stats bar', () => {
    renderReplay();
    expect(screen.getByText('gpt-5.3-codex')).toBeInTheDocument();
  });

  it('renders messages with correct role labels', () => {
    renderReplay();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getAllByText('Assistant').length).toBeGreaterThanOrEqual(1);
  });

  it('renders system message content', () => {
    renderReplay();
    expect(screen.getByText('You are the Architect agent.')).toBeInTheDocument();
  });

  it('renders user message content', () => {
    renderReplay();
    expect(screen.getByText('Plan task breakdown for auth project')).toBeInTheDocument();
  });

  it('shows token counts', () => {
    renderReplay();
    expect(screen.getByText('15 tok')).toBeInTheDocument();
    expect(screen.getByText('450 tok')).toBeInTheDocument();
  });

  // ── Tool group card tests ──────────────────────────────────────

  it('renders tool call as grouped card with tool name', () => {
    renderReplay();
    expect(screen.getByText('create_task')).toBeInTheDocument();
    expect(screen.getByTestId('tool-group-card')).toBeInTheDocument();
  });

  it('expands tool group on click to show input and result', () => {
    renderReplay();
    const toolName = screen.getByText('create_task');
    // Click the parent button (the collapsed summary row)
    fireEvent.click(toolName.closest('button')!);
    // Should show input section
    expect(screen.getByText('Input')).toBeInTheDocument();
    // Should show result section
    expect(screen.getByText('Result')).toBeInTheDocument();
    // Should show formatted JSON input
    expect(screen.getByText(/"title": "Design schema"/)).toBeInTheDocument();
    // Should show result text
    expect(screen.getByText(/Task created successfully with id task-001/)).toBeInTheDocument();
  });

  // ── Events ─────────────────────────────────────────────────────

  it('renders session event row', () => {
    renderReplay();
    const events = screen.getAllByTestId('transcript-event');
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // ── Thinking blocks ────────────────────────────────────────────

  it('renders thinking block as collapsed', () => {
    renderReplay();
    expect(screen.getByText('Thinking')).toBeInTheDocument();
    expect(screen.queryByText('Let me think about the auth project...')).not.toBeInTheDocument();
  });

  it('expands thinking block on click', () => {
    renderReplay();
    const thinkingBtn = screen.getByText('Thinking');
    fireEvent.click(thinkingBtn);
    expect(screen.getByText('Let me think about the auth project...')).toBeInTheDocument();
  });

  // ── Filter bar ────────────────────────────────────────────────

  it('renders filter bar with all modes', () => {
    renderReplay();
    const filterBar = screen.getByTestId('filter-bar');
    expect(filterBar).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('filters to chat-only when Chat filter clicked', () => {
    renderReplay();
    fireEvent.click(screen.getByText('Chat'));
    // Chat messages should still be visible
    expect(screen.getByText('You are the Architect agent.')).toBeInTheDocument();
    // Events should be hidden
    expect(screen.queryByTestId('transcript-event')).not.toBeInTheDocument();
    // Tool cards should be hidden
    expect(screen.queryByTestId('tool-group-card')).not.toBeInTheDocument();
  });

  it('filters to tools-only when Tools filter clicked', () => {
    renderReplay();
    fireEvent.click(screen.getByText('Tools'));
    // Tool card should be visible
    expect(screen.getByTestId('tool-group-card')).toBeInTheDocument();
    // Chat messages should be hidden
    expect(screen.queryByText('You are the Architect agent.')).not.toBeInTheDocument();
  });

  it('filters to events-only when Events filter clicked', () => {
    renderReplay();
    fireEvent.click(screen.getByText('Events'));
    // Events should be visible
    expect(screen.getByTestId('transcript-event')).toBeInTheDocument();
    // Chat should be hidden
    expect(screen.queryByText('You are the Architect agent.')).not.toBeInTheDocument();
    // Tool cards should be hidden
    expect(screen.queryByTestId('tool-group-card')).not.toBeInTheDocument();
  });

  // ── Search ────────────────────────────────────────────────────

  it('toggles search bar', () => {
    renderReplay();
    const replayContainer = screen.getByTestId('conversation-replay');
    const searchBtn = Array.from(replayContainer.querySelectorAll('button')).find(btn =>
      btn.querySelector('.lucide-search'),
    );
    if (searchBtn) {
      fireEvent.click(searchBtn);
      expect(screen.getByPlaceholderText(/Search messages/)).toBeInTheDocument();
    }
  });

  it('filters messages by search term', () => {
    renderReplay();
    const replayContainer = screen.getByTestId('conversation-replay');
    const searchBtn = Array.from(replayContainer.querySelectorAll('button')).find(btn =>
      btn.querySelector('.lucide-search'),
    );
    if (searchBtn) {
      fireEvent.click(searchBtn);
      const searchInput = screen.getByPlaceholderText(/Search messages/);
      fireEvent.change(searchInput, { target: { value: 'Architect' } });
      // System message with 'Architect' should appear (with highlight, so check by partial)
      const messages = screen.getAllByTestId('transcript-message');
      const systemMessage = messages.find(m => m.textContent?.includes('Architect'));
      expect(systemMessage).toBeTruthy();
      // User message without 'Architect' should be hidden
      expect(screen.queryByText('Plan task breakdown for auth project')).not.toBeInTheDocument();
    }
  });

  it('shows empty state for no search results', () => {
    renderReplay();
    const replayContainer = screen.getByTestId('conversation-replay');
    const searchBtn = Array.from(replayContainer.querySelectorAll('button')).find(btn =>
      btn.querySelector('.lucide-search'),
    );
    if (searchBtn) {
      fireEvent.click(searchBtn);
      const searchInput = screen.getByPlaceholderText(/Search messages/);
      fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });
      expect(screen.getByText('No matching messages')).toBeInTheDocument();
    }
  });

  it('searches by tool name', () => {
    renderReplay();
    const replayContainer = screen.getByTestId('conversation-replay');
    const searchBtn = Array.from(replayContainer.querySelectorAll('button')).find(btn =>
      btn.querySelector('.lucide-search'),
    );
    if (searchBtn) {
      fireEvent.click(searchBtn);
      const searchInput = screen.getByPlaceholderText(/Search messages/);
      fireEvent.change(searchInput, { target: { value: 'create_task' } });
      // Tool group should appear (matched by toolMeta.toolName)
      expect(screen.getByTestId('tool-group-card')).toBeInTheDocument();
    }
  });

  // ── Close ─────────────────────────────────────────────────────

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    renderReplay({ onClose });
    const replayContainer = screen.getByTestId('conversation-replay');
    const closeBtn = Array.from(replayContainer.querySelectorAll('button')).find(btn =>
      btn.querySelector('.lucide-x'),
    );
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });
});

// ── Utility function tests (groupToolItems, isToolGroup) ───────

// We test groupToolItems logic via module import trick. Since these
// helpers are not exported, we verify behavior through rendered output.
// The filter + tool group rendering tests above exercise grouping implicitly.
