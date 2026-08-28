import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  CANONICAL_ROLE_IDS,
  invokePermanentRole,
  loadPermanentWorkforce,
} from '../../src/identity/permanent-workforce.js';
import type { OrchestrationRequest } from '../../src/factory/orchestrator-core.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const profileSource = await readFile(path.join(repoRoot, 'APP_PROFILE.yaml'), 'utf8');

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

test('Shia Core invocation calls the Phase 3 orchestrator rather than a second engine', async () => {
  const result = await invokePermanentRole(repoRoot, {
    role: '@shia-core', capability: 'intake', objective: 'Route existing work.',
    orchestrator: { profileSource, request: orchestrationRequest() },
  });
  assert.equal(result.roleId, 'shia-core');
  assert.equal(result.status, 'accepted');
  assert.equal(result.orchestration?.contract.id, 'PHASE4-INVOCATION');
  assert.ok(result.evidence.includes('boris/src/factory/orchestrator-core.ts'));
});

test('Design Director is callable and routes design work without bootstrap self-certification', async () => {
  const workforce = await loadPermanentWorkforce(repoRoot);
  const design = workforce.byId('design-director');
  assert.equal(design?.certification, 'pending-cristian-approval');
  assert.equal(workforce.resolve('PED')?.role.id, 'design-director');
  const result = await invokePermanentRole(repoRoot, {
    role: 'Design Director', capability: 'ux-review', objective: 'Review responsive UX.',
    evidence: ['design brief'], bootstrapSubjectRole: 'design-director', humanApproved: true,
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.certified, false);
  assert.equal(result.approvalRequired, true);
  assert.ok(result.limitations.some((item) => /repository governance/.test(item)));
});

test('Quality Gate is callable for exact candidates and blocks missing evidence', async () => {
  const blocked = await invokePermanentRole(repoRoot, {
    role: 'Quality Gate', capability: 'functional-test', objective: 'Verify candidate.', exactCandidate: 'candidate-a',
  });
  assert.equal(blocked.status, 'blocked');
  const routed = await invokePermanentRole(repoRoot, {
    role: '@quality-gate', capability: 'functional-test', objective: 'Verify candidate.',
    exactCandidate: 'candidate-a', evidence: ['test:pass'],
  });
  assert.equal(routed.status, 'accepted');
  assert.equal(routed.roleId, 'quality-gate');
});

test('Quality Gate bootstrap cannot self-certify even when invocation claims human approval', async () => {
  const result = await invokePermanentRole(repoRoot, {
    role: 'Testing Agent', capability: 'release-verification', objective: 'Certify Quality Gate bootstrap.',
    exactCandidate: 'phase4-candidate', evidence: ['unit:pass', 'integration:pass'],
    bootstrapSubjectRole: 'quality-gate', reviewerRole: 'quality-gate', humanApproved: true,
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.certified, false);
  assert.equal(result.approvalRequired, true);
  assert.ok(result.limitations.some((item) => /cannot independently certify its own bootstrap/.test(item)));
  assert.ok(result.limitations.some((item) => /Self-review.*non-independent/.test(item)));
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
