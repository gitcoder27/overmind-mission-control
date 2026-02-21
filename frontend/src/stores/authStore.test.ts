import { describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/authStore';

describe('authStore', () => {
  it('initializes with null authRequired', () => {
    const state = useAuthStore.getState();
    expect(state.authRequired).toBeNull();
  });

  it('logout clears token and sets authenticated to false', () => {
    // Setup: manually put a token
    useAuthStore.setState({ token: 'test-token', authenticated: true });
    expect(useAuthStore.getState().authenticated).toBe(true);

    // Logout
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().authenticated).toBe(false);
  });

  it('exposes login and checkAuth functions', () => {
    const state = useAuthStore.getState();
    expect(typeof state.login).toBe('function');
    expect(typeof state.checkAuth).toBe('function');
    expect(typeof state.logout).toBe('function');
  });
});
