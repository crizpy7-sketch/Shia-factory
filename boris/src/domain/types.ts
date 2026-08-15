/**
 * BORIS-001 domain model.
 *
 * These types are the contract between the storage layer, the agent loop, the API and the
 * dashboard. Nothing vendor-specific belongs here.
 */

export type TaskStatus =
  | 'queued'
  | 'planning'
  | 'working'
  | 'verifying'
  | 'blocked'
  | 'awaiting_approval'
  | 'failed'
  | 'completed'
  | 'cancelled';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'queued', 'planning', 'working', 'verifying', 'blocked',
  'awaiting_approval', 'failed', 'completed', 'cancelled',
] as const;

export const TERMINAL_STATUSES: readonly TaskStatus[] = ['failed', 'completed', 'cancelled'] as const;

/** Runtime state exposed by the heartbeat. Drives the avatar; must reflect reality. */
export type HeartbeatState =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'researching'
  | 'analyzing'
  | 'working'
  | 'testing'
  | 'bug_found'
  | 'fixing'
  | 'blocked'
  | 'awaiting_approval'
  | 'deploying'
  | 'learning'
  | 'done'
  | 'error'
  | 'sleep';

export type ApprovalState = 'none' | 'requested' | 'approved' | 'rejected';

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Task {
  id: string;
  parentTaskId: string | null;
  title: string;
  objective: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  assignedAgent: string;
  workspace: string;
  dependencies: string[];
  attempts: number;
  maxAttempts: number;
  result: string | null;
  evidence: Evidence[];
  error: string | null;
  approvalState: ApprovalState;
  usage: UsageTotals;
  scheduleId: string | null;
  depth: number;
  plan: Plan | null;
  /** Stable signature of the last failure, used to detect recurrence across attempts. */
  failureSignature: string | null;
}

export interface PlanStep {
  step: string;
  why: string;
  verification: string;
  done: boolean;
}

/** A plan is recorded before mutation is permitted, so intent is inspectable and auditable. */
export interface Plan {
  summary: string;
  steps: PlanStep[];
  risks: string[];
  verificationCommand: string | null;
  createdAt: string;
}

export interface Evidence {
  kind: 'command' | 'tool' | 'file' | 'test' | 'observation' | 'plan' | 'verification';
  summary: string;
  detail: string;
  createdAt: string;
  ok: boolean;
}

export interface UsageTotals {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolCalls: number;
  workers: number;
}

export function emptyUsage(): UsageTotals {
  return { modelCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, toolCalls: 0, workers: 0 };
}

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

export interface AgentRun {
  id: string;
  taskId: string;
  agentId: string;
  role: string;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  provider: string;
  model: string;
  turns: number;
  parentRunId: string | null;
  depth: number;
  usage: UsageTotals;
  error: string | null;
  heartbeat: HeartbeatState;
  /** Set on process start; a run whose owner differs from the live process is recoverable. */
  ownerPid: number;
  ownerBootId: string;
}

export type EventType =
  | 'task.created' | 'task.started' | 'task.completed' | 'task.failed' | 'task.cancelled'
  | 'task.blocked' | 'task.recovered'
  | 'plan.created'
  | 'run.started' | 'run.completed' | 'run.failed' | 'run.interrupted'
  | 'model.requested' | 'model.completed' | 'model.failed' | 'model.invalid_output'
  | 'tool.requested' | 'tool.started' | 'tool.completed' | 'tool.failed' | 'tool.denied'
  | 'worker.started' | 'worker.completed' | 'worker.failed' | 'worker.rejected'
  | 'verification.started' | 'verification.passed' | 'verification.failed'
  | 'repair.started'
  | 'approval.requested' | 'approval.approved' | 'approval.rejected'
  | 'memory.created' | 'memory.retrieved'
  | 'skill.loaded' | 'skill.created'
  | 'limit.reached'
  | 'heartbeat.changed'
  | 'schedule.fired';

export interface AgentEvent {
  id: string;
  type: EventType;
  taskId: string | null;
  runId: string | null;
  workerId: string | null;
  toolCallId: string | null;
  at: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  summary: string;
  data: Record<string, unknown>;
}

export type ToolCallStatus = 'requested' | 'denied' | 'running' | 'completed' | 'failed';

export interface ToolCallRecord {
  id: string;
  taskId: string;
  runId: string;
  tool: string;
  input: Record<string, unknown>;
  status: ToolCallStatus;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  ok: boolean | null;
  output: string | null;
  error: string | null;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  runId: string | null;
  action: string;
  tool: string | null;
  input: Record<string, unknown>;
  reason: string;
  risk: string;
  consequence: string;
  state: ApprovalState;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
}

export type MemoryCategory = 'identity' | 'procedural' | 'episodic' | 'failure' | 'research' | 'task';

export interface MemoryRecord {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  tags: string[];
  source: string;
  provenance: string;
  confidence: number;
  verified: boolean;
  supersededBy: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  useCount: number;
}

export interface Skill {
  id: string;
  name: string;
  purpose: string;
  version: string;
  triggers: string[];
  requiredTools: string[];
  instructions: string;
  verification: string;
  createdAt: string;
  source: string;
}

export interface ScheduleRecord {
  id: string;
  name: string;
  kind: 'once' | 'recurring';
  /** Milliseconds between runs for 'recurring'; ignored for 'once'. */
  intervalMs: number | null;
  nextRunAt: string;
  lastRunAt: string | null;
  enabled: boolean;
  objective: string;
  workspace: string;
  priority: TaskPriority;
  runCount: number;
  maxRuns: number | null;
  createdAt: string;
}

export interface UsageRecord {
  id: string;
  taskId: string | null;
  runId: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  at: string;
  latencyMs: number;
  ok: boolean;
}

export interface AgentStatus {
  agentId: string;
  displayName: string;
  heartbeat: HeartbeatState;
  provider: string;
  model: string;
  providerAvailable: boolean;
  uptimeSeconds: number;
  bootId: string;
  currentTaskId: string | null;
  currentObjective: string | null;
  currentStep: string | null;
  currentTool: string | null;
  activeWorkers: number;
  queueDepth: number;
  certification: string;
  recertification: string;
}
