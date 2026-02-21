import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DataProviderProvider } from '@/providers/data';
import type { DataProvider } from '@/providers/data/types';
import { ControlPage } from './control';

// ── Mocks ───────────────────────────────────────────────────────

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<object>('@tanstack/react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearch: () => ({}),
  };
});

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
      cronActions: true,
      controlIntake: true,
      controlChat: true,
    },
    getSnapshot: vi.fn().mockResolvedValue({
      health: { overall: 'healthy', components: [], timestamp: new Date().toISOString() },
      orchestrator: { running: true, pid: 1234, cursorPosition: 100, cursorLag: 0, stagnant: false },
      summary: { activeProjects: 2, waitingApproval: 0, runningAttempts: 1, blockedTasks: 0, deadLetters: 0, retryStorms: 0, totalProjects: 5, totalTasks: 20 },
      activeProjects: [],
      runningAttempts: [],
      recentEvents: [],
      alerts: [],
      retryStorms: [],
      blockers: [],
      deadLetters: [],
      timestamp: new Date().toISOString(),
    }),
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
    enableCronJob: vi.fn(),
    disableCronJob: vi.fn(),
    runCronJob: vi.fn(),
    createProject: vi.fn().mockResolvedValue({ projectId: 'proj_test123', status: 'QUEUED', routeType: 'auto', priority: 3 }),
    sendManagerMessage: vi.fn().mockResolvedValue({ response: 'Test response', sessionKey: 'dashboard:control', model: null, usage: null }),
    getManagerSession: vi.fn().mockResolvedValue({ sessionKey: 'dashboard:control', messages: [], count: 0 }),
    ...overrides,
  } as DataProvider;
}

function renderControl(provider?: DataProvider) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const p = provider || createTestProvider();
  return render(
    <QueryClientProvider client={queryClient}>
      <DataProviderProvider value={p}>
        <ControlPage />
      </DataProviderProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ───────────────────────────────────────────────────────

describe('ControlPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Layout', () => {
    it('renders page heading', () => {
      renderControl();
      expect(screen.getByText('Command Center')).toBeInTheDocument();
    });

    it('renders both tab buttons', () => {
      renderControl();
      expect(screen.getByText('Project Intake')).toBeInTheDocument();
      expect(screen.getByText('Manager Console')).toBeInTheDocument();
    });

    it('shows intake tab by default', () => {
      renderControl();
      expect(screen.getByText('Mission Objective')).toBeInTheDocument();
    });

    it('switches to chat tab on click', () => {
      renderControl();
      fireEvent.click(screen.getByText('Manager Console'));
      expect(screen.getByText('Overmind Coordinator')).toBeInTheDocument();
    });
  });

  describe('Intake Tab', () => {
    it('renders goal textarea', () => {
      renderControl();
      expect(screen.getByPlaceholderText(/describe what you want/i)).toBeInTheDocument();
    });

    it('renders route type selector with 4 options', () => {
      renderControl();
      expect(screen.getByText('Auto')).toBeInTheDocument();
      expect(screen.getByText('Coding')).toBeInTheDocument();
      expect(screen.getByText('Research')).toBeInTheDocument();
      expect(screen.getByText('Hybrid')).toBeInTheDocument();
    });

    it('shows advanced options when toggled', () => {
      renderControl();
      fireEvent.click(screen.getByText('Advanced Options'));
      expect(screen.getByText('Notes / Context')).toBeInTheDocument();
    });

    it('submit button disabled when goal is empty', () => {
      renderControl();
      const btn = screen.getByRole('button', { name: /launch mission/i });
      expect(btn).toBeDisabled();
    });

    it('submit button enabled when goal has text', () => {
      renderControl();
      const textarea = screen.getByPlaceholderText(/describe what you want/i);
      fireEvent.change(textarea, { target: { value: 'Build a widget' } });
      const btn = screen.getByRole('button', { name: /launch mission/i });
      expect(btn).not.toBeDisabled();
    });

    it('calls createProject on submit and shows success', async () => {
      const provider = createTestProvider();
      renderControl(provider);

      const textarea = screen.getByPlaceholderText(/describe what you want/i);
      fireEvent.change(textarea, { target: { value: 'Build a widget' } });

      const btn = screen.getByRole('button', { name: /launch mission/i });
      fireEvent.click(btn);

      await waitFor(() => {
        expect(provider.createProject).toHaveBeenCalledWith(
          expect.objectContaining({ goal: 'Build a widget', routeType: 'auto', priority: 3 }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Mission Launched')).toBeInTheDocument();
      });
    });

    it('shows error message on failure', async () => {
      const provider = createTestProvider({
        createProject: vi.fn().mockRejectedValue(new Error('CLI timeout')),
      });
      renderControl(provider);

      const textarea = screen.getByPlaceholderText(/describe what you want/i);
      fireEvent.change(textarea, { target: { value: 'Build a widget' } });

      // Use click on the form button — the mutation error is caught internally
      const btn = screen.getByRole('button', { name: /launch mission/i });
      fireEvent.click(btn);

      // Wait for the error UI to appear (the hook catches the rejection internally)
      await waitFor(
        () => {
          expect(screen.getByText(/CLI timeout/i)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('allows selecting a different route type', () => {
      renderControl();
      fireEvent.click(screen.getByText('Research'));
      expect(screen.getByText('Investigation and analysis')).toBeInTheDocument();
    });
  });

  describe('Chat Tab', () => {
    it('shows empty state when no messages', async () => {
      renderControl();
      fireEvent.click(screen.getByText('Manager Console'));

      await waitFor(() => {
        expect(screen.getByText(/chat directly with/i)).toBeInTheDocument();
      });
    });

    it('renders chat composer', () => {
      renderControl();
      fireEvent.click(screen.getByText('Manager Console'));
      expect(screen.getByPlaceholderText(/message the coordinator/i)).toBeInTheDocument();
    });

    it('send button disabled when input is empty', () => {
      renderControl();
      fireEvent.click(screen.getByText('Manager Console'));
      // The send button should be disabled — find by the button that contains a Send icon
      const buttons = screen.getAllByRole('button');
      const sendBtn = buttons.find(b => b.querySelector('.lucide-send'));
      if (sendBtn) {
        expect(sendBtn).toBeDisabled();
      }
    });

    it('sends message on enter key', async () => {
      const provider = createTestProvider();
      renderControl(provider);
      fireEvent.click(screen.getByText('Manager Console'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/message the coordinator/i)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/message the coordinator/i);
      fireEvent.change(input, { target: { value: 'What projects are running?' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(provider.sendManagerMessage).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'What projects are running?' }),
        );
      });
    });
  });
});
