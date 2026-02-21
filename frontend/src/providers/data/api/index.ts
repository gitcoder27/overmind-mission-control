import type { DataProvider, ProviderCapabilities } from '../types';
import type {
  SystemSnapshot,
  Project,
  Task,
  EventItem,
  Agent,
  AgentFileInfo,
  AgentFileContent,
  AgentSession,
  CronJob,
  HealthState,
  SessionMessage,
  TranscriptResponse,
  TranscriptItem,
  IntakeRequest,
  IntakeResult,
  ManagerMessageRequest,
  ManagerMessageResult,
  ManagerStreamEvent,
  ManagerSessionResult,
  OrchestratorRestartResult,
} from '@/types/domain';
import { useAuthStore } from '@/stores/authStore';

const capabilities: ProviderCapabilities = {
  realtime: true,
  controlIntake: true,
  controlChat: true,
  mutations: true,
  approveProject: true,
  requestChanges: true,
  setProjectStatus: true,
  pauseOrchestrator: true,
  resumeOrchestrator: true,
  restartOrchestrator: true,
  cronActions: true,
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8788';

function buildAuthHeaders(includeJsonContentType = true): Record<string, string> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    headers: buildAuthHeaders(),
    ...options,
  });

  // Handle 401 – clear auth and redirect
  if (res.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error?.message || `API error: ${res.status}`);
  }
  return json.data as T;
}

export function createApiProvider(): DataProvider {
  return {
    name: 'api',
    capabilities,

    async getSnapshot() {
      return apiFetch<SystemSnapshot>('/system/snapshot');
    },

    async getProjects(filters) {
      const params = new URLSearchParams(filters);
      return apiFetch<Project[]>(`/projects?${params}`);
    },

    async getProject(id) {
      return apiFetch<Project>(`/projects/${id}`);
    },

    async getProjectTasks(id) {
      return apiFetch<Task[]>(`/projects/${id}/tasks`);
    },

    async getEvents(filters) {
      const params = new URLSearchParams(filters);
      return apiFetch<EventItem[]>(`/events?${params}`);
    },

    async getAgents() {
      return apiFetch<Agent[]>('/agents');
    },

    async getAgent(id) {
      return apiFetch<Agent>(`/agents/${id}`);
    },

    async getAgentFiles(id) {
      return apiFetch<AgentFileInfo[]>(`/agents/${id}/files`);
    },

    async getAgentFileContent(id, fileKey) {
      return apiFetch<AgentFileContent>(`/agents/${id}/files/${fileKey}`);
    },

    async getAgentSessions(id) {
      return apiFetch<AgentSession[]>(`/agents/${id}/sessions`);
    },

    async getSessionMessages(agentId, sessionKey) {
      return apiFetch<SessionMessage[]>(`/agents/${agentId}/sessions/${sessionKey}/messages`);
    },

    async getTranscript(agentId, sessionKey, params) {
      const searchParams = new URLSearchParams();
      if (params?.limit != null) searchParams.set('limit', String(params.limit));
      if (params?.offset != null) searchParams.set('offset', String(params.offset));
      if (params?.includeEvents != null) searchParams.set('includeEvents', String(params.includeEvents));
      if (params?.includeThinking != null) searchParams.set('includeThinking', String(params.includeThinking));
      if (params?.maxContentSize != null) searchParams.set('maxContentSize', String(params.maxContentSize));
      const qs = searchParams.toString();
      return apiFetch<TranscriptResponse>(`/agents/${agentId}/sessions/${sessionKey}/transcript${qs ? `?${qs}` : ''}`);
    },

    async getTranscriptItemRaw(agentId, sessionKey, itemIndex) {
      return apiFetch<TranscriptItem>(`/agents/${agentId}/sessions/${sessionKey}/transcript/item/${itemIndex}`);
    },

    async getCronJobs() {
      return apiFetch<CronJob[]>('/cron/jobs');
    },

    async getSystemHealth() {
      return apiFetch<HealthState>('/system/health');
    },

    async approveProject(id, notes) {
      await apiFetch(`/projects/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
    },

    async requestChanges(id, notes) {
      await apiFetch(`/projects/${id}/request-changes`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
    },

    async setProjectStatus(id, status, reason) {
      await apiFetch(`/projects/${id}/set-status`, {
        method: 'POST',
        body: JSON.stringify({ status, reason }),
      });
    },

    async pauseOrchestrator() {
      await apiFetch('/system/orchestrator/pause', { method: 'POST' });
    },

    async resumeOrchestrator() {
      await apiFetch('/system/orchestrator/resume', { method: 'POST' });
    },

    async restartOrchestrator() {
      return apiFetch<OrchestratorRestartResult>('/system/orchestrator/restart', { method: 'POST' });
    },

    async enableCronJob(id) {
      await apiFetch(`/cron/jobs/${id}/enable`, { method: 'POST' });
    },

    async disableCronJob(id) {
      await apiFetch(`/cron/jobs/${id}/disable`, { method: 'POST' });
    },

    async runCronJob(id) {
      await apiFetch(`/cron/jobs/${id}/run`, { method: 'POST' });
    },

    // Control Surface
    async createProject(intake: IntakeRequest) {
      return apiFetch<IntakeResult>('/control/projects', {
        method: 'POST',
        body: JSON.stringify(intake),
      });
    },

    async streamManagerMessage(req: ManagerMessageRequest, onEvent: (event: ManagerStreamEvent) => void) {
      const headers = buildAuthHeaders();
      headers.Accept = 'text/event-stream';

      const res = await fetch(`${API_BASE}/api/v1/control/manager/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
      });

      if (res.status === 401) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }

      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await res.json();
          throw new Error(json.error?.message || `Stream error: ${res.status}`);
        }
        const raw = await res.text();
        throw new Error(raw || `Stream error: ${res.status}`);
      }

      if (!res.body) {
        throw new Error('No stream body returned from manager stream endpoint');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneSeen = false;

      const parseOutputIndex = (value: unknown): number => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }
        if (typeof value === 'string' && value.trim()) {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed)) return parsed;
        }
        return 0;
      };

      const emitEventBlock = (block: string) => {
        const normalized = block.replace(/\r/g, '');
        if (!normalized.trim()) return;

        let eventName = 'message';
        const dataLines: string[] = [];

        for (const line of normalized.split('\n')) {
          if (!line || line.startsWith(':')) continue;
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim() || 'message';
            continue;
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        const dataRaw = dataLines.join('\n');
        if (!dataRaw) return;

        if (dataRaw === '[DONE]' || eventName === 'done') {
          doneSeen = true;
          onEvent({ type: 'done', sessionKey: req.sessionKey });
          return;
        }

        let payload: unknown = dataRaw;
        try {
          payload = JSON.parse(dataRaw);
        } catch {
          // Non-JSON data frames are allowed by SSE; keep as raw string.
        }

        if (eventName === 'delta' && typeof payload === 'object' && payload !== null) {
          const data = payload as Record<string, unknown>;
          const delta = typeof data.delta === 'string' ? data.delta : '';
          if (!delta) return;
          onEvent({
            type: 'delta',
            delta,
            outputIndex: parseOutputIndex(data.outputIndex),
            sessionKey: typeof data.sessionKey === 'string' ? data.sessionKey : req.sessionKey,
          });
          return;
        }

        if (eventName === 'error') {
          let message = 'Manager stream failed';
          let code: string | undefined;
          let details: Record<string, unknown> | undefined;

          if (typeof payload === 'object' && payload !== null) {
            const data = payload as Record<string, unknown>;
            if (typeof data.message === 'string' && data.message.trim()) {
              message = data.message;
            }
            if (typeof data.code === 'string' && data.code.trim()) {
              code = data.code;
            }
            if (typeof data.details === 'object' && data.details !== null) {
              details = data.details as Record<string, unknown>;
            }
          } else if (typeof payload === 'string' && payload.trim()) {
            message = payload;
          }

          onEvent({ type: 'error', message, code, details });
          throw new Error(message);
        }
      };

      try {
        const nextBoundary = () => {
          const lf = buffer.indexOf('\n\n');
          const crlf = buffer.indexOf('\r\n\r\n');
          if (lf < 0 && crlf < 0) return { index: -1, length: 0 };
          if (lf < 0) return { index: crlf, length: 4 };
          if (crlf < 0) return { index: lf, length: 2 };
          return lf < crlf ? { index: lf, length: 2 } : { index: crlf, length: 4 };
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          buffer += decoder.decode(value, { stream: true });

          let boundary = nextBoundary();
          while (boundary.index >= 0) {
            const block = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary.length);
            emitEventBlock(block);
            boundary = nextBoundary();
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          emitEventBlock(buffer);
        }
      } finally {
        reader.releaseLock();
      }

      if (!doneSeen) {
        onEvent({ type: 'done', sessionKey: req.sessionKey });
      }
    },

    async sendManagerMessage(req: ManagerMessageRequest) {
      return apiFetch<ManagerMessageResult>('/control/manager/message', {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async getManagerSession(sessionKey: string) {
      return apiFetch<ManagerSessionResult>(`/control/manager/session/${encodeURIComponent(sessionKey)}`);
    },
  };
}
