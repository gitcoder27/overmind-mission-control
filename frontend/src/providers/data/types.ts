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
  OrchestratorRestartResult,
} from '@/types/domain';

export interface ProviderCapabilities {
  realtime: boolean;
  mutations: boolean;
  approveProject: boolean;
  requestChanges: boolean;
  setProjectStatus: boolean;
  pauseOrchestrator: boolean;
  resumeOrchestrator: boolean;
  restartOrchestrator: boolean;
  cronActions: boolean;
  controlIntake: boolean;
  controlChat: boolean;
}

export interface DataProvider {
  name: string;
  capabilities: ProviderCapabilities;

  // Queries
  getSnapshot(): Promise<SystemSnapshot>;
  getProjects(filters?: Record<string, string>): Promise<Project[]>;
  getProject(id: string): Promise<Project>;
  getProjectTasks(id: string): Promise<Task[]>;
  getEvents(filters?: Record<string, string>): Promise<EventItem[]>;
  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent>;
  getAgentFiles(id: string): Promise<AgentFileInfo[]>;
  getAgentFileContent(id: string, fileKey: string): Promise<AgentFileContent>;
  getAgentSessions(id: string): Promise<AgentSession[]>;
  getSessionMessages(agentId: string, sessionKey: string): Promise<SessionMessage[]>;
  getTranscript(agentId: string, sessionKey: string, params?: {
    limit?: number;
    offset?: number;
    includeEvents?: boolean;
    includeThinking?: boolean;
    maxContentSize?: number;
  }): Promise<TranscriptResponse>;
  getTranscriptItemRaw(agentId: string, sessionKey: string, itemIndex: number): Promise<TranscriptItem>;
  getCronJobs(): Promise<CronJob[]>;
  getSystemHealth(): Promise<HealthState>;

  // Mutations
  approveProject(id: string, notes?: string): Promise<void>;
  requestChanges(id: string, notes?: string): Promise<void>;
  setProjectStatus(id: string, status: string, reason?: string): Promise<void>;
  pauseOrchestrator(): Promise<void>;
  resumeOrchestrator(): Promise<void>;
  restartOrchestrator(): Promise<OrchestratorRestartResult>;
  enableCronJob(id: string): Promise<void>;
  disableCronJob(id: string): Promise<void>;
  runCronJob(id: string): Promise<void>;

  // Control Surface
  createProject(intake: IntakeRequest): Promise<IntakeResult>;
  sendManagerMessage(req: ManagerMessageRequest): Promise<ManagerMessageResult>;
  getManagerSession(sessionKey: string): Promise<ManagerSessionResult>;
}
