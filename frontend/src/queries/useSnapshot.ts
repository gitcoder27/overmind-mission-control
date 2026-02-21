import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './keys';
import { useDataProvider } from '@/providers/data';

export function useSnapshot() {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.snapshot,
    queryFn: () => provider.getSnapshot(),
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useProjects() {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => provider.getProjects(),
    staleTime: 5000,
  });
}

export function useProject(id: string) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => provider.getProject(id),
    staleTime: 5000,
  });
}

export function useProjectTasks(id: string) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.projectTasks(id),
    queryFn: () => provider.getProjectTasks(id),
    staleTime: 5000,
  });
}

/**
 * Fetches the complete attempt (agent activity) history for a project.
 * Uses the dedicated /projects/:id/attempts endpoint that returns ALL
 * attempts across all tasks, not just the latest per task.
 */
export function useProjectAttempts(projectId: string) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.projectAttempts(projectId),
    queryFn: () => provider.getProjectAttempts(projectId),
    staleTime: 5000,
  });
}

export function useEvents(filters?: Record<string, string>) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.events(filters),
    queryFn: () => provider.getEvents(filters),
    staleTime: 5000,
  });
}

export function useAgents() {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => provider.getAgents(),
    staleTime: 10000,
  });
}

export function useAgent(id: string) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.agent(id),
    queryFn: () => provider.getAgent(id),
    staleTime: 10000,
  });
}

export function useAgentFiles(id: string) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.agentFiles(id),
    queryFn: () => provider.getAgentFiles(id),
    staleTime: 30000,
  });
}

export function useAgentFileContent(id: string, fileKey: string) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.agentFileContent(id, fileKey),
    queryFn: () => provider.getAgentFileContent(id, fileKey),
    staleTime: 60000,
    enabled: !!fileKey,
  });
}

export function useAgentSessions(id: string) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.agentSessions(id),
    queryFn: () => provider.getAgentSessions(id),
    staleTime: 15000,
  });
}

export function useSessionMessages(agentId: string, sessionKey: string) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.sessionMessages(agentId, sessionKey),
    queryFn: () => provider.getSessionMessages(agentId, sessionKey),
    staleTime: 30000,
    enabled: !!sessionKey,
  });
}

export function useTranscript(
  agentId: string,
  sessionKey: string,
  params?: { limit?: number; offset?: number; includeEvents?: boolean; includeThinking?: boolean; maxContentSize?: number },
) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.transcript(agentId, sessionKey, params as Record<string, unknown>),
    queryFn: () => provider.getTranscript(agentId, sessionKey, params),
    staleTime: 30000,
    enabled: !!sessionKey,
  });
}

export function useTranscriptItemRaw(
  agentId: string,
  sessionKey: string,
  itemIndex: number,
  enabled = false,
) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.transcriptItemRaw(agentId, sessionKey, itemIndex),
    queryFn: () => provider.getTranscriptItemRaw(agentId, sessionKey, itemIndex),
    staleTime: 60000,
    enabled,
  });
}

export function useCronJobs() {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.cronJobs,
    queryFn: () => provider.getCronJobs(),
    staleTime: 10000,
  });
}

export function useSystemHealth() {
  const provider = useDataProvider();
  return useQuery({
    queryKey: queryKeys.systemHealth,
    queryFn: () => provider.getSystemHealth(),
    staleTime: 10000,
  });
}
