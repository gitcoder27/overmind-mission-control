import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { DataProviderProvider } from '@/providers/data';
import { createMockProvider } from '@/providers/data/mock';
import { AgentsPage } from '@/routes/agents';

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<object>('@tanstack/react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Recharts has issues in JSDOM — stub ResponsiveContainer to render children directly
vi.mock('recharts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DataProviderProvider value={createMockProvider()}>
        <AgentsPage />
      </DataProviderProvider>
    </QueryClientProvider>,
  );
}

describe('AgentsPage hierarchy', () => {
  it('renders the command structure heading', async () => {
    renderPage();
    expect(await screen.findByText('Agent Command Structure')).toBeInTheDocument();
  });

  it('renders three tier lanes', async () => {
    renderPage();
    expect(await screen.findByTestId('tier-lane-manager')).toBeInTheDocument();
    expect(screen.getByTestId('tier-lane-lead')).toBeInTheDocument();
    expect(screen.getByTestId('tier-lane-worker')).toBeInTheDocument();
  });

  it('places coordinator in manager lane', async () => {
    renderPage();
    const managerLane = await screen.findByTestId('tier-lane-manager');
    expect(managerLane).toHaveTextContent('Coordinator');
  });

  it('places architect, oracle, qa in leads lane', async () => {
    renderPage();
    const leadLane = await screen.findByTestId('tier-lane-lead');
    expect(leadLane).toHaveTextContent('Architect');
    expect(leadLane).toHaveTextContent('Oracle');
    expect(leadLane).toHaveTextContent('QA');
  });

  it('places builder, scout in workers lane', async () => {
    renderPage();
    const workerLane = await screen.findByTestId('tier-lane-worker');
    expect(workerLane).toHaveTextContent('Builder');
    expect(workerLane).toHaveTextContent('Scout');
  });

  it('renders hierarchy board container', async () => {
    renderPage();
    expect(await screen.findByTestId('hierarchy-board')).toBeInTheDocument();
  });

  it('shows KPI chips with correct totals', async () => {
    renderPage();
    // 6 agents total in mock data
    expect(await screen.findByText('6')).toBeInTheDocument();
  });
});
