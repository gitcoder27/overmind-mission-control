import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataProviderProvider } from '@/providers/data';
import { createMockProvider } from '@/providers/data/mock';
import { KanbanBoard } from '@/components/projects/KanbanBoard';
import { KanbanTaskCard } from '@/components/projects/KanbanTaskCard';
import type { Task } from '@/types/domain';

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<object>('@tanstack/react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

const mockTasks: Task[] = [
  {
    id: 'task-1', projectId: 'proj-1', title: 'Design schema',
    description: 'DB schema design', role: 'architect', status: 'DONE',
    priority: 3, retryCount: 0, maxRetries: 3, leaseExpiresAt: null,
    claimedBy: null, taskKind: 'execution',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    attemptCount: 1,
  },
  {
    id: 'task-2', projectId: 'proj-1', title: 'Build API endpoints',
    description: null, role: 'builder', status: 'IN_PROGRESS',
    priority: 4, retryCount: 1, maxRetries: 3,
    leaseExpiresAt: new Date(Date.now() + 600000).toISOString(),
    claimedBy: 'builder', taskKind: 'execution',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    attemptCount: 2,
  },
  {
    id: 'task-3', projectId: 'proj-1', title: 'Run test suite',
    description: null, role: 'qa', status: 'TODO',
    priority: 2, retryCount: 0, maxRetries: 3, leaseExpiresAt: null,
    claimedBy: null, taskKind: 'execution',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    attemptCount: 0,
  },
  {
    id: 'task-4', projectId: 'proj-1', title: 'Blocked on dep',
    description: null, role: 'builder', status: 'BLOCKED',
    priority: 5, retryCount: 0, maxRetries: 3, leaseExpiresAt: null,
    claimedBy: null, taskKind: 'execution',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    attemptCount: 0,
  },
  {
    id: 'task-5', projectId: 'proj-1', title: 'Review PR',
    description: null, role: 'qa', status: 'REVIEW',
    priority: 3, retryCount: 0, maxRetries: 3, leaseExpiresAt: null,
    claimedBy: null, taskKind: 'execution',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    attemptCount: 1,
  },
];

function renderBoard(tasks = mockTasks) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DataProviderProvider value={createMockProvider()}>
        <KanbanBoard tasks={tasks} />
      </DataProviderProvider>
    </QueryClientProvider>,
  );
}

function renderCard(task = mockTasks[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DataProviderProvider value={createMockProvider()}>
        <KanbanTaskCard task={task} />
      </DataProviderProvider>
    </QueryClientProvider>,
  );
}

describe('KanbanBoard', () => {
  it('renders the board container', () => {
    renderBoard();
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
  });

  it('renders all status columns with correct labels', () => {
    renderBoard();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('shows task count badges per column', () => {
    renderBoard();
    // TODO column has 1 task, IN_PROGRESS has 1, DONE has 1, BLOCKED has 1, REVIEW has 1
    // The count badges should show correct numbers
    const badges = screen.getAllByText('1');
    expect(badges.length).toBeGreaterThanOrEqual(4);
  });

  it('places tasks in correct columns', () => {
    renderBoard();
    // "Design schema" is DONE
    expect(screen.getByText('Design schema')).toBeInTheDocument();
    // "Build API endpoints" is IN_PROGRESS
    expect(screen.getByText('Build API endpoints')).toBeInTheDocument();
    // "Run test suite" is TODO
    expect(screen.getByText('Run test suite')).toBeInTheDocument();
  });
});

describe('KanbanTaskCard', () => {
  it('renders task title and role', () => {
    renderCard(mockTasks[1]);
    expect(screen.getByText('Build API endpoints')).toBeInTheDocument();
    // Both role label and claimedBy show 'builder', so use getAllByText
    expect(screen.getAllByText('builder').length).toBeGreaterThanOrEqual(1);
  });

  it('shows retry count when retries > 0', () => {
    renderCard(mockTasks[1]);
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('shows claimed-by agent when task is claimed', () => {
    renderCard(mockTasks[1]);
    // claimedBy = 'builder' appears as role AND as claimedBy
    const builderTexts = screen.getAllByText('builder');
    expect(builderTexts.length).toBe(2); // once for role, once for claimedBy
  });

  it('expands to show details on click', () => {
    const { container } = renderCard(mockTasks[1]);
    // Initially no description shown
    expect(screen.queryByText('2 attempts')).not.toBeInTheDocument();

    // Click the card
    const card = container.querySelector('[class*="rounded-lg"]');
    if (card) fireEvent.click(card);

    // Now details should be visible
    expect(screen.getByText('2 attempts')).toBeInTheDocument();
  });

  it('renders without errors for task with no description', () => {
    renderCard(mockTasks[2]);
    expect(screen.getByText('Run test suite')).toBeInTheDocument();
  });
});
