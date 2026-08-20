/**
 * Resource and cost controls.
 *
 * When a ceiling is reached the task is blocked and surfaced for a human decision — never
 * silently continued, never silently dropped.
 */
import { Limits } from '../config.js';
import { Task, UsageTotals } from '../domain/types.js';

export interface LimitVerdict {
  ok: boolean;
  limit?: keyof Limits;
  reason?: string;
}

const OK: LimitVerdict = { ok: true };

export function checkTaskLimits(task: Task, limits: Limits, nowMs = Date.now()): LimitVerdict {
  const usage: UsageTotals = task.usage;
  if (usage.modelCalls >= limits.maxModelCallsPerTask) {
    return { ok: false, limit: 'maxModelCallsPerTask', reason: `model call budget exhausted (${usage.modelCalls}/${limits.maxModelCallsPerTask})` };
  }
  if (usage.toolCalls >= limits.maxToolCallsPerTask) {
    return { ok: false, limit: 'maxToolCallsPerTask', reason: `tool call budget exhausted (${usage.toolCalls}/${limits.maxToolCallsPerTask})` };
  }
  if (usage.costUsd >= limits.maxCostUsdPerTask) {
    return { ok: false, limit: 'maxCostUsdPerTask', reason: `cost ceiling reached ($${usage.costUsd.toFixed(4)}/$${limits.maxCostUsdPerTask})` };
  }
  if (task.startedAt) {
    const elapsed = nowMs - Date.parse(task.startedAt);
    if (Number.isFinite(elapsed) && elapsed > limits.maxTaskDurationMs) {
      return { ok: false, limit: 'maxTaskDurationMs', reason: `task exceeded its time budget (${Math.round(elapsed / 1000)}s/${Math.round(limits.maxTaskDurationMs / 1000)}s)` };
    }
  }
  return OK;
}

export function checkWorkerLimits(task: Task, limits: Limits, depth: number): LimitVerdict {
  if (depth > limits.maxWorkerDepth) {
    return { ok: false, limit: 'maxWorkerDepth', reason: `worker depth ${depth} exceeds the maximum of ${limits.maxWorkerDepth}` };
  }
  if (task.usage.workers >= limits.maxWorkersPerTask) {
    return { ok: false, limit: 'maxWorkersPerTask', reason: `worker budget exhausted (${task.usage.workers}/${limits.maxWorkersPerTask})` };
  }
  return OK;
}

export function checkAttempts(task: Task): LimitVerdict {
  if (task.attempts >= task.maxAttempts) {
    return { ok: false, limit: 'maxAttempts', reason: `attempt budget exhausted (${task.attempts}/${task.maxAttempts})` };
  }
  return OK;
}

export function addUsage(base: UsageTotals, delta: Partial<UsageTotals>): UsageTotals {
  return {
    modelCalls: base.modelCalls + (delta.modelCalls ?? 0),
    inputTokens: base.inputTokens + (delta.inputTokens ?? 0),
    outputTokens: base.outputTokens + (delta.outputTokens ?? 0),
    costUsd: base.costUsd + (delta.costUsd ?? 0),
    toolCalls: base.toolCalls + (delta.toolCalls ?? 0),
    workers: base.workers + (delta.workers ?? 0),
  };
}
