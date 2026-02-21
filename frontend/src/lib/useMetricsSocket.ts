/**
 * useMetricsSocket — WebSocket hook for live system metrics.
 *
 * Connects to /api/v1/ws/metrics, maintains a circular buffer of the
 * last 60 readings (~2 min history for sparklines), auto-reconnects
 * with exponential back-off, and pauses when the tab is hidden.
 */

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { SystemMetricsSnapshot } from '@/types/metrics';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8788';
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const MAX_HISTORY = 60;

export interface MetricsState {
  current: SystemMetricsSnapshot | null;
  history: SystemMetricsSnapshot[];
  connected: boolean;
}

export function useMetricsSocket(): MetricsState {
  const token = useAuthStore((s) => s.token);
  const [connected, setConnected] = useState(false);
  const [current, setCurrent] = useState<SystemMetricsSnapshot | null>(null);
  const historyRef = useRef<SystemMetricsSnapshot[]>([]);
  const [history, setHistory] = useState<SystemMetricsSnapshot[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    function pushSnapshot(snap: SystemMetricsSnapshot) {
      const buf = historyRef.current;
      if (buf.length >= MAX_HISTORY) buf.shift();
      buf.push(snap);
      historyRef.current = buf;
      setCurrent(snap);
      setHistory([...buf]);
    }

    function connect() {
      if (!mountedRef.current) return;
      const url = `${WS_BASE}/api/v1/ws/metrics${token ? `?token=${token}` : ''}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        retryRef.current = 0;
      };

      ws.onmessage = (e) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(e.data as string) as SystemMetricsSnapshot;
          if (data.type === 'metrics') {
            pushSnapshot(data);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30_000);
        retryRef.current += 1;
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        wsRef.current?.close();
        if (timerRef.current) clearTimeout(timerRef.current);
      } else {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [token]);

  return { current, history, connected };
}
