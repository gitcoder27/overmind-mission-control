import type { DataProvider, ProviderCapabilities } from '../types';
import {
  mockSnapshot,
  mockProjects,
  mockTasks,
  mockEvents,
  mockAgents,
  mockCronJobs,
  mockHealth,
} from './fixtures';
import type { AgentFileInfo, AgentFileContent, AgentSession, SessionMessage, TranscriptResponse } from '@/types/domain';

const capabilities: ProviderCapabilities = {
  realtime: false,
  mutations: false,
  approveProject: false,
  requestChanges: false,
  setProjectStatus: false,
  pauseOrchestrator: false,
  resumeOrchestrator: false,
  cronActions: false,
  controlIntake: false,
  controlChat: false,
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createMockProvider(): DataProvider {
  return {
    name: 'mock',
    capabilities,

    async getSnapshot() {
      await delay(100);
      return { ...mockSnapshot, timestamp: new Date().toISOString() };
    },

    async getProjects(filters) {
      await delay(80);
      let result = [...mockProjects];
      if (filters?.status) {
        result = result.filter((p) => p.status === filters.status);
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        result = result.filter((p) => p.goal.toLowerCase().includes(q) || p.id.includes(q));
      }
      return result;
    },

    async getProject(id) {
      await delay(60);
      const project = mockProjects.find((p) => p.id === id);
      if (!project) throw new Error(`Project not found: ${id}`);
      return project;
    },

    async getProjectTasks(id) {
      await delay(80);
      return mockTasks.filter((t) => t.projectId === id);
    },

    async getEvents(filters) {
      await delay(60);
      let result = [...mockEvents];
      if (filters?.project_id) {
        result = result.filter((e) => e.projectId === filters.project_id);
      }
      if (filters?.event_type) {
        result = result.filter((e) => e.eventType === filters.event_type);
      }
      return result;
    },

    async getAgents() {
      await delay(60);
      return [...mockAgents];
    },

    async getAgent(id) {
      await delay(60);
      const agent = mockAgents.find((a) => a.id === id);
      if (!agent) throw new Error(`Agent not found: ${id}`);
      return { ...agent };
    },

    async getAgentFiles() {
      await delay(60);
      const keys = ['agents', 'soul', 'identity', 'user', 'tools'];
      const names = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md'];
      return keys.map((key, i): AgentFileInfo => ({
        name: names[i],
        key,
        relativePath: names[i],
        exists: Math.random() > 0.3,
        size: Math.floor(Math.random() * 4096) + 256,
        updatedAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
      }));
    },

    async getAgentFileContent(id: string, fileKey: string) {
      void id;
      await delay(80);
      const content = `# ${fileKey.toUpperCase()}\n\nThis is a mock profile document for the agent.\n\n## Purpose\n\nPlaceholder content for development and testing.\n`;
      return { key: fileKey, name: `${fileKey.toUpperCase()}.md`, content, size: content.length } satisfies AgentFileContent;
    },

    async getAgentSessions(id) {
      await delay(80);
      return Array.from({ length: 3 }, (_, i): AgentSession => ({
        sessionKey: `sess-mock-${id}-${i}`,
        agentId: id,
        updatedAt: new Date(Date.now() - i * 3600000).toISOString(),
        createdAt: new Date(Date.now() - i * 7200000).toISOString(),
        messageCount: Math.floor(Math.random() * 50) + 5,
      }));
    },

    async getSessionMessages() {
      await delay(100);
      const mockMessages: SessionMessage[] = [
        { role: 'system', content: 'You are the Architect agent. Your job is to decompose projects into tasks, design system structure, and ensure technical coherence.', timestamp: new Date(Date.now() - 300000).toISOString(), tokenCount: 42 },
        { role: 'user', content: 'Plan task breakdown for project: Implement user authentication with OAuth2 and JWT token management', timestamp: new Date(Date.now() - 290000).toISOString(), tokenCount: 28 },
        { role: 'assistant', content: 'I\'ll create a comprehensive task breakdown for this authentication project.\n\n## Task Plan\n\n1. **Design auth database schema** - Create migration files for users, sessions, tokens tables\n2. **Implement OAuth2 provider integration** - Google and GitHub OAuth2 flow\n3. **JWT token service** - Token generation, validation, refresh logic\n4. **Auth middleware** - Request authentication and authorization\n5. **Password reset flow** - Email-based password recovery\n6. **Security audit** - Review all auth code for vulnerabilities', timestamp: new Date(Date.now() - 280000).toISOString(), tokenCount: 847 },
        { role: 'tool', content: '{"tool": "create_task", "args": {"title": "Design auth database schema", "role": "architect", "priority": 3}}', timestamp: new Date(Date.now() - 270000).toISOString(), tokenCount: 35 },
        { role: 'assistant', content: 'Task created successfully. Proceeding with the remaining tasks...', timestamp: new Date(Date.now() - 260000).toISOString(), tokenCount: 12 },
        { role: 'tool', content: '{"tool": "create_task", "args": {"title": "Implement OAuth2 provider integration", "role": "builder", "priority": 3}}', timestamp: new Date(Date.now() - 250000).toISOString(), tokenCount: 38 },
        { role: 'assistant', content: 'All 6 tasks have been created and queued. The dependency chain ensures the architect designs schemas first, then builders implement, followed by QA review.', timestamp: new Date(Date.now() - 240000).toISOString(), tokenCount: 156 },
      ];
      return mockMessages;
    },

    async getCronJobs() {
      await delay(60);
      return [...mockCronJobs];
    },

    async getTranscript(agentId: string, sessionKey: string) {
      void agentId;
      void sessionKey;
      await delay(100);
      const mockTranscript: TranscriptResponse = {
        items: [
          { index: 0, eventType: 'session', timestamp: new Date(Date.now() - 310000).toISOString(), role: null, contentText: 'Session started', contentParts: [{ type: 'text', text: 'Session started' }], usage: null, model: 'gpt-5.3-codex', metadata: {}, kind: 'event', summary: 'Session started', contentSize: 15, truncated: false, toolMeta: null, toolGroupId: null },
          { index: 1, eventType: 'message', timestamp: new Date(Date.now() - 300000).toISOString(), role: 'system', contentText: 'You are the Architect agent.', contentParts: [{ type: 'text', text: 'You are the Architect agent.' }], usage: { inputTokens: 42, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, model: null, metadata: {}, kind: 'chat', summary: 'You are the Architect agent.', contentSize: 28, truncated: false, toolMeta: null, toolGroupId: null },
          { index: 2, eventType: 'message', timestamp: new Date(Date.now() - 290000).toISOString(), role: 'user', contentText: 'Plan task breakdown for auth project', contentParts: [{ type: 'text', text: 'Plan task breakdown for auth project' }], usage: { inputTokens: 28, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, model: null, metadata: {}, kind: 'chat', summary: 'Plan task breakdown for auth project', contentSize: 36, truncated: false, toolMeta: null, toolGroupId: null },
          { index: 3, eventType: 'message', timestamp: new Date(Date.now() - 280000).toISOString(), role: 'assistant', contentText: 'I will create a comprehensive breakdown:\n\n1. Design schema\n2. Build API\n3. Write tests', contentParts: [{ type: 'thinking', text: 'Let me analyze the auth project requirements...' }, { type: 'text', text: 'I will create a comprehensive breakdown:\n\n1. Design schema\n2. Build API\n3. Write tests' }], usage: { inputTokens: 100, outputTokens: 350, cacheReadTokens: 20, cacheCreationTokens: 0 }, model: null, metadata: {}, kind: 'chat', summary: 'I will create a comprehensive breakdown:\n\n1. Design schema\n2. Build API\n3. Write tests', contentSize: 90, truncated: false, toolMeta: null, toolGroupId: null },
          { index: 4, eventType: 'message', timestamp: new Date(Date.now() - 270000).toISOString(), role: 'assistant', contentText: '[Tool call: create_task]', contentParts: [{ type: 'tool_use', toolCallId: 'tc1', toolName: 'create_task', input: { title: 'Design schema', role: 'architect' } }], usage: { inputTokens: 0, outputTokens: 35, cacheReadTokens: 0, cacheCreationTokens: 0 }, model: null, metadata: {}, kind: 'tool_call', summary: '⚡ create_task  →  title=Design schema', contentSize: 52, truncated: false, toolMeta: { toolName: 'create_task', toolCallId: 'tc1', status: 'called' }, toolGroupId: 'tc1' },
          { index: 5, eventType: 'message', timestamp: new Date(Date.now() - 265000).toISOString(), role: 'tool', contentText: '[Tool result: Task created successfully]', contentParts: [{ type: 'tool_result', toolCallId: 'tc1', text: 'Task created successfully with id task-001', isError: false }], usage: null, model: null, metadata: {}, kind: 'tool_result', summary: '✓ Result (43 B): Task created successfully with id task-001', contentSize: 43, truncated: false, toolMeta: { toolName: 'create_task', toolCallId: 'tc1', status: 'success' }, toolGroupId: 'tc1' },
        ],
        totalEvents: 6,
        messageCount: 5,
        hasMore: false,
        sessionId: sessionKey,
        model: 'gpt-5.3-codex',
        parseErrors: 0,
        toolCallCount: 1,
      };
      return mockTranscript;
    },

    async getTranscriptItemRaw(agentId: string, sessionKey: string, itemIndex: number) {
      void agentId; void sessionKey;
      const transcript = await this.getTranscript(agentId, sessionKey);
      const item = transcript.items.find(i => i.index === itemIndex);
      if (!item) throw new Error(`Item ${itemIndex} not found`);
      return item;
    },

    async getSystemHealth() {
      await delay(40);
      return { ...mockHealth, timestamp: new Date().toISOString() };
    },

    async approveProject() { throw new Error('Not supported in mock provider'); },
    async requestChanges() { throw new Error('Not supported in mock provider'); },
    async setProjectStatus() { throw new Error('Not supported in mock provider'); },
    async pauseOrchestrator() { throw new Error('Not supported in mock provider'); },
    async resumeOrchestrator() { throw new Error('Not supported in mock provider'); },
    async enableCronJob() { throw new Error('Not supported in mock provider'); },
    async disableCronJob() { throw new Error('Not supported in mock provider'); },
    async runCronJob() { throw new Error('Not supported in mock provider'); },
    async createProject() { throw new Error('Not supported in mock provider'); },
    async sendManagerMessage() { throw new Error('Not supported in mock provider'); },
    async getManagerSession() { throw new Error('Not supported in mock provider'); },
  };
}
