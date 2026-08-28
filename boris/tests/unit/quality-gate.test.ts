import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { OrchestratorTaskContract } from '../../src/factory/orchestrator-core.js';
import { admitTrustedFixture } from '../helpers/quality-admission.js';
import {
  QUALITY_GATE_RISK_MATRIX,
  evaluateQualityGate,
  persistQualityGateReceipt,
  type QualityEvidence,
  type QualityGateInput,
} from '../../src/quality/quality-gate.js';

const CANDIDATE = 'a'.repeat(40);
const OLD_CANDIDATE = 'b'.repeat(40);
const NOW = '2026-08-28T20:00:00Z';

function contract(overrides: Partial<OrchestratorTaskContract> = {}): OrchestratorTaskContract {
  return {
    schemaVersion: '1.0.0', id: 'TASK-5', projectId: 'shia-factory', objective: 'Verify Phase 5.', outcome: 'Evidence-based quality.',
    repository: { commit: 'c'.repeat(40), branch: 'migration/core-v2-phase5-quality-safety' }, profileDigest: 'd'.repeat(64),
    risk: { tier: 'T2', reasons: ['normal behavior'] }, reuse: { searched: true, findings: [], creationDisposition: 'reuse-search-recorded' },
    selectedRoles: [], selectedSkillPacks: [], selectedTools: [],
    acceptanceCriteria: [{ id: 'AC-1', statement: 'The exact candidate passes deterministic checks.', evidence: ['test'] }],
    requiredEvidence: ['test'], allowedActions: [], approvalGates: [], executionBlocked: false, executionBlockers: [],
    certificationReleaseBlocked: false, certificationReleaseBlockers: [], blocked: false, blockers: [], ...overrides,
  };
}

function evidence(kind: QualityEvidence['kind'], overrides: Partial<QualityEvidence> = {}): QualityEvidence {
  return {
    id: `E-${kind}`, kind, candidateSha: CANDIDATE, status: 'pass', source: `command:${kind}`,
    summary: `${kind} passed`, criterionIds: kind === 'unit' ? ['AC-1'] : [], observedAt: NOW,
    method: 'automated-tool', ...overrides,
  };
}

function automated(): QualityEvidence[] {
  return ['typecheck', 'lint', 'unit', 'integration'].map((kind) => evidence(kind as QualityEvidence['kind']));
}

function input(overrides: Partial<QualityGateInput> = {}): QualityGateInput {
  const taskContract = overrides.taskContract ?? contract();
  return {
    taskId: taskContract.id, projectId: taskContract.projectId, repository: 'crizpy7-sketch/Shia-factory', candidateSha: CANDIDATE,
    branch: taskContract.repository.branch, riskTier: taskContract.risk.tier, taskContract,
    acceptanceCriteria: taskContract.acceptanceCriteria, requiredEvidence: taskContract.requiredEvidence,
    actualEvidence: automated(), changedPaths: ['boris/src/quality/quality-gate.ts'],
    changeSignals: { userFacing: false, securitySurfaces: [], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: [] },
    dangerousActions: [], reviewer: null, repair: { attempt: 0, maxAttempts: 2 }, evaluatedAt: NOW,
    ...overrides,
  };
}
function evaluate(inputValue: QualityGateInput) { return evaluateQualityGate(admitTrustedFixture(inputValue)) }

test('risk matrix is deterministic for T0 through T4', () => {
  assert.deepEqual(QUALITY_GATE_RISK_MATRIX, {
    T0: { security: 'baseline', adversarial: false, cristianApproval: false },
    T1: { security: 'baseline', adversarial: false, cristianApproval: false },
    T2: { security: 'when-security-surface', adversarial: false, cristianApproval: false },
    T3: { security: 'mandatory', adversarial: true, cristianApproval: false },
    T4: { security: 'mandatory', adversarial: true, cristianApproval: true },
  });
});

test('Quality Gate rejects structurally incomplete evidence packets', () => {
  const receipt = evaluate(input({ projectId: '' }));
  assert.equal(receipt.finalState, 'blocked');
  assert.ok(receipt.knownLimitations.includes('projectId is required'));
});

test('evidence is bound to the exact candidate SHA and stale evidence cannot certify a change', () => {
  const stale = automated().map((item) => ({ ...item, candidateSha: OLD_CANDIDATE }));
  const receipt = evaluate(input({ actualEvidence: stale }));
  assert.equal(receipt.finalState, 'needs-evidence');
  assert.equal(receipt.actualEvidence.length, 0);
  assert.equal(receipt.staleEvidence.length, 4);
  assert.ok(receipt.knownLimitations.some((item) => /different candidate/.test(item)));
});

test('user-facing work requires real browser and retained visual evidence instead of fabrication', () => {
  const receipt = evaluate(input({
    changedPaths: ['app/page.tsx'], changeSignals: { userFacing: true, securitySurfaces: [], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: [] },
  }));
  const gate = receipt.gateResults.find((item) => item.id === 'browser-visual');
  assert.equal(receipt.finalState, 'needs-evidence');
  assert.equal(gate?.state, 'needs-evidence');
  assert.deepEqual(gate?.requiredEvidenceKinds, ['browser', 'visual']);
});

test('browser evidence without a real viewport or visual artifact digest remains an evidence gap', () => {
  const receipt = evaluate(input({
    changedPaths: ['app/page.tsx'], changeSignals: { userFacing: true, securitySurfaces: [], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: [] },
    actualEvidence: [...automated(), evidence('browser'), evidence('visual'), evidence('accessibility', { testedSurfaces: ['home'] })],
  }));
  assert.equal(receipt.finalState, 'needs-evidence');
  assert.ok(receipt.gateResults.find((item) => item.id === 'browser-visual')?.limitations.some((item) => /viewport|artifact/.test(item)));
});

test('applicable accessibility failures reject acceptance and name the failed criterion', () => {
  const visual = evidence('visual', { artifact: { path: 'artifacts/home.png', sha256: 'f'.repeat(64), mediaType: 'image/png' } });
  const browser = evidence('browser', { method: 'real-browser', testedSurfaces: ['home'], browser: { name: 'Chromium', version: '128', viewport: { width: 390, height: 844 }, device: 'phone' } });
  const accessibility = evidence('accessibility', {
    status: 'fail', testedSurfaces: ['home'], criterionIds: ['AC-1'],
    findings: [{ id: 'A11Y-1', severity: 'P2', summary: 'Primary control has no accessible name.', criterionIds: ['AC-1'], evidenceIds: ['E-accessibility'] }],
  });
  const receipt = evaluate(input({
    changedPaths: ['app/page.tsx'], changeSignals: { userFacing: true, securitySurfaces: [], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: [] },
    actualEvidence: [...automated(), browser, visual, accessibility],
  }));
  assert.equal(receipt.finalState, 'reject');
  assert.equal(receipt.gateResults.find((item) => item.id === 'accessibility')?.state, 'fail');
  assert.ok(receipt.reworkRequests.some((item) => item.failedCriterionId === 'AC-1'));
});

test('T3 and T4 activate mandatory security and adversarial paths', () => {
  for (const tier of ['T3', 'T4'] as const) {
    const high = contract({ risk: { tier, reasons: ['high consequence'] }, requiredEvidence: ['test', 'review'], approvalGates: tier === 'T4' ? ['Cristian'] : [] });
    const actual = [...automated(), evidence('independent-review')];
    if (tier === 'T4') actual.push(evidence('human-approval', { source: 'Cristian repository approval' }));
    const receipt = evaluate(input({ taskContract: high, riskTier: tier, requiredEvidence: high.requiredEvidence, actualEvidence: actual,
      reviewer: { id: 'codex-independent-review', source: 'gstack:/review independent surface', independent: true } }));
    const security = receipt.gateResults.find((item) => item.id === 'security-adversarial');
    assert.deepEqual(security?.requiredEvidenceKinds, ['security', 'adversarial']);
    assert.equal(security?.state, 'needs-evidence');
  }
});

test('T2 security review activates only for meaningful security surfaces', () => {
  const normal = evaluate(input());
  assert.equal(normal.gateResults.find((item) => item.id === 'security-adversarial')?.state, 'not-applicable');
  const auth = evaluate(input({ changedPaths: ['src/auth/session.ts'] }));
  assert.equal(auth.gateResults.find((item) => item.id === 'security-adversarial')?.state, 'needs-evidence');
});

test('T0 and T1 use the smallest reliable security subset', () => {
  for (const tier of ['T0', 'T1'] as const) {
    const low = contract({ risk: { tier, reasons: ['low consequence'] } });
    const missing = evaluate(input({ taskContract: low, riskTier: tier }));
    assert.equal(missing.gateResults.find((item) => item.id === 'security-adversarial')?.state, 'needs-evidence');
    const complete = evaluate(input({ taskContract: low, riskTier: tier, actualEvidence: [...automated(), evidence('security')] }));
    assert.equal(complete.gateResults.find((item) => item.id === 'security-adversarial')?.state, 'pass');
  }
});

test('task-contract required evidence is enforced independently of gate metadata', () => {
  const reviewed = contract({ requiredEvidence: ['test', 'review'] });
  const receipt = evaluate(input({ taskContract: reviewed, requiredEvidence: reviewed.requiredEvidence }));
  assert.equal(receipt.finalState, 'needs-evidence');
  assert.ok(receipt.knownLimitations.some((item) => /review/.test(item)));
});

test('performance gates activate only for declared or material risk surfaces and require measurements', () => {
  const normal = evaluate(input());
  assert.equal(normal.gateResults.find((item) => item.id === 'performance')?.state, 'not-applicable');
  const active = evaluate(input({
    changeSignals: { userFacing: false, securitySurfaces: [], performanceSurfaces: ['api-backend'], performanceFailureMaterial: false, subjectRoles: [] },
    actualEvidence: [...automated(), evidence('performance')],
  }));
  assert.equal(active.gateResults.find((item) => item.id === 'performance')?.state, 'needs-evidence');
  const measured = evaluate(input({
    changeSignals: { userFacing: false, securitySurfaces: [], performanceSurfaces: ['api-backend'], performanceFailureMaterial: false, subjectRoles: [] },
    actualEvidence: [...automated(), evidence('performance', {
      thresholds: [{ metric: 'p95', comparator: 'lte', value: 200, unit: 'ms' }],
      measurements: [{ metric: 'p95', value: 250, unit: 'ms' }],
    })],
  }));
  assert.equal(measured.finalState, 'reject');
  const pathActivated = evaluate(input({ changedPaths: ['src/api/route.ts'] }));
  assert.equal(pathActivated.gateResults.find((item) => item.id === 'performance')?.state, 'needs-evidence');
});

test('dangerous actions cannot gain authority through a passing Quality Gate', () => {
  const receipt = evaluate(input({
    dangerousActions: [{ action: 'secret-access', authorization: 'approved', approvedBy: 'Cristian', candidateSha: CANDIDATE, source: 'approval' }],
  }));
  assert.equal(receipt.finalState, 'blocked');
  assert.equal(receipt.controlPlane.qualityEvidenceGrantsActionAuthority, false);
  assert.equal(receipt.controlPlane.qualityGateMayAcceptTask, false);
  assert.ok(receipt.gateResults.find((item) => item.id === 'dangerous-action-permission')?.findings.some((item) => /secret access/.test(item.summary)));
});

test('failed criteria produce bounded BORIS rework against a new candidate', () => {
  const failedUnit = evidence('unit', { status: 'fail', summary: 'Unit regression failed.', criterionIds: ['AC-1'] });
  const receipt = evaluate(input({ actualEvidence: [...automated().filter((item) => item.kind !== 'unit'), failedUnit], repair: { attempt: 0, maxAttempts: 2 } }));
  assert.equal(receipt.finalState, 'reject');
  assert.equal(receipt.reworkRequests[0]?.owner, 'boris');
  assert.equal(receipt.reworkRequests[0]?.newCandidateRequired, true);
  assert.equal(receipt.reworkRequests[0]?.repairAttempt, 1);
  assert.equal(receipt.reworkRequests[0]?.remainingAttempts, 2);
});

test('repair budget exhaustion blocks instead of looping indefinitely', () => {
  const failedUnit = evidence('unit', { status: 'fail', summary: 'Still failing.', criterionIds: ['AC-1'] });
  const receipt = evaluate(input({ actualEvidence: [...automated().filter((item) => item.kind !== 'unit'), failedUnit], repair: { attempt: 2, maxAttempts: 2 } }));
  assert.equal(receipt.finalState, 'blocked');
  assert.deepEqual(receipt.reworkRequests, []);
});

test('Quality Gate cannot self-certify or bypass Cristian', () => {
  const high = contract({ risk: { tier: 'T3', reasons: ['Quality Gate governance change'] }, requiredEvidence: ['test', 'review'] });
  const receipt = evaluate(input({
    taskContract: high, riskTier: 'T3', requiredEvidence: high.requiredEvidence,
    actualEvidence: [...automated(), evidence('security'), evidence('adversarial')],
    changeSignals: { userFacing: false, securitySurfaces: ['factory-governance'], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: ['quality-gate'] },
    reviewer: { id: 'quality-gate', source: 'permanent-quality-gate', independent: false },
  }));
  assert.equal(receipt.finalState, 'blocked');
  assert.ok(receipt.approvalGates.some((item) => item.name === 'Cristian' && item.state === 'pending'));
  assert.ok(receipt.knownLimitations.some((item) => /cannot independently certify/.test(item)));
});

test('Shia Core remains acceptance authority and GStack evidence cannot mark a task accepted', () => {
  const receipt = evaluate(input());
  assert.equal(receipt.finalState, 'pass');
  assert.equal(receipt.controlPlane.authority, 'shia-core');
  assert.equal(receipt.controlPlane.gstackMayAcceptTask, false);
  assert.equal(receipt.controlPlane.qualityGateMayAcceptTask, false);
});

test('receipt persistence is exact-candidate keyed and idempotent', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shia-quality-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const receipt = evaluate(input());
  const first = await persistQualityGateReceipt(receipt, directory);
  const second = await persistQualityGateReceipt(receipt, directory);
  assert.equal(first, second);
  assert.match(path.basename(first), new RegExp(`${CANDIDATE}\\.json$`));
  assert.deepEqual(JSON.parse(await readFile(first, 'utf8')), JSON.parse(JSON.stringify(receipt)));
});
