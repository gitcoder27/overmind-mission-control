/**
 * Tests for useMetricsSocket hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMetricsSocket } from '@/lib/useMetricsSocket';
import type { SystemMetricsSnapshot } from '@/types/metrics';

// ── Mock authStore ──────────────────────────────────────────
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { token: string }) => unknown) =>
    selector({ token: 'test-token' }),
}));

// ── Mock WebSocket ──────────────────────────────────────────
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.();
  }
}

function makeSnapshot(overrides: Partial<SystemMetricsSnapshot> = {}): SystemMetricsSnapshot {
  return {
    type: 'metrics',
    timestamp: new Date().toISOString(),
    cpu: { percent: 25, perCore: [20, 30], coreCount: 2, loadAvg: [0.5, 0.6, 0.7], frequency: null },
    memory: { total: 8e9, available: 4e9, used: 4e9, percent: 50, swap: { total: 2e9, used: 1e8, percent: 5 } },
    disk: { partitions: [{ device: '/dev/sda1', mountpoint: '/', fstype: 'ext4', total: 100e9, used: 40e9, free: 60e9, percent: 40 }], io: { readBytes: 1000, writeBytes: 2000, readCount: 10, writeCount: 20 } },
    network: { bytesSent: 5000, bytesRecv: 10000, packetsSent: 100, packetsRecv: 200, connections: 5 },
    system: { hostname: 'test', platform: 'linux', platformVersion: 'Ubuntu 22.04', kernelVersion: '5.15.0', architecture: 'x86_64', uptime: 3600, bootTime: '2026-01-01T00:00:00Z', pythonVersion: '3.12.0' },
    processes: { total: 100, running: 2, sleeping: 97, zombie: 1, topCpu: [], topMemory: [] },
    temperatures: [],
    ...overrides,
  };
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useMetricsSocket', () => {
  it('connects and sets connected=true on open', () => {
    const { result } = renderHook(() => useMetricsSocket());

    expect(result.current.connected).toBe(false);
    expect(MockWebSocket.instances.length).toBe(1);

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.connected).toBe(true);
  });

  it('stores snapshots in current and history', () => {
    const { result } = renderHook(() => useMetricsSocket());
    const ws = MockWebSocket.instances[0];

    act(() => ws.simulateOpen());

    const snap = makeSnapshot({ cpu: { percent: 42, perCore: [40, 44], coreCount: 2, loadAvg: [1, 1, 1], frequency: null } });
    act(() => ws.simulateMessage(snap));

    expect(result.current.current?.cpu.percent).toBe(42);
    expect(result.current.history.length).toBe(1);
  });

  it('maintains circular buffer of max 60', () => {
    const { result } = renderHook(() => useMetricsSocket());
    const ws = MockWebSocket.instances[0];

    act(() => ws.simulateOpen());

    for (let i = 0; i < 65; i++) {
      act(() => ws.simulateMessage(makeSnapshot({ cpu: { percent: i, perCore: [], coreCount: 1, loadAvg: [0, 0, 0], frequency: null } })));
    }

    expect(result.current.history.length).toBe(60);
    // First entry should be index 5 (first 5 were shifted out)
    expect(result.current.history[0].cpu.percent).toBe(5);
  });

  it('includes token in WebSocket URL', () => {
    renderHook(() => useMetricsSocket());
    expect(MockWebSocket.instances[0].url).toContain('?token=test-token');
  });
});
