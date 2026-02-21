import type {
  SystemSnapshot,
  Project,
  Task,
  Attempt,
  EventItem,
  Agent,
  CronJob,
  Blocker,
  DeadLetter,
  HealthState,
  OrchestratorStatus,
  Alert,
  RetryStorm,
} from '@/types/domain';

const now = new Date().toISOString();
const ago = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();

export const mockProjects: Project[] = [
  {
    id: 'proj-a1b2c3d4',
    goal: 'Implement user authentication with OAuth2 and JWT token management',
    status: 'ACTIVE',
    priority: 3,
    routeType: 'coding',
    activePlanVersion: 2,
    maxReplanCycles: 3,
    replanCount: 1,
    createdBy: 'coordinator',
    metadata: null,
    createdAt: ago(180),
    updatedAt: ago(5),
    taskSummary: { total: 8, done: 3, inProgress: 2, blocked: 0, failed: 0, todo: 1, ready: 1, review: 1, cancelled: 0 },
  },
  {
    id: 'proj-e5f6g7h8',
    goal: 'Research competitor landscape and compile strategic analysis report',
    status: 'WAITING_USER_APPROVAL',
    priority: 2,
    routeType: 'research',
    activePlanVersion: 1,
    maxReplanCycles: 3,
    replanCount: 0,
    createdBy: 'coordinator',
    metadata: null,
    createdAt: ago(360),
    updatedAt: ago(12),
    taskSummary: { total: 5, done: 5, inProgress: 0, blocked: 0, failed: 0, todo: 0, ready: 0, review: 0, cancelled: 0 },
  },
  {
    id: 'proj-i9j0k1l2',
    goal: 'Refactor payment processing pipeline and add Stripe integration',
    status: 'ACTIVE',
    priority: 5,
    routeType: 'coding',
    activePlanVersion: 1,
    maxReplanCycles: 3,
    replanCount: 0,
    createdBy: 'coordinator',
    metadata: null,
    createdAt: ago(90),
    updatedAt: ago(2),
    taskSummary: { total: 12, done: 4, inProgress: 3, blocked: 1, failed: 1, todo: 2, ready: 1, review: 0, cancelled: 0 },
  },
  {
    id: 'proj-m3n4o5p6',
    goal: 'Design and build notification system with email and push support',
    status: 'QUEUED',
    priority: 1,
    routeType: 'hybrid',
    activePlanVersion: 1,
    maxReplanCycles: 3,
    replanCount: 0,
    createdBy: 'coordinator',
    metadata: null,
    createdAt: ago(30),
    updatedAt: ago(30),
    taskSummary: { total: 0, done: 0, inProgress: 0, blocked: 0, failed: 0, todo: 0, ready: 0, review: 0, cancelled: 0 },
  },
  {
    id: 'proj-q7r8s9t0',
    goal: 'Fix critical memory leak in websocket connection handler',
    status: 'BLOCKED',
    priority: 4,
    routeType: 'coding',
    activePlanVersion: 1,
    maxReplanCycles: 3,
    replanCount: 0,
    createdBy: 'coordinator',
    metadata: null,
    createdAt: ago(240),
    updatedAt: ago(60),
    taskSummary: { total: 3, done: 1, inProgress: 0, blocked: 1, failed: 1, todo: 0, ready: 0, review: 0, cancelled: 0 },
  },
  {
    id: 'proj-u1v2w3x4',
    goal: 'Completed: API documentation generation from OpenAPI specs',
    status: 'COMPLETED',
    priority: 2,
    routeType: 'hybrid',
    activePlanVersion: 1,
    maxReplanCycles: 3,
    replanCount: 0,
    createdBy: 'coordinator',
    metadata: null,
    createdAt: ago(1440),
    updatedAt: ago(720),
    taskSummary: { total: 6, done: 6, inProgress: 0, blocked: 0, failed: 0, todo: 0, ready: 0, review: 0, cancelled: 0 },
  },
];

export const mockTasks: Task[] = [
  { id: 'task-001', projectId: 'proj-a1b2c3d4', title: 'Design auth database schema', description: 'Create migration files for users, sessions, tokens tables', role: 'architect', status: 'DONE', priority: 3, retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(170), updatedAt: ago(140), attemptCount: 1 },
  { id: 'task-002', projectId: 'proj-a1b2c3d4', title: 'Implement OAuth2 provider integration', description: 'Google and GitHub OAuth2 flow', role: 'builder', status: 'IN_PROGRESS', priority: 3, retryCount: 0, maxRetries: 3, leaseExpiresAt: ago(-10), claimedBy: 'builder', taskKind: 'execution', createdAt: ago(160), updatedAt: ago(3), attemptCount: 2 },
  { id: 'task-003', projectId: 'proj-a1b2c3d4', title: 'JWT token service implementation', description: null, role: 'builder', status: 'IN_PROGRESS', priority: 3, retryCount: 1, maxRetries: 3, leaseExpiresAt: ago(-15), claimedBy: 'builder', taskKind: 'execution', createdAt: ago(150), updatedAt: ago(1), attemptCount: 3 },
  { id: 'task-004', projectId: 'proj-a1b2c3d4', title: 'Write auth middleware tests', description: null, role: 'qa', status: 'REVIEW', priority: 2, retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(140), updatedAt: ago(20), attemptCount: 1 },
  { id: 'task-005', projectId: 'proj-a1b2c3d4', title: 'Research session management best practices', description: null, role: 'scout', status: 'DONE', priority: 2, retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(175), updatedAt: ago(160), attemptCount: 1 },
  { id: 'task-006', projectId: 'proj-a1b2c3d4', title: 'Security audit of auth flow', description: null, role: 'qa', status: 'TODO', priority: 1, retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(130), updatedAt: ago(130), attemptCount: 0 },
  { id: 'task-007', projectId: 'proj-a1b2c3d4', title: 'Implement password reset flow', description: null, role: 'builder', status: 'READY', priority: 2, retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(120), updatedAt: ago(120), attemptCount: 0 },
  { id: 'task-008', projectId: 'proj-a1b2c3d4', title: 'Auth documentation', description: null, role: 'coordinator', status: 'DONE', priority: 1, retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(110), updatedAt: ago(80), attemptCount: 1 },
  { id: 'task-010', projectId: 'proj-i9j0k1l2', title: 'Stripe SDK integration', description: 'Set up Stripe Node SDK and webhook handling', role: 'builder', status: 'IN_PROGRESS', priority: 5, retryCount: 0, maxRetries: 3, leaseExpiresAt: ago(-5), claimedBy: 'builder', taskKind: 'execution', createdAt: ago(85), updatedAt: ago(2), attemptCount: 1 },
  { id: 'task-011', projectId: 'proj-i9j0k1l2', title: 'Payment state machine design', description: null, role: 'architect', status: 'DONE', priority: 5, retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(88), updatedAt: ago(70), attemptCount: 1 },
  { id: 'task-012', projectId: 'proj-i9j0k1l2', title: 'Refund processing handler', description: null, role: 'builder', status: 'BLOCKED', priority: 4, retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(80), updatedAt: ago(40), attemptCount: 0 },
  { id: 'task-013', projectId: 'proj-i9j0k1l2', title: 'Payment webhook testing', description: null, role: 'qa', status: 'FAILED', priority: 3, retryCount: 3, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(75), updatedAt: ago(15), attemptCount: 3 },
  { id: 'task-020', projectId: 'proj-q7r8s9t0', title: 'Diagnose WS memory leak', description: null, role: 'scout', status: 'DONE', priority: 4, retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(200), updatedAt: ago(120), attemptCount: 1 },
  { id: 'task-021', projectId: 'proj-q7r8s9t0', title: 'Implement connection pool fix', description: null, role: 'builder', status: 'BLOCKED', priority: 4, retryCount: 2, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(180), updatedAt: ago(80), attemptCount: 2 },
  { id: 'task-022', projectId: 'proj-q7r8s9t0', title: 'Stress test WS handler', description: null, role: 'qa', status: 'FAILED', priority: 3, retryCount: 3, maxRetries: 3, leaseExpiresAt: null, claimedBy: null, taskKind: 'execution', createdAt: ago(170), updatedAt: ago(70), attemptCount: 3 },
];

export const mockAttempts: Attempt[] = [
  { id: 'att-001', taskId: 'task-002', agentRole: 'builder', status: 'RUNNING', attemptNo: 2, startedAt: ago(3), endedAt: null, errorCode: null, errorMessage: null, invocationMode: 'live', sessionKey: 'sess-abc-001', taskTitle: 'Implement OAuth2 provider integration', projectId: 'proj-a1b2c3d4', projectGoal: 'Implement user authentication with OAuth2 and JWT token management' },
  { id: 'att-002', taskId: 'task-003', agentRole: 'builder', status: 'RUNNING', attemptNo: 3, startedAt: ago(1), endedAt: null, errorCode: null, errorMessage: null, invocationMode: 'live', sessionKey: 'sess-abc-002', taskTitle: 'JWT token service implementation', projectId: 'proj-a1b2c3d4', projectGoal: 'Implement user authentication with OAuth2 and JWT token management' },
  { id: 'att-003', taskId: 'task-010', agentRole: 'builder', status: 'RUNNING', attemptNo: 1, startedAt: ago(7), endedAt: null, errorCode: null, errorMessage: null, invocationMode: 'live', sessionKey: 'sess-abc-003', taskTitle: 'Stripe SDK integration', projectId: 'proj-i9j0k1l2', projectGoal: 'Refactor payment processing pipeline and add Stripe integration' },
  { id: 'att-004', taskId: 'task-002', agentRole: 'builder', status: 'FAILED', attemptNo: 1, startedAt: ago(30), endedAt: ago(25), errorCode: 'TIMEOUT', errorMessage: 'Agent exceeded maximum execution time', invocationMode: 'live', sessionKey: 'sess-old-001', taskTitle: 'Implement OAuth2 provider integration', projectId: 'proj-a1b2c3d4' },
  { id: 'att-005', taskId: 'task-003', agentRole: 'builder', status: 'FAILED', attemptNo: 1, startedAt: ago(50), endedAt: ago(45), errorCode: 'EXEC_ERROR', errorMessage: 'Module not found: @auth/core', invocationMode: 'live', sessionKey: 'sess-old-002', taskTitle: 'JWT token service implementation', projectId: 'proj-a1b2c3d4' },
  { id: 'att-006', taskId: 'task-003', agentRole: 'builder', status: 'FAILED', attemptNo: 2, startedAt: ago(40), endedAt: ago(38), errorCode: 'EXEC_ERROR', errorMessage: 'Test suite failed: 3 assertions', invocationMode: 'live', sessionKey: 'sess-old-003', taskTitle: 'JWT token service implementation', projectId: 'proj-a1b2c3d4' },
  { id: 'att-007', taskId: 'task-020', agentRole: 'scout', status: 'SUCCEEDED', attemptNo: 1, startedAt: ago(130), endedAt: ago(120), errorCode: null, errorMessage: null, invocationMode: 'live', sessionKey: 'sess-old-004', taskTitle: 'Diagnose WS memory leak', projectId: 'proj-q7r8s9t0' },
];

export const mockEvents: EventItem[] = [
  { id: 'evt-001', projectId: 'proj-a1b2c3d4', taskId: 'task-003', eventType: 'ATTEMPT_STARTED', level: 'INFO', source: 'orchestrator', payload: { attemptNo: 3, role: 'builder' }, createdAt: ago(1) },
  { id: 'evt-002', projectId: 'proj-i9j0k1l2', taskId: 'task-010', eventType: 'ATTEMPT_STARTED', level: 'INFO', source: 'orchestrator', payload: { attemptNo: 1, role: 'builder' }, createdAt: ago(2) },
  { id: 'evt-003', projectId: 'proj-a1b2c3d4', taskId: 'task-003', eventType: 'ATTEMPT_COMPLETED', level: 'WARN', source: 'orchestrator', payload: { attemptNo: 2, status: 'FAILED', error: 'Test suite failed' }, createdAt: ago(5) },
  { id: 'evt-004', projectId: 'proj-a1b2c3d4', taskId: 'task-004', eventType: 'TASK_STATUS_CHANGED', level: 'INFO', source: 'orchestrator', payload: { from: 'IN_PROGRESS', to: 'REVIEW' }, createdAt: ago(8) },
  { id: 'evt-005', projectId: 'proj-e5f6g7h8', taskId: null, eventType: 'PROJECT_TRANSITION', level: 'INFO', source: 'orchestrator', payload: { from: 'ACTIVE', to: 'WAITING_USER_APPROVAL' }, createdAt: ago(12) },
  { id: 'evt-006', projectId: 'proj-q7r8s9t0', taskId: 'task-022', eventType: 'ALERT_TRIGGERED', level: 'ERROR', source: 'health_monitor', payload: { alert: 'Retry exhausted', taskTitle: 'Stress test WS handler' }, createdAt: ago(15) },
  { id: 'evt-007', projectId: 'proj-i9j0k1l2', taskId: 'task-013', eventType: 'ATTEMPT_COMPLETED', level: 'ERROR', source: 'orchestrator', payload: { attemptNo: 3, status: 'FAILED', error: 'Webhook signature verification failed' }, createdAt: ago(18) },
  { id: 'evt-008', projectId: 'proj-a1b2c3d4', taskId: 'task-001', eventType: 'TASK_STATUS_CHANGED', level: 'INFO', source: 'orchestrator', payload: { from: 'IN_PROGRESS', to: 'DONE' }, createdAt: ago(25) },
  { id: 'evt-009', projectId: null, taskId: null, eventType: 'SYSTEM_HEARTBEAT', level: 'DEBUG', source: 'orchestrator', payload: { cursor: 15432 }, createdAt: ago(30) },
  { id: 'evt-010', projectId: 'proj-i9j0k1l2', taskId: null, eventType: 'PROJECT_TRANSITION', level: 'INFO', source: 'orchestrator', payload: { from: 'QUEUED', to: 'ACTIVE' }, createdAt: ago(35) },
];

export const mockAgents: Agent[] = [
  { id: 'overmind-coordinator', name: 'Coordinator', role: 'coordinator', status: 'idle', successRate: 96, avgDuration: 120, totalAttempts: 145, recentActivity: Array.from({ length: 24 }, (_, i) => ({ timestamp: ago((23 - i) * 60), count: Math.floor(Math.random() * 5) + 1 })) },
  { id: 'overmind-architect', name: 'Architect', role: 'architect', status: 'idle', successRate: 92, avgDuration: 180, totalAttempts: 87, recentActivity: Array.from({ length: 24 }, (_, i) => ({ timestamp: ago((23 - i) * 60), count: Math.floor(Math.random() * 3) })) },
  { id: 'overmind-builder', name: 'Builder', role: 'builder', status: 'busy', successRate: 84, avgDuration: 300, totalAttempts: 312, recentActivity: Array.from({ length: 24 }, (_, i) => ({ timestamp: ago((23 - i) * 60), count: Math.floor(Math.random() * 8) + 2 })) },
  { id: 'overmind-scout', name: 'Scout', role: 'scout', status: 'idle', successRate: 98, avgDuration: 90, totalAttempts: 64, recentActivity: Array.from({ length: 24 }, (_, i) => ({ timestamp: ago((23 - i) * 60), count: Math.floor(Math.random() * 2) })) },
  { id: 'overmind-oracle', name: 'Oracle', role: 'oracle', status: 'offline', successRate: 91, avgDuration: 150, totalAttempts: 43, recentActivity: Array.from({ length: 24 }, (_, i) => ({ timestamp: ago((23 - i) * 60), count: i < 20 ? Math.floor(Math.random() * 3) : 0 })) },
  { id: 'overmind-qa', name: 'QA', role: 'qa', status: 'idle', successRate: 78, avgDuration: 240, totalAttempts: 98, recentActivity: Array.from({ length: 24 }, (_, i) => ({ timestamp: ago((23 - i) * 60), count: Math.floor(Math.random() * 4) })) },
];

export const mockCronJobs: CronJob[] = [
  { id: 'cron-001', name: 'coordinator:orchestrator-health-check', label: 'Orchestrator Health Check', schedule: '*/5 * * * *', scheduleHuman: 'Every 5 minutes', enabled: true, nextRun: ago(-3), lastRun: ago(2), lastRunStatus: 'success', payload: null, agentRole: 'coordinator', payloadKind: 'agentTurn', description: 'Read HEARTBEAT.md and verify all agent processes are alive and responding within latency targets.', model: 'kimi-coding/k2p5', thinking: 'low', timeoutSeconds: 120, sessionTarget: 'isolated', deliveryMode: 'none', deliveryChannel: null },
  { id: 'cron-002', name: 'scout:dead-letter-sweep', label: 'Dead Letter Sweep', schedule: '0 */6 * * *', scheduleHuman: 'Every 6 hours', enabled: true, nextRun: ago(-180), lastRun: ago(180), lastRunStatus: 'success', payload: null, agentRole: 'scout', payloadKind: 'agentTurn', description: 'Scan the dead-letter queue for failed messages, attempt reprocessing or escalate to coordinator.', model: 'google-gemini-cli/gemini-3-flash-preview', thinking: 'high', timeoutSeconds: 300, sessionTarget: 'isolated', deliveryMode: 'announce', deliveryChannel: 'telegram' },
  { id: 'cron-003', name: 'qa:session-cleanup', label: 'Session Cleanup', schedule: '0 2 * * *', scheduleHuman: 'Daily at 2:00 AM', enabled: true, nextRun: ago(-600), lastRun: ago(840), lastRunStatus: 'success', payload: null, agentRole: 'qa', payloadKind: 'agentTurn', description: 'Archive stale sessions older than 72 hours and prune orphaned context files from workspace.', model: 'kimi-coding/k2p5', thinking: 'low', timeoutSeconds: 600, sessionTarget: 'main', deliveryMode: 'none', deliveryChannel: null },
  { id: 'cron-004', name: 'oracle:metrics-aggregation', label: 'Metrics Aggregation', schedule: '*/30 * * * *', scheduleHuman: 'Every 30 minutes', enabled: false, nextRun: null, lastRun: ago(1440), lastRunStatus: 'failure', payload: null, agentRole: 'oracle', payloadKind: 'agentTurn', description: 'Aggregate performance metrics across all agents and generate a summary report.', model: 'openai-codex/gpt-5.3-codex', thinking: 'medium', timeoutSeconds: 240, sessionTarget: 'isolated', deliveryMode: 'announce', deliveryChannel: 'slack' },
  { id: 'cron-005', name: 'scout:project-stale-check', label: 'Project Stale Check', schedule: '0 */2 * * *', scheduleHuman: 'Every 2 hours', enabled: true, nextRun: ago(-45), lastRun: ago(75), lastRunStatus: 'success', payload: null, agentRole: 'scout', payloadKind: 'systemEvent', description: 'Check for projects with no activity in the last 24 hours and flag them for attention.', model: null, thinking: null, timeoutSeconds: 60, sessionTarget: 'main', deliveryMode: 'none', deliveryChannel: null },
];

const mockOrchestratorStatus: OrchestratorStatus = {
  running: true,
  pid: 42851,
  cursorPosition: 15432,
  cursorLag: 3,
  lastHeartbeat: ago(0.1),
  stagnant: false,
  uptimeSeconds: 86400,
};

const mockHealth: HealthState = {
  overall: 'healthy',
  components: [
    { name: 'API Server', status: 'healthy', latencyMs: 12, message: null },
    { name: 'SQLite Database', status: 'healthy', latencyMs: 2, message: null },
    { name: 'OpenClaw Gateway', status: 'healthy', latencyMs: 45, message: null },
    { name: 'Orchestrator', status: 'healthy', latencyMs: null, message: 'Running, PID 42851' },
  ],
  timestamp: now,
};

const mockAlerts: Alert[] = [
  { id: 'alert-001', severity: 'warning', title: 'Retry Storm Detected', message: 'Task "Payment webhook testing" has failed 3 times in the last hour', source: 'health_monitor', timestamp: ago(15), acknowledged: false },
  { id: 'alert-002', severity: 'info', title: 'Project Awaiting Approval', message: 'Project "Research competitor landscape" is waiting for user approval', source: 'orchestrator', timestamp: ago(12), acknowledged: false },
];

const mockBlockers: Blocker[] = [
  { id: 'blk-001', projectId: 'proj-q7r8s9t0', taskId: 'task-021', sourceRole: 'builder', question: 'Should we use connection pooling library or implement custom pool?', impact: 'Blocks all remaining WS fixes', suggestedAction: 'Use pg-pool for consistency', status: 'OPEN', createdAt: ago(80) },
];

const mockDeadLetters: DeadLetter[] = [
  { id: 'dl-001', projectId: 'proj-i9j0k1l2', taskId: 'task-013', attemptId: 'att-expired', reason: 'Max retries exhausted: Webhook signature verification failed', status: 'OPEN', createdAt: ago(15), projectGoal: 'Refactor payment processing pipeline', taskTitle: 'Payment webhook testing', taskRole: 'qa' },
  { id: 'dl-002', projectId: 'proj-q7r8s9t0', taskId: 'task-022', attemptId: 'att-expired-2', reason: 'Max retries exhausted: Stress test assertions failed', status: 'OPEN', createdAt: ago(70), projectGoal: 'Fix critical memory leak', taskTitle: 'Stress test WS handler', taskRole: 'qa' },
];

const mockRetryStorms: RetryStorm[] = [
  { taskId: 'task-013', taskTitle: 'Payment webhook testing', failCount: 3, totalAttempts: 3, projectId: 'proj-i9j0k1l2' },
];

export const mockSnapshot: SystemSnapshot = {
  health: mockHealth,
  orchestrator: mockOrchestratorStatus,
  summary: {
    activeProjects: 2,
    waitingApproval: 1,
    runningAttempts: 3,
    blockedTasks: 2,
    deadLetters: 2,
    retryStorms: 1,
    totalProjects: 6,
    totalTasks: 15,
  },
  activeProjects: mockProjects.filter((p) => ['ACTIVE', 'WAITING_USER_APPROVAL', 'QUEUED', 'BLOCKED'].includes(p.status)),
  runningAttempts: mockAttempts.filter((a) => a.status === 'RUNNING'),
  recentEvents: mockEvents,
  alerts: mockAlerts,
  retryStorms: mockRetryStorms,
  blockers: mockBlockers,
  deadLetters: mockDeadLetters,
  timestamp: now,
};

export { mockHealth };
