import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  CANONICAL_ROLE_IDS,
  invokePermanentRole,
  loadPermanentWorkforce,
} from '../../src/identity/permanent-workforce.js';
import type { OrchestrationRequest, OrchestratorTaskContract } from '../../src/factory/orchestrator-core.js';
import type { QualityEvidence } from '../../src/quality/quality-gate.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const profileSource = await readFile(path.join(repoRoot, 'APP_PROFILE.yaml'), 'utf8');
const qualityCandidate = 'a'.repeat(40);

function qualityTaskContract(): OrchestratorTaskContract {
  return {
    schemaVersion: '1.0.0', id: 'TASK-1', projectId: 'shia-factory', objective: 'Verify candidate.', outcome: 'Candidate is evidenced.',
    repository: { commit: 'b'.repeat(40), branch: 'phase5' }, profileDigest: 'c'.repeat(64), risk: { tier: 'T2', reasons: ['normal feature'] },
    reuse: { searched: true, findings: [], creationDisposition: 'reuse-search-recorded' }, selectedRoles: [], selectedSkillPacks: [], selectedTools: [],
    acceptanceCriteria: [{ id: 'AC-1', statement: 'Feature works.', evidence: ['test'] }], requiredEvidence: ['test'], allowedActions: [], approvalGates: [],
    executionBlocked: false, executionBlockers: [], certificationReleaseBlocked: false, certificationReleaseBlockers: [], blocked: false, blockers: [],
  };
}

function qualityEvidence(kind: QualityEvidence['kind']): QualityEvidence {
  return { id: `E-${kind}`, kind, candidateSha: qualityCandidate, status: 'pass', source: `command:${kind}`, summary: `${kind} passed`,
    criterionIds: kind === 'unit' ? ['AC-1'] : [], observedAt: '2026-08-28T20:00:00Z', method: 'automated-tool' };
}

function qualityInputs(): Record<string, unknown> {
  const task = qualityTaskContract();
  return {
    'task-id': task.id, 'application-or-project': task.projectId, repository: 'crizpy7-sketch/Shia-factory', branch: task.repository.branch,
    'task-contract': task, 'risk-tier': task.risk.tier, 'acceptance-criteria': task.acceptanceCriteria, 'required-evidence': task.requiredEvidence,
    'actual-evidence': ['typecheck', 'lint', 'unit', 'integration'].map((kind) => qualityEvidence(kind as QualityEvidence['kind'])),
    'changed-paths': ['src/domain/value.ts'], 'change-signals': { userFacing: false, securitySurfaces: [], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: [] },
    'dangerous-actions': [], 'repair-budget': { attempt: 0, maxAttempts: 2 }, 'evaluated-at': '2026-08-28T20:00:00Z',
  };
}

function orchestrationRequest(): OrchestrationRequest {
  return {
    taskId: 'PHASE4-INVOCATION', objective: 'Map an existing compatibility path.', outcome: 'Mapping retained.',
    repository: { commit: '20ec1883f9fecda5476fcb01524a1c924f6f5c25', branch: 'migration/core-v2-phase4-agent-consolidation' },
    requestedCapabilities: ['engineering'], requestedActions: ['inspect', 'plan'],
    acceptanceCriteria: [{ id: 'AC-1', statement: 'Existing path remains intact.', evidence: ['test'] }],
    now: '2026-08-28T17:00:00Z',
  };
}

test('exactly five canonical permanent roles are callable', async () => {
  const workforce = await loadPermanentWorkforce(repoRoot);
  assert.deepEqual(workforce.roles.map((role) => role.id), [...CANONICAL_ROLE_IDS]);
  assert.equal(new Set(workforce.roles.map((role) => role.id)).size, 5);
  assert.ok(workforce.roles.every((role) => role.callable));
});

test('BORIS permanent contract maps the existing identity, runtime and engineering surface', async () => {
  const workforce = await loadPermanentWorkforce(repoRoot);
  const boris = workforce.byId('boris');
  assert.equal(boris?.hostedIdentity?.agentId, 'BORIS-001');
  assert.ok(boris?.owns.includes('frontend'));
  assert.ok(boris?.owns.includes('release-engineering'));
  assert.ok(boris?.compatibilityPaths.includes('agents/BORIS-001'));
  assert.ok(boris?.compatibilityPaths.includes('boris'));
});

test('Gary permanent contract maps existing identity and consolidated product/growth responsibilities', async () => {
  const workforce = await loadPermanentWorkforce(repoRoot);
  const gary = workforce.byId('gary');
  assert.equal(gary?.hostedIdentity?.agentId, 'GARY-001');
  for (const capability of ['product-strategy', 'customer-research', 'positioning', 'marketing', 'launch', 'growth', 'analytics-interpretation']) {
    assert.ok(gary?.owns.includes(capability), capability);
  }
  assert.equal(workforce.resolve('Gary Vee')?.role.id, 'gary');
  assert.equal(workforce.resolve('Marketing Chief')?.mapping?.classification, 'deprecated');
});

test('Gary missing audience, evidence and success metric returns exact evidence gaps without execution', async () => {
  const result = await invokePermanentRole(repoRoot, {
    role: 'Gary', capability: 'marketing', objective: 'Prepare a campaign route.',
    inputs: { 'offer-or-product': 'Shia Factory' },
  });
  assert.equal(result.status, 'evidence-gap');
  assert.deepEqual(result.missingInputs, ['audience', 'evidence', 'success-metric']);
  assert.equal(result.dispatch.executed, false);
  assert.deepEqual(result.producedOutputs, []);
});

test('BORIS complete invocation explicitly routes to its existing runtime without claiming execution', async () => {
  const result = await invokePermanentRole(repoRoot, {
    role: 'BORIS-001', capability: 'implementation', objective: 'Implement a bounded parser change.',
    inputs: {
      'allowed-paths-and-tools': { paths: ['boris/src'], tools: ['fs_read', 'fs_write'] },
      'acceptance-criteria': ['Parser rejects invalid input.'], 'risk-tier': 'T1',
      'verification-plan': ['typecheck', 'unit tests'],
    },
  });
  assert.equal(result.status, 'routed');
  assert.equal(result.dispatch.mode, 'route-only');
  assert.equal(result.dispatch.executed, false);
  assert.ok(result.dispatch.runtimePaths.includes('boris/src/runtime.ts'));
  assert.deepEqual(result.producedOutputs, []);
  assert.ok(result.limitations.some((item) => /did not execute/.test(item)));
});

test('Shia Core invocation calls the Phase 3 orchestrator rather than a second engine', async () => {
  const result = await invokePermanentRole(repoRoot, {
    role: '@shia-core', capability: 'intake', objective: 'Route existing work.',
    orchestrator: { profileSource, request: orchestrationRequest() },
  });
  assert.equal(result.roleId, 'shia-core');
  assert.equal(result.status, 'completed');
  assert.equal(result.dispatch.executed, true);
  assert.equal(result.orchestration?.contract.id, 'PHASE4-INVOCATION');
  assert.ok(result.evidence.includes('boris/src/factory/orchestrator-core.ts'));
});

test('Design Director missing required context needs exact input and produces no artifact', async () => {
  const result = await invokePermanentRole(repoRoot, {
    role: 'Design Director', capability: 'ux-review', objective: 'Review responsive UX.',
    inputs: { 'product-context': 'Family scheduler' },
  });
  assert.equal(result.status, 'needs-input');
  assert.deepEqual(result.missingInputs, ['target-platforms', 'user-flows', 'candidate-or-design-artifact', 'acceptance-criteria']);
  assert.equal(result.dispatch.executed, false);
  assert.deepEqual(result.producedOutputs, []);
});

test('Design Director complete bounded input is callable and routed without artifact claims or self-certification', async () => {
  const workforce = await loadPermanentWorkforce(repoRoot);
  const design = workforce.byId('design-director');
  assert.equal(design?.certification, 'bootstrap-approved');
  assert.equal(workforce.resolve('PED')?.role.id, 'design-director');
  const result = await invokePermanentRole(repoRoot, {
    role: 'Design Director', capability: 'ux-review', objective: 'Review responsive UX.',
    exactCandidate: 'design-candidate-a', evidence: ['design brief'],
    inputs: {
      'product-context': 'Family scheduler', 'target-platforms': ['mobile', 'tablet', 'desktop'],
      'user-flows': ['create appointment'], 'acceptance-criteria': ['Responsive at supported widths'],
    },
    bootstrapSubjectRole: 'design-director', humanApproved: true,
  });
  assert.equal(result.status, 'routed');
  assert.equal(result.dispatch.executed, false);
  assert.deepEqual(result.producedOutputs, []);
  assert.equal(result.certified, false);
  assert.equal(result.approvalRequired, true);
  assert.ok(result.limitations.some((item) => /repository governance/.test(item)));
});

test('Quality Gate missing task, risk, acceptance and required evidence returns exact evidence gaps', async () => {
  const blocked = await invokePermanentRole(repoRoot, {
    role: 'Quality Gate', capability: 'functional-test', objective: 'Verify candidate.', exactCandidate: 'candidate-a',
  });
  assert.equal(blocked.status, 'evidence-gap');
  assert.deepEqual(blocked.missingInputs, [
    'task-id', 'application-or-project', 'repository', 'branch', 'task-contract', 'risk-tier', 'acceptance-criteria',
    'required-evidence', 'actual-evidence', 'changed-paths', 'change-signals', 'repair-budget', 'evaluated-at',
  ]);
  assert.equal(blocked.dispatch.executed, false);
});

test('complete bounded Quality Gate input executes the canonical receipt engine without accepting the Shia task', async () => {
  const routed = await invokePermanentRole(repoRoot, {
    role: '@quality-gate', capability: 'functional-test', objective: 'Verify candidate.',
    exactCandidate: qualityCandidate, inputs: qualityInputs(),
  });
  assert.equal(routed.status, 'completed');
  assert.equal(routed.roleId, 'quality-gate');
  assert.equal(routed.dispatch.executed, true);
  assert.equal(routed.certified, false);
  assert.equal(routed.approvalRequired, true);
  assert.equal(routed.qualityReceipt?.finalState, 'pass');
  assert.equal(routed.qualityReceipt?.controlPlane.qualityGateMayAcceptTask, false);
  assert.ok(routed.limitations.some((item) => /Phase 5 implementation approval is pending/.test(item)));
});

test('malformed Quality Gate packet is blocked rather than throwing or inventing evidence', async () => {
  const inputs = qualityInputs();
  inputs['task-contract'] = { id: 'TASK-1' };
  const result = await invokePermanentRole(repoRoot, {
    role: 'Quality Gate', capability: 'release-verification', objective: 'Reject malformed input.', exactCandidate: qualityCandidate, inputs,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.dispatch.executed, false);
  assert.equal(result.certified, false);
  assert.deepEqual(result.producedOutputs, []);
  assert.ok(result.limitations.some((item) => /Malformed Quality Gate packet was rejected/.test(item)));
});

test('Quality Gate bootstrap cannot self-certify even when invocation claims human approval', async () => {
  const inputs = qualityInputs();
  inputs['change-signals'] = { userFacing: false, securitySurfaces: ['factory-governance'], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: ['quality-gate'] };
  inputs['independent-reviewer'] = { id: 'quality-gate', source: 'permanent-quality-gate', independent: false };
  const task = qualityTaskContract();
  task.risk = { tier: 'T3', reasons: ['Quality Gate governance change'] };
  task.requiredEvidence = ['test', 'review'];
  inputs['task-contract'] = task;
  inputs['risk-tier'] = 'T3';
  inputs['required-evidence'] = task.requiredEvidence;
  (inputs['actual-evidence'] as QualityEvidence[]).push(qualityEvidence('security'), qualityEvidence('adversarial'));
  const result = await invokePermanentRole(repoRoot, {
    role: 'Testing Agent', capability: 'release-verification', objective: 'Certify Quality Gate bootstrap.',
    exactCandidate: qualityCandidate, inputs,
    bootstrapSubjectRole: 'quality-gate', reviewerRole: 'quality-gate', humanApproved: true,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.certified, false);
  assert.equal(result.approvalRequired, true);
  assert.ok(result.limitations.some((item) => /cannot independently certify/.test(item)));
});

test('deprecated aliases route deterministically to the correct permanent owner', async () => {
  const workforce = await loadPermanentWorkforce(repoRoot);
  const expected = new Map([
    ['Engineering Council', 'boris'], ['Influencers Council', 'boris'], ['Growth Council', 'gary'],
    ['Marketing Chief', 'gary'], ['PED', 'design-director'], ['Reviewer', 'quality-gate'],
  ]);
  for (const [alias, owner] of expected) {
    const resolved = workforce.resolve(alias);
    assert.equal(resolved?.role.id, owner, alias);
    assert.equal(resolved?.mapping?.classification, 'deprecated', alias);
  }
});

test('legacy BORIS and Gary compatibility paths remain intact', async () => {
  for (const relative of ['agents/BORIS-001/identity/identity.json', 'agents/GARY-001/identity/identity.json', 'agents/registry.js', 'agents/gary.js', 'boris/src/identity/roster.ts']) {
    assert.ok((await stat(path.join(repoRoot, relative))).isFile(), relative);
  }
});

test('Phase 4 adds no standalone skill and keeps pack indexes canonical', async () => {
  for (const relative of ['skills/factory-runtime-wiring/SKILL.md', 'skills/factory-learning-loop/SKILL.md']) {
    assert.ok((await stat(path.join(repoRoot, relative))).isFile());
  }
  const design = JSON.parse(await readFile(path.join(repoRoot, 'skills/design/PACK.json'), 'utf8')) as { members: unknown[] };
  const quality = JSON.parse(await readFile(path.join(repoRoot, 'skills/quality/PACK.json'), 'utf8')) as { members: unknown[] };
  assert.ok(design.members.length > 0);
  assert.ok(quality.members.length > 0);
});
