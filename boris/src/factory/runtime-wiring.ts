import {
  acceptedWorkUnit,
  evidenceSatisfiesContract,
  readyToRun,
  type CandidateReceipt,
  type EvidenceItem,
  type FactoryTaskContract,
  type FactoryTaskSnapshot,
} from './operating-system.js';

export type RuntimeTaskState =
  | 'ready'
  | 'running'
  | 'verifying'
  | 'review'
  | 'repair'
  | 'accepted'
  | 'escalated'
  | 'blocked'
  | 'cancelled';

export type RuntimeEventType =
  | 'task_ready'
  | 'worker_started'
  | 'verification_started'
  | 'verification_recorded'
  | 'review_started'
  | 'candidate_accepted'
  | 'candidate_rejected'
  | 'repair_started'
  | 'task_escalated';

export interface RuntimeEvent {
  at: string;
  type: RuntimeEventType;
  summary: string;
}

export interface RuntimeCheckpoint {
  taskId: string;
  state: RuntimeTaskState;
  workerId: string | null;
  candidate: string | null;
  evidence: EvidenceItem[];
  repairAttempts: number;
  blocker: string | null;
  exactNextAction: string;
  updatedAt: string;
}

export interface RuntimeTask {
  contract: FactoryTaskContract;
  state: RuntimeTaskState;
  workerId: string | null;
  candidate: string | null;
  evidence: EvidenceItem[];
  receipt: CandidateReceipt | null;
  repairAttempts: number;
  blocker: string | null;
  events: RuntimeEvent[];
  checkpoint: RuntimeCheckpoint;
}

export interface RuntimeResult {
  task: RuntimeTask;
  ok: boolean;
  reasons: string[];
}

function cloneEvidence(evidence: readonly EvidenceItem[]): EvidenceItem[] {
  return evidence.map((item) => ({ ...item }));
}

function event(at: string, type: RuntimeEventType, summary: string): RuntimeEvent {
  return { at, type, summary };
}

function nextActionFor(task: Pick<RuntimeTask, 'state' | 'contract' | 'repairAttempts'>): string {
  switch (task.state) {
    case 'ready':
      return 'Assign an authorized worker and start execution.';
    case 'running':
      return 'Produce a candidate within the task contract, then begin verification.';
    case 'verifying':
      return 'Collect the evidence required by the task contract and acceptance criteria.';
    case 'review':
      return 'Review the exact candidate and authorize, reject, or request bounded repair.';
    case 'repair':
      return `Repair the rejected candidate without widening authority, then re-verify (${task.repairAttempts}/${task.contract.maxRepairAttempts} attempts used).`;
    case 'accepted':
      return 'Persist project state and promote only verified reusable lessons.';
    case 'escalated':
      return 'Escalate with the task contract, candidate, evidence, failure reasons, and repair history.';
    case 'blocked':
      return 'Resolve the recorded blocker before returning the task to READY.';
    case 'cancelled':
      return 'No further action unless the task is explicitly recreated.';
  }
}

function withCheckpoint(task: Omit<RuntimeTask, 'checkpoint'>, at: string): RuntimeTask {
  const completed: RuntimeTask = {
    ...task,
    checkpoint: {
      taskId: task.contract.id,
      state: task.state,
      workerId: task.workerId,
      candidate: task.candidate,
      evidence: cloneEvidence(task.evidence),
      repairAttempts: task.repairAttempts,
      blocker: task.blocker,
      exactNextAction: '',
      updatedAt: at,
    },
  };
  completed.checkpoint.exactNextAction = nextActionFor(completed);
  return completed;
}

export function createRuntimeTask(
  contract: FactoryTaskContract,
  tasks: readonly FactoryTaskSnapshot[],
  at: string,
): RuntimeResult {
  const readiness = readyToRun(contract, tasks);
  if (!readiness.ready) {
    const blocked = withCheckpoint({
      contract,
      state: 'blocked',
      workerId: null,
      candidate: null,
      evidence: [],
      receipt: null,
      repairAttempts: 0,
      blocker: readiness.reasons.join('; '),
      events: [],
    }, at);
    return { task: blocked, ok: false, reasons: readiness.reasons };
  }

  const ready = withCheckpoint({
    contract,
    state: 'ready',
    workerId: null,
    candidate: null,
    evidence: [],
    receipt: null,
    repairAttempts: 0,
    blocker: null,
    events: [event(at, 'task_ready', `${contract.id} passed contract and dependency checks.`)],
  }, at);
  return { task: ready, ok: true, reasons: [] };
}

export function startWorker(task: RuntimeTask, workerId: string, at: string): RuntimeResult {
  if (task.state !== 'ready' && task.state !== 'repair') {
    return { task, ok: false, reasons: [`cannot start worker from ${task.state}`] };
  }
  if (workerId.trim().length === 0) {
    return { task, ok: false, reasons: ['worker id is required'] };
  }

  const isRepair = task.state === 'repair';
  const next = withCheckpoint({
    ...task,
    state: 'running',
    workerId,
    receipt: null,
    blocker: null,
    events: [
      ...task.events,
      event(at, isRepair ? 'repair_started' : 'worker_started', `${workerId} started ${isRepair ? 'bounded repair' : 'execution'} for ${task.contract.id}.`),
    ],
  }, at);
  return { task: next, ok: true, reasons: [] };
}

export function beginVerification(
  task: RuntimeTask,
  candidate: string,
  at: string,
): RuntimeResult {
  if (task.state !== 'running') {
    return { task, ok: false, reasons: [`cannot begin verification from ${task.state}`] };
  }
  if (candidate.trim().length === 0) {
    return { task, ok: false, reasons: ['candidate identity is required before verification'] };
  }

  const next = withCheckpoint({
    ...task,
    state: 'verifying',
    candidate,
    evidence: [],
    receipt: null,
    events: [...task.events, event(at, 'verification_started', `Verification started for exact candidate ${candidate}.`)],
  }, at);
  return { task: next, ok: true, reasons: [] };
}

export function recordVerification(
  task: RuntimeTask,
  evidence: readonly EvidenceItem[],
  at: string,
): RuntimeResult {
  if (task.state !== 'verifying') {
    return { task, ok: false, reasons: [`cannot record verification from ${task.state}`] };
  }

  const check = evidenceSatisfiesContract(task.contract, evidence);
  const attempts = check.ok ? task.repairAttempts : task.repairAttempts + 1;
  const exhausted = !check.ok && attempts > task.contract.maxRepairAttempts;
  const state: RuntimeTaskState = check.ok ? 'review' : exhausted ? 'escalated' : 'repair';
  const summary = check.ok
    ? 'Required evidence passed; candidate is ready for review.'
    : `Verification failed: ${check.missing.join('; ') || 'required evidence did not pass'}`;

  const next = withCheckpoint({
    ...task,
    state,
    evidence: cloneEvidence(evidence),
    repairAttempts: attempts,
    blocker: check.ok ? null : summary,
    events: [
      ...task.events,
      event(at, 'verification_recorded', summary),
      ...(state === 'review' ? [event(at, 'review_started', `Review opened for ${task.candidate ?? '<missing-candidate>'}.`)] : []),
      ...(state === 'escalated' ? [event(at, 'task_escalated', 'Verification failure exhausted the repair budget.')] : []),
    ],
  }, at);

  return { task: next, ok: check.ok, reasons: check.ok ? [] : check.missing };
}

export function finalizeReview(
  task: RuntimeTask,
  receipt: CandidateReceipt,
  at: string,
): RuntimeResult {
  if (task.state !== 'review') {
    return { task, ok: false, reasons: [`cannot finalize review from ${task.state}`] };
  }
  if (task.candidate === null) {
    return { task, ok: false, reasons: ['runtime task has no candidate to review'] };
  }

  const accepted = acceptedWorkUnit(task.contract, receipt, task.candidate);
  if (accepted) {
    const next = withCheckpoint({
      ...task,
      state: 'accepted',
      receipt,
      blocker: null,
      events: [...task.events, event(at, 'candidate_accepted', `Exact candidate ${task.candidate} was accepted.`)],
    }, at);
    return { task: next, ok: true, reasons: [] };
  }

  const attempts = task.repairAttempts + 1;
  const exhausted = attempts > task.contract.maxRepairAttempts;
  const reasons = ['exact candidate did not satisfy review/receipt authorization'];
  const next = withCheckpoint({
    ...task,
    state: exhausted ? 'escalated' : 'repair',
    receipt,
    repairAttempts: attempts,
    blocker: reasons.join('; '),
    events: [
      ...task.events,
      event(at, 'candidate_rejected', `Exact candidate ${task.candidate} was rejected.`),
      ...(exhausted ? [event(at, 'task_escalated', 'Review rejection exhausted the repair budget.')] : []),
    ],
  }, at);
  return { task: next, ok: false, reasons };
}

export function resumeFromCheckpoint(
  contract: FactoryTaskContract,
  checkpoint: RuntimeCheckpoint,
  events: readonly RuntimeEvent[] = [],
): RuntimeTask {
  if (checkpoint.taskId !== contract.id) {
    throw new Error(`checkpoint belongs to ${checkpoint.taskId}, not ${contract.id}`);
  }

  return {
    contract,
    state: checkpoint.state,
    workerId: checkpoint.workerId,
    candidate: checkpoint.candidate,
    evidence: cloneEvidence(checkpoint.evidence),
    receipt: null,
    repairAttempts: checkpoint.repairAttempts,
    blocker: checkpoint.blocker,
    events: [...events],
    checkpoint: {
      ...checkpoint,
      evidence: cloneEvidence(checkpoint.evidence),
    },
  };
}
