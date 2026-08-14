/**
 * Task state machine.
 *
 * Transitions are explicit and enforced. An illegal transition throws rather than silently
 * corrupting state — a task that reaches a wrong state is worse than one that stops.
 */
import { TaskStatus, TERMINAL_STATUSES, HeartbeatState } from './types.js';

const ALLOWED: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ['planning', 'working', 'cancelled', 'blocked', 'failed'],
  planning: ['working', 'blocked', 'awaiting_approval', 'failed', 'cancelled'],
  working: ['verifying', 'blocked', 'awaiting_approval', 'failed', 'cancelled', 'working'],
  verifying: ['completed', 'working', 'failed', 'blocked', 'cancelled'],
  blocked: ['queued', 'working', 'planning', 'cancelled', 'failed'],
  awaiting_approval: ['queued', 'working', 'planning', 'blocked', 'cancelled', 'failed'],
  failed: ['queued'],
  completed: [],
  cancelled: [],
};

export class IllegalTransitionError extends Error {
  constructor(public readonly from: TaskStatus, public readonly to: TaskStatus) {
    super(`Illegal task transition: ${from} -> ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses whose work is outstanding and must be recovered after a restart. */
export function isOutstanding(status: TaskStatus): boolean {
  return status === 'planning' || status === 'working' || status === 'verifying';
}

const HEARTBEAT_FOR_STATUS: Record<TaskStatus, HeartbeatState> = {
  queued: 'idle',
  planning: 'planning',
  working: 'working',
  verifying: 'testing',
  blocked: 'blocked',
  awaiting_approval: 'awaiting_approval',
  failed: 'error',
  completed: 'done',
  cancelled: 'idle',
};

export function heartbeatForStatus(status: TaskStatus): HeartbeatState {
  return HEARTBEAT_FOR_STATUS[status];
}
