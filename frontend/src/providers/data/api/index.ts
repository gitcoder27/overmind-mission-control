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
  ManagerSessionResult,
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
  cronActions: true,
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8788';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // Attach auth token if available
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    headers,
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
