import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataProviderProvider } from '@/providers/data';
import { createMockProvider } from '@/providers/data/mock';
import { LoginPage } from '@/routes/login';

// Mock the auth store
const mockLogin = vi.fn();
const mockState = {
  token: null,
  authenticated: false,
  authRequired: true,
  loading: false,
  login: mockLogin,
  logout: vi.fn(),
  checkAuth: vi.fn(),
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

function renderLogin(onSuccess?: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DataProviderProvider value={createMockProvider()}>
        <LoginPage onSuccess={onSuccess} />
      </DataProviderProvider>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.loading = false;
  });

  it('renders the login form with API key input', () => {
    renderLogin();
    expect(screen.getByText('Overmind')).toBeInTheDocument();
    expect(screen.getByLabelText('Access Key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enter Mission Control/i })).toBeInTheDocument();
  });

  it('shows error for empty key submission', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /Enter Mission Control/i }));
    expect(await screen.findByText('API key is required')).toBeInTheDocument();
  });

  it('calls login on form submit with key', async () => {
    mockLogin.mockResolvedValue(true);
    const onSuccess = vi.fn();
    renderLogin(onSuccess);

    const input = screen.getByLabelText('Access Key');
    fireEvent.change(input, { target: { value: 'test-key-123' } });
    fireEvent.click(screen.getByRole('button', { name: /Enter Mission Control/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test-key-123');
    });
  });

  it('shows error on failed login', async () => {
    mockLogin.mockResolvedValue(false);
    renderLogin();

    const input = screen.getByLabelText('Access Key');
    fireEvent.change(input, { target: { value: 'wrong-key' } });
    fireEvent.click(screen.getByRole('button', { name: /Enter Mission Control/i }));

    expect(await screen.findByText('Invalid API key')).toBeInTheDocument();
  });

  it('has show/hide password toggle', () => {
    renderLogin();
    const input = screen.getByLabelText('Access Key') as HTMLInputElement;
    expect(input.type).toBe('password');

    // Find the toggle button (it has an EyeOff icon initially)
    const toggleButtons = screen.getAllByRole('button');
    const toggleBtn = toggleButtons.find((btn) => btn.getAttribute('tabindex') === '-1');
    expect(toggleBtn).toBeTruthy();

    if (toggleBtn) {
      fireEvent.click(toggleBtn);
      expect(input.type).toBe('text');
    }
  });
});
