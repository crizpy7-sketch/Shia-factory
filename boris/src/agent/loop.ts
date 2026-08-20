/**
 * The BORIS agent loop.
 *
 * Read → Plan → Act → Observe → Verify → Repeat, with every step persisted so a restart resumes
 * rather than forgets. Success claims are not taken on trust: when the agent reports completion
 * with a verification command, the runtime re-runs that command itself and sends failures back
 * for repair.
 */
import { Config } from '../config.js';
import { AgentRun, Evidence, HeartbeatState, Task, TaskStatus, emptyUsage } from '../domain/types.js';
import { assertTransition } from '../domain/state.js';
import { EventBus } from '../events/bus.js';
import { AgentCharter, BorisIdentity, buildSystemPrompt } from '../identity/loader.js';
import { DEFAULT_CHARTER } from '../identity/roster.js';
import { MemoryStore } from '../memory/store.js';
import { captureFailure, countPriorOccurrences } from '../memory/learning.js';
import { addUsage, checkTaskLimits, checkWorkerLimits } from '../policy/limits.js';
import { PermissionContext, checkCommand, parseCommand } from '../policy/permissions.js';
import { CompletionRequest, ContentBlock, ModelMessage, ModelProvider, ProviderError } from '../providers/types.js';
import { SkillRegistry } from '../skills/registry.js';
import { Storage } from '../storage/types.js';
import { isControlTool } from '../tools/agent.js';
import { runProcess } from '../tools/builtin.js';
import { ToolContext, ToolRegistry } from '../tools/registry.js';
import { id, now, truncate } from '../util/ids.js';
import { Logger } from '../util/log.js';
import { validate } from '../util/validate.js';

export interface AgentDeps {
  config: Config;
  storage: Storage;
  bus: EventBus;
  provider: ModelProvider;
  tools: ToolRegistry;
  memory: MemoryStore;
  skills: SkillRegistry;
  identity: BorisIdentity;
  logger: Logger;
  /** How this agent is briefed. Defaults to the engineering charter. */
  charter?: AgentCharter;
  /**
   * The tools this agent may call at all, enforced at authorize time rather than merely hidden
   * from the prompt. undefined = every registered tool. A delegation's narrower allowlist is
   * intersected with this, so a subagent can never exceed the agent who spawned it.
   */
  agentTools?: string[] | undefined;
}

export interface RunOptions {
  role?: string;
  allowedTools?: string[];
  depth?: number;
  parentRunId?: string | null;
  maxTurns?: number;
  signal?: AbortSignal;
}

export interface RunOutcome {
  runId: string;
  taskId: string;
  status: 'completed' | 'failed' | 'blocked' | 'awaiting_approval' | 'cancelled';
  success: boolean;
  report: string;
  turns: number;
  evidence: Evidence[];
  verified: boolean;
}

/**
 * Tools that change the workspace. None of them run until a plan exists: inspect, then plan,
 * then act. Read-only tools stay open so reconnaissance can happen first.
 */
const MUTATING_TOOLS = new Set(['fs_write', 'fs_edit', 'fs_move', 'fs_delete', 'git_commit']);

const MAX_CONTEXT_CHARS = 60000;
const MAX_NUDGES = 2;
const MAX_VERIFICATION_PROMPTS = 1;

export class BorisAgent {
  constructor(private readonly deps: AgentDeps) {}

  /** Reflects the live state of a run into storage and the event stream. */
  private setHeartbeat(run: AgentRun, state: HeartbeatState, detail: string): AgentRun {
    if (run.heartbeat === state) return run;
    const updated = this.deps.storage.updateRun(run.id, { heartbeat: state });
    this.deps.bus.emit('heartbeat.changed', `${state}: ${detail}`, {
      taskId: run.taskId, runId: run.id, data: { state, detail },
    });
    return updated;
  }

  private transition(task: Task, to: TaskStatus, patch: Partial<Task> = {}): Task {
    if (task.status !== to) assertTransition(task.status, to);
    return this.deps.storage.updateTask(task.id, { ...patch, status: to });
  }

  private addEvidence(task: Task, evidence: Evidence): Task {
    return this.deps.storage.updateTask(task.id, { evidence: [...task.evidence, evidence] });
  }

  /**
   * Intersects a requested tool list with this agent's own allowlist. Returns undefined only when
   * neither constrains anything, which the registry reads as "every tool".
   */
  private boundedTools(requested: string[] | undefined): string[] | undefined {
    const mine = this.deps.agentTools;
    if (!mine) return requested;
    if (!requested) return [...mine];
    const allowed = new Set(mine);
    return requested.filter((name) => allowed.has(name));
  }

  private permissionContext(task: Task): PermissionContext {
    return {
      workspaceRoots: this.deps.config.workspaceRoots,
      workspace: task.workspace,
      autoApprove: this.deps.config.autoApprove,
    };
  }

  /**
   * Keeps the conversation inside a bounded budget by collapsing the oldest observations first.
   * The system prompt and the most recent turns always survive.
   */
  private trim(messages: ModelMessage[]): ModelMessage[] {
    let total = JSON.stringify(messages).length;
    if (total <= MAX_CONTEXT_CHARS) return messages;
    const trimmed = messages.map((m) => ({ ...m, content: m.content.map((c) => ({ ...c })) }));
    for (let i = 0; i < trimmed.length - 4 && total > MAX_CONTEXT_CHARS; i++) {
      const message = trimmed[i];
      if (!message) continue;
      for (const block of message.content) {
        if (block.type === 'tool_result' && block.content.length > 400) {
          total -= block.content.length - 400;
          block.content = `${block.content.slice(0, 400)}\n… [earlier observation collapsed]`;
        }
      }
    }
    return trimmed;
  }

  private priorContext(task: Task): string {
    const decided = this.deps.storage.listApprovals()
      .filter((a) => a.taskId === task.id && a.state !== 'requested');
    const approvals = decided.map((a) => `- approval "${a.action}" was ${a.state}${a.decisionNote ? ` (${a.decisionNote})` : ''}`);
    const recurrence = task.failureSignature
      ? countPriorOccurrences(this.deps.storage, task.failureSignature) : 0;
    if (!task.evidence.length && task.attempts === 0 && !approvals.length) return '';
    const lines = task.evidence.slice(-12).map((e) => `- [${e.kind}${e.ok ? '' : ' FAILED'}] ${e.summary}`);
    return [
      '',
      `## Prior work on this task (attempt ${task.attempts + 1})`,
      'This task has run before. Earlier evidence, most recent last:',
      ...lines,
      task.error ? `Last error: ${task.error}` : '',
      ...(approvals.length ? ['', '## Approval decisions', ...approvals] : []),
      ...(recurrence >= 2 ? ['',
        `## This failure has now happened ${recurrence} times`,
        'A further one-off repair is the wrong answer. Find the root cause, and leave behind a',
        'permanent safeguard — a test, a validation rule, or a skill — so it cannot recur silently.',
      ] : []),
      'Do not repeat work that already succeeded. Verify anything you intend to rely on.',
    ].filter(Boolean).join('\n');
  }

  async runTask(taskId: string, options: RunOptions = {}): Promise<RunOutcome> {
    const { storage, bus, provider, tools, config, logger } = this.deps;
    let task = storage.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const depth = options.depth ?? task.depth;
    const charter = this.deps.charter ?? DEFAULT_CHARTER;
    /* A run is labelled with the agent's own role. Calling Gary's work "principal engineer" in the
       activity stream would misreport who did it. */
    const role = options.role ?? charter.role;
    const maxTurns = Math.min(options.maxTurns ?? config.limits.maxTurnsPerRun, config.limits.maxTurnsPerRun);

    const run: AgentRun = storage.createRun({
      id: id('run'),
      taskId,
      agentId: this.deps.identity.agentId,
      role,
      status: 'running',
      startedAt: now(),
      endedAt: null,
      provider: provider.name,
      model: provider.model,
      turns: 0,
      parentRunId: options.parentRunId ?? null,
      depth,
      usage: emptyUsage(),
      error: null,
      heartbeat: 'planning',
      ownerPid: process.pid,
      ownerBootId: config.bootId,
    });
    const log = logger.child({ taskId, runId: run.id });
    bus.emit('run.started', `${role} run started (${provider.name}/${provider.model})`, {
      taskId, runId: run.id, data: { role, depth, provider: provider.name, model: provider.model, testDouble: provider.isTestDouble },
    });

    const finish = (
      status: RunOutcome['status'],
      success: boolean,
      report: string,
      verified: boolean,
      turns: number,
    ): RunOutcome => {
      storage.updateRun(run.id, {
        status: status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'failed',
        endedAt: now(),
        turns,
        heartbeat: status === 'completed' ? 'done' : status === 'awaiting_approval' ? 'awaiting_approval' : 'error',
        ...(success ? {} : { error: report.slice(0, 2000) }),
      });
      bus.emit(status === 'completed' ? 'run.completed' : 'run.failed', truncate(report, 300), {
        taskId, runId: run.id, level: success ? 'info' : 'warn', data: { status, verified, turns },
      });
      const finalTask = storage.getTask(taskId);
      return {
        runId: run.id, taskId, status, success, report, turns,
        evidence: finalTask?.evidence ?? [], verified,
      };
    };

    // ---- identity, memory and skills are selected per objective, never dumped wholesale
    const selectedMemory = this.deps.memory.retrieve({ objective: `${task.title} ${task.objective}`, taskId, limit: 8 });
    const selectedSkills = this.deps.skills.select(`${task.title} ${task.objective}`, 3);
    if (selectedMemory.length) {
      bus.emit('memory.retrieved', `${selectedMemory.length} memories selected`, {
        taskId, runId: run.id, data: { ids: selectedMemory.map((m) => m.record.id) },
      });
    }
    if (selectedSkills.length) {
      bus.emit('skill.loaded', `skills: ${selectedSkills.map((s) => s.name).join(', ')}`, {
        taskId, runId: run.id, data: { skills: selectedSkills.map((s) => s.name) },
      });
    }

    /* The agent's own boundary always applies. A delegation may narrow it further; it can never
       widen it, so a subagent cannot reach a tool its parent was never given. */
    const allowedTools = this.boundedTools(options.allowedTools);
    const toolSpecs = tools.specs(allowedTools);
    const system = buildSystemPrompt(this.deps.identity, {
      workspace: task.workspace,
      toolNames: toolSpecs.map((t) => t.name),
      memory: this.deps.memory.format(selectedMemory),
      skills: this.deps.skills.format(selectedSkills),
      objective: task.objective,
      role,
      charter,
    });

    const messages: ModelMessage[] = [{
      role: 'user',
      content: [{
        type: 'text',
        text: [
          `Objective: ${task.objective}`,
          task.description ? `Context: ${task.description}` : '',
          `Workspace: ${task.workspace}`,
          this.priorContext(task),
          '',
          'Begin with reconnaissance. Use tools; do not answer from assumption.',
        ].filter(Boolean).join('\n'),
      }],
    }];

    task = this.transition(task, 'planning', { attempts: task.attempts + 1 });
    this.setHeartbeat(run, 'planning', 'building a plan');
    bus.emit('task.started', `attempt ${task.attempts} of ${task.maxAttempts}`, { taskId, runId: run.id });

    let nudges = 0;
    let verificationPrompts = 0;
    let turns = 0;

    for (turns = 1; turns <= maxTurns; turns++) {
      if (options.signal?.aborted) {
        this.transition(task, 'cancelled');
        return finish('cancelled', false, 'run cancelled', false, turns);
      }

      task = storage.getTask(taskId) as Task;
      const limitVerdict = checkTaskLimits(task, config.limits);
      if (!limitVerdict.ok) {
        bus.emit('limit.reached', limitVerdict.reason ?? 'limit reached', {
          taskId, runId: run.id, level: 'warn', data: { limit: limitVerdict.limit },
        });
        this.transition(task, 'blocked', { error: limitVerdict.reason ?? 'limit reached' });
        this.setHeartbeat(run, 'blocked', limitVerdict.reason ?? 'limit reached');
        return finish('blocked', false, `Blocked: ${limitVerdict.reason}`, false, turns);
      }

      // ---------------------------------------------------------------- model
      this.setHeartbeat(run, turns === 1 ? 'thinking' : 'working', `turn ${turns}`);
      const request: CompletionRequest = {
        system,
        messages: this.trim(messages),
        tools: toolSpecs.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        maxOutputTokens: config.limits.maxOutputTokens,
        timeoutMs: config.limits.modelTimeoutMs,
      };
      bus.emit('model.requested', `turn ${turns}`, { taskId, runId: run.id, level: 'debug' });

      let completion;
      try {
        completion = await provider.complete(request);
      } catch (error) {
        const message = error instanceof ProviderError ? error.message : (error as Error).message;
        bus.emit('model.failed', truncate(message, 300), { taskId, runId: run.id, level: 'error' });
        storage.recordUsage({
          id: id('use'), taskId, runId: run.id, provider: provider.name, model: provider.model,
          inputTokens: 0, outputTokens: 0, costUsd: null, at: now(), latencyMs: 0, ok: false,
        });
        task = this.transition(storage.getTask(taskId) as Task, 'blocked', {
          error: `provider failure: ${message}`,
        });
        this.setHeartbeat(run, 'error', 'provider failure');
        return finish('blocked', false, `Provider failure: ${message}`, false, turns);
      }

      storage.recordUsage({
        id: id('use'), taskId, runId: run.id, provider: completion.provider, model: completion.model,
        inputTokens: completion.usage.inputTokens, outputTokens: completion.usage.outputTokens,
        costUsd: completion.costUsd, at: now(), latencyMs: completion.latencyMs, ok: true,
      });
      task = storage.updateTask(taskId, {
        usage: addUsage(task.usage, {
          modelCalls: 1,
          inputTokens: completion.usage.inputTokens,
          outputTokens: completion.usage.outputTokens,
          costUsd: completion.costUsd ?? 0,
        }),
      });
      storage.updateRun(run.id, {
        turns,
        usage: addUsage(storage.getRun(run.id)?.usage ?? emptyUsage(), {
          modelCalls: 1,
          inputTokens: completion.usage.inputTokens,
          outputTokens: completion.usage.outputTokens,
          costUsd: completion.costUsd ?? 0,
        }),
      });
      bus.emit('model.completed', `turn ${turns}: ${completion.toolUses.length} tool call(s)`, {
        taskId, runId: run.id, level: 'debug',
        data: { stopReason: completion.stopReason, tokens: completion.usage, latencyMs: completion.latencyMs },
      });

      // ------------------------------------------------- malformed / no action
      if (!completion.toolUses.length) {
        if (nudges >= MAX_NUDGES) {
          const reason = 'the model produced no tool call after repeated prompting';
          bus.emit('model.invalid_output', reason, { taskId, runId: run.id, level: 'error' });
          task = this.transition(storage.getTask(taskId) as Task, 'failed', { error: reason, completedAt: now() });
          return finish('failed', false, `Failed: ${reason}. Last text: ${truncate(completion.text, 500)}`, false, turns);
        }
        nudges += 1;
        bus.emit('model.invalid_output', `no tool call on turn ${turns}; prompting for action`, {
          taskId, runId: run.id, level: 'warn',
        });
        messages.push({ role: 'assistant', content: [{ type: 'text', text: completion.text || '(no output)' }] });
        messages.push({
          role: 'user',
          content: [{
            type: 'text',
            text: 'That was not an action. Use a tool to make progress, or call report_result to finish. Do not answer in prose.',
          }],
        });
        continue;
      }

      const assistantBlocks: ContentBlock[] = [];
      if (completion.text.trim()) assistantBlocks.push({ type: 'text', text: completion.text });
      for (const use of completion.toolUses) {
        assistantBlocks.push({ type: 'tool_use', id: use.id, name: use.name, input: use.input });
      }
      messages.push({ role: 'assistant', content: assistantBlocks });

      const resultBlocks: ContentBlock[] = [];
      let terminal: RunOutcome | null = null;

      for (const use of completion.toolUses) {
        if (terminal) break;
        const ctx: ToolContext = {
          config,
          permissions: this.permissionContext(task),
          taskId,
          runId: run.id,
          workspace: task.workspace,
          logger: log,
          storage,
          workerId: options.parentRunId ? run.id : null,
          signal: options.signal ?? new AbortController().signal,
        };

        const toolCallId = id('tc');
        if (MUTATING_TOOLS.has(use.name) && !task.plan) {
          const reason = 'no plan recorded yet — call the plan tool before changing the workspace';
          storage.recordToolCall({
            id: toolCallId, taskId, runId: run.id, tool: use.name, input: (use.input ?? {}),
            status: 'denied', startedAt: now(), endedAt: now(), durationMs: 0, ok: false,
            output: null, error: reason,
          });
          bus.emit('tool.denied', `${use.name} denied: ${reason}`, {
            taskId, runId: run.id, toolCallId, level: 'warn', data: { tool: use.name, reason },
          });
          resultBlocks.push({
            type: 'tool_result', toolUseId: use.id, isError: true,
            content: `DENIED: ${reason}. Inspect what you need, then call plan with steps, verification and risks.`,
          });
          continue;
        }

        const { tool, input, decision } = tools.authorize(use.name, use.input, ctx, allowedTools);

        if (!tool || decision.kind === 'deny') {
          storage.recordToolCall({
            id: toolCallId, taskId, runId: run.id, tool: use.name, input: (use.input ?? {}),
            status: 'denied', startedAt: now(), endedAt: now(), durationMs: 0, ok: false,
            output: null, error: decision.reason,
          });
          bus.emit('tool.denied', `${use.name} denied: ${decision.reason}`, {
            taskId, runId: run.id, toolCallId, level: 'warn', data: { tool: use.name, reason: decision.reason },
          });
          resultBlocks.push({
            type: 'tool_result', toolUseId: use.id, isError: true,
            content: `DENIED: ${decision.reason}`,
          });
          continue;
        }

        if (decision.kind === 'require_approval') {
          const approval = storage.createApproval({
            id: id('apr'), taskId, runId: run.id, action: `${use.name}`, tool: use.name,
            input, reason: decision.reason,
            risk: decision.risk ?? 'unspecified risk',
            consequence: decision.consequence ?? `If approved, ${use.name} runs as requested.`,
            state: 'requested', requestedAt: now(), decidedAt: null, decidedBy: null, decisionNote: null,
          });
          bus.emit('approval.requested', `${use.name}: ${decision.reason}`, {
            taskId, runId: run.id, toolCallId, level: 'warn', data: { approvalId: approval.id, tool: use.name },
          });
          storage.recordToolCall({
            id: toolCallId, taskId, runId: run.id, tool: use.name, input,
            status: 'denied', startedAt: now(), endedAt: now(), durationMs: 0, ok: false,
            output: null, error: `awaiting approval ${approval.id}`,
          });
          task = this.transition(storage.getTask(taskId) as Task, 'awaiting_approval', { approvalState: 'requested' });
          this.setHeartbeat(run, 'awaiting_approval', decision.reason);
          terminal = finish('awaiting_approval', false,
            `Paused for approval ${approval.id}: ${decision.reason}`, false, turns);
          break;
        }

        // ------------------------------------------------------ control tools
        if (isControlTool(use.name)) {
          if (use.name === 'request_approval') {
            const approval = storage.createApproval({
              id: id('apr'), taskId, runId: run.id, action: String(input['action']), tool: null,
              input, reason: String(input['reason']), risk: String(input['risk']),
              consequence: String(input['consequence']), state: 'requested', requestedAt: now(),
              decidedAt: null, decidedBy: null, decisionNote: null,
            });
            bus.emit('approval.requested', String(input['action']), {
              taskId, runId: run.id, level: 'warn', data: { approvalId: approval.id },
            });
            task = this.transition(storage.getTask(taskId) as Task, 'awaiting_approval', { approvalState: 'requested' });
            this.setHeartbeat(run, 'awaiting_approval', String(input['action']));
            terminal = finish('awaiting_approval', false,
              `Paused for approval ${approval.id}: ${String(input['action'])}`, false, turns);
            break;
          }

          if (use.name === 'plan') {
            const steps = (input['steps'] as Array<Record<string, unknown>>).map((step) => ({
              step: String(step['step'] ?? ''),
              why: String(step['why'] ?? ''),
              verification: String(step['verification'] ?? ''),
              done: false,
            })).filter((step) => step.step.length > 0);
            if (!steps.length) {
              resultBlocks.push({
                type: 'tool_result', toolUseId: use.id, isError: true,
                content: 'DENIED: a plan needs at least one step with a description.',
              });
              continue;
            }
            const recorded = {
              summary: String(input['summary']),
              steps,
              risks: ((input['risks'] as string[] | undefined) ?? []).map(String),
              verificationCommand: typeof input['verificationCommand'] === 'string'
                ? input['verificationCommand'] : null,
              createdAt: now(),
            };
            task = storage.updateTask(taskId, { plan: recorded });
            storage.recordToolCall({
              id: toolCallId, taskId, runId: run.id, tool: 'plan', input,
              status: 'completed', startedAt: now(), endedAt: now(), durationMs: null,
              ok: true, output: `${steps.length} steps`, error: null,
            });
            bus.emit('plan.created', `${steps.length}-step plan: ${truncate(recorded.summary, 160)}`, {
              taskId, runId: run.id, data: { steps: steps.length, risks: recorded.risks.length },
            });
            task = this.addEvidence(task, {
              kind: 'plan',
              summary: `plan recorded: ${truncate(recorded.summary, 160)}`,
              detail: steps.map((step, index) => `${index + 1}. ${step.step}\n   why: ${step.why}\n   verify: ${step.verification}`).join('\n'),
              createdAt: now(), ok: true,
            });
            this.setHeartbeat(run, 'planning', 'plan recorded');
            resultBlocks.push({
              type: 'tool_result', toolUseId: use.id, isError: false,
              content: `Plan recorded (${steps.length} steps). Workspace changes are now permitted. Follow the plan and verify each step.`,
            });
            continue;
          }

          if (use.name === 'delegate') {
            const workerResult = await this.runWorker(task, run, input, options);
            storage.recordToolCall({
              id: toolCallId, taskId, runId: run.id, tool: 'delegate', input,
              status: workerResult.ok ? 'completed' : 'failed', startedAt: now(), endedAt: now(),
              durationMs: null, ok: workerResult.ok, output: truncate(workerResult.output, 4000),
              error: workerResult.error ?? null,
            });
            resultBlocks.push({
              type: 'tool_result', toolUseId: use.id, isError: !workerResult.ok,
              content: truncate(workerResult.output, 6000),
            });
            task = storage.getTask(taskId) as Task;
            continue;
          }

          // report_result
          const verification = await this.verifyReport(task, run, input);
          storage.recordToolCall({
            id: toolCallId, taskId, runId: run.id, tool: 'report_result', input,
            status: 'completed', startedAt: now(), endedAt: now(), durationMs: null,
            ok: verification.passed, output: truncate(verification.detail, 4000), error: null,
          });

          if (verification.passed) {
            task = this.addEvidence(storage.getTask(taskId) as Task, {
              kind: 'verification',
              summary: verification.summary,
              detail: truncate(verification.detail, 4000),
              createdAt: now(),
              ok: true,
            });
            const success = input['success'] === true;
            const report = String(input['summary']);
            task = this.transition(task, 'verifying');
            task = this.transition(task, success ? 'completed' : 'failed', {
              result: report,
              completedAt: now(),
              ...(success ? {} : { error: 'agent reported the objective was not met' }),
            });
            bus.emit(success ? 'task.completed' : 'task.failed', truncate(report, 300), {
              taskId, runId: run.id, level: success ? 'info' : 'warn',
              data: { verified: verification.verified },
            });
            this.setHeartbeat(run, success ? 'done' : 'error', 'reported');
            terminal = finish(success ? 'completed' : 'failed', success, report, verification.verified, turns);
            break;
          }

          // Verification failed: this is a repair cycle, not a completion.
          if (verification.needsCommand && verificationPrompts >= MAX_VERIFICATION_PROMPTS) {
            task = this.addEvidence(storage.getTask(taskId) as Task, {
              kind: 'verification',
              summary: 'accepted without independent verification',
              detail: 'The agent reported success but supplied no command the runtime could re-run.',
              createdAt: now(), ok: false,
            });
            const report = `${String(input['summary'])}\n\n[UNVERIFIED: no verification command was supplied, so the runtime could not confirm this independently.]`;
            task = this.transition(task, 'verifying');
            task = this.transition(task, 'completed', { result: report, completedAt: now() });
            bus.emit('task.completed', 'completed without independent verification', {
              taskId, runId: run.id, level: 'warn',
            });
            terminal = finish('completed', input['success'] === true, report, false, turns);
            break;
          }
          if (verification.needsCommand) verificationPrompts += 1;

          const learned = captureFailure({ storage, memory: this.deps.memory }, task, {
            kind: 'verification',
            summary: verification.summary,
            detail: verification.detail,
            rootCause: 'the reported repair did not satisfy the verification command',
          });
          task = storage.updateTask(taskId, { failureSignature: learned.signature });
          bus.emit('memory.created', learned.recurring
            ? `recurring failure recorded (${learned.occurrences} occurrences)`
            : 'failure recorded in memory', {
            taskId, runId: run.id, level: learned.recurring ? 'warn' : 'info',
            data: { memoryId: learned.record.id, signature: learned.signature, occurrences: learned.occurrences },
          });
          this.setHeartbeat(run, 'bug_found', 'verification failed');
          bus.emit('verification.failed', verification.summary, {
            taskId, runId: run.id, level: 'warn', data: { detail: truncate(verification.detail, 1000) },
          });
          task = this.addEvidence(storage.getTask(taskId) as Task, {
            kind: 'verification', summary: verification.summary,
            detail: truncate(verification.detail, 4000), createdAt: now(), ok: false,
          });
          bus.emit('repair.started', 'returning to repair after failed verification', { taskId, runId: run.id });
          this.setHeartbeat(run, 'fixing', 'repairing after failed verification');
          resultBlocks.push({
            type: 'tool_result', toolUseId: use.id, isError: true,
            content: `VERIFICATION FAILED — the report was not accepted.\n${verification.detail}\n\nDiagnose and repair, then report again.`,
          });
          continue;
        }

        // ------------------------------------------------------- normal tools
        const startedAt = now();
        const started = Date.now();
        storage.recordToolCall({
          id: toolCallId, taskId, runId: run.id, tool: use.name, input,
          status: 'running', startedAt, endedAt: null, durationMs: null, ok: null, output: null, error: null,
        });
        bus.emit('tool.started', `${use.name}`, {
          taskId, runId: run.id, toolCallId, level: 'debug', data: { tool: use.name, input },
        });
        this.setHeartbeat(run, use.name === 'dev' || use.name === 'shell_run' ? 'testing' : 'working', use.name);

        const result = await tools.execute(tool, input, ctx);
        const durationMs = Date.now() - started;
        storage.updateToolCall(toolCallId, {
          status: result.ok ? 'completed' : 'failed',
          endedAt: now(), durationMs, ok: result.ok,
          output: truncate(result.output, 20000), error: result.error ?? null,
        });
        task = storage.updateTask(taskId, { usage: addUsage((storage.getTask(taskId) as Task).usage, { toolCalls: 1 }) });
        bus.emit(result.ok ? 'tool.completed' : 'tool.failed', `${use.name} ${result.ok ? 'ok' : 'failed'} (${durationMs}ms)`, {
          taskId, runId: run.id, toolCallId, level: result.ok ? 'info' : 'warn',
          data: { tool: use.name, durationMs, ...(result.data ?? {}) },
        });
        task = this.addEvidence(storage.getTask(taskId) as Task, {
          kind: 'tool',
          summary: `${use.name}: ${result.ok ? 'ok' : `failed — ${result.error ?? 'unknown error'}`}`,
          detail: truncate(result.output || result.error || '', 2000),
          createdAt: now(), ok: result.ok,
        });
        if (!result.ok) this.setHeartbeat(run, 'bug_found', `${use.name} failed`);

        resultBlocks.push({
          type: 'tool_result', toolUseId: use.id, isError: !result.ok,
          content: truncate(result.ok ? result.output : `ERROR: ${result.error ?? 'failed'}\n${result.output}`, 12000),
        });
      }

      if (terminal) return terminal;

      if (resultBlocks.length) {
        messages.push({ role: 'user', content: resultBlocks });
        task = this.transition(storage.getTask(taskId) as Task, 'working');
      }
    }

    // The loop counter has already been incremented past the ceiling; report turns actually run.
    const turnsRun = Math.min(turns, maxTurns);
    const reason = `turn budget exhausted after ${maxTurns} turns without a report`;
    bus.emit('task.failed', reason, { taskId, runId: run.id, level: 'warn' });
    let current = storage.getTask(taskId) as Task;
    const exhausted = captureFailure({ storage, memory: this.deps.memory }, current, {
      kind: 'task',
      summary: reason,
      detail: current.evidence.slice(-6).map((e) => `${e.ok ? 'ok' : 'FAILED'} ${e.kind}: ${e.summary}`).join('\n'),
      rootCause: 'the objective was not reached inside the turn budget',
    });
    current = storage.updateTask(taskId, { failureSignature: exhausted.signature });
    this.transition(current, current.attempts >= current.maxAttempts ? 'failed' : 'blocked', {
      error: reason,
      ...(current.attempts >= current.maxAttempts ? { completedAt: now() } : {}),
    });
    this.setHeartbeat(run, 'error', reason);
    return finish(current.attempts >= current.maxAttempts ? 'failed' : 'blocked', false, reason, false, turnsRun);
  }

  /**
   * Independent verification. The runtime re-runs the command the agent nominated; the agent's
   * own claim is never the evidence.
   */
  private async verifyReport(task: Task, run: AgentRun, input: Record<string, unknown>): Promise<{
    passed: boolean; verified: boolean; needsCommand: boolean; summary: string; detail: string;
  }> {
    const { bus, config } = this.deps;
    const success = input['success'] === true;
    const command = typeof input['verificationCommand'] === 'string' ? input['verificationCommand'].trim() : '';

    bus.emit('verification.started', success ? 'verifying reported success' : 'recording reported failure', {
      taskId: task.id, runId: run.id, data: { command: command || null },
    });
    this.setHeartbeat(run, 'testing', 'verifying the report');

    if (!success) {
      return {
        passed: true, verified: false, needsCommand: false,
        summary: 'agent reported failure; no verification required',
        detail: String(input['summary'] ?? ''),
      };
    }

    if (!command) {
      return {
        passed: false, verified: false, needsCommand: true,
        summary: 'success claimed without a verification command',
        detail: 'You claimed success but gave no verificationCommand. Supply a command the runtime can run itself (for example "npm test"), then report again.',
      };
    }

    const decision = checkCommand(this.permissionContext(task), command);
    if (decision.kind !== 'allow') {
      return {
        passed: false, verified: false, needsCommand: true,
        summary: `verification command not permitted: ${decision.reason}`,
        detail: `The runtime refused to run "${command}": ${decision.reason}. Nominate a command inside the workspace policy.`,
      };
    }

    let parsed;
    try {
      parsed = parseCommand(command);
    } catch (error) {
      return {
        passed: false, verified: false, needsCommand: true,
        summary: 'verification command could not be parsed',
        detail: (error as Error).message,
      };
    }

    const outcome = await runProcess(parsed.binary, parsed.args, {
      cwd: task.workspace,
      timeoutMs: config.limits.shellTimeoutMs,
      maxOutputBytes: config.limits.maxShellOutputBytes,
    });
    const detail = [
      `$ ${command}`,
      `exit=${outcome.timedOut ? 'timeout' : outcome.code} duration=${outcome.durationMs}ms`,
      outcome.stdout ? `--- stdout ---\n${truncate(outcome.stdout, 4000)}` : '',
      outcome.stderr ? `--- stderr ---\n${truncate(outcome.stderr, 4000)}` : '',
    ].filter(Boolean).join('\n');

    if (outcome.code === 0 && !outcome.timedOut) {
      bus.emit('verification.passed', `${command} exited 0`, { taskId: task.id, runId: run.id, data: { command } });
      return {
        passed: true, verified: true, needsCommand: false,
        summary: `independent verification passed: ${command} exited 0`,
        detail,
      };
    }
    return {
      passed: false, verified: false, needsCommand: false,
      summary: `independent verification failed: ${command} exited ${outcome.timedOut ? 'timeout' : outcome.code}`,
      detail,
    };
  }

  /** Bounded delegation. The worker's output returns as a claim the parent must verify. */
  private async runWorker(
    parentTask: Task,
    parentRun: AgentRun,
    input: Record<string, unknown>,
    options: RunOptions,
  ): Promise<{ ok: boolean; output: string; error?: string }> {
    const { storage, bus, config } = this.deps;
    const depth = (options.depth ?? parentTask.depth) + 1;
    const verdict = checkWorkerLimits(parentTask, config.limits, depth);
    if (!verdict.ok) {
      bus.emit('worker.rejected', verdict.reason ?? 'worker limit reached', {
        taskId: parentTask.id, runId: parentRun.id, level: 'warn', data: { limit: verdict.limit },
      });
      return { ok: false, output: `DELEGATION REFUSED: ${verdict.reason}`, error: verdict.reason ?? 'limit' };
    }

    const shape = validate<{ role: string; objective: string; completionCriteria: string }>(input, {
      role: { type: 'string', required: true },
      objective: { type: 'string', required: true },
      completionCriteria: { type: 'string', required: true },
    });
    if (!shape.ok || !shape.value) {
      return { ok: false, output: `DELEGATION REFUSED: ${shape.issues.join('; ')}`, error: 'invalid delegation' };
    }

    const requested = (input['allowedTools'] as string[] | undefined) ?? ['fs_list', 'fs_read', 'fs_search', 'report_result'];
    const allowedTools = [...new Set([...requested.filter((t) => this.deps.tools.get(t)), 'report_result'])];

    const subTask: Task = storage.createTask({
      id: id('task'),
      parentTaskId: parentTask.id,
      title: `[${shape.value.role}] ${shape.value.objective.slice(0, 80)}`,
      objective: `${shape.value.objective}\n\nCompletion criteria: ${shape.value.completionCriteria}`,
      description: `Delegated by ${this.deps.identity.agentId} from task ${parentTask.id}.`,
      status: 'queued',
      priority: parentTask.priority,
      createdAt: now(),
      updatedAt: now(),
      startedAt: null,
      completedAt: null,
      assignedAgent: `${this.deps.identity.agentId}:${shape.value.role}`,
      workspace: parentTask.workspace,
      dependencies: [],
      attempts: 0,
      maxAttempts: 1,
      result: null,
      evidence: [],
      error: null,
      approvalState: 'none',
      usage: emptyUsage(),
      scheduleId: null,
      depth,
      plan: null,
      failureSignature: null,
    });

    storage.updateTask(parentTask.id, {
      usage: addUsage((storage.getTask(parentTask.id) as Task).usage, { workers: 1 }),
    });
    bus.emit('worker.started', `${shape.value.role}: ${truncate(shape.value.objective, 120)}`, {
      taskId: parentTask.id, runId: parentRun.id, workerId: subTask.id,
      data: { role: shape.value.role, depth, allowedTools },
    });

    const outcome = await this.runTask(subTask.id, {
      role: shape.value.role,
      allowedTools,
      depth,
      parentRunId: parentRun.id,
      maxTurns: Math.min(typeof input['maxTurns'] === 'number' ? input['maxTurns'] : 8, config.limits.maxTurnsPerRun),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    // Roll the worker's spend up to the parent so budgets are global, not per-agent.
    const child = storage.getTask(subTask.id) as Task;
    storage.updateTask(parentTask.id, {
      usage: addUsage((storage.getTask(parentTask.id) as Task).usage, {
        modelCalls: child.usage.modelCalls,
        inputTokens: child.usage.inputTokens,
        outputTokens: child.usage.outputTokens,
        costUsd: child.usage.costUsd,
        toolCalls: child.usage.toolCalls,
      }),
    });

    bus.emit(outcome.success ? 'worker.completed' : 'worker.failed',
      `${shape.value.role} ${outcome.success ? 'reported completion' : 'did not complete'}`, {
        taskId: parentTask.id, runId: parentRun.id, workerId: subTask.id,
        level: outcome.success ? 'info' : 'warn',
        data: { status: outcome.status, verified: outcome.verified, turns: outcome.turns },
      });

    return {
      ok: outcome.success,
      output: [
        `WORKER RESULT — ${shape.value.role} (task ${subTask.id}, status ${outcome.status})`,
        outcome.verified ? '[independently verified by the runtime]' : '[NOT independently verified]',
        '',
        outcome.report,
        '',
        'This is the worker\'s claim, not established fact. Verify it before relying on it.',
      ].join('\n'),
      ...(outcome.success ? {} : { error: `worker ended ${outcome.status}` }),
    };
  }
}
