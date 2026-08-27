import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginVerification,
  createRuntimeTask,
  finalizeReview,
  recordVerification,
  resumeFromCheckpoint,
  startWorker,
} from '../../src/factory/runtime-wiring.js';
import type {
  CandidateReceipt,
  EvidenceItem,
  FactoryTaskContract,
} from '../../src/factory/operating-system.js';

function contract(overrides: Partial<FactoryTaskContract> = {}): FactoryTaskContract {
  return {
    id: 'RW-001',
    projectId: 'shia-factory',
    outcome: 'One real task travels through Factory runtime policy to a verified terminal state.',
    objective: 'Prove Runtime Wiring v1 with one bounded candidate.',
    riskTier: 'T2',
    dependencies: [],
    allowedPaths: ['boris/src/factory/**', 'boris/tests/unit/**'],
    readOnlyPaths: ['FACTORY_CONSTITUTION.md'],
    forbiddenPaths: ['.env', '.github/workflows/**'],
    allowedTools: ['repo.read', 'repo.write', 'test'],
    forbiddenTools: ['deploy', 'merge', 'production-db'],
    acceptanceCriteria: [
      { id: 'AC-1', statement: 'Task follows READY through REVIEW before acceptance.', evidenceRequired: ['test', 'runtime'] },
      { id: 'AC-2', statement: 'Missing required evidence prevents acceptance.', evidenceRequired: ['test', 'runtime'] },
    ],
    requiredEvidence: ['test', 'runtime'],
    maxRepairAttempts: 2,
    maxCostUsd: 2,
    escalationConditions: ['repair budget exhausted', 'authority must widen'],
    reviewerRequired: false,
    humanApprovalRequired: false,
    ...overrides,
  };
}

const passingEvidence: EvidenceItem[] = [
  { kind: 'test', summary: 'Runtime Wiring unit tests pass.', ok: true },
  { kind: 'runtime', summary: 'Structured state path reached review.', ok: true },
];

function receipt(overrides: Partial<CandidateReceipt> = {}): CandidateReceipt {
  return {
    taskId: 'RW-001',
    baseCandidate: 'main-base',
    candidate: 'candidate-a',
    changedPaths: ['boris/src/factory/runtime-wiring.ts'],
    riskTier: 'T2',
    evidence: passingEvidence,
    reviewedBy: 'factory-reviewer',
    reviewerApproved: true,
    humanApproved: false,
    authorizedAt: '2026-08-27T08:30:00-05:00',
    ...overrides,
  };
}

test('RW-001 completes READY -> RUNNING -> VERIFYING -> REVIEW -> ACCEPTED', () => {
  let result = createRuntimeTask(contract(), [], '2026-08-27T08:20:00-05:00');
  assert.equal(result.ok, true);
  assert.equal(result.task.state, 'ready');

  result = startWorker(result.task, 'BORIS-001', '2026-08-27T08:21:00-05:00');
  assert.equal(result.task.state, 'running');

  result = beginVerification(result.task, 'candidate-a', '2026-08-27T08:22:00-05:00');
  assert.equal(result.task.state, 'verifying');

  result = recordVerification(result.task, passingEvidence, '2026-08-27T08:23:00-05:00');
  assert.equal(result.ok, true);
  assert.equal(result.task.state, 'review');

  result = finalizeReview(result.task, receipt(), '2026-08-27T08:30:00-05:00');
  assert.equal(result.ok, true);
  assert.equal(result.task.state, 'accepted');
  assert.equal(result.task.receipt?.candidate, 'candidate-a');
  assert.match(result.task.checkpoint.exactNextAction, /Persist project state/);

  assert.deepEqual(
    result.task.events.map((item) => item.type),
    [
      'task_ready',
      'worker_started',
      'verification_started',
      'verification_recorded',
      'review_started',
      'candidate_accepted',
    ],
  );
});

test('invalid contract or unfinished dependency never enters READY', () => {
  const result = createRuntimeTask(
    contract({ dependencies: ['DEP-001'] }),
    [{ id: 'DEP-001', state: 'review' }],
    '2026-08-27T08:20:00-05:00',
  );
  assert.equal(result.ok, false);
  assert.equal(result.task.state, 'blocked');
  assert.match(result.task.blocker ?? '', /dependencies not done/);
});

test('verification failure enters bounded REPAIR rather than ACCEPTED', () => {
  let result = createRuntimeTask(contract(), [], '2026-08-27T08:20:00-05:00');
  result = startWorker(result.task, 'BORIS-001', '2026-08-27T08:21:00-05:00');
  result = beginVerification(result.task, 'candidate-a', '2026-08-27T08:22:00-05:00');
  result = recordVerification(
    result.task,
    [{ kind: 'test', summary: 'tests passed but runtime proof is absent', ok: true }],
    '2026-08-27T08:23:00-05:00',
  );

  assert.equal(result.ok, false);
  assert.equal(result.task.state, 'repair');
  assert.equal(result.task.repairAttempts, 1);
  assert.match(result.task.blocker ?? '', /runtime/);
  assert.match(result.task.checkpoint.exactNextAction, /without widening authority/);
});

test('repair budget exhaustion escalates instead of looping forever', () => {
  let result = createRuntimeTask(contract({ maxRepairAttempts: 1 }), [], '2026-08-27T08:20:00-05:00');
  result = startWorker(result.task, 'BORIS-001', '2026-08-27T08:21:00-05:00');
  result = beginVerification(result.task, 'candidate-a', '2026-08-27T08:22:00-05:00');
  result = recordVerification(result.task, [], '2026-08-27T08:23:00-05:00');
  assert.equal(result.task.state, 'repair');

  result = startWorker(result.task, 'CODEX', '2026-08-27T08:24:00-05:00');
  result = beginVerification(result.task, 'candidate-b', '2026-08-27T08:25:00-05:00');
  result = recordVerification(result.task, [], '2026-08-27T08:26:00-05:00');
  assert.equal(result.task.state, 'escalated');
  assert.equal(result.task.repairAttempts, 2);
  assert.match(result.task.checkpoint.exactNextAction, /Escalate/);
});

test('review of a changed candidate is rejected and routed to repair', () => {
  let result = createRuntimeTask(contract(), [], '2026-08-27T08:20:00-05:00');
  result = startWorker(result.task, 'BORIS-001', '2026-08-27T08:21:00-05:00');
  result = beginVerification(result.task, 'candidate-a', '2026-08-27T08:22:00-05:00');
  result = recordVerification(result.task, passingEvidence, '2026-08-27T08:23:00-05:00');
  result = finalizeReview(
    result.task,
    receipt({ candidate: 'different-candidate' }),
    '2026-08-27T08:30:00-05:00',
  );
  assert.equal(result.ok, false);
  assert.equal(result.task.state, 'repair');
  assert.equal(result.task.repairAttempts, 1);
});

test('checkpoint lets a replacement worker resume without replaying chat history', () => {
  let result = createRuntimeTask(contract(), [], '2026-08-27T08:20:00-05:00');
  result = startWorker(result.task, 'BORIS-001', '2026-08-27T08:21:00-05:00');
  result = beginVerification(result.task, 'candidate-a', '2026-08-27T08:22:00-05:00');

  const resumed = resumeFromCheckpoint(contract(), result.task.checkpoint, result.task.events);
  assert.equal(resumed.state, 'verifying');
  assert.equal(resumed.candidate, 'candidate-a');
  assert.equal(resumed.workerId, 'BORIS-001');
  assert.match(resumed.checkpoint.exactNextAction, /Collect the evidence/);
});
