export const queryKeys = {
  snapshot: ['snapshot'] as const,
  projects: (filters?: Record<string, string>) => ['projects', filters] as const,
  project: (id: string) => ['project', id] as const,
  projectTasks: (id: string) => ['project', id, 'tasks'] as const,
  events: (filters?: Record<string, string>) => ['events', filters] as const,
  agents: ['agents'] as const,
  agent: (id: string) => ['agent', id] as const,
  agentFiles: (id: string) => ['agent', id, 'files'] as const,
  agentFileContent: (id: string, key: string) => ['agent', id, 'files', key] as const,
  agentSessions: (id: string) => ['agent', id, 'sessions'] as const,
  sessionMessages: (agentId: string, sessionKey: string) =>
    ['agent', agentId, 'sessions', sessionKey, 'messages'] as const,
  transcript: (agentId: string, sessionKey: string, params?: Record<string, unknown>) =>
    ['agent', agentId, 'sessions', sessionKey, 'transcript', params] as const,
  transcriptItemRaw: (agentId: string, sessionKey: string, itemIndex: number) =>
    ['agent', agentId, 'sessions', sessionKey, 'transcript', 'item', itemIndex] as const,
  cronJobs: ['cronJobs'] as const,
  systemHealth: ['systemHealth'] as const,
} as const;
