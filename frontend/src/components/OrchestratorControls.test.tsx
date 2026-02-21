import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DataProviderProvider } from '@/providers/data';
import type { DataProvider } from '@/providers/data/types';
import { OrchestratorControls } from './OrchestratorControls';
import type { SystemSnapshot } from '@/types/domain';

// ── Mock confirm to auto-accept ─────────────────────────────────

vi.mock('@/lib/confirm', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  confirmChannel: { push: null },
}));

// ── Test helpers ────────────────────────────────────────────────

function makeSnapshot(overrides?: Partial<SystemSnapshot['orchestrator']>): SystemSnapshot {
  return {
    health: { overall: 'healthy', components: [], timestamp: new Date().toISOString() },
    orchestrator: {
      running: true,
      pid: 961191,
      cursorPosition: 200,
      cursorLag: 0,
      lastHeartbeat: new Date().toISOString(),
      stagnant: false,
      uptimeSeconds: 3600,
      ...overrides,
    },
    summary: {
      activeProjects: 1, waitingApproval: 0, runningAttempts: 0,
      blockedTasks: 0, deadLetters: 0, retryStorms: 0,
      totalProjects: 1, totalTasks: 0,
    },
    activeProjects: [],
    runningAttempts: [],
    recentEvents: [],
    alerts: [],
    retryStorms: [],
    blockers: [],
    deadLetters: [],
    timestamp: new Date().toISOString(),
  };
}

function createTestProvider(
  snapshotOverrides?: Partial<SystemSnapshot['orchestrator']>,
  extra?: Partial<DataProvider>,
): DataProvider {
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
    getSnapshot: vi.fn().mockResolvedValue(makeSnapshot(snapshotOverrides)),
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
    getTranscript: vi.fn().mockResolvedValue({ items: [], totalEvents: 0, messageCount: 0, hasMore: false }),
    getTranscriptItemRaw: vi.fn().mockResolvedValue({}),
    getCronJobs: vi.fn().mockResolvedValue([]),
    getSystemHealth: vi.fn().mockResolvedValue({ overall: 'healthy', components: [], timestamp: '' }),
    approveProject: vi.fn(),
    requestChanges: vi.fn(),
    setProjectStatus: vi.fn(),
    pauseOrchestrator: vi.fn(),
    resumeOrchestrator: vi.fn(),
    restartOrchestrator: vi.fn().mockResolvedValue({
      restarted: true,
      output: '[overmind] Preflight: config validate\n[overmind] Orchestrator started: pid=999',
    }),
    enableCronJob: vi.fn(),
    disableCronJob: vi.fn(),
    runCronJob: vi.fn(),
    createProject: vi.fn().mockResolvedValue({ projectId: 'proj_test', status: 'QUEUED', routeType: 'auto', priority: 3 }),
    streamManagerMessage: vi.fn(),
    sendManagerMessage: vi.fn().mockResolvedValue({ messages: [{ role: 'assistant', content: 'ok' }], sessionKey: 'test', model: null, usage: null }),
    getManagerSession: vi.fn().mockResolvedValue({ sessionKey: 'test', messages: [], count: 0 }),
    ...extra,
  } as DataProvider;
}

function renderComponent(provider?: DataProvider) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const p = provider ?? createTestProvider();
  return render(
    <QueryClientProvider client={queryClient}>
      <DataProviderProvider value={p}>
        <OrchestratorControls />
      </DataProviderProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ───────────────────────────────────────────────────────

describe('OrchestratorControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────

  it('renders heading and status when snapshot loads', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Orchestrator Control')).toBeInTheDocument();
    });
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows PID from snapshot', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/PID 961191/)).toBeInTheDocument();
    });
  });

  it('shows cursor lag label', async () => {
    renderComponent(createTestProvider({ cursorLag: 5 }));
    await waitFor(() => {
      expect(screen.getByText(/5 events behind/)).toBeInTheDocument();
    });
  });

  it('shows uptime when available', async () => {
    renderComponent(createTestProvider({ uptimeSeconds: 7200 }));
    await waitFor(() => {
      expect(screen.getByText(/2h 0m/)).toBeInTheDocument();
    });
  });

  // ── Status states ─────────────────────────────────────────────

  it('shows Stopped status when orchestrator is not running', async () => {
    renderComponent(createTestProvider({ running: false, pid: null }));
    await waitFor(() => {
      expect(screen.getByText('Stopped')).toBeInTheDocument();
    });
  });

  it('shows Stagnant status when heartbeat is stale', async () => {
    renderComponent(createTestProvider({ stagnant: true }));
    await waitFor(() => {
      expect(screen.getByText('Stagnant')).toBeInTheDocument();
    });
  });

  // ── Control buttons ───────────────────────────────────────────

  it('renders Pause, Resume, and Restart buttons', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Pause')).toBeInTheDocument();
      expect(screen.getByText('Resume')).toBeInTheDocument();
      expect(screen.getByText('Restart')).toBeInTheDocument();
    });
  });

  it('Restart button is enabled even when orchestrator is stopped', async () => {
    renderComponent(createTestProvider({ running: false }));
    await waitFor(() => {
      expect(screen.getByText('Restart')).toBeInTheDocument();
    });
    const restartBtn = screen.getByText('Restart').closest('button')!;
    expect(restartBtn).not.toBeDisabled();
  });

  it('Restart button is enabled when orchestrator is running', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Restart')).toBeInTheDocument();
    });
    const restartBtn = screen.getByText('Restart').closest('button')!;
    expect(restartBtn).not.toBeDisabled();
  });

  // ── Restart flow ──────────────────────────────────────────────

  it('calls restartOrchestrator on click and shows output', async () => {
    const provider = createTestProvider();
    renderComponent(provider);

    await waitFor(() => {
      expect(screen.getByText('Restart')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Restart').closest('button')!);

    await waitFor(() => {
      expect(provider.restartOrchestrator).toHaveBeenCalledTimes(1);
    });

    // After success, output panel should appear
    await waitFor(() => {
      expect(screen.getByTestId('restart-output')).toBeInTheDocument();
      expect(screen.getByText('Restart Output')).toBeInTheDocument();
    });
  });

  it('shows error message when restart fails', async () => {
    const provider = createTestProvider(undefined, {
      restartOrchestrator: vi.fn().mockRejectedValue(new Error('Script not found')),
    });
    renderComponent(provider);

    await waitFor(() => {
      expect(screen.getByText('Restart')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Restart').closest('button')!);

    await waitFor(() => {
      expect(screen.getByTestId('restart-error')).toBeInTheDocument();
      expect(screen.getByText(/Script not found/)).toBeInTheDocument();
    });
  });

  // ── Output panel expand ───────────────────────────────────────

  it('expands the output panel when clicked', async () => {
    const provider = createTestProvider();
    renderComponent(provider);

    await waitFor(() => expect(screen.getByText('Restart')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Restart').closest('button')!);

    await waitFor(() => expect(screen.getByText('Restart Output')).toBeInTheDocument());

    // Click the output toggle to expand
    fireEvent.click(screen.getByText('Restart Output'));

    await waitFor(() => {
      expect(screen.getByText(/Preflight: config validate/)).toBeInTheDocument();
    });
  });

  // ── Capability-gated buttons ──────────────────────────────────

  it('hides Restart button when restartOrchestrator capability is false', async () => {
    const provider = createTestProvider();
    provider.capabilities.restartOrchestrator = false;
    renderComponent(provider);

    await waitFor(() => {
      expect(screen.getByText('Orchestrator Control')).toBeInTheDocument();
    });
    expect(screen.queryByText('Restart')).not.toBeInTheDocument();
  });

  it('hides Pause/Resume buttons when capabilities are false', async () => {
    const provider = createTestProvider();
    provider.capabilities.pauseOrchestrator = false;
    provider.capabilities.resumeOrchestrator = false;
    renderComponent(provider);

    await waitFor(() => {
      expect(screen.getByText('Orchestrator Control')).toBeInTheDocument();
    });
    expect(screen.queryByText('Pause')).not.toBeInTheDocument();
    expect(screen.queryByText('Resume')).not.toBeInTheDocument();
  });
});
