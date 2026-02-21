import { describe, expect, it } from 'vitest';
import { _testExports } from './index';

describe('legacy mappers', () => {
  it('mapOrchestrator maps process/cursor/heartbeat', () => {
    const out = _testExports.mapOrchestrator({
      process: { running: true, pid: 1234 },
      cursor: { rowid: 50, lag_events: 2, cursor_stagnant_for_seconds: 20 },
      heartbeat: { exists: true, age_seconds: 5 },
    });

    expect(out.running).toBe(true);
    expect(out.pid).toBe(1234);
    expect(out.cursorPosition).toBe(50);
    expect(out.cursorLag).toBe(2);
    expect(out.stagnant).toBe(false);
    expect(out.lastHeartbeat).not.toBeNull();
  });

  it('mapHealth maps health state and component statuses', () => {
    const out = _testExports.mapHealth({
      health: { state: 'degraded' },
      health_snapshot: {
        database: { ok: true },
        orchestrator: { running: false, heartbeat_age_seconds: 120 },
      },
    });

    expect(out.overall).toBe('degraded');
    expect(out.components.find((c) => c.name === 'SQLite Database')?.status).toBe('healthy');
    expect(out.components.find((c) => c.name === 'Orchestrator')?.status).toBe('unhealthy');
  });
});
