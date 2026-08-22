import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptedWorkUnit,
  canPromoteMemory,
  canTransition,
  evidenceSatisfiesContract,
  memoryBudgetFor,
  readyToRun,
  receiptAuthorizesCandidate,
  riskRequiresReadOnlyRecon,
  validateTaskContract,
  workMayRunConcurrently,
  type CandidateReceipt,
  type FactoryTaskContract,
} from '../../src/factory/operating-system.js';

function contract(overrides: Partial<FactoryTaskContract> = {}): FactoryTaskContract {
  return {
    id: 'TASK-001',
    projectId: 'REMIXR',
    outcome: 'A paid generation survives reload without creating a duplicate job.',
    objective: 'Repair generation reconciliation after page reload.',
    riskTier: 'T2',
    dependencies: [],
    allowedPaths: ['src/generation/**'],
    readOnlyPaths: ['src/payments/**'],
    forbiddenPaths: ['src/auth/**', '.env'],
    allowedTools: ['repo.read', 'repo.write', 'test', 'browser'],
    forbiddenTools: ['deploy', 'production-db'],
    acceptanceCriteria: [
      { id: 'AC-1', statement: 'Existing paid job resumes after reload.', evidenceRequired: ['test', 'runtime'] },
      { id: 'AC-2', statement: 'Reload does not create a second paid job.', evidenceRequired: ['test'] },
    ],
    requiredEvidence: ['test', 'runtime'],
    maxRepairAttempts: 2,
    maxCostUsd: 2,
    escalationConditions: ['architecture change required', 'repair budget exhausted'],
    reviewerRequired: false,
    humanApprovalRequired: false,
    ...overrides,
  };
}

function receipt(overrides: Partial<CandidateReceipt> = {}): CandidateReceipt {
  return {
    taskId: 'TASK-001',
    baseCandidate: 'base-123',
    candidate: 'candidate-456',
    changedPaths: ['src/generation/reconcile.ts'],
    riskTier: 'T2',
    evidence: [
      { kind: 'test', summary: 'unit and integration tests passed', ok: true },
      { kind: 'runtime', summary: 'reload flow passed in runtime', ok: true },
    ],
    reviewedBy: null,
    reviewerApproved: false,
    humanApproved: false,
    authorizedAt: '2026-08-21T10:00:00-05:00',
    ...overrides,
  };
}

test('factory lifecycle forbids skipping from backlog directly to done', () => {
  assert.equal(canTransition('backlog', 'ready'), true);
  assert.equal(canTransition('ready', 'running'), true);
  assert.equal(canTransition('running', 'review'), true);
  assert.equal(canTransition('review', 'done'), true);
  assert.equal(canTransition('backlog', 'done'), false);
  assert.equal(canTransition('done', 'running'), false);
});

test('a task is not ready when a dependency is not accepted', () => {
  const result = readyToRun(contract({ dependencies: ['TASK-000'] }), [
    { id: 'TASK-000', state: 'review' },
  ]);
  assert.equal(result.ready, false);
  assert.match(result.reasons.join('\n'), /dependencies not done: TASK-000/);
});

test('T3 work requires independent review evidence and reviewer policy', () => {
  const invalid = contract({
    riskTier: 'T3',
    requiredEvidence: ['test'],
    reviewerRequired: false,
  });
  const violations = validateTaskContract(invalid);
  assert.ok(violations.some((value) => value.includes('requires review evidence')));
  assert.ok(violations.some((value) => value.includes('requires an independent reviewer')));
});

test('T4 work requires explicit human approval', () => {
  const violations = validateTaskContract(contract({
    riskTier: 'T4',
    requiredEvidence: ['test', 'review'],
    reviewerRequired: true,
    humanApprovalRequired: false,
  }));
  assert.ok(violations.some((value) => value.includes('human_approval')));
  assert.ok(violations.some((value) => value.includes('explicit human approval')));
  assert.equal(riskRequiresReadOnlyRecon('T4'), true);
});

test('factory rejects unbounded default repair loops', () => {
  const violations = validateTaskContract(contract({ maxRepairAttempts: 7 }));
  assert.ok(violations.some((value) => value.includes('cannot exceed 2')));
});

test('path and tool authority cannot be both allowed and forbidden', () => {
  const violations = validateTaskContract(contract({
    allowedPaths: ['src/auth/**'],
    forbiddenPaths: ['src/auth/**'],
    allowedTools: ['deploy'],
    forbiddenTools: ['deploy'],
  }));
  assert.ok(violations.some((value) => value.includes('both allowed and forbidden')));
  assert.ok(violations.filter((value) => value.includes('both allowed and forbidden')).length >= 2);
});

test('acceptance requires evidence rather than worker confidence', () => {
  const missing = evidenceSatisfiesContract(contract(), [
    { kind: 'test', summary: 'tests passed', ok: true },
  ]);
  assert.equal(missing.ok, false);
  assert.ok(missing.missing.some((value) => value.includes('runtime')));
});

test('approval is bound to the exact reviewed candidate', () => {
  const valid = receiptAuthorizesCandidate(receipt(), 'candidate-456', contract());
  assert.equal(valid.authorized, true);

  const changed = receiptAuthorizesCandidate(receipt(), 'candidate-789', contract());
  assert.equal(changed.authorized, false);
  assert.ok(changed.reasons.includes('candidate changed after review'));
});

test('high-risk candidate cannot be accepted without required reviewer and human approval', () => {
  const highRisk = contract({
    riskTier: 'T4',
    requiredEvidence: ['test', 'review', 'human_approval'],
    acceptanceCriteria: [
      { id: 'AC-1', statement: 'Production migration is reversible.', evidenceRequired: ['test', 'review', 'human_approval'] },
    ],
    reviewerRequired: true,
    humanApprovalRequired: true,
  });
  const highRiskReceipt = receipt({
    riskTier: 'T4',
    evidence: [{ kind: 'test', summary: 'migration test passed', ok: true }],
  });
  assert.equal(acceptedWorkUnit(highRisk, highRiskReceipt, 'candidate-456'), false);
});

test('inference and assumptions cannot silently become authoritative memory', () => {
  for (const state of ['inferred', 'assumed'] as const) {
    const result = canPromoteMemory({
      content: 'Safari is definitely the root cause.',
      state,
      provenance: 'agent hypothesis from TASK-001',
      verified: false,
      supportCount: 0,
      authority: 'candidate',
    });
    assert.equal(result.allowed, false);
  }

  const decided = canPromoteMemory({
    content: 'Paid jobs use durable server state.',
    state: 'decided',
    provenance: 'ADR-018',
    verified: false,
    supportCount: 0,
    authority: 'candidate',
  });
  assert.equal(decided.allowed, true);
});

test('memory dosage is smaller for local workers than frontier reviewers', () => {
  const local = memoryBudgetFor({ class: 'local', provenTaskTypes: ['classification'] });
  const frontier = memoryBudgetFor({ class: 'frontier', provenTaskTypes: ['architecture'] });
  assert.ok(local.maxTaskLessons < frontier.maxTaskLessons);
  assert.equal(local.allowBroadHistory, false);
  assert.equal(frontier.allowBroadHistory, true);
});

test('parallel tasks cannot share write ownership or direct dependencies', () => {
  const first = contract({ id: 'A', allowedPaths: ['src/payments/**'] });
  const conflict = contract({ id: 'B', allowedPaths: ['src/payments/**'] });
  const conflictResult = workMayRunConcurrently(first, conflict);
  assert.equal(conflictResult.allowed, false);
  assert.match(conflictResult.reason ?? '', /overlapping write authority/);

  const dependent = contract({ id: 'B', dependencies: ['A'], allowedPaths: ['src/ui/**'] });
  const dependencyResult = workMayRunConcurrently(first, dependent);
  assert.equal(dependencyResult.allowed, false);
  assert.match(dependencyResult.reason ?? '', /direct dependency/);

  const independent = contract({ id: 'C', allowedPaths: ['tests/**'] });
  assert.equal(workMayRunConcurrently(first, independent).allowed, true);
});
