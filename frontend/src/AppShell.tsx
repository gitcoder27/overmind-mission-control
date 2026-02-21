import { useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { useWebSocketConnection } from '@/lib/useWebSocket';
import { dataProvider } from '@/providers/data';
import { router } from '@/router';
import { useAuthStore } from '@/stores/authStore';
import { LoginPage } from '@/routes/login';

/**
 * Inner app component that has access to QueryClient context.
 * Wires WebSocket lifecycle and falls back to polling when WS is off.
 */
export function AppShell() {
  const authRequired = useAuthStore((s) => s.authRequired);
  const authenticated = useAuthStore((s) => s.authenticated);
  const checkAuth = useAuthStore((s) => s.checkAuth);

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Only enable WS when the provider claims realtime support
  useWebSocketConnection(dataProvider.capabilities.realtime && authenticated);

  // Still loading auth status
  if (authRequired === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-void">
        <div className="h-6 w-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  // Auth required but not authenticated — show login
  if (authRequired && !authenticated) {
    return <LoginPage onSuccess={() => window.location.reload()} />;
  }

  return <RouterProvider router={router} />;
}
