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
  migrationCapabilityDecisions,
  orchestrate,
  parseAndValidateAppProfile,
  parseYamlStrict,
  persistDecisionReceipt,
  productionBaselineDigest,
  scanReuseCatalog,
  type NormalizedAppProfile,
  type OrchestrationRequest,
  type ProductionDeploymentDependencies,
  type TrustedProductionBaselineRecord,
} from '../../src/factory/orchestrator-core.js';
import { qualityReceiptDigest } from '../../src/factory/reusable-shelf.js';
import type { ApprovalRequest } from '../../src/domain/types.js';
import type { QualityGateReceipt } from '../../src/quality/quality-gate.js';

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
  assert.ok(catalog.some((asset) => asset.id === 'block:forms-001' && asset.state === 'verified'
    && asset.certification.shelfAdmission === 'candidate'));
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

test('provider-aware routing does not treat self-hosted PostgreSQL as Supabase', () => {
  const postgres = profile({ stack: { frontend: 'server-html', backend: 'node-http', database: 'PostgreSQL-16', source_control: 'GitHub' } });
  const databaseWork = buildTaskContract(postgres, registries, request({
    objective: 'Build a database repository.', requestedCapabilities: ['database', 'postgresql'], requestedActions: ['inspect', 'plan', 'build'],
  }), []);
  assert.equal(databaseWork.selectedTools.some((tool) => tool.id === 'supabase'), false);

  const vpsWork = buildTaskContract(profile({ stack: { frontend: 'server-html', backend: 'node-http', database: 'PostgreSQL', deployment: ['Docker', 'VPS'] } }), registries, request({
    objective: 'Prepare a PostgreSQL Docker VPS deployment.', requestedCapabilities: ['postgresql', 'vps-deployment'],
    requestedActions: ['inspect', 'plan', 'build', 'deploy'],
  }), []);
  assert.equal(vpsWork.selectedTools.some((tool) => tool.id === 'supabase'), false);
  assert.ok(vpsWork.selectedTools.some((tool) => tool.id === 'vps'));
});

test('provider-aware routing retains explicit Supabase support', () => {
  const backend = buildTaskContract(profile({ stack: { frontend: 'Next.js', backend: 'Supabase', deployment: ['VPS'] } }), registries, request({
    objective: 'Build the configured backend.', requestedCapabilities: ['backend'], requestedActions: ['inspect', 'plan', 'build'],
  }), []);
  assert.ok(backend.selectedTools.some((tool) => tool.id === 'supabase'));

  const integration = buildTaskContract(profile({ stack: { frontend: 'Next.js', backend: 'node', integrations: ['Supabase'] } }), registries, request({
    objective: 'Build the declared data integration.', requestedCapabilities: ['integration', 'database'], requestedActions: ['inspect', 'plan', 'build'],
  }), []);
  assert.ok(integration.selectedTools.some((tool) => tool.id === 'supabase'));
});

function deploymentRequest(overrides: Partial<NonNullable<OrchestrationRequest['productionDeployment']>> = {}): OrchestrationRequest {
  const base = request({
    objective: 'Build, test and deploy a bounded production change.',
    requestedCapabilities: ['engineering', 'test-verification', 'vps-deployment'],
    requestedActions: ['inspect', 'plan', 'build', 'test', 'deploy'],
  });
  return { ...base, productionDeployment: { environment: 'production', existingApplication: true,
    repository: 'repo', candidateSha: base.repository.commit, ...overrides } };
}

function trustedBaseline(candidateSha = request().repository.commit, healthSha = candidateSha): TrustedProductionBaselineRecord {
  const base: Omit<TrustedProductionBaselineRecord, 'integrityDigest'> = {
    referenceId: 'baseline-1', repository: 'repo', deployedSha: candidateSha,
    runtimeIdentity: { id: 'compose:michel-os/app:container-1', source: 'trusted-vps-observer' },
    healthBaseline: { state: 'healthy', observedSha: healthSha, source: 'trusted-vps-observer:/api/ready' },
    rollbackRevision: { sha: candidateSha, source: 'trusted-vps-observer:.swarm/deployed-sha', procedureId: 'rollback-1' },
    backupRecovery: { state: 'restore-verified', productionSha: candidateSha, backupId: 'backup-1', recoveryPlanId: 'recovery-1',
      source: 'trusted-backup-observer', restoreTested: true },
    releaseProvenance: { state: 'verified', source: 'trusted-runtime-observer', repositoryRevision: candidateSha,
      deploymentStampRevision: candidateSha, imageRevision: healthSha },
    observedAt: '2026-08-30T22:30:00Z', collector: 'phase-7-test-observer',
  };
  return { ...base, integrityDigest: productionBaselineDigest(base) };
}

function trustedQualityReceipt(taskId: string, candidateSha: string): QualityGateReceipt {
  const receipt = {
    schemaVersion: '1.1.0', receiptId: '', finalState: 'pass', taskId, projectId: 'fixture-app', repository: 'repo',
    candidateSha, branch: 'main', riskTier: 'T3', staleEvidence: [], unverifiedEvidence: [], unverifiedApprovals: [],
    criterionResults: [], gateResults: [],
  } as unknown as QualityGateReceipt;
  receipt.receiptId = qualityReceiptDigest(receipt);
  return receipt;
}

function approvedDeployment(taskId: string, candidateSha: string): ApprovalRequest {
  return { id: 'approval-1', taskId, runId: null, action: 'deploy', tool: null,
    input: { candidateSha, provenance: 'phase-7-test-governance' }, reason: 'Approve exact production deployment.', risk: 'T3',
    consequence: 'Production mutation.', state: 'approved', requestedAt: '2026-08-30T22:30:00Z',
    decidedAt: '2026-08-30T22:31:00Z', decidedBy: 'Cristian', decisionNote: null };
}

function completeDeploymentDependencies(candidateRequest: OrchestrationRequest, baseline = trustedBaseline()): ProductionDeploymentDependencies {
  const receipt = trustedQualityReceipt(candidateRequest.taskId, candidateRequest.repository.commit);
  const approval = approvedDeployment(candidateRequest.taskId, candidateRequest.repository.commit);
  return {
    baselineResolver: { id: 'baseline-resolver', provenance: 'test', resolve: (id) => id === baseline.referenceId ? baseline : null },
    qualityReceiptResolver: { id: 'quality-resolver', provenance: 'test', resolve: (id) => id === receipt.receiptId ? receipt : null },
    governanceApprovalResolver: { id: 'approval-resolver', provenance: 'test', resolve: (id) => id === approval.id ? approval : null },
  };
}

test('T3 existing production deployment is precondition-blocked without blocking isolated build and test', () => {
  const candidate = deploymentRequest();
  const contract = buildTaskContract(profile({ app: { id: 'fixture-app', name: 'Fixture', type: 'web-app', lifecycleStage: 'production' },
    risk: { baselineTier: 'T3', reasons: ['Existing private production application.'] }, data: { sensitivity: 'private', irreversibleAuthority: false } }),
  registries, candidate, []);
  assert.equal(contract.executionBlocked, false);
  assert.equal(contract.allowedActions.find((item) => item.action === 'build')?.executable, true);
  assert.equal(contract.allowedActions.find((item) => item.action === 'test')?.executable, true);
  assert.equal(contract.allowedActions.find((item) => item.action === 'deploy')?.executionState, 'precondition-blocked');
  assert.equal(contract.deployment?.state, 'precondition-blocked');
  assert.equal(contract.deployment?.preconditions.length, 8);
  assert.equal(contract.deployment?.productionMutationPerformed, false);
});

test('approval or Quality receipt alone cannot clear missing production baseline evidence', () => {
  const baseRequest = deploymentRequest();
  const approval = approvedDeployment(baseRequest.taskId, baseRequest.repository.commit);
  const approvalOnly = deploymentRequest({ approvalId: approval.id });
  const approvalContract = buildTaskContract(profile(), registries, approvalOnly, [], undefined, {
    governanceApprovalResolver: { id: 'approval-resolver', provenance: 'test', resolve: () => approval },
  });
  assert.equal(approvalContract.deployment?.state, 'precondition-blocked');
  assert.ok(approvalContract.deployment?.blockers.some((item) => /deployed-production-revision/.test(item)));
  assert.ok(approvalContract.deployment?.blockers.some((item) => /exact-candidate-quality-receipt/.test(item)));

  const receipt = trustedQualityReceipt(baseRequest.taskId, baseRequest.repository.commit);
  const qualityOnly = deploymentRequest({ qualityReceiptReferenceId: receipt.receiptId });
  const qualityContract = buildTaskContract(profile(), registries, qualityOnly, [], undefined, {
    qualityReceiptResolver: { id: 'quality-resolver', provenance: 'test', resolve: () => receipt },
  });
  assert.equal(qualityContract.deployment?.state, 'precondition-blocked');
  assert.ok(qualityContract.deployment?.blockers.some((item) => /health-baseline/.test(item)));
  assert.ok(qualityContract.deployment?.blockers.some((item) => /cristian-deploy-approval/.test(item)));
});

test('stale production observation cannot clear deploy while complete matching trusted evidence may make it eligible', () => {
  const initial = deploymentRequest();
  const receipt = trustedQualityReceipt(initial.taskId, initial.repository.commit);
  const approval = approvedDeployment(initial.taskId, initial.repository.commit);
  const candidate = deploymentRequest({ baselineReferenceId: 'baseline-1', qualityReceiptReferenceId: receipt.receiptId, approvalId: approval.id });
  const staleBaseline = trustedBaseline(initial.repository.commit, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const stale = buildTaskContract(profile(), registries, candidate, [], undefined, completeDeploymentDependencies(candidate, staleBaseline));
  assert.equal(stale.deployment?.state, 'precondition-blocked');
  assert.ok(stale.deployment?.blockers.some((item) => /exact-release-provenance/.test(item)));

  const complete = buildTaskContract(profile(), registries, candidate, [], undefined, completeDeploymentDependencies(candidate));
  assert.equal(complete.deployment?.state, 'eligible');
  assert.deepEqual(complete.deployment?.blockers, []);
  assert.ok(complete.deployment?.preconditions.every((item) => item.state === 'satisfied'));
  assert.equal(complete.allowedActions.find((item) => item.action === 'deploy')?.executable, true);
  assert.equal(complete.deployment?.productionMutationPerformed, false);
});

test('backup-file integrity and matching deployment markers do not prove restore or running-image provenance', () => {
  const initial = deploymentRequest();
  const receipt = trustedQualityReceipt(initial.taskId, initial.repository.commit);
  const approval = approvedDeployment(initial.taskId, initial.repository.commit);
  const candidate = deploymentRequest({ baselineReferenceId: 'baseline-1', qualityReceiptReferenceId: receipt.receiptId, approvalId: approval.id });
  const complete = trustedBaseline();
  const { integrityDigest: _integrityDigest, ...completeBase } = complete;
  const integrityOnlyBase: Omit<TrustedProductionBaselineRecord, 'integrityDigest'> = {
    ...completeBase,
    rollbackRevision: { ...complete.rollbackRevision, procedureId: null },
    backupRecovery: { state: 'integrity-verified', productionSha: complete.deployedSha, backupId: 'backup.sql.gz',
      recoveryPlanId: null, source: 'trusted-vps-observer:gzip', integrityDigest: 'a'.repeat(64), integrityCheck: 'pass', restoreTested: false },
    releaseProvenance: { state: 'marker-only', source: 'trusted-vps-observer', repositoryRevision: complete.deployedSha,
      deploymentStampRevision: complete.deployedSha, imageRevision: null },
  };
  const integrityOnly = { ...integrityOnlyBase, integrityDigest: productionBaselineDigest(integrityOnlyBase) };
  const contract = buildTaskContract(profile(), registries, candidate, [], undefined, completeDeploymentDependencies(candidate, integrityOnly));
  assert.equal(contract.deployment?.state, 'precondition-blocked');
  assert.deepEqual(contract.deployment?.preconditions.filter((item) => item.state !== 'satisfied').map((item) => item.id), [
    'rollback-revision', 'backup-recovery', 'exact-release-provenance',
  ]);
  assert.equal(contract.deployment?.productionMutationPerformed, false);
});

test('migration analysis preserves working application capabilities despite Shelf CREATE', () => {
  const decisions = migrationCapabilityDecisions([
    { capability: 'identity-auth', existingImplementation: 'working', evidence: ['server/auth'], extractionCandidateAfterLifecycleProof: true },
    { capability: 'release-provenance-readiness', existingImplementation: 'missing', evidence: ['server/main.ts:/api/ready'], boundedPilotChangesCapability: true, extractionCandidateAfterLifecycleProof: true },
  ], 'CREATE');
  assert.deepEqual(decisions.map((item) => [item.factoryShelfDisposition, item.applicationAction, item.extractionAction]), [
    ['CREATE', 'PRESERVE', 'CANDIDATE_AFTER_LIFECYCLE_PROOF'],
    ['CREATE', 'IMPLEMENT', 'CANDIDATE_AFTER_LIFECYCLE_PROOF'],
  ]);
  assert.equal(decisions.some((item) => (item.applicationAction as string) === 'REBUILD'), false);
  assert.match(decisions[0]?.reason ?? '', /does not authorize a rebuild/);
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

test('BORIS can build an isolated pending Design Director bootstrap candidate without self-certification', () => {
  const pendingRegistries = structuredClone(registries);
  const registryRole = pendingRegistries.core.permanent_roles.find((role) => role.id === 'design-director');
  assert.ok(registryRole);
  registryRole.certification_status = 'pending-cristian-bootstrap-approval';
  const contract = buildTaskContract(profile(), pendingRegistries, request({
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

test('BORIS can build an isolated pending Quality Gate bootstrap candidate but cannot certify or release it', () => {
  const pendingRegistries = structuredClone(registries);
  const registryRole = pendingRegistries.core.permanent_roles.find((role) => role.id === 'quality-gate');
  assert.ok(registryRole);
  registryRole.certification_status = 'pending-cristian-bootstrap-approval';
  const contract = buildTaskContract(profile(), pendingRegistries, request({
    objective: 'Implement the missing unified Quality Gate runtime candidate.',
    requestedCapabilities: ['quality gate implementation', 'engineering'],
    requestedActions: ['inspect', 'plan', 'build'],
  }), []);
  assert.equal(contract.selectedRoles.find((role) => role.id === 'quality-gate')?.availability, 'available');
  assert.equal(contract.executionBlocked, false);
  assert.equal(contract.certificationReleaseBlocked, true);
  assert.ok(contract.certificationReleaseBlockers.some((blocker) => /quality-gate.*pending Cristian approval/.test(blocker)));

  const release = buildTaskContract(profile(), pendingRegistries, request({
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

test('approved Phase 5 Quality Gate no longer creates a registry certification blocker', async () => {
  const result = await orchestrate(repoRoot, profileSource, request({
    objective: 'Add a normal integration feature.', requestedCapabilities: ['integration'], requestedActions: ['inspect', 'plan', 'build'],
  }));
  assert.equal(result.contract.projectId, 'shia-factory');
  assert.equal(result.contract.repository.commit, request().repository.commit);
  assert.equal(result.contract.risk.tier, 'T3');
  assert.ok(result.contract.requiredEvidence.includes('security'));
  assert.ok(result.contract.acceptanceCriteria.length > 0);
  assert.equal(result.contract.executionBlocked, false);
  assert.equal(result.contract.certificationReleaseBlockers.some((blocker) => /quality-gate.*pending Cristian approval/.test(blocker)), false);
  assert.equal(result.contract.executionBlocked, false);
  assert.equal(result.contract.reuse.shelfDecision?.disposition, 'CREATE');
  assert.ok((result.contract.reuse.shelfDecision?.noMatchEvidence.length ?? 0) > 0);
});

test('orchestrator records an explicit non-admitted extension policy without calling it exact reuse', async () => {
  const result = await orchestrate(repoRoot, profileSource, request({
    objective: 'Extend the existing forms browser capability.', requestedCapabilities: ['forms'],
    requestedActions: ['inspect', 'plan', 'build'], capabilityCreationRequested: true,
    targetPlatforms: ['browser'], allowNonAdmittedAssetIds: ['block:forms-001'],
  }));
  assert.equal(result.contract.reuse.shelfDecision?.disposition, 'EXTEND');
  assert.deepEqual(result.contract.reuse.shelfDecision?.nonAdmittedUse, { permitted: true, assetIds: ['block:forms-001'] });
  const decision = result.receipt.decisions.find((item) => item.stage === 'shelf-reuse');
  assert.equal(decision?.decision, 'EXTEND');
  assert.match(decision?.reason ?? '', /not treated as certified reuse/);
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
