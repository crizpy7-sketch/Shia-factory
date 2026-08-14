/**
 * Runtime assembly and the operations the API, CLI and worker all share.
 */
import { Config, loadConfig } from './config.js';
import { BorisAgent } from './agent/loop.js';
import { AgentStatus, ApprovalRequest, HeartbeatState, ScheduleRecord, Task, TaskPriority, emptyUsage } from './domain/types.js';
import { isOutstanding } from './domain/state.js';
import { EventBus } from './events/bus.js';
import { BorisIdentity, loadIdentity } from './identity/loader.js';
import { MemoryStore } from './memory/store.js';
import { createProvider } from './providers/index.js';
import { ModelProvider } from './providers/types.js';
import { SkillRegistry } from './skills/registry.js';
import { SqliteStorage } from './storage/sqlite.js';
import { Storage } from './storage/types.js';
import { createAgentTools } from './tools/agent.js';
import { registerBuiltins } from './tools/builtin.js';
import { ToolRegistry } from './tools/registry.js';
import { id, now } from './util/ids.js';
import { Logger } from './util/log.js';
import { resolveWorkspacePath } from './policy/permissions.js';
import { mkdirSync } from 'node:fs';

export interface Runtime {
  config: Config;
  storage: Storage;
  bus: EventBus;
  provider: ModelProvider;
  tools: ToolRegistry;
  memory: MemoryStore;
  skills: SkillRegistry;
  identity: BorisIdentity;
  agent: BorisAgent;
  logger: Logger;
  startedAt: number;
  heartbeat: HeartbeatState;
}

export interface CreateRuntimeOptions {
  config?: Partial<Config>;
  storage?: Storage;
  provider?: ModelProvider;
  logger?: Logger;
}

export function createRuntime(options: CreateRuntimeOptions = {}): Runtime {
  const config = loadConfig(options.config ?? {});
  const logger = options.logger ?? new Logger(config.logLevel, { agent: config.agentId });
  const storage = options.storage ?? new SqliteStorage(config.dbPath);
  storage.migrate();

  const bus = new EventBus(storage, logger);
  const identity = loadIdentity(config.identityDir);
  const memory = new MemoryStore(storage);
  const skills = new SkillRegistry(storage);
  const provider = options.provider ?? createProvider(config);

  const tools = new ToolRegistry();
  registerBuiltins(tools);
  for (const tool of createAgentTools({ memory, skills })) tools.register(tool);

  for (const root of config.workspaceRoots) mkdirSync(root, { recursive: true });

  const runtime: Runtime = {
    config, storage, bus, provider, tools, memory, skills, identity,
    agent: new BorisAgent({ config, storage, bus, provider, tools, memory, skills, identity, logger }),
    logger,
    startedAt: Date.now(),
    heartbeat: 'idle',
  };
  return runtime;
}

/** First-boot bootstrap: seed skills and import BORIS's portable state into memory. */
export function bootstrap(runtime: Runtime): { skills: number; memories: number; skipped: string[] } {
  const seeded = runtime.skills.seed();
  const imported = runtime.memory.importPortableState(runtime.config.identityDir);
  runtime.logger.info('bootstrap complete', {
    skillsSeeded: seeded, memoriesImported: imported.imported, skipped: imported.skipped,
  });
  return { skills: seeded, memories: imported.imported, skipped: imported.skipped };
}

export interface SubmitOptions {
  title?: string;
  description?: string;
  workspace?: string;
  priority?: TaskPriority;
  maxAttempts?: number;
  scheduleId?: string | null;
}

export function submitObjective(runtime: Runtime, objective: string, options: SubmitOptions = {}): Task {
  const trimmed = objective.trim();
  if (trimmed.length < 10) throw new Error('objective must be at least 10 characters');
  if (trimmed.length > 8000) throw new Error('objective is too long (8000 character limit)');

  const requested = options.workspace ?? runtime.config.workspaceRoots[0] ?? '';
  const resolved = resolveWorkspacePath(
    { workspaceRoots: runtime.config.workspaceRoots, workspace: runtime.config.workspaceRoots[0] ?? '' },
    requested,
  );
  if (!resolved.ok) throw new Error(`workspace rejected: ${resolved.reason}`);
  mkdirSync(resolved.path, { recursive: true });

  const task: Task = {
    id: id('task'),
    parentTaskId: null,
    title: (options.title ?? trimmed.split('\n')[0] ?? trimmed).slice(0, 120),
    objective: trimmed,
    description: options.description ?? '',
    status: 'queued',
    priority: options.priority ?? 'normal',
    createdAt: now(),
    updatedAt: now(),
    startedAt: null,
    completedAt: null,
    assignedAgent: runtime.config.agentId,
    workspace: resolved.path,
    dependencies: [],
    attempts: 0,
    maxAttempts: options.maxAttempts ?? runtime.config.limits.maxAttempts,
    result: null,
    evidence: [],
    error: null,
    approvalState: 'none',
    usage: emptyUsage(),
    scheduleId: options.scheduleId ?? null,
    depth: 0,
  };
  runtime.storage.createTask(task);
  runtime.bus.emit('task.created', task.title, { taskId: task.id, data: { objective: trimmed, workspace: task.workspace } });
  return task;
}

/**
 * Restart recovery. Runs owned by a previous boot are marked interrupted and their tasks are
 * returned to the queue with their evidence intact, so work resumes instead of being lost.
 */
export function recoverOutstandingWork(runtime: Runtime): { runs: number; tasks: string[] } {
  const orphans = runtime.storage.findOrphanedRuns(runtime.config.bootId);
  for (const run of orphans) {
    runtime.storage.updateRun(run.id, {
      status: 'interrupted', endedAt: now(), error: 'process restarted while this run was active',
    });
    runtime.bus.emit('run.interrupted', 'run interrupted by a restart', {
      taskId: run.taskId, runId: run.id, level: 'warn',
    });
  }

  const recovered: string[] = [];
  for (const task of runtime.storage.listTasks({ limit: 500 })) {
    if (!isOutstanding(task.status)) continue;
    runtime.storage.updateTask(task.id, { status: 'blocked', error: 'interrupted by restart' });
    runtime.storage.updateTask(task.id, { status: 'queued', error: null });
    runtime.bus.emit('task.recovered', 'requeued after restart', { taskId: task.id, level: 'warn' });
    recovered.push(task.id);
  }
  if (orphans.length || recovered.length) {
    runtime.logger.warn('recovered outstanding work', { runs: orphans.length, tasks: recovered.length });
  }
  return { runs: orphans.length, tasks: recovered };
}

export function decideApproval(
  runtime: Runtime,
  approvalId: string,
  decision: 'approved' | 'rejected',
  by: string,
  note: string | null,
): { approval: ApprovalRequest; task: Task } {
  const approval = runtime.storage.decideApproval(approvalId, decision, by, note);
  const task = runtime.storage.getTask(approval.taskId);
  if (!task) throw new Error(`Task not found for approval: ${approval.taskId}`);

  if (decision === 'approved') {
    const updated = runtime.storage.updateTask(task.id, {
      status: 'queued', approvalState: 'approved', error: null,
    });
    runtime.bus.emit('approval.approved', `${approval.action} approved by ${by}`, {
      taskId: task.id, data: { approvalId, note },
    });
    return { approval, task: updated };
  }
  const updated = runtime.storage.updateTask(task.id, {
    status: 'failed', approvalState: 'rejected',
    error: `approval rejected by ${by}${note ? `: ${note}` : ''}`,
    completedAt: now(),
  });
  runtime.bus.emit('approval.rejected', `${approval.action} rejected by ${by}`, {
    taskId: task.id, level: 'warn', data: { approvalId, note },
  });
  return { approval, task: updated };
}

export function cancelTask(runtime: Runtime, taskId: string): Task {
  const task = runtime.storage.getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status === 'completed' || task.status === 'cancelled') {
    throw new Error(`task is already ${task.status} and cannot be cancelled`);
  }
  const updated = runtime.storage.updateTask(taskId, { status: 'cancelled', completedAt: now() });
  runtime.bus.emit('task.cancelled', 'cancelled by operator', { taskId, level: 'warn' });
  return updated;
}

export function agentStatus(runtime: Runtime): AgentStatus {
  const running = runtime.storage.listTasks({ status: ['planning', 'working', 'verifying'], limit: 5 });
  const current = running[0] ?? null;
  const currentRun = current ? runtime.storage.listRuns(current.id).at(-1) ?? null : null;
  const activeToolCall = current
    ? runtime.storage.listToolCalls(current.id).filter((c) => c.status === 'running').at(-1) ?? null
    : null;
  const availability = runtime.provider.available();

  return {
    agentId: runtime.identity.agentId,
    displayName: runtime.identity.displayName,
    heartbeat: currentRun?.heartbeat ?? (runtime.storage.countTasks('queued') > 0 ? 'idle' : runtime.heartbeat),
    provider: runtime.provider.isTestDouble ? `${runtime.provider.name} (test double)` : runtime.provider.name,
    model: runtime.provider.model,
    providerAvailable: availability.ok,
    uptimeSeconds: Math.round((Date.now() - runtime.startedAt) / 1000),
    bootId: runtime.config.bootId,
    currentTaskId: current?.id ?? null,
    currentObjective: current?.objective ?? null,
    currentStep: currentRun ? `${currentRun.role} · turn ${currentRun.turns}` : null,
    currentTool: activeToolCall?.tool ?? null,
    activeWorkers: current ? runtime.storage.listTasks({ parentTaskId: current.id, limit: 50 })
      .filter((t) => t.status === 'working' || t.status === 'planning').length : 0,
    queueDepth: runtime.storage.countTasks('queued'),
    certification: runtime.identity.certificationStatus,
    recertification: /Status:\s*(\w+)/.exec(runtime.identity.recertification)?.[1] ?? 'UNKNOWN',
  };
}

export function createSchedule(runtime: Runtime, input: {
  name: string;
  objective: string;
  kind: 'once' | 'recurring';
  intervalMs?: number | null;
  runAt?: string;
  workspace?: string;
  priority?: TaskPriority;
  maxRuns?: number | null;
}): ScheduleRecord {
  if (input.kind === 'recurring' && (!input.intervalMs || input.intervalMs < 1000)) {
    throw new Error('recurring schedules need an intervalMs of at least 1000');
  }
  const workspace = input.workspace ?? runtime.config.workspaceRoots[0] ?? '';
  const resolved = resolveWorkspacePath(
    { workspaceRoots: runtime.config.workspaceRoots, workspace: runtime.config.workspaceRoots[0] ?? '' },
    workspace,
  );
  if (!resolved.ok) throw new Error(`workspace rejected: ${resolved.reason}`);

  const schedule: ScheduleRecord = {
    id: id('sched'),
    name: input.name,
    kind: input.kind,
    intervalMs: input.kind === 'recurring' ? (input.intervalMs ?? null) : null,
    nextRunAt: input.runAt ?? now(),
    lastRunAt: null,
    enabled: true,
    objective: input.objective,
    workspace: resolved.path,
    priority: input.priority ?? 'normal',
    runCount: 0,
    maxRuns: input.maxRuns ?? null,
    createdAt: now(),
  };
  return runtime.storage.putSchedule(schedule);
}
