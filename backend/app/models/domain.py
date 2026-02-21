"""Domain models – Pydantic schemas matching the frontend TypeScript types.

Field names are camelCase to match the frontend contract verbatim.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ── Project ──────────────────────────────────────────────────────

class TaskSummary(BaseModel):
    total: int = 0
    done: int = 0
    inProgress: int = 0
    blocked: int = 0
    failed: int = 0
    todo: int = 0
    ready: int = 0
    review: int = 0
    cancelled: int = 0


class Project(BaseModel):
    id: str
    goal: str
    status: str
    priority: int
    routeType: str | None = None
    activePlanVersion: int = 1
    maxReplanCycles: int = 3
    replanCount: int = 0
    createdBy: str = "coordinator"
    metadata: dict[str, Any] | None = None
    createdAt: str
    updatedAt: str
    taskSummary: TaskSummary | None = None


# ── Task ─────────────────────────────────────────────────────────

class Attempt(BaseModel):
    id: str
    taskId: str
    agentRole: str
    status: str
    attemptNo: int = 1
    startedAt: str | None = None
    endedAt: str | None = None
    errorCode: str | None = None
    errorMessage: str | None = None
    invocationMode: str = "mock"
    sessionKey: str | None = None
    taskTitle: str | None = None
    projectId: str | None = None
    projectGoal: str | None = None


class Task(BaseModel):
    id: str
    projectId: str
    title: str
    description: str | None = None
    role: str
    status: str
    priority: int = 1
    retryCount: int = 0
    maxRetries: int = 3
    leaseExpiresAt: str | None = None
    claimedBy: str | None = None
    taskKind: str = "execution"
    createdAt: str
    updatedAt: str
    latestAttempt: Attempt | None = None
    attemptCount: int | None = None


# ── Event ────────────────────────────────────────────────────────

class EventItem(BaseModel):
    id: str
    projectId: str | None = None
    taskId: str | None = None
    eventType: str
    level: str = "INFO"
    source: str = "orchestrator"
    payload: dict[str, Any] = Field(default_factory=dict)
    createdAt: str


# ── Agent ────────────────────────────────────────────────────────

class AgentActivity(BaseModel):
    timestamp: str
    count: int


class Agent(BaseModel):
    id: str
    name: str
    role: str
    status: str = "idle"
    successRate: float = 0.0
    avgDuration: float = 0.0
    totalAttempts: int = 0
    recentActivity: list[AgentActivity] = Field(default_factory=list)


# ── Cron ─────────────────────────────────────────────────────────

class CronJob(BaseModel):
    id: str
    name: str
    schedule: str
    scheduleHuman: str = ""
    enabled: bool = True
    nextRun: str | None = None
    lastRun: str | None = None
    lastRunStatus: str | None = None
    payload: dict[str, Any] | None = None


# ── Blocker ──────────────────────────────────────────────────────

class Blocker(BaseModel):
    id: str
    projectId: str | None = None
    taskId: str | None = None
    sourceRole: str
    question: str
    impact: str | None = None
    suggestedAction: str | None = None
    status: str = "OPEN"
    createdAt: str


# ── Dead Letter ──────────────────────────────────────────────────

class DeadLetter(BaseModel):
    id: str
    projectId: str | None = None
    taskId: str | None = None
    attemptId: str | None = None
    reason: str
    status: str = "OPEN"
    createdAt: str
    projectGoal: str | None = None
    taskTitle: str | None = None
    taskRole: str | None = None


# ── Orchestrator ─────────────────────────────────────────────────

class OrchestratorStatus(BaseModel):
    running: bool = False
    pid: int | None = None
    cursorPosition: int = 0
    cursorLag: int = 0
    lastHeartbeat: str | None = None
    stagnant: bool = False
    uptimeSeconds: float | None = None


# ── Health ───────────────────────────────────────────────────────

class HealthComponent(BaseModel):
    name: str
    status: str = "healthy"
    latencyMs: float | None = None
    message: str | None = None


class HealthState(BaseModel):
    overall: str = "healthy"
    components: list[HealthComponent] = Field(default_factory=list)
    timestamp: str = ""


# ── Alert ────────────────────────────────────────────────────────

class Alert(BaseModel):
    id: str
    severity: str = "info"
    title: str
    message: str
    source: str
    timestamp: str
    acknowledged: bool = False


# ── Retry Storm ──────────────────────────────────────────────────

class RetryStorm(BaseModel):
    taskId: str
    taskTitle: str
    failCount: int
    totalAttempts: int
    projectId: str


# ── Snapshot ─────────────────────────────────────────────────────

class SnapshotSummary(BaseModel):
    activeProjects: int = 0
    waitingApproval: int = 0
    runningAttempts: int = 0
    blockedTasks: int = 0
    deadLetters: int = 0
    retryStorms: int = 0
    totalProjects: int = 0
    totalTasks: int = 0


class SystemSnapshot(BaseModel):
    health: HealthState
    orchestrator: OrchestratorStatus
    summary: SnapshotSummary
    activeProjects: list[Project] = Field(default_factory=list)
    runningAttempts: list[Attempt] = Field(default_factory=list)
    recentEvents: list[EventItem] = Field(default_factory=list)
    alerts: list[Alert] = Field(default_factory=list)
    retryStorms: list[RetryStorm] = Field(default_factory=list)
    blockers: list[Blocker] = Field(default_factory=list)
    deadLetters: list[DeadLetter] = Field(default_factory=list)
    timestamp: str = ""
