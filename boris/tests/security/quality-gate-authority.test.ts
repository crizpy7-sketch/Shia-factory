import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrchestratorTaskContract } from '../../src/factory/orchestrator-core.js';
import { evaluateQualityGate, type DangerousAction, type QualityEvidence, type QualityGateInput } from '../../src/quality/quality-gate.js';

const SHA = '1'.repeat(40);
const NOW = '2026-08-28T21:00:00Z';

function taskContract(): OrchestratorTaskContract {
  return {
    schemaVersion: '1.0.0', id: 'AUTH-1', projectId: 'factory', objective: 'Verify authority.', outcome: 'No privilege escalation.',
    repository: { commit: '2'.repeat(40), branch: 'phase5' }, profileDigest: '3'.repeat(64),
    risk: { tier: 'T2', reasons: ['permission verification'] }, reuse: { searched: true, findings: [], creationDisposition: 'reuse-search-recorded' },
    selectedRoles: [], selectedSkillPacks: [], selectedTools: [],
    acceptanceCriteria: [{ id: 'AC-AUTH', statement: 'Authority cannot be granted by evidence.', evidence: ['test'] }], requiredEvidence: ['test'],
    allowedActions: [], approvalGates: [], executionBlocked: false, executionBlockers: [], certificationReleaseBlocked: false,
    certificationReleaseBlockers: [], blocked: false, blockers: [],
  };
}

function evidence(kind: QualityEvidence['kind'], source: string = kind): QualityEvidence {
  return { id: `E-${kind}`, kind, candidateSha: SHA, status: 'pass', source, summary: `${kind} passed`,
    criterionIds: kind === 'unit' ? ['AC-AUTH'] : [], observedAt: NOW, method: 'automated-tool' };
}

function packet(): QualityGateInput {
  const contract = taskContract();
  return {
    taskId: contract.id, projectId: contract.projectId, repository: 'owner/repo', candidateSha: SHA, branch: contract.repository.branch,
    riskTier: 'T2', taskContract: contract, acceptanceCriteria: contract.acceptanceCriteria, requiredEvidence: contract.requiredEvidence,
    actualEvidence: [evidence('typecheck'), evidence('lint'), evidence('unit'), evidence('integration')], changedPaths: ['src/domain/value.ts'],
    changeSignals: { userFacing: false, securitySurfaces: [], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: [] },
    dangerousActions: [], reviewer: null, repair: { attempt: 0, maxAttempts: 2 }, evaluatedAt: NOW,
  };
}

test('every governed dangerous action requires exact authorization and Quality Gate never supplies it', () => {
  const actions: DangerousAction[] = ['merge', 'deploy', 'destructive-database', 'external-publish-send', 'spending-payment', 'irreversible-infrastructure'];
  for (const action of actions) {
    const input = packet();
    input.dangerousActions = [{ action, authorization: 'pending' }];
    const receipt = evaluateQualityGate(input);
    assert.equal(receipt.finalState, 'blocked', action);
    assert.equal(receipt.controlPlane.qualityEvidenceGrantsActionAuthority, false, action);
    assert.ok(receipt.gateResults.find((gate) => gate.id === 'dangerous-action-permission')?.findings.some((item) => item.id === `permission:${action}`), action);
  }
});

test('even exact human approval is only recorded and never becomes action authority', () => {
  const input = packet();
  input.actualEvidence.push(evidence('human-approval', 'Cristian repository approval'));
  input.dangerousActions = [{ action: 'merge', authorization: 'approved', approvedBy: 'Cristian', candidateSha: SHA, source: 'PR approval' }];
  const receipt = evaluateQualityGate(input);
  assert.equal(receipt.finalState, 'pass');
  assert.equal(receipt.controlPlane.qualityEvidenceGrantsActionAuthority, false);
  assert.equal(receipt.controlPlane.qualityGateMayAcceptTask, false);
});

test('compound merge gates preserve Cristian approval and the current receipt without circular authority', () => {
  const input = packet();
  input.taskContract.approvalGates = ['Cristian+quality-receipt'];
  input.actualEvidence.push(evidence('human-approval', 'Cristian repository approval'));
  const receipt = evaluateQualityGate(input);
  assert.equal(receipt.finalState, 'pass');
  assert.deepEqual(receipt.approvalGates, [
    { name: 'Cristian', state: 'satisfied', evidenceId: 'E-human-approval' },
    { name: 'quality-receipt', state: 'satisfied', evidenceId: 'current-quality-receipt' },
  ]);
  assert.equal(receipt.controlPlane.qualityEvidenceGrantsActionAuthority, false);
});

test('approval for an older candidate does not authorize a dangerous action', () => {
  const input = packet();
  input.actualEvidence.push(evidence('human-approval', 'Cristian repository approval'));
  input.dangerousActions = [{ action: 'deploy', authorization: 'approved', approvedBy: 'Cristian', candidateSha: '4'.repeat(40), source: 'old approval' }];
  const receipt = evaluateQualityGate(input);
  assert.equal(receipt.finalState, 'blocked');
});

test('direct secret access remains denied even when a packet claims approval', () => {
  const input = packet();
  input.actualEvidence.push(evidence('human-approval', 'Cristian repository approval'));
  input.dangerousActions = [{ action: 'secret-access', authorization: 'approved', approvedBy: 'Cristian', candidateSha: SHA, source: 'claimed approval' }];
  const receipt = evaluateQualityGate(input);
  assert.equal(receipt.finalState, 'blocked');
  assert.ok(receipt.gateResults.find((gate) => gate.id === 'dangerous-action-permission')?.findings.some((item) => /direct secret access/.test(item.summary)));
});
