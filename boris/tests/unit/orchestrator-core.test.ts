import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildTaskContract,
  classifyRisk,
  createDecisionReceipt,
  discoverReuse,
  loadOrchestratorRegistries,
  orchestrate,
  parseAndValidateAppProfile,
  parseYamlStrict,
  persistDecisionReceipt,
  scanReuseCatalog,
  type NormalizedAppProfile,
  type OrchestrationRequest,
} from '../../src/factory/orchestrator-core.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const profileSource = await readFile(path.join(repoRoot, 'APP_PROFILE.yaml'), 'utf8');
const registries = await loadOrchestratorRegistries(repoRoot);

function profile(overrides: Partial<NormalizedAppProfile> = {}): NormalizedAppProfile {
  return {
    schemaVersion: '1.0',
    app: { id: 'fixture-app', name: 'Fixture', type: 'web-app', lifecycleStage: 'build' },
    blueprint: null,
    risk: { baselineTier: 'T0', reasons: ['Low baseline fixture.'] },
    data: { sensitivity: 'public', irreversibleAuthority: false },
    stack: { frontend: 'Next.js', source_control: 'GitHub', deployment: ['VPS'] },
    requiredRoles: ['shia-core'], conditionalRoles: ['boris', 'design-director', 'gary', 'quality-gate'],
    quality: { unit: 'required' }, approvals: { human_before_merge: true, human_before_deploy: true },
    reuseSearchRequired: true, statusDocument: 'docs/STATUS.md', ...overrides,
  };
}

function request(overrides: Partial<OrchestrationRequest> = {}): OrchestrationRequest {
  return {
    taskId: 'ORCH-001', objective: 'Update documentation copy.', outcome: 'Clear documentation.',
    repository: { commit: '6b3f055c3446fe88cb77e5c4451d25d37c67e8ff', branch: 'main' },
    requestedCapabilities: ['documentation'], requestedActions: ['inspect', 'plan'],
    acceptanceCriteria: [{ id: 'AC-1', statement: 'Documentation is accurate.', evidence: ['observation'] }],
    now: '2026-08-28T15:00:00Z', ...overrides,
  };
}

test('strict parser normalizes the current APP_PROFILE and registry roles', () => {
  const parsed = parseAndValidateAppProfile(profileSource, registries.core);
  assert.equal(parsed.app.id, 'shia-factory');
  assert.equal(parsed.risk.baselineTier, 'T3');
  assert.deepEqual(parsed.stack.language, ['JavaScript', 'TypeScript']);
  assert.equal(parsed.data.sensitivity, 'internal');
  assert.deepEqual(parsed.requiredRoles, ['shia-core', 'boris', 'quality-gate']);
});

test('profile validation fails closed on unknown keys, roles, schema and disabled reuse search', () => {
  assert.throws(() => parseAndValidateAppProfile(`${profileSource}\nunknown_key: true\n`, registries.core), /unsupported APP_PROFILE key/);
  assert.throws(() => parseAndValidateAppProfile(profileSource.replace('schema_version: "1.0"', 'schema_version: "2.0"'), registries.core), /unsupported APP_PROFILE schema/);
  assert.throws(() => parseAndValidateAppProfile(profileSource.replace('conditional_roles: [design-director, gary]', 'conditional_roles: [invented-agent]'), registries.core), /unknown role/);
  assert.throws(() => parseAndValidateAppProfile(profileSource.replace('reuse_search_required: true', 'reuse_search_required: false'), registries.core), /must require reuse search/);
});

test('strict YAML parser rejects duplicate keys, tabs, anchors and unsupported inline objects', () => {
  assert.throws(() => parseYamlStrict('a: 1\na: 2\n'), /duplicate key/);
  assert.throws(() => parseYamlStrict('a:\n\tb: 1\n'), /tabs/);
  assert.throws(() => parseYamlStrict('a: &anchor value\n'), /anchors/);
  assert.throws(() => parseYamlStrict('a: {b: 1}\n'), /inline objects/);
});

test('reuse catalog searches blocks, pack members and known implementations before creation', async () => {
  const catalog = await scanReuseCatalog(repoRoot, registries);
  assert.ok(catalog.some((asset) => asset.id === 'block:forms-001' && asset.state === 'legacy'));
  assert.ok(catalog.some((asset) => asset.path === 'skills/factory-runtime-wiring/SKILL.md' && asset.state === 'verified'));
  assert.ok(catalog.some((asset) => asset.kind === 'implementation' && asset.id.includes('boris')));
  const findings = discoverReuse(['runtime wiring'], catalog);
  assert.ok(findings.some((finding) => finding.path === 'skills/factory-runtime-wiring/SKILL.md' && finding.state === 'verified'));
});

test('provenance-verified reuse is not Shelf-admitted or Quality Gate certified', async () => {
  const catalog = await scanReuseCatalog(repoRoot, registries);
  const findings = discoverReuse(['runtime wiring'], catalog);
  const existing = findings.find((finding) => finding.path === 'skills/factory-runtime-wiring/SKILL.md');
  assert.equal(existing?.state, 'verified');
  assert.deepEqual(existing?.certification, {
    provenanceVerified: true,
    shelfAdmission: 'not-evaluated',
    qualityCertification: 'not-evaluated',
  });
  const contract = buildTaskContract(profile(), registries, request({
    objective: 'Create runtime wiring capability.', requestedCapabilities: ['runtime wiring'],
    requestedActions: ['inspect', 'plan'], capabilityCreationRequested: true,
  }), findings);
  assert.equal(contract.reuse.searched, true);
  assert.equal(contract.reuse.creationDisposition, 'reuse-required-before-creation');
});

test('risk routing uses consequence and data sensitivity instead of diff size', () => {
  const privateRisk = classifyRisk(profile({ data: { sensitivity: 'private', irreversibleAuthority: false } }), request({
    objective: 'Change login behavior.', changedPaths: ['one-line.ts'], requestedActions: ['build'], requestedCapabilities: ['authentication'],
  }));
  assert.equal(privateRisk.tier, 'T3');
  assert.ok(privateRisk.reasons.some((reason) => /overrides superficial diff size/.test(reason)));
  const regulatedRisk = classifyRisk(profile({ data: { sensitivity: 'regulated', irreversibleAuthority: false } }), request());
  assert.equal(regulatedRisk.tier, 'T4');
});

test('minimum routing selects only Shia Core and BORIS for an isolated build', () => {
  const contract = buildTaskContract(profile(), registries, request({
    objective: 'Build an isolated parser helper.', requestedCapabilities: ['engineering'], requestedActions: ['inspect', 'plan', 'build'],
  }), []);
  assert.deepEqual(contract.selectedRoles.map((role) => role.id), ['shia-core', 'boris']);
  assert.deepEqual(contract.selectedSkillPacks.map((pack) => pack.id), ['operations', 'engineering']);
  assert.deepEqual(contract.selectedTools.map((tool) => tool.id), ['github']);
  assert.equal(contract.blocked, false);
});

test('unavailable roles remain unavailable and block required work', () => {
  const unavailableRegistries = structuredClone(registries);
  const registryRole = unavailableRegistries.core.permanent_roles.find((role) => role.id === 'design-director');
  const invocationRole = unavailableRegistries.invocation.roles.find((role) => role.role_id === 'design-director');
  assert.ok(registryRole && invocationRole);
  registryRole.implementation_status = 'missing';
  invocationRole.implementation.status = 'missing';
  const contract = buildTaskContract(profile(), unavailableRegistries, request({
    objective: 'Review responsive UX.', requestedCapabilities: ['ux', 'responsive design'], requestedActions: ['inspect', 'plan', 'design'],
  }), []);
  const design = contract.selectedRoles.find((role) => role.id === 'design-director');
  assert.equal(design?.availability, 'unavailable');
  assert.equal(contract.executionBlocked, true);
  assert.ok(contract.executionBlockers.some((blocker) => /design-director is unavailable/.test(blocker)));
  assert.equal(contract.certificationReleaseBlocked, true);
});

test('BORIS can build an isolated Design Director bootstrap candidate without self-certification', () => {
  const contract = buildTaskContract(profile(), registries, request({
    objective: 'Implement the missing Design Director runtime candidate.',
    requestedCapabilities: ['design director implementation', 'engineering'],
    requestedActions: ['inspect', 'plan', 'build'],
  }), []);
  assert.equal(contract.selectedRoles.find((role) => role.id === 'design-director')?.availability, 'available');
  assert.equal(contract.selectedRoles.find((role) => role.id === 'boris')?.availability, 'available');
  assert.equal(contract.executionBlocked, false);
  assert.equal(contract.blocked, false);
  assert.equal(contract.certificationReleaseBlocked, true);
  assert.ok(contract.certificationReleaseBlockers.some((blocker) => /design-director.*pending Cristian approval/.test(blocker)));
});

test('BORIS can build an isolated Quality Gate bootstrap candidate but cannot certify or release it', () => {
  const contract = buildTaskContract(profile(), registries, request({
    objective: 'Implement the missing unified Quality Gate runtime candidate.',
    requestedCapabilities: ['quality gate implementation', 'engineering'],
    requestedActions: ['inspect', 'plan', 'build'],
  }), []);
  assert.equal(contract.selectedRoles.find((role) => role.id === 'quality-gate')?.availability, 'available');
  assert.equal(contract.executionBlocked, false);
  assert.equal(contract.certificationReleaseBlocked, true);
  assert.ok(contract.certificationReleaseBlockers.some((blocker) => /quality-gate.*pending Cristian approval/.test(blocker)));

  const release = buildTaskContract(profile(), registries, request({
    objective: 'Deploy the Quality Gate candidate.', requestedCapabilities: ['quality gate implementation'],
    requestedActions: ['inspect', 'plan', 'deploy'],
  }), []);
  assert.equal(release.executionBlocked, true);
  assert.ok(release.executionBlockers.some((blocker) => /merge\/deploy cannot execute/.test(blocker)));
  assert.ok(release.approvalGates.includes('Cristian+quality-receipt'));
  assert.ok(release.approvalGates.includes('Cristian'));
});

test('authority enforcement denies direct secrets and gates merge/deploy', () => {
  const denied = buildTaskContract(profile(), registries, request({
    objective: 'Read a secret directly.', requestedCapabilities: ['engineering'], requestedActions: ['inspect', 'plan', 'access-secrets-directly'],
  }), []);
  assert.equal(denied.allowedActions.find((item) => item.action === 'access-secrets-directly')?.allowed, false);
  assert.equal(denied.blocked, true);

  const gated = buildTaskContract(profile(), registries, request({
    objective: 'Prepare and deploy a bounded release.', requestedCapabilities: ['devops'], requestedActions: ['inspect', 'plan', 'deploy'],
  }), []);
  assert.ok(gated.approvalGates.includes('Cristian+quality-receipt'));
  assert.ok(gated.approvalGates.includes('Cristian'));
});

test('task contract emits acceptance, evidence, repository binding and honest Quality Gate certification blocker', async () => {
  const result = await orchestrate(repoRoot, profileSource, request({
    objective: 'Add a normal integration feature.', requestedCapabilities: ['integration'], requestedActions: ['inspect', 'plan', 'build'],
  }));
  assert.equal(result.contract.projectId, 'shia-factory');
  assert.equal(result.contract.repository.commit, request().repository.commit);
  assert.equal(result.contract.risk.tier, 'T3');
  assert.ok(result.contract.requiredEvidence.includes('security'));
  assert.ok(result.contract.acceptanceCriteria.length > 0);
  assert.equal(result.contract.executionBlocked, false);
  assert.ok(result.contract.certificationReleaseBlockers.some((blocker) => /quality-gate.*pending Cristian approval/.test(blocker)));
});

test('decision receipt is deterministic, repository-bound and persisted idempotently', async () => {
  const contract = buildTaskContract(profile(), registries, request(), []);
  const first = createDecisionReceipt(profile(), contract, request());
  const second = createDecisionReceipt(profile(), contract, request());
  assert.deepEqual(first, second);
  assert.equal(first.repository.commit, request().repository.commit);
  assert.equal(first.contractDigest.length, 64);
  assert.equal(first.receiptId.length, 64);

  const directory = await mkdtemp(path.join(tmpdir(), 'shia-receipts-'));
  try {
    const target = await persistDecisionReceipt(first, directory);
    assert.equal(await persistDecisionReceipt(first, directory), target);
    const stored = JSON.parse(await readFile(target, 'utf8')) as { receiptId: string };
    assert.equal(stored.receiptId, first.receiptId);
    const changed = { ...first, createdAt: 'later' };
    await assert.rejects(() => persistDecisionReceipt(changed, directory), /already exists with different content/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('request validation fails closed on missing criteria, unknown actions and invalid repository state', () => {
  assert.throws(() => buildTaskContract(profile(), registries, request({ acceptanceCriteria: [] }), []), /acceptance criteria/);
  assert.throws(() => buildTaskContract(profile(), registries, request({ requestedActions: ['teleport'] }), []), /unsupported action/);
  assert.throws(() => buildTaskContract(profile(), registries, request({ repository: { commit: 'not-a-sha', branch: 'main' } }), []), /Git SHA/);
});
