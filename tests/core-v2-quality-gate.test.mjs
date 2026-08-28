import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const json = async (relative) => JSON.parse(await readFile(new URL(relative, root), 'utf8'));

test('Phase 5 keeps exactly five canonical permanent role IDs and upgrades only Quality Gate', async () => {
  const registry = await json('factory/registry/core-v2.json');
  assert.deepEqual(registry.permanent_roles.map((role) => role.id), ['shia-core', 'boris', 'design-director', 'gary', 'quality-gate']);
  const quality = registry.permanent_roles.find((role) => role.id === 'quality-gate');
  assert.equal(quality.implementation_status, 'operational-quality-gate-v1-candidate');
  assert.equal(quality.certification_status, 'pending-cristian-phase-5-approval');
  for (const role of registry.permanent_roles) {
    assert.deepEqual(await readdir(new URL(`agents/${role.id}/`, root)), ['README.md']);
  }
});

test('canonical receipt schema requires exact task, project, repository, candidate and gate evidence', async () => {
  const schema = await json('factory/quality/quality-gate-receipt.schema.json');
  for (const field of ['taskId', 'projectId', 'repository', 'candidateSha', 'branch', 'riskTier', 'taskContract', 'acceptanceCriteria',
    'requiredEvidence', 'actualEvidence', 'gateResults', 'knownLimitations', 'reworkRequests', 'approvalGates', 'independentReviewer']) {
    assert.ok(schema.required.includes(field), field);
  }
  assert.equal(schema.properties.controlPlane.properties.authority.const, 'shia-core');
  assert.equal(schema.properties.controlPlane.properties.qualityGateMayAcceptTask.const, false);
  assert.equal(schema.properties.controlPlane.properties.gstackMayAcceptTask.const, false);
});

test('risk policy activates consequence-aware security and relevant-only performance gates', async () => {
  const policy = await json('factory/quality/risk-gate-policy.json');
  assert.equal(policy.risk_matrix.T3.security, 'mandatory');
  assert.equal(policy.risk_matrix.T3.adversarial, true);
  assert.equal(policy.risk_matrix.T4.cristian_approval, true);
  assert.deepEqual(policy.performance.activates_when, [
    'frontend-performance-sensitive', 'api-backend-latency-sensitive', 'large-data-database',
    'ai-media-resource-intensive', 'T3-or-T4-material-performance-consequence',
  ]);
  assert.equal(policy.rules.stale_evidence_may_pass, false);
  assert.equal(policy.rules.quality_evidence_grants_authority, false);
});

test('permanent invocation contract delegates complete Quality Gate packets to one canonical engine', async () => {
  const invocations = await json('factory/registry/invocation-contracts.json');
  const quality = invocations.roles.find((role) => role.role_id === 'quality-gate');
  for (const required of ['task-id', 'application-or-project', 'repository', 'branch', 'task-contract', 'risk-tier', 'exact-candidate',
    'acceptance-criteria', 'required-evidence', 'actual-evidence', 'changed-paths', 'change-signals', 'repair-budget', 'evaluated-at']) {
    assert.ok(quality.requires.includes(required), required);
  }
  assert.ok(quality.implementation.compatibility_paths.includes('boris/src/quality/quality-gate.ts'));
  const source = await readFile(new URL('boris/src/identity/permanent-workforce.ts', root), 'utf8');
  assert.match(source, /evaluateQualityGate\(qualityInput\(request\)\)/);
  assert.doesNotMatch(source, /gstackMayAcceptTask:\s*true/);
});

test('Phase 5 creates no standalone skill or sixth agent and leaves Phase 6 untouched', async () => {
  const qualityFiles = await readdir(new URL('skills/quality/', root));
  assert.deepEqual(qualityFiles.sort(), ['PACK.json', 'README.md']);
  assert.equal(qualityFiles.includes('SKILL.md'), false);
  const status = await readFile(new URL('docs/STATUS.md', root), 'utf8');
  const phase6 = status.split('## Phase 6')[1]?.split('## Phase 7')[0] ?? '';
  assert.doesNotMatch(phase6, /\[x\]/);
  assert.match(status, /Phase 5 candidate: 7\/7 technical items evidenced; approval pending/);
});
