import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { DataProviderProvider } from '@/providers/data';
import type { DataProvider } from '@/providers/data/types';
import { useCreateProject, useManagerChat } from './useControl';

// ── Helpers ─────────────────────────────────────────────────────

function createTestProvider(overrides?: Partial<DataProvider>): DataProvider {
  return {
    name: 'test',
    capabilities: {
      realtime: true,
      mutations: true,
      approveProject: true,
      requestChanges: true,
      setProjectStatus: true,
      pauseOrchestrator: true,
      resumeOrchestrator: true,
      restartOrchestrator: true,
      cronActions: true,
      controlIntake: true,
      controlChat: true,
    },
    getSnapshot: vi.fn().mockResolvedValue({}),
    getProjects: vi.fn().mockResolvedValue([]),
    getProject: vi.fn().mockResolvedValue({}),
    getProjectTasks: vi.fn().mockResolvedValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
    getAgents: vi.fn().mockResolvedValue([]),
    getAgent: vi.fn().mockResolvedValue({}),
    getAgentFiles: vi.fn().mockResolvedValue([]),
    getAgentFileContent: vi.fn().mockResolvedValue({}),
    getAgentSessions: vi.fn().mockResolvedValue([]),
    getSessionMessages: vi.fn().mockResolvedValue([]),
    getTranscript: vi.fn().mockResolvedValue({ items: [] }),
    getTranscriptItemRaw: vi.fn().mockResolvedValue({}),
    getCronJobs: vi.fn().mockResolvedValue([]),
    getSystemHealth: vi.fn().mockResolvedValue({}),
    approveProject: vi.fn(),
    requestChanges: vi.fn(),
    setProjectStatus: vi.fn(),
    pauseOrchestrator: vi.fn(),
    resumeOrchestrator: vi.fn(),
    restartOrchestrator: vi.fn(),
    enableCronJob: vi.fn(),
    disableCronJob: vi.fn(),
    runCronJob: vi.fn(),
    createProject: vi.fn().mockResolvedValue({ projectId: 'proj_abc', status: 'QUEUED', routeType: 'auto', priority: 3 }),
    streamManagerMessage: vi.fn().mockImplementation(async (req, onEvent) => {
      onEvent({ type: 'delta', delta: 'Done!', outputIndex: 0, sessionKey: req.sessionKey });
      onEvent({ type: 'done', sessionKey: req.sessionKey });
    }),
    sendManagerMessage: vi.fn().mockResolvedValue({ messages: [{ role: 'assistant', content: 'Done!' }], sessionKey: 'test:session', model: null, usage: null }),
    getManagerSession: vi.fn().mockResolvedValue({ sessionKey: 'test:session', messages: [], count: 0 }),
    ...overrides,
  } as DataProvider;
}

function createWrapper(provider: DataProvider) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <DataProviderProvider value={provider}>
          {children}
        </DataProviderProvider>
      </QueryClientProvider>
    );
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('useCreateProject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls provider.createProject on mutate', async () => {
    const provider = createTestProvider();
    const { result } = renderHook(() => useCreateProject(), { wrapper: createWrapper(provider) });

    await result.current.mutateAsync({
      goal: 'Test goal',
      routeType: 'coding',
      priority: 4,
    });

    expect(provider.createProject).toHaveBeenCalledWith({
      goal: 'Test goal',
      routeType: 'coding',
      priority: 4,
    });
  });

  it('returns project data on success', async () => {
    const provider = createTestProvider();
    const { result } = renderHook(() => useCreateProject(), { wrapper: createWrapper(provider) });

    const data = await result.current.mutateAsync({
      goal: 'Test goal',
      routeType: 'auto',
      priority: 3,
    });

    expect(data.projectId).toBe('proj_abc');
    expect(data.status).toBe('QUEUED');
  });

  it('handles error gracefully', async () => {
    const provider = createTestProvider({
      createProject: vi.fn().mockRejectedValue(new Error('CLI error')),
    });
    const { result } = renderHook(() => useCreateProject(), { wrapper: createWrapper(provider) });

    await expect(
      result.current.mutateAsync({ goal: 'Test', routeType: 'auto', priority: 3 }),
    ).rejects.toThrow('CLI error');
  });
});

describe('useManagerChat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with empty messages', async () => {
    const provider = createTestProvider();
    const { result } = renderHook(() => useManagerChat('test:session'), { wrapper: createWrapper(provider) });

    await waitFor(() => {
      expect(result.current.messages).toEqual([]);
    });
  });

  it('sends a message and appends streamed response', async () => {
    const provider = createTestProvider();
    const { result } = renderHook(() => useManagerChat('test:session'), { wrapper: createWrapper(provider) });

    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false));

    await result.current.sendMessage('Hello');

    expect(provider.streamManagerMessage).toHaveBeenCalledWith({
      sessionKey: 'test:session',
      message: 'Hello',
    }, expect.any(Function));

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('handles send error without crashing', async () => {
    const provider = createTestProvider({
      streamManagerMessage: vi.fn().mockRejectedValue(new Error('Timeout')),
      sendManagerMessage: vi.fn().mockRejectedValue(new Error('Timeout')),
    });
    const { result } = renderHook(() => useManagerChat('test:session'), { wrapper: createWrapper(provider) });

    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false));

    await expect(result.current.sendMessage('Hello')).rejects.toThrow();
  });
});
