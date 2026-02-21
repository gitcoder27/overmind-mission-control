import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WebSocketManager } from './websocket';
import type { ConnectionStatus } from './websocket';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { queryKeys } from '@/queries/keys';
import type { WsEvent } from '@/types/domain';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8788/ws/v1/live';

/**
 * Connects WebSocketManager to the React lifecycle.
 * - Updates Zustand connection status in real time.
 * - Invalidates TanStack Query caches on incoming WS events.
 * - Sets lastUpdated timestamp on every message.
 * - Falls back gracefully to polling when WS is unavailable
 *   (TanStack Query refetchInterval handles polling).
 * - Cleans up on unmount.
 *
 * Only call this once, at the app root level.
 */
export function useWebSocketConnection(enabled: boolean): void {
  const queryClient = useQueryClient();
  const setConnectionStatus = useUiStore((s) => s.setConnectionStatus);
  const setLastUpdated = useUiStore((s) => s.setLastUpdated);
  const managerRef = useRef<WebSocketManager | null>(null);

  useEffect(() => {
    if (!enabled) {
      setConnectionStatus('disconnected');
      return;
    }

    const handleStatusChange = (status: ConnectionStatus) => {
      setConnectionStatus(status);
    };

    const handleMessage = (data: unknown) => {
      const event = data as WsEvent;
      const now = new Date().toISOString();
      setLastUpdated(now);

      // Invalidate relevant query keys based on event type
      invalidateByEventType(queryClient, event);

      // Live toast for critical events
      notifyCriticalEvent(event);
    };

    // Append auth token to WS URL if available
    const token = useAuthStore.getState().token;
    const wsUrl = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;

    const manager = new WebSocketManager({
      url: wsUrl,
      onMessage: handleMessage,
      onStatusChange: handleStatusChange,
      reconnectIntervalMs: 1000,
      maxReconnectMs: 30000,
    });

    managerRef.current = manager;
    manager.connect();

    return () => {
      manager.disconnect();
      managerRef.current = null;
    };
  }, [enabled, queryClient, setConnectionStatus, setLastUpdated]);
}

/**
 * Sends a toast notification for critical events (failed attempts, alerts).
 */
function notifyCriticalEvent(event: WsEvent): void {
  const eventType = event.type?.toUpperCase?.() ?? '';
  const payload = event.payload as Record<string, unknown> | null;

  if (eventType === 'ATTEMPT_COMPLETED' && payload?.status === 'FAILED') {
    useToastStore.getState().addToast({
      type: 'error',
      title: 'Attempt Failed',
      message: (payload.error as string) || (payload.taskTitle as string) || 'An attempt has failed',
      duration: 6000,
    });
  }

  if (eventType === 'ALERT_TRIGGERED') {
    useToastStore.getState().addToast({
      type: 'warning',
      title: (payload?.alert as string) || 'Alert Triggered',
      message: (payload?.taskTitle as string) || '',
      duration: 8000,
    });
  }
}

/**
 * Maps a WS event type to the TanStack Query keys that should be invalidated.
 * Uses direct cache updates for granular events where possible.
 */
function invalidateByEventType(
  queryClient: ReturnType<typeof useQueryClient>,
  event: WsEvent,
): void {
  const eventType = event.type?.toUpperCase?.() ?? '';

  switch (eventType) {
    case 'SNAPSHOT':
      // Full snapshot push — invalidate everything
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
      queryClient.invalidateQueries({ queryKey: queryKeys.systemHealth });
      break;

    case 'SNAPSHOT_UPDATE':
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      break;

    case 'EVENT_NEW':
    case 'TASK_CREATED':
    case 'TASK_STATUS_CHANGED':
    case 'ATTEMPT_STARTED':
    case 'ATTEMPT_COMPLETED':
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      break;

    case 'TASK_UPDATE':
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      break;

    case 'AGENT_UPDATE':
      queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      break;

    case 'PROJECT_TRANSITION':
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      break;

    case 'ALERT_TRIGGERED':
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: queryKeys.systemHealth });
      break;

    case 'CRON_UPDATE':
      queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
      break;

    case 'SYSTEM_HEARTBEAT':
      queryClient.invalidateQueries({ queryKey: queryKeys.systemHealth });
      break;

    default:
      // Unknown event type — invalidate snapshot as catch-all
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      break;
  }
}
