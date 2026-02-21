import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { DataProviderProvider } from '@/providers/data';
import { createMockProvider } from '@/providers/data/mock';
import { OverviewPage } from './overview';

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<object>('@tanstack/react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

describe('OverviewPage smoke', () => {
  it('renders command center heading', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DataProviderProvider value={createMockProvider()}>
          <OverviewPage />
        </DataProviderProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Command Center')).toBeInTheDocument();
  });
});
