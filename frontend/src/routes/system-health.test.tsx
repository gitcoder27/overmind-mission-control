/**
 * Smoke test for SystemHealthPage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemHealthPage } from '@/routes/system-health';
import type { SystemMetricsSnapshot } from '@/types/metrics';

function makeSnapshot(): SystemMetricsSnapshot {
  return {
    type: 'metrics',
    timestamp: new Date().toISOString(),
    cpu: { percent: 25, perCore: [20, 30], coreCount: 2, loadAvg: [0.5, 0.6, 0.7], frequency: { current: 2400, min: 800, max: 3600 } },
    memory: { total: 8e9, available: 4e9, used: 4e9, percent: 50, swap: { total: 2e9, used: 1e8, percent: 5 } },
    disk: { partitions: [{ device: '/dev/sda1', mountpoint: '/', fstype: 'ext4', total: 100e9, used: 40e9, free: 60e9, percent: 40 }], io: { readBytes: 1000, writeBytes: 2000, readCount: 10, writeCount: 20 } },
    network: { bytesSent: 5000, bytesRecv: 10000, packetsSent: 100, packetsRecv: 200, connections: 5 },
    system: { hostname: 'test-vm', platform: 'linux', platformVersion: 'Ubuntu 22.04', kernelVersion: '5.15.0', architecture: 'x86_64', uptime: 3600, bootTime: '2026-01-01T00:00:00Z', pythonVersion: '3.12.0' },
    processes: { total: 100, running: 2, sleeping: 97, zombie: 0, topCpu: [{ pid: 1, name: 'uvicorn', cpu: 2.1, memory: 1.5 }], topMemory: [{ pid: 2, name: 'node', cpu: 0.5, memory: 4.2 }] },
    temperatures: [],
  };
}

// Test with data injected via mock
const mockHook = vi.fn();

vi.mock('@/lib/useMetricsSocket', () => ({
  useMetricsSocket: () => mockHook(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SystemHealthPage', () => {
  it('renders loading state when current is null', () => {
    mockHook.mockReturnValue({ current: null, history: [], connected: false });
    render(<SystemHealthPage />);
    expect(screen.getByText('System Health')).toBeDefined();
    expect(screen.getByText('Connecting…')).toBeDefined();
  });

  it('renders dashboard when data is available', () => {
    const snap = makeSnapshot();
    mockHook.mockReturnValue({ current: snap, history: [snap], connected: true });
    render(<SystemHealthPage />);

    expect(screen.getByText('System Health')).toBeDefined();
    expect(screen.getByText('Live')).toBeDefined();
    expect(screen.getByText('test-vm')).toBeDefined();
  });

  it('shows disconnected indicator when not connected', () => {
    const snap = makeSnapshot();
    mockHook.mockReturnValue({ current: snap, history: [snap], connected: false });
    render(<SystemHealthPage />);

    expect(screen.getByText('Disconnected')).toBeDefined();
  });
});
