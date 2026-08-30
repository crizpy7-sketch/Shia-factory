import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildTaskContract, loadOrchestratorRegistries, type NormalizedAppProfile, type OrchestrationRequest } from '../../src/factory/orchestrator-core.js';
import {
  admitShelfCandidate,
  createTrustedQualityReceiptAdapter,
  decideShelfReuse,
  deriveFactoryTrustManifest,
  isAdmittedShelfAsset,
  loadShelfCatalog,
  qualityReceiptDigest,
  shelfManifestPathsExist,
  trustedShelfReceiptRecordDigest,
  validateShelfDependencyGraph,
  validateShelfManifest,
  type LoadedShelfAsset,
  type ShelfAssetManifest,
  type TrustedQualityReceiptRecord,
} from '../../src/factory/reusable-shelf.js';
import { evaluateQualityGate, type QualityEvidence, type QualityGateInput, type QualityGateReceipt } from '../../src/quality/quality-gate.js';
import { admitTrustedFixture } from '../helpers/quality-admission.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const registries = await loadOrchestratorRegistries(repoRoot);
const CANDIDATE = 'a'.repeat(40);

function profile(): NormalizedAppProfile {
  return {
    schemaVersion: '1.0', app: { id: 'shelf-fixture', name: 'Shelf Fixture', type: 'web-app', lifecycleStage: 'build' },
    blueprint: null, risk: { baselineTier: 'T1', reasons: ['Bounded Shelf fixture.'] },
    data: { sensitivity: 'public', irreversibleAuthority: false }, stack: { frontend: 'browser' },
    requiredRoles: ['shia-core'], conditionalRoles: ['boris', 'design-director', 'gary', 'quality-gate'],
    quality: { unit: 'required' }, approvals: { human_before_merge: true, human_before_deploy: true },
    reuseSearchRequired: true, statusDocument: 'docs/STATUS.md',
  };
}

function request(): OrchestrationRequest {
  return {
    taskId: 'SHELF-ADMISSION-block-test-forms-1.0.0', objective: 'Create a bounded reusable forms capability.', outcome: 'A tested forms candidate exists.',
    repository: { commit: CANDIDATE, branch: 'fixture' }, requestedCapabilities: ['forms', 'engineering'],
    requestedActions: ['inspect', 'plan', 'build'], acceptanceCriteria: [{ id: 'AC-1', statement: 'Forms behavior passes.', evidence: ['unit'] }],
    capabilityCreationRequested: true, targetPlatforms: ['browser'], now: '2026-08-29T00:00:00Z',
  };
}

function evidence(kind: QualityEvidence['kind']): QualityEvidence {
  return {
    id: `evidence-${kind}`, kind, candidateSha: CANDIDATE, status: 'pass', source: 'phase-6-test-fixture',
    summary: `${kind} passed.`, criterionIds: kind === 'unit' ? ['AC-1'] : [], observedAt: '2026-08-29T00:00:00Z',
    method: 'automated-tool', testedSurfaces: ['fixture'],
  };
}

function passingReceipt(): QualityGateReceipt {
  const contract = buildTaskContract(profile(), registries, request(), []);
  const input: QualityGateInput = {
    taskId: contract.id, projectId: contract.projectId, repository: 'repo', candidateSha: CANDIDATE, branch: contract.repository.branch,
    riskTier: contract.risk.tier, taskContract: contract, acceptanceCriteria: contract.acceptanceCriteria,
    requiredEvidence: contract.requiredEvidence,
    actualEvidence: ['typecheck', 'lint', 'unit', 'integration', 'security'].map((kind) => evidence(kind as QualityEvidence['kind'])),
    changedPaths: ['src/forms.ts'], changeSignals: { userFacing: false, securitySurfaces: [], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: [] },
    dangerousActions: [], reviewer: null, repair: { attempt: 0, maxAttempts: 2 }, evaluatedAt: '2026-08-29T00:00:00Z',
  };
  const receipt = evaluateQualityGate(admitTrustedFixture(input));
  assert.equal(receipt.finalState, 'pass', JSON.stringify({ limitations: receipt.knownLimitations, gates: receipt.gateResults, criteria: receipt.criterionResults }, null, 2));
  return receipt;
}

function manifest(receipt: QualityGateReceipt | null = null, overrides: Partial<ShelfAssetManifest> = {}): ShelfAssetManifest {
  return {
    schemaVersion: '1.0.0', assetId: 'block:test-forms', type: 'block', lifecycle: 'candidate', version: '1.0.0', owner: 'boris',
    purpose: 'Test forms capability.', repository: { id: 'repo', path: 'blocks/test-forms' }, capabilities: ['forms', 'engineering'],
    dependencies: [], supportedPlatforms: ['browser'], interfaces: [{ id: 'submit', direction: 'output', schema: 'Record', description: 'Emits a record.' }],
    blueprint: null,
    compatibility: { factoryCore: '>=2.0.0', runtimes: ['browser'], notes: [] },
    provenance: { sourceType: 'repository', sourcePath: 'blocks/test-forms/index.html', evidence: ['tests/forms.test.ts'] },
    exactSource: { repository: 'repo', candidateSha: CANDIDATE, version: '1.0.0' },
    qualityGate: { receipt: receipt ? { sourceType: 'factory-quality-gate', taskId: receipt.taskId, receiptId: receipt.receiptId, candidateSha: CANDIDATE } : null,
      admissionEvidenceState: 'missing' },
    security: { riskTier: 'T1', dataSensitivity: 'public', reviewState: 'quality-gate-reviewed' },
    documentation: ['docs/forms.md'], examples: ['examples/forms.html'], tests: ['tests/forms.test.ts'], knownLimitations: ['Fixture only.'],
    maintenance: { status: 'active', maintainer: 'boris', lastReviewedAt: '2026-08-29T00:00:00Z' },
    deprecation: { replacementAssetId: null, reason: null, effectiveAt: null }, ...overrides,
  };
}

function trusted(receipt: QualityGateReceipt): ReturnType<typeof createTrustedQualityReceiptAdapter> {
  const base: Omit<TrustedQualityReceiptRecord, 'integrityDigest'> = {
    referenceId: receipt.receiptId, receipt, collector: 'phase-6-quality-receipt-store', observedAt: receipt.evaluatedAt,
  };
  const record: TrustedQualityReceiptRecord = { ...base, integrityDigest: trustedShelfReceiptRecordDigest(base) };
  return createTrustedQualityReceiptAdapter('phase-6-quality-receipt-adapter', (referenceId) => referenceId === record.referenceId ? record : null);
}

function loaded(candidate: ShelfAssetManifest, admitted: ReturnType<typeof admitShelfCandidate>['admittedAsset'] = undefined): LoadedShelfAsset {
  return { manifest: admitted ?? candidate, admitted: admitted ?? null, admission: null };
}

test('only a trusted passing exact-candidate Phase 5 receipt can admit a Shelf asset', () => {
  const receipt = passingReceipt();
  assert.equal(qualityReceiptDigest(receipt), receipt.receiptId);
  const rawClaim = admitShelfCandidate(manifest(receipt), { qualityReceiptAdapters: [] });
  assert.equal(rawClaim.state, 'needs-evidence');
  assert.match(rawClaim.findings.join(' '), /No authorized adapter/);

  const result = admitShelfCandidate(manifest(receipt), { qualityReceiptAdapters: [trusted(receipt)] });
  assert.equal(result.state, 'admitted');
  assert.ok(result.admittedAsset && isAdmittedShelfAsset(result.admittedAsset));
});

test('catalog files and manifests remain candidates rather than becoming automatically admitted', async () => {
  const catalog = await loadShelfCatalog(repoRoot);
  assert.deepEqual(catalog.map((item) => [item.manifest.assetId, item.manifest.lifecycle, item.admitted]), [
    ['block:forms-001', 'candidate', null], ['block:records-002', 'candidate', null],
  ]);
});

test('caller-created lifecycle and Quality Gate claims do not create a reusable admitted asset', () => {
  const receipt = passingReceipt();
  const forged = manifest(receipt, { lifecycle: 'admitted', qualityGate: { receipt: { sourceType: 'factory-quality-gate', taskId: receipt.taskId, receiptId: receipt.receiptId, candidateSha: CANDIDATE }, admissionEvidenceState: 'verified' } });
  assert.equal(isAdmittedShelfAsset(forged), false);
  const decision = decideShelfReuse({ capabilities: ['forms'], targetPlatforms: ['browser'] }, [loaded(forged)]);
  assert.equal(decision.disposition, 'CREATE');
  assert.match(decision.noMatchEvidence.join(' '), /not admitted/i);
});

test('stale, mismatched or tampered receipt evidence cannot admit another source candidate', () => {
  const receipt = passingReceipt();
  const stale = manifest(receipt, { exactSource: { repository: 'repo', candidateSha: 'b'.repeat(40), version: '1.0.0' } });
  assert.equal(admitShelfCandidate(stale, { qualityReceiptAdapters: [trusted(receipt)] }).state, 'needs-evidence');
  const anotherAsset = manifest(receipt, { assetId: 'block:other', repository: { id: 'repo', path: 'blocks/other' } });
  assert.equal(admitShelfCandidate(anotherAsset, { qualityReceiptAdapters: [trusted(receipt)] }).state, 'needs-evidence');

  const base: Omit<TrustedQualityReceiptRecord, 'integrityDigest'> = { referenceId: receipt.receiptId, receipt, collector: 'tampered', observedAt: receipt.evaluatedAt };
  const bad = { ...base, integrityDigest: '0'.repeat(64) };
  const adapter = createTrustedQualityReceiptAdapter('tampered', () => bad);
  assert.equal(admitShelfCandidate(manifest(receipt), { qualityReceiptAdapters: [adapter] }).state, 'needs-evidence');
});

test('dependency policy rejects higher/same-layer coupling and circular graphs', () => {
  const block = manifest(null, { assetId: 'block:primitive', repository: { id: 'repo', path: 'blocks/primitive' }, capabilities: ['primitive'] });
  const moduleA = manifest(null, { assetId: 'module:a', type: 'module', repository: { id: 'repo', path: 'modules/a' }, capabilities: ['a'],
    dependencies: [{ assetId: 'module:b', type: 'module', versionRange: '^1.0.0' }] });
  const moduleB = manifest(null, { assetId: 'module:b', type: 'module', repository: { id: 'repo', path: 'modules/b' }, capabilities: ['b'],
    dependencies: [{ assetId: 'module:a', type: 'module', versionRange: '^1.0.0' }] });
  const blueprint = manifest(null, { assetId: 'blueprint:web', type: 'blueprint', repository: { id: 'repo', path: 'blueprints/web' }, capabilities: ['web'],
    dependencies: [{ assetId: 'block:primitive', type: 'block', versionRange: '^1.0.0' }] });
  assert.deepEqual(validateShelfDependencyGraph([block, blueprint]), []);
  const errors = validateShelfDependencyGraph([block, moduleA, moduleB]);
  assert.ok(errors.some((item) => /circular dependency/.test(item)));
  assert.ok(errors.some((item) => /more primitive/.test(item)));
});

test('reuse prefers admitted compatibility and distinguishes exact REUSE from partial EXTEND', () => {
  const receipt = passingReceipt();
  const admitted = admitShelfCandidate(manifest(receipt), { qualityReceiptAdapters: [trusted(receipt)] }).admittedAsset;
  assert.ok(admitted);
  const exact = decideShelfReuse({ capabilities: ['forms'], targetPlatforms: ['browser'] }, [loaded(admitted, admitted)]);
  assert.equal(exact.disposition, 'REUSE');
  const extension = decideShelfReuse({ capabilities: ['forms', 'payments'], targetPlatforms: ['browser'] }, [loaded(admitted, admitted)]);
  assert.equal(extension.disposition, 'EXTEND');
  assert.deepEqual(extension.evaluated[0]?.missingCapabilities, ['payments']);
});

test('deprecated and revoked assets are excluded from normal reuse', () => {
  for (const lifecycle of ['deprecated', 'revoked'] as const) {
    const retired = manifest(null, { lifecycle, deprecation: { replacementAssetId: null, reason: `${lifecycle} by policy`, effectiveAt: '2026-08-29T00:00:00Z' } });
    const decision = decideShelfReuse({ capabilities: ['forms'], targetPlatforms: ['browser'] }, [loaded(retired)]);
    assert.equal(decision.disposition, 'CREATE');
    assert.match(decision.noMatchEvidence.join(' '), new RegExp(lifecycle));
  }
});

test('non-admitted use requires explicit policy and remains visible as EXTEND', () => {
  const candidate = manifest();
  const denied = decideShelfReuse({ capabilities: ['forms'], targetPlatforms: ['browser'] }, [loaded(candidate)]);
  assert.equal(denied.disposition, 'CREATE');
  const permitted = decideShelfReuse({ capabilities: ['forms'], targetPlatforms: ['browser'], allowNonAdmittedAssetIds: [candidate.assetId] }, [loaded(candidate)]);
  assert.equal(permitted.disposition, 'EXTEND');
  assert.deepEqual(permitted.nonAdmittedUse, { permitted: true, assetIds: [candidate.assetId] });
});

test('CREATE always records deterministic no-match evidence', () => {
  const decision = decideShelfReuse({ capabilities: ['payments'], targetPlatforms: ['browser'] }, []);
  assert.equal(decision.disposition, 'CREATE');
  assert.deepEqual(decision.noMatchEvidence, ['Shelf catalog contains no assets.']);
});

test('trust manifest derives from admitted evidence, exposes no source or certification marketing, and blocks secrets', () => {
  const receipt = passingReceipt();
  const admitted = admitShelfCandidate(manifest(receipt), { qualityReceiptAdapters: [trusted(receipt)] }).admittedAsset;
  assert.ok(admitted);
  const trust = deriveFactoryTrustManifest(admitted, receipt);
  assert.equal(trust.quality.receiptReferences[0], receipt.receiptId);
  assert.deepEqual(trust.claims, { independentCertification: false, aiApproved: false, sourceCodeIncluded: false });
  assert.equal('sourceCode' in trust, false);
  assert.doesNotMatch(JSON.stringify(trust), /sk-[A-Za-z0-9]/);
  assert.throws(() => deriveFactoryTrustManifest(manifest(receipt) as never, receipt), /admitted through the trusted Shelf boundary/);

  const secret = manifest(receipt, { knownLimitations: ['password=super-secret-value'] });
  const result = admitShelfCandidate(secret, { qualityReceiptAdapters: [trusted(receipt)] });
  assert.equal(result.state, 'rejected');
  assert.match(result.findings.join(' '), /credential-shaped/);
});

test('canonical candidate manifests are valid and all evidence paths exist', async () => {
  for (const relative of ['blocks/forms-001/manifest.json', 'blocks/records-002/manifest.json']) {
    const candidate = JSON.parse(await readFile(path.join(repoRoot, relative), 'utf8')) as ShelfAssetManifest;
    assert.deepEqual(validateShelfManifest(candidate), []);
    assert.deepEqual(await shelfManifestPathsExist(repoRoot, candidate), []);
  }
});
