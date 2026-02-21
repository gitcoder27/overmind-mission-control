import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataProviderProvider, dataProvider } from '@/providers/data';
import { AppShell } from '@/AppShell';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DataProviderProvider value={dataProvider}>
        <AppShell />
      </DataProviderProvider>
    </QueryClientProvider>
  </StrictMode>,
);
