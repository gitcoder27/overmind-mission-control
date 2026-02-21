// Overmind Mission Control - Canonical Domain Types
// All UI components consume these types. Adapters map raw data into these.

export type ProjectStatus =
  | 'QUEUED'
  | 'ACTIVE'
  | 'WAITING_USER_APPROVAL'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'ARCHIVED'
  | 'FAILED';

export type TaskStatus =
  | 'TODO'
  | 'READY'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'DONE'
  | 'BLOCKED'
  | 'FAILED'
  | 'CANCELLED';

export type AttemptStatus =
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'CANCELLED';

export type AgentRole =
  | 'coordinator'
  | 'architect'
  | 'builder'
  | 'scout'
  | 'oracle'
  | 'qa';

export type RouteType = 'coding' | 'research' | 'hybrid';

export type EventLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export type BlockerStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface Project {
  id: string;
  goal: string;
  status: ProjectStatus;
  priority: number;
  routeType: RouteType | null;
  activePlanVersion: number;
  maxReplanCycles: number;
  replanCount: number;
  createdBy: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  taskSummary?: TaskSummary;
}

export interface TaskSummary {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  failed: number;
  todo: number;
  ready: number;
  review: number;
  cancelled: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  role: AgentRole;
  status: TaskStatus;
  priority: number;
  retryCount: number;
  maxRetries: number;
  leaseExpiresAt: string | null;
  claimedBy: string | null;
  taskKind: string;
  createdAt: string;
  updatedAt: string;
  latestAttempt?: Attempt | null;
  attemptCount?: number;
}

export interface Attempt {
  id: string;
  taskId: string;
  agentRole: AgentRole;
  status: AttemptStatus;
  attemptNo: number;
  startedAt: string | null;
  endedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  invocationMode: string;
  sessionKey: string | null;
  taskTitle?: string;
  projectId?: string;
  projectGoal?: string;
}

export interface EventItem {
  id: string;
  projectId: string | null;
  taskId: string | null;
  eventType: string;
  level: EventLevel;
  source: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: 'idle' | 'busy' | 'offline';
  successRate: number;
  avgDuration: number;
  totalAttempts: number;
  recentActivity: AgentActivity[];
  // v1.1 – model visibility & profile health
  effectiveModel?: string | null;
  modelSource?: 'primary' | 'default' | 'unknown';
  registered?: boolean;
  workspace?: string | null;
  profileHealth?: ProfileHealth;
}

export interface ProfileHealth {
  ok: boolean;
  missingFiles: string[];
}

export interface AgentActivity {
  timestamp: string;
  count: number;
}

export interface AgentFileInfo {
  name: string;
  key: string;
  relativePath: string;
  exists: boolean;
  size: number | null;
  updatedAt: string | null;
}

export interface AgentFileContent {
  key: string;
  name: string;
  content: string;
  size: number;
}

export interface AgentSession {
  sessionKey: string;
  agentId: string;
  updatedAt: string;
  createdAt: string;
  messageCount: number | null;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string | null;
  tokenCount: number | null;
}

// ── Rich transcript types (v2) ──────────────────────────────────

export type ContentPartType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result';

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ThinkingContentPart {
  type: 'thinking';
  text: string;
}

export interface ToolUseContentPart {
  type: 'tool_use';
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown> | string;
}

export interface ToolResultContentPart {
  type: 'tool_result';
  toolCallId: string;
  text: string;
  isError: boolean;
}

export type ContentPart =
  | TextContentPart
  | ThinkingContentPart
  | ToolUseContentPart
  | ToolResultContentPart;

export type TranscriptEventType =
  | 'message'
  | 'model_change'
  | 'thinking_level_change'
  | 'session'
  | string;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

// v2 – structured tool metadata returned by enhanced transcript endpoint
export interface ToolMeta {
  toolName: string | null;
  toolCallId: string;
  status?: 'called' | 'success' | 'error';
  isError?: boolean;
}

export type TranscriptItemKind = 'chat' | 'tool_call' | 'tool_result' | 'event';

export interface TranscriptItem {
  index: number;
  eventType: TranscriptEventType;
  timestamp: string | null;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'toolResult' | null;
  contentText: string;
  contentParts: ContentPart[];
  usage: TokenUsage | null;
  model: string | null;
  metadata: Record<string, unknown>;
  // v2 enrichments
  kind: TranscriptItemKind;
  summary: string;
  contentSize: number;
  truncated: boolean;
  toolMeta: ToolMeta | null;
  toolGroupId: string | null;
}

/** A paired tool invocation: call + optional result grouped by toolGroupId. */
export interface ToolGroup {
  groupId: string;
  call: TranscriptItem;
  result: TranscriptItem | null;
}

export interface TranscriptResponse {
  items: TranscriptItem[];
  totalEvents: number;
  messageCount: number;
  hasMore: boolean;
  sessionId: string | null;
  model: string | null;
  parseErrors: number;
  toolCallCount: number;
}

export interface CronJob {
  id: string;
  name: string;
  label: string;
  schedule: string;
  scheduleHuman: string;
  enabled: boolean;
  nextRun: string | null;
  lastRun: string | null;
  lastRunStatus: 'success' | 'failure' | null;
  payload: Record<string, unknown> | null;
  agentRole: string | null;
  payloadKind: 'agentTurn' | 'systemEvent' | string | null;
  description: string | null;
  model: string | null;
  thinking: string | null;
  timeoutSeconds: number | null;
  sessionTarget: 'main' | 'isolated' | string | null;
  deliveryMode: 'none' | 'announce' | string | null;
  deliveryChannel: string | null;
}

export interface Blocker {
  id: string;
  projectId: string | null;
  taskId: string | null;
  sourceRole: AgentRole;
  question: string;
  impact: string | null;
  suggestedAction: string | null;
  status: BlockerStatus;
  createdAt: string;
}

export interface DeadLetter {
  id: string;
  projectId: string | null;
  taskId: string | null;
  attemptId: string | null;
  reason: string;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
  projectGoal?: string;
  taskTitle?: string;
  taskRole?: AgentRole;
}

export interface OrchestratorStatus {
  running: boolean;
  pid: number | null;
  cursorPosition: number;
  cursorLag: number;
  lastHeartbeat: string | null;
  stagnant: boolean;
  uptimeSeconds: number | null;
}

export interface OrchestratorRestartResult {
  restarted: boolean;
  output: string;
}

export interface HealthComponent {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number | null;
  message: string | null;
}

export interface HealthState {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: HealthComponent[];
  timestamp: string;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  source: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface RetryStorm {
  taskId: string;
  taskTitle: string;
  failCount: number;
  totalAttempts: number;
  projectId: string;
}

export interface SystemSnapshot {
  health: HealthState;
  orchestrator: OrchestratorStatus;
  summary: {
    activeProjects: number;
    waitingApproval: number;
    runningAttempts: number;
    blockedTasks: number;
    deadLetters: number;
    retryStorms: number;
    totalProjects: number;
    totalTasks: number;
  };
  activeProjects: Project[];
  runningAttempts: Attempt[];
  recentEvents: EventItem[];
  alerts: Alert[];
  retryStorms: RetryStorm[];
  blockers: Blocker[];
  deadLetters: DeadLetter[];
  timestamp: string;
}

export interface WsEvent {
  type: string;
  seq: number;
  timestamp: string;
  payload: unknown;
}

// ──────────────────────────────────────────────────────
// Control Surface Types
// ──────────────────────────────────────────────────────

export type IntakeRouteType = 'auto' | 'coding' | 'research' | 'hybrid';

export interface IntakeRequest {
  goal: string;
  routeType: IntakeRouteType;
  priority: number;
  notes?: string;
}

export interface IntakeResult {
  projectId: string;
  status: string;
  routeType: string;
  priority: number;
}

export interface ManagerMessageRequest {
  sessionKey: string;
  message: string;
}

export interface ManagerMessageResult {
  messages: { role: 'assistant'; content: string }[];
  sessionKey: string;
  model: string | null;
  usage: Record<string, number> | null;
  raw?: unknown;
}

export interface ManagerChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string | null;
}

export interface ManagerSessionResult {
  sessionKey: string;
  messages: ManagerChatMessage[];
  count: number;
}
