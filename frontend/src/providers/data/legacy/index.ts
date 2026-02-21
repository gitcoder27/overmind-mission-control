import type { DataProvider, ProviderCapabilities } from '../types';
import type {
  SystemSnapshot,
  Project,
  Task,
  Attempt,
  EventItem,
  Agent,
  CronJob,
  HealthState,
  OrchestratorStatus,
  Alert,
  DeadLetter,
  Blocker,
  RetryStorm,
} from '@/types/domain';

const capabilities: ProviderCapabilities = {
  realtime: false,
  mutations: false,
  approveProject: false,
  requestChanges: false,
  setProjectStatus: false,
  pauseOrchestrator: false,
  resumeOrchestrator: false,
  cronActions: false,
};

const LEGACY_BASE = import.meta.env.VITE_LEGACY_BASE_URL || 'http://127.0.0.1:8787';

// ────────────────────────────────────────────────────
// Raw legacy payload types (snake_case from Python)
// ────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

let _snapshotCache: { data: Raw; ts: number } | null = null;
const CACHE_TTL_MS = 1500; // avoid refetching within 1.5s

async function fetchLegacySnapshot(): Promise<Raw> {
  const now = Date.now();
  if (_snapshotCache && now - _snapshotCache.ts < CACHE_TTL_MS) {
    return _snapshotCache.data;
  }
  const res = await fetch(`${LEGACY_BASE}/api/snapshot`);
  if (!res.ok) throw new Error(`Legacy API error: ${res.status}`);
  const data = (await res.json()) as Raw;
  _snapshotCache = { data, ts: now };
  return data;
}

// ────────────────────────────────────────────────────
// Mapping helpers
// ────────────────────────────────────────────────────

function mapProject(raw: Raw): Project {
  const ts = raw.task_summary as Raw | undefined;
  return {
    id: String(raw.id || ''),
    goal: String(raw.goal || ''),
    status: String(raw.status || 'QUEUED') as Project['status'],
    priority: Number(raw.priority ?? 1),
    routeType: (raw.route_type as Project['routeType']) || null,
    activePlanVersion: Number(raw.active_plan_version ?? 1),
    maxReplanCycles: Number(raw.max_replan_cycles ?? 3),
    replanCount: Number(raw.replan_count ?? 0),
    createdBy: String(raw.created_by || 'unknown'),
    metadata: raw.metadata_json ? (typeof raw.metadata_json === 'string' ? JSON.parse(raw.metadata_json) : raw.metadata_json) : null,
    createdAt: String(raw.created_at || new Date().toISOString()),
    updatedAt: String(raw.updated_at || new Date().toISOString()),
    taskSummary: ts
      ? {
          total: Number(ts.total ?? 0),
          done: Number(ts.done ?? 0),
          inProgress: Number(ts.in_progress ?? 0),
          blocked: Number(ts.blocked ?? 0),
          failed: Number(ts.failed ?? 0),
          todo: Number(ts.todo ?? 0),
          ready: Number(ts.ready ?? 0),
          review: Number(ts.review ?? 0),
          cancelled: Number(ts.cancelled ?? 0),
        }
      : undefined,
  };
}

function mapTask(raw: Raw): Task {
  return {
    id: String(raw.id || ''),
    projectId: String(raw.project_id || ''),
    title: String(raw.title || ''),
    description: raw.description ?? null,
    role: (raw.role || 'builder') as Task['role'],
    status: String(raw.status || 'TODO') as Task['status'],
    priority: Number(raw.priority ?? 1),
    retryCount: Number(raw.retry_count ?? 0),
    maxRetries: Number(raw.max_retries ?? 3),
    leaseExpiresAt: raw.lease_expires_at ?? null,
    claimedBy: raw.claimed_by ?? null,
    taskKind: String(raw.task_kind || 'execution'),
    createdAt: String(raw.created_at || new Date().toISOString()),
    updatedAt: String(raw.updated_at || new Date().toISOString()),
    attemptCount: Number(raw.attempt_count ?? raw.attempts_count ?? 0),
  };
}

function mapAttempt(raw: Raw): Attempt {
  return {
    id: String(raw.id || ''),
    taskId: String(raw.task_id || ''),
    agentRole: (raw.agent_role || 'builder') as Attempt['agentRole'],
    status: String(raw.status || 'RUNNING') as Attempt['status'],
    attemptNo: Number(raw.attempt_no ?? 1),
    startedAt: raw.started_at ?? null,
    endedAt: raw.ended_at ?? null,
    errorCode: raw.error_code ?? null,
    errorMessage: raw.error_message ?? null,
    invocationMode: String(raw.invocation_mode || 'live'),
    sessionKey: raw.session_key ?? null,
    taskTitle: raw.task_title ?? undefined,
    projectId: raw.project_id ?? undefined,
    projectGoal: raw.project_goal ?? undefined,
  };
}

function mapEvent(raw: Raw): EventItem {
  let payload: Record<string, unknown> = {};
  if (raw.payload && typeof raw.payload === 'object') {
    payload = raw.payload as Record<string, unknown>;
  } else if (raw.payload_json) {
    try {
      payload = typeof raw.payload_json === 'string' ? JSON.parse(raw.payload_json) : raw.payload_json;
    } catch { /* use empty */ }
  }
  return {
    id: String(raw.id || ''),
    projectId: raw.project_id ?? null,
    taskId: raw.task_id ?? null,
    eventType: String(raw.event_type || 'UNKNOWN'),
    level: (raw.level || 'INFO') as EventItem['level'],
    source: String(raw.source || 'unknown'),
    payload,
    createdAt: String(raw.created_at || new Date().toISOString()),
  };
}

/**
 * Build OrchestratorStatus from the legacy orchestrator section.
 * Legacy shape:
 *   orchestrator.process.{pid, running}
 *   orchestrator.paused
 *   orchestrator.cursor.{rowid, lag_events, cursor_stagnant_for_seconds}
 *   orchestrator.heartbeat.{age_seconds, exists}
 */
function mapOrchestrator(raw: Raw | undefined): OrchestratorStatus {
  if (!raw) return { running: false, pid: null, cursorPosition: 0, cursorLag: 0, lastHeartbeat: null, stagnant: false, uptimeSeconds: null };
  const proc = raw.process as Raw | undefined;
  const cursor = raw.cursor as Raw | undefined;
  const hb = raw.heartbeat as Raw | undefined;
  const stagnantSec = Number(cursor?.cursor_stagnant_for_seconds ?? 0);
  return {
    running: Boolean(proc?.running ?? false),
    pid: proc?.pid ?? null,
    cursorPosition: Number(cursor?.rowid ?? 0),
    cursorLag: Number(cursor?.lag_events ?? 0),
    lastHeartbeat: hb?.exists ? new Date(Date.now() - (Number(hb.age_seconds ?? 0) * 1000)).toISOString() : null,
    stagnant: stagnantSec > 300, // stagnant if cursor hasn't moved in 5 minutes
    uptimeSeconds: null, // not available from legacy
  };
}

/**
 * Build HealthState from both `health` and `health_snapshot` sections.
 */
function mapHealth(raw: Raw): HealthState {
  const healthSection = raw.health as Raw | undefined;
  const healthSnapshot = raw.health_snapshot as Raw | undefined;

  const overall = healthSection?.state === 'healthy' ? 'healthy' : healthSection?.state === 'degraded' ? 'degraded' : healthSection?.state ? 'unhealthy' : 'unhealthy';

  const components: HealthState['components'] = [];

  // Database
  if (healthSnapshot?.database) {
    components.push({
      name: 'SQLite Database',
      status: healthSnapshot.database.ok ? 'healthy' : 'unhealthy',
      latencyMs: null,
      message: healthSnapshot.database.ok ? null : 'Database unreachable',
    });
  }

  // Orchestrator from health_snapshot
  if (healthSnapshot?.orchestrator) {
    const orchHS = healthSnapshot.orchestrator as Raw;
    components.push({
      name: 'Orchestrator',
      status: orchHS.running ? 'healthy' : 'unhealthy',
      latencyMs: null,
      message: orchHS.running ? `Heartbeat ${Number(orchHS.heartbeat_age_seconds ?? 0).toFixed(1)}s ago` : 'Not running',
    });
  }

  // API Server (we just reached it, so healthy)
  components.push({
    name: 'API Server',
    status: 'healthy',
    latencyMs: null,
    message: 'Legacy API reachable',
  });

  // OpenClaw Gateway (not reported by legacy, mark unknown)
  components.push({
    name: 'OpenClaw Gateway',
    status: 'degraded',
    latencyMs: null,
    message: 'Status not available from legacy endpoint',
  });

  return {
    overall: overall as HealthState['overall'],
    components,
    timestamp: new Date().toISOString(),
  };
}

function mapAlerts(raw: Raw): Alert[] {
  const legacyAlerts = raw.alerts as Raw[] | undefined;
  const stuckAlerts = (raw.stuck_signals as Raw | undefined)?.alerts as Raw[] | undefined;
  const all: Alert[] = [];

  if (legacyAlerts && Array.isArray(legacyAlerts)) {
    legacyAlerts.forEach((a: Raw, i: number) => {
      all.push({
        id: a.id || `alert-legacy-${i}`,
        severity: a.severity || (a.level === 'ERROR' ? 'critical' : a.level === 'WARN' ? 'warning' : 'info'),
        title: String(a.title || a.summary || a.type || 'Alert'),
        message: String(a.message || a.details || ''),
        source: String(a.source || 'legacy'),
        timestamp: String(a.created_at || a.timestamp || new Date().toISOString()),
        acknowledged: false,
      });
    });
  }

  if (stuckAlerts && Array.isArray(stuckAlerts)) {
    stuckAlerts.forEach((a: Raw, i: number) => {
      all.push({
        id: `stuck-${i}`,
        severity: 'warning',
        title: String(a.type || 'Stuck Signal'),
        message: String(a.message || a.details || JSON.stringify(a)),
        source: 'stuck_signals',
        timestamp: new Date().toISOString(),
        acknowledged: false,
      });
    });
  }

  return all;
}

export function createLegacyProvider(): DataProvider {
  return {
    name: 'legacy',
    capabilities,

    async getSnapshot(): Promise<SystemSnapshot> {
      const raw = await fetchLegacySnapshot();

      const projects = Array.isArray(raw.active_projects)
        ? (raw.active_projects as Raw[]).map(mapProject)
        : [];

      const orchestrator = mapOrchestrator(raw.orchestrator as Raw);
      const health = mapHealth(raw);
      const alerts = mapAlerts(raw);

      // Map running attempts from attempts.running[]
      const attemptsSection = raw.attempts as Raw | undefined;
      const runningAttempts = Array.isArray(attemptsSection?.running)
        ? (attemptsSection.running as Raw[]).map(mapAttempt)
        : [];

      // Map events from events_readable[] (richer format) falling back to events[]
      const eventsSource = Array.isArray(raw.events_readable)
        ? raw.events_readable
        : Array.isArray(raw.events)
          ? raw.events
          : [];
      const recentEvents = (eventsSource as Raw[]).map(mapEvent);

      // Dead letters
      const dlSection = raw.dead_letters as Raw | undefined;
      const deadLetters: DeadLetter[] = Array.isArray(dlSection?.groups)
        ? (dlSection.groups as Raw[]).map((dl: Raw, i: number) => ({
            id: String(dl.id || `dl-${i}`),
            projectId: dl.project_id ?? null,
            taskId: dl.task_id ?? null,
            attemptId: dl.attempt_id ?? null,
            reason: String(dl.reason || dl.payload_json || 'Unknown'),
            status: (dl.status || 'OPEN') as DeadLetter['status'],
            createdAt: String(dl.created_at || new Date().toISOString()),
            projectGoal: dl.project_goal ?? undefined,
            taskTitle: dl.task_title ?? undefined,
            taskRole: dl.task_role ?? undefined,
          }))
        : [];

      // Retry storms from retry_storm section
      const rsSection = raw.retry_storm as Raw | undefined;
      const retryStorms: RetryStorm[] = [];
      // Legacy only provides counts, no per-task detail
      const retryStormCount = Number(rsSection?.active ?? rsSection?.global ?? 0);

      // Summary: map from legacy summary structure
      const summarySection = raw.summary as Raw | undefined;
      const projectsSummary = summarySection?.projects as Raw | undefined;
      const tasksSummary = summarySection?.tasks as Raw | undefined;

      // Count projects/tasks from summary maps if available
      let totalProjects = projects.length;
      let totalTasks = 0;
      if (projectsSummary && typeof projectsSummary === 'object') {
        const vals = Object.values(projectsSummary) as number[];
        totalProjects = Math.max(totalProjects, vals.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0));
      }
      if (tasksSummary && typeof tasksSummary === 'object') {
        const vals = Object.values(tasksSummary) as number[];
        totalTasks = vals.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
      }

      const activeCount = projects.filter(p => p.status === 'ACTIVE').length;
      const waitingCount = projects.filter(p => p.status === 'WAITING_USER_APPROVAL').length;

      return {
        health,
        orchestrator,
        summary: {
          activeProjects: activeCount || Number(projectsSummary?.ACTIVE ?? 0),
          waitingApproval: waitingCount || Number(summarySection?.pending_approvals ?? 0),
          runningAttempts: runningAttempts.length || Number(attemptsSection?.running_count ?? 0),
          blockedTasks: Number(tasksSummary?.BLOCKED ?? 0),
          deadLetters: Number(dlSection?.global_open ?? dlSection?.active_open ?? 0),
          retryStorms: retryStormCount,
          totalProjects,
          totalTasks,
        },
        activeProjects: projects,
        runningAttempts,
        recentEvents,
        alerts,
        retryStorms,
        blockers: [] as Blocker[], // blockers not exposed by legacy endpoint
        deadLetters,
        timestamp: String(raw.generated_at || new Date().toISOString()),
      };
    },

    async getProjects(): Promise<Project[]> {
      const snap = await this.getSnapshot();
      return snap.activeProjects;
    },

    async getProject(id: string): Promise<Project> {
      const projects = await this.getProjects();
      const p = projects.find((pr) => pr.id === id);
      if (!p) throw new Error(`Project not found: ${id}`);
      return p;
    },

    async getProjectTasks(projectId: string): Promise<Task[]> {
      const raw = await fetchLegacySnapshot();
      // Legacy provides project_tasks.items when filtered
      const pt = raw.project_tasks as Raw | undefined;
      if (pt && Array.isArray(pt.items) && pt.items.length > 0) {
        // Filter to the requested project
        return (pt.items as Raw[])
          .filter((t: Raw) => !projectId || t.project_id === projectId)
          .map(mapTask);
      }
      // Fallback: not available per-project from unfiltered legacy snapshot
      return [];
    },

    async getEvents(filters?: Record<string, string>): Promise<EventItem[]> {
      const raw = await fetchLegacySnapshot();
      const eventsSource = Array.isArray(raw.events_readable)
        ? raw.events_readable
        : Array.isArray(raw.events) ? raw.events : [];
      let events = (eventsSource as Raw[]).map(mapEvent);
      if (filters?.project_id) {
        events = events.filter(e => e.projectId === filters.project_id);
      }
      if (filters?.event_type) {
        events = events.filter(e => e.eventType === filters.event_type);
      }
      if (filters?.level) {
        events = events.filter(e => e.level === filters.level);
      }
      return events;
    },

    async getAgents(): Promise<Agent[]> {
      // Legacy snapshot doesn't include agent roster.
      // Return empty — UI will show empty state with clear message.
      return [];
    },

    async getAgent(): Promise<Agent> {
      throw new Error('Not supported in legacy provider');
    },

    async getAgentFiles() {
      return [];
    },

    async getAgentFileContent() {
      throw new Error('Not supported in legacy provider');
    },

    async getAgentSessions() {
      return [];
    },

    async getSessionMessages() {
      return [];
    },

    async getTranscript() {
      return { items: [], totalEvents: 0, messageCount: 0, hasMore: false, sessionId: null, model: null, parseErrors: 0, toolCallCount: 0 };
    },

    async getTranscriptItemRaw() {
      throw new Error('Not supported in legacy provider');
    },

    async getCronJobs(): Promise<CronJob[]> {
      // Legacy snapshot doesn't include cron jobs.
      // Return empty — UI will show empty state with clear message.
      return [];
    },

    async getSystemHealth(): Promise<HealthState> {
      const raw = await fetchLegacySnapshot();
      return mapHealth(raw);
    },

    // Mutations — not supported in legacy provider
    async approveProject() { throw new Error('Not supported in legacy provider'); },
    async requestChanges() { throw new Error('Not supported in legacy provider'); },
    async setProjectStatus() { throw new Error('Not supported in legacy provider'); },
    async pauseOrchestrator() { throw new Error('Not supported in legacy provider'); },
    async resumeOrchestrator() { throw new Error('Not supported in legacy provider'); },
    async enableCronJob() { throw new Error('Not supported in legacy provider'); },
    async disableCronJob() { throw new Error('Not supported in legacy provider'); },
    async runCronJob() { throw new Error('Not supported in legacy provider'); },
  };
}

/**
 * Exported for unit testing
 */
export const _testExports = { mapProject, mapTask, mapAttempt, mapEvent, mapOrchestrator, mapHealth };
