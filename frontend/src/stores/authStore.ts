import { create } from 'zustand';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8788';
const STORAGE_KEY = 'overmind_auth_token';

interface AuthState {
  token: string | null;
  authenticated: boolean;
  authRequired: boolean | null; // null = unknown yet
  loading: boolean;
  login: (key: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(STORAGE_KEY),
  authenticated: !!localStorage.getItem(STORAGE_KEY),
  authRequired: null,
  loading: false,

  async login(key: string) {
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const json = await res.json();
      if (json.ok && res.status === 200) {
        const token = json.data.token as string;
        localStorage.setItem(STORAGE_KEY, token);
        set({ token, authenticated: true, loading: false });
        return true;
      }
      set({ loading: false });
      return false;
    } catch {
      set({ loading: false });
      return false;
    }
  },

  logout() {
    localStorage.removeItem(STORAGE_KEY);
    set({ token: null, authenticated: false });
  },

  async checkAuth() {
    const { token } = get();
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/api/v1/auth/verify`, { headers });
      const json = await res.json();
      if (json.ok) {
        const authEnabled = json.data.authEnabled as boolean;
        const valid = json.data.valid as boolean;
        if (!authEnabled) {
          // Auth not required — anyone can access
          set({ authRequired: false, authenticated: true });
        } else if (valid && token) {
          set({ authRequired: true, authenticated: true });
        } else {
          // Auth required but no valid token
          localStorage.removeItem(STORAGE_KEY);
          set({ authRequired: true, authenticated: false, token: null });
        }
      }
    } catch {
      // Backend unreachable — assume no auth required for offline dev
      set({ authRequired: false, authenticated: true });
    }
  },
}));
