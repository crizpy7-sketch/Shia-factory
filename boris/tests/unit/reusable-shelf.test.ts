import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { buildTaskContract, loadOrchestratorRegistries, type NormalizedAppProfile, type OrchestrationRequest } from '../../src/factory/orchestrator-core.js';
import {
  admitShelfCandidate, createGitTreeSourceVerifier, createTrustedQualityReceiptAdapter, decideShelfReuse,
  deriveFactoryTrustManifest, isAdmittedShelfAsset, loadShelfCatalog, qualityReceiptDigest,
  shelfManifestPathsExist, trustedShelfReceiptRecordDigest, validateShelfDependencyGraph,
  validateShelfManifest, validVersionRange, verifyAdmittedShelfAsset, versionSatisfiesRange,
  type AdmittedShelfAsset, type LoadedShelfAsset, type ShelfAdmissionDependencies,
  type ShelfAssetManifest, type ShelfDependency, type ShelfAssetType, type TrustedQualityReceiptRecord,
} from '../../src/factory/reusable-shelf.js';
import { evaluateQualityGate, type QualityEvidence, type QualityGateInput, type QualityGateReceipt } from '../../src/quality/quality-gate.js';
import { admitTrustedFixture } from '../helpers/quality-admission.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const registries = await loadOrchestratorRegistries(repoRoot);
const sourceRoot = await mkdtemp(path.join(tmpdir(), 'shia-shelf-source-'));

async function write(relative: string, content = relative): Promise<void> {
  const target = path.join(sourceRoot, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${content}\n`);
}

for (const relative of [
  'blocks/test-forms/index.html', 'blocks/a/index.ts', 'blocks/b/index.ts',
  'modules/m/index.ts', 'blueprints/web/index.ts', 'docs/asset.md', 'examples/asset.ts', 'tests/asset.test.ts',
]) await write(relative);
execFileSync('git', ['init', '-q'], { cwd: sourceRoot });
execFileSync('git', ['config', 'user.name', 'Shelf Test'], { cwd: sourceRoot });
execFileSync('git', ['config', 'user.email', 'shelf@example.invalid'], { cwd: sourceRoot });
execFileSync('git', ['add', '.'], { cwd: sourceRoot });
execFileSync('git', ['commit', '-qm', 'exact source fixture'], { cwd: sourceRoot });
const CANDIDATE = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
const TRUSTED_REPOSITORY_ID = 'repo';
const sourceVerifier = createGitTreeSourceVerifier(sourceRoot, TRUSTED_REPOSITORY_ID, () => '2026-08-30T00:00:00Z');
await write('blocks/working-tree-only/index.ts');
after(async () => rm(sourceRoot, { recursive: true, force: true }));

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

function request(assetId: string, version: string): OrchestrationRequest {
  return {
    taskId: `SHELF-ADMISSION-${assetId.replace(':', '-')}-${version}`,
    objective: `Admit ${assetId}.`, outcome: 'A tested reusable candidate exists.',
    repository: { commit: CANDIDATE, branch: 'fixture' }, requestedCapabilities: ['forms', 'engineering'],
    requestedActions: ['inspect', 'plan', 'build'], acceptanceCriteria: [{ id: 'AC-1', statement: 'Candidate behavior passes.', evidence: ['unit'] }],
    capabilityCreationRequested: true, targetPlatforms: ['browser'], now: '2026-08-30T00:00:00Z',
  };
}

function evidence(kind: QualityEvidence['kind']): QualityEvidence {
  return {
    id: `evidence-${kind}`, kind, candidateSha: CANDIDATE, status: 'pass', source: 'phase-6-test-fixture',
    summary: `${kind} passed.`, criterionIds: kind === 'unit' ? ['AC-1'] : [], observedAt: '2026-08-30T00:00:00Z',
    method: 'automated-tool', testedSurfaces: ['fixture'],
  };
}

function passingReceipt(assetId = 'block:test-forms', version = '1.0.0'): QualityGateReceipt {
  const contract = buildTaskContract(profile(), registries, request(assetId, version), []);
  const input: QualityGateInput = {
    taskId: contract.id, projectId: contract.projectId, repository: 'repo', candidateSha: CANDIDATE, branch: contract.repository.branch,
    riskTier: contract.risk.tier, taskContract: contract, acceptanceCriteria: contract.acceptanceCriteria, requiredEvidence: contract.requiredEvidence,
    actualEvidence: ['typecheck', 'lint', 'unit', 'integration', 'security'].map((kind) => evidence(kind as QualityEvidence['kind'])),
    changedPaths: ['src/asset.ts'], changeSignals: { userFacing: false, securitySurfaces: [], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: [] },
    dangerousActions: [], reviewer: null, repair: { attempt: 0, maxAttempts: 2 }, evaluatedAt: '2026-08-30T00:00:00Z',
  };
  const receipt = evaluateQualityGate(admitTrustedFixture(input));
  assert.equal(receipt.finalState, 'pass');
  return receipt;
}

function blueprintContract(): ShelfAssetManifest['blueprint'] {
  return { appProfileDefaults: {}, requiredRoles: ['shia-core', 'boris'], skillPacks: ['product', 'engineering'],
    qualityPolicy: 'factory/quality/risk-gate-policy.json', supportedStack: ['Next.js'], integrations: [],
    deploymentExpectations: ['approval-gated'], extensionPoints: ['brand'] };
}

function manifest(receipt: QualityGateReceipt | null = null, overrides: Partial<ShelfAssetManifest> = {}): ShelfAssetManifest {
  const base: ShelfAssetManifest = {
    schemaVersion: '1.0.0', assetId: 'block:test-forms', type: 'block', lifecycle: 'candidate', version: '1.0.0', owner: 'boris',
    purpose: 'Test forms capability.', repository: { id: 'repo', path: 'blocks/test-forms' },
    capabilities: ['forms', 'engineering'], capabilityAliases: { forms: ['form-builder'], engineering: [] },
    dependencies: [], supportedPlatforms: ['browser'], interfaces: [{ id: 'submit', direction: 'output', schema: 'Record', description: 'Emits a record.' }],
    blueprint: null, compatibility: { factoryCore: '>=2.0.0', runtimes: ['browser'], notes: [] },
    provenance: { sourceType: 'repository', sourcePath: 'blocks/test-forms/index.html', evidence: ['tests/asset.test.ts'] },
    exactSource: { repository: 'repo', candidateSha: CANDIDATE, version: '1.0.0' },
    qualityGate: { receipt: receipt ? { sourceType: 'factory-quality-gate', taskId: receipt.taskId, receiptId: receipt.receiptId, candidateSha: CANDIDATE } : null,
      admissionEvidenceState: 'missing' },
    security: { riskTier: 'T1', dataSensitivity: 'public', reviewState: 'quality-gate-reviewed' },
    documentation: ['docs/asset.md'], examples: ['examples/asset.ts'], tests: ['tests/asset.test.ts'], knownLimitations: ['Fixture only.'],
    maintenance: { status: 'active', maintainer: 'boris', lastReviewedAt: '2026-08-30T00:00:00Z' },
    deprecation: { replacementAssetId: null, reason: null, effectiveAt: null },
  };
  return { ...base, ...overrides };
}

function typedManifest(assetId: string, type: ShelfAssetType, version: string, receipt: QualityGateReceipt,
  sourcePath: string, dependencies: ShelfDependency[] = []): ShelfAssetManifest {
  return manifest(receipt, { assetId, type, version, repository: { id: 'repo', path: path.posix.dirname(sourcePath) },
    capabilities: [assetId.split(':')[1] ?? 'asset'], capabilityAliases: {}, dependencies, blueprint: type === 'blueprint' ? blueprintContract() : null,
    provenance: { sourceType: 'repository', sourcePath, evidence: ['tests/asset.test.ts'] }, exactSource: { repository: 'repo', candidateSha: CANDIDATE, version },
    qualityGate: { receipt: { sourceType: 'factory-quality-gate', taskId: receipt.taskId, receiptId: receipt.receiptId, candidateSha: CANDIDATE }, admissionEvidenceState: 'missing' } });
}

function trusted(receipt: QualityGateReceipt): ReturnType<typeof createTrustedQualityReceiptAdapter> {
  const base: Omit<TrustedQualityReceiptRecord, 'integrityDigest'> = {
    referenceId: receipt.receiptId, receipt, collector: 'phase-6-quality-receipt-store', observedAt: receipt.evaluatedAt,
  };
  const record: TrustedQualityReceiptRecord = { ...base, integrityDigest: trustedShelfReceiptRecordDigest(base) };
  return createTrustedQualityReceiptAdapter('phase-6-quality-receipt-adapter', (referenceId) => referenceId === record.referenceId ? record : null);
}

function context(receipts: QualityGateReceipt[], catalog: LoadedShelfAsset[] = []): ShelfAdmissionDependencies {
  return { qualityReceiptAdapters: receipts.map(trusted), sourceVerifier, catalog };
}

function loaded(candidate: ShelfAssetManifest, admitted?: AdmittedShelfAsset): LoadedShelfAsset {
  return { manifest: admitted ?? candidate, admitted: admitted ?? null, admission: null };
}

test('admission requires trusted Phase 5 evidence and exact-source Git-tree proof', () => {
  const receipt = passingReceipt();
  assert.equal(qualityReceiptDigest(receipt), receipt.receiptId);
  assert.equal(admitShelfCandidate(manifest(receipt), context([])).state, 'needs-evidence');
  const result = admitShelfCandidate(manifest(receipt), context([receipt]));
  assert.equal(result.state, 'admitted');
  assert.ok(result.sourceVerification?.objects.some((item) => item.path === 'blocks/test-forms'));
  assert.ok(result.admittedAsset && isAdmittedShelfAsset(result.admittedAsset));
});

test('exact-source verifier owns immutable repository identity instead of trusting manifest strings', () => {
  const receipt = passingReceipt();
  const valid = manifest(receipt);
  const verification = sourceVerifier.verify(valid);
  assert.ok(verification);
  assert.equal(sourceVerifier.trustedRepositoryId, TRUSTED_REPOSITORY_ID);
  assert.equal(Object.isFrozen(sourceVerifier), true);
  assert.equal(Object.isFrozen(verification), true);
  assert.equal(verification.repository, TRUSTED_REPOSITORY_ID);

  const wrongRepositoryId = manifest(receipt, { repository: { id: 'false-repository', path: 'blocks/test-forms' } });
  assert.equal(sourceVerifier.verify(wrongRepositoryId), null);
  assert.notEqual(admitShelfCandidate(wrongRepositoryId, context([receipt])).state, 'admitted');

  const coordinatedSpoof = manifest(receipt, {
    repository: { id: 'false-repository', path: 'blocks/test-forms' },
    exactSource: { repository: 'false-repository', candidateSha: CANDIDATE, version: '1.0.0' },
  });
  assert.deepEqual(validateShelfManifest(coordinatedSpoof), []);
  assert.equal(sourceVerifier.verify(coordinatedSpoof), null);
  const spoofResult = admitShelfCandidate(coordinatedSpoof, context([receipt]));
  assert.notEqual(spoofResult.state, 'admitted');
  assert.match(spoofResult.findings.join(' '), /trusted repository context/);
});

test('stored admitted verification rechecks source and dependency context before returning an admitted object', () => {
  const receiptA = passingReceipt('block:a'); const receiptB = passingReceipt('block:b'); const receiptM = passingReceipt('module:m');
  const blockA = typedManifest('block:a', 'block', '1.0.0', receiptA, 'blocks/a/index.ts');
  const blockB = typedManifest('block:b', 'block', '1.0.0', receiptB, 'blocks/b/index.ts');
  const storedModule = typedManifest('module:m', 'module', '1.0.0', receiptM, 'modules/m/index.ts', [
    { assetId: 'block:a', type: 'block', versionRange: '^1.0.0' }, { assetId: 'block:b', type: 'block', versionRange: '^1.0.0' },
  ]);
  storedModule.lifecycle = 'admitted'; storedModule.qualityGate.admissionEvidenceState = 'verified';
  const result = verifyAdmittedShelfAsset(storedModule, context([receiptM], [loaded(blockA), loaded(blockB)]));
  assert.notEqual(result.state, 'admitted');
  assert.equal(result.admittedAsset, undefined);
  assert.match(result.findings.join(' '), /not admitted through the trusted Shelf boundary/);
});

test('exact-source admission rejects nonexistent, outside-repository and working-tree-only paths', () => {
  const receipt = passingReceipt();
  for (const candidate of [
    manifest(receipt, { repository: { id: 'repo', path: 'blocks/does-not-exist' } }),
    manifest(receipt, { provenance: { sourceType: 'repository', sourcePath: '../outside', evidence: ['tests/asset.test.ts'] } }),
    manifest(receipt, { repository: { id: 'repo', path: 'blocks/working-tree-only' }, provenance: { sourceType: 'repository', sourcePath: 'blocks/working-tree-only/index.ts', evidence: ['tests/asset.test.ts'] } }),
  ]) assert.notEqual(admitShelfCandidate(candidate, context([receipt])).state, 'admitted');
});

test('every provenance, documentation, example and test path must exist at the exact source SHA', () => {
  const receipt = passingReceipt();
  const variants: Partial<ShelfAssetManifest>[] = [
    { provenance: { sourceType: 'repository', sourcePath: 'blocks/test-forms/index.html', evidence: ['tests/missing.test.ts'] } },
    { documentation: ['docs/missing.md'] }, { examples: ['examples/missing.ts'] }, { tests: ['tests/missing.test.ts'] },
  ];
  for (const override of variants) {
    const result = admitShelfCandidate(manifest(receipt, override), context([receipt]));
    assert.notEqual(result.state, 'admitted');
    assert.match(result.findings.join(' '), /Exact-source Git-tree verification failed/);
  }
});

test('catalog files remain candidates and current-checkout stat is not admission proof', async () => {
  const catalog = await loadShelfCatalog(repoRoot);
  assert.deepEqual(catalog.map((item) => [item.manifest.assetId, item.manifest.lifecycle, item.admitted]), [
    ['block:forms-001', 'candidate', null], ['block:records-002', 'candidate', null],
  ]);
  const candidate = manifest();
  assert.deepEqual(await shelfManifestPathsExist(sourceRoot, candidate), []);
  assert.equal(isAdmittedShelfAsset(candidate), false);
});

test('stored admitted asset without trusted repository context remains needs-evidence and cannot REUSE', async () => {
  const catalogRoot = await mkdtemp(path.join(tmpdir(), 'shia-shelf-no-repository-context-'));
  try {
    const receipt = passingReceipt();
    const stored = manifest(receipt);
    stored.lifecycle = 'admitted';
    stored.qualityGate.admissionEvidenceState = 'verified';
    await mkdir(path.join(catalogRoot, 'factory/shelf'), { recursive: true });
    await mkdir(path.join(catalogRoot, 'blocks/test-forms'), { recursive: true });
    await writeFile(path.join(catalogRoot, 'factory/shelf/catalog.json'), `${JSON.stringify({ manifests: ['blocks/test-forms/manifest.json'] })}\n`);
    await writeFile(path.join(catalogRoot, 'blocks/test-forms/manifest.json'), `${JSON.stringify(stored)}\n`);
    const catalog = await loadShelfCatalog(catalogRoot, { qualityReceiptAdapters: [trusted(receipt)] });
    assert.equal(catalog[0]?.admission?.state, 'needs-evidence');
    assert.equal(catalog[0]?.admitted, null);
    assert.match(catalog[0]?.admission?.findings.join(' ') ?? '', /trusted exact-source verifier/);
    assert.notEqual(decideShelfReuse({ capabilities: ['forms'], targetPlatforms: ['browser'] }, catalog).disposition, 'REUSE');
  } finally {
    await rm(catalogRoot, { recursive: true, force: true });
  }
});

test('dependency admission rejects candidate, missing, retired and incompatible dependencies', () => {
  const blockReceipt = passingReceipt('block:a'); const secondReceipt = passingReceipt('block:b');
  const block = typedManifest('block:a', 'block', '1.0.0', blockReceipt, 'blocks/a/index.ts');
  const second = typedManifest('block:b', 'block', '1.0.0', secondReceipt, 'blocks/b/index.ts');
  const moduleReceipt = passingReceipt('module:m');
  const dependency = (assetId: string, versionRange = '^1.0.0'): ShelfDependency => ({ assetId, type: 'block', versionRange });
  const scenarios: Array<{ module: ShelfAssetManifest; catalog: LoadedShelfAsset[]; pattern: RegExp }> = [
    { module: typedManifest('module:m', 'module', '1.0.0', moduleReceipt, 'modules/m/index.ts', [dependency('block:a'), dependency('block:b')]), catalog: [loaded(block), loaded(second)], pattern: /not admitted/ },
    { module: typedManifest('module:m', 'module', '1.0.0', moduleReceipt, 'modules/m/index.ts', [dependency('block:missing'), dependency('block:b')]), catalog: [loaded(second)], pattern: /missing/ },
    { module: typedManifest('module:m', 'module', '1.0.0', moduleReceipt, 'modules/m/index.ts', [dependency('block:a', '^2.0.0'), dependency('block:b')]), catalog: [loaded(block), loaded(second)], pattern: /does not satisfy/ },
  ];
  for (const scenario of scenarios) {
    const result = admitShelfCandidate(scenario.module, context([moduleReceipt], scenario.catalog));
    assert.notEqual(result.state, 'admitted');
    assert.match(result.findings.join(' '), scenario.pattern);
  }
  for (const lifecycle of ['deprecated', 'revoked'] as const) {
    const retired = { ...block, lifecycle, deprecation: { replacementAssetId: null, reason: 'retired', effectiveAt: '2026-08-30T00:00:00Z' } } as ShelfAssetManifest;
    const module = typedManifest('module:m', 'module', '1.0.0', moduleReceipt, 'modules/m/index.ts', [dependency('block:a'), dependency('block:b')]);
    const result = admitShelfCandidate(module, context([moduleReceipt], [loaded(retired), loaded(second)]));
    assert.notEqual(result.state, 'admitted');
    assert.match(result.findings.join(' '), new RegExp(lifecycle));
  }
});

test('Blueprint cannot hide a candidate Module and complete graph cycles are rejected', () => {
  const moduleReceipt = passingReceipt('module:m');
  const candidateModule = typedManifest('module:m', 'module', '1.0.0', moduleReceipt, 'modules/m/index.ts');
  const blueprintReceipt = passingReceipt('blueprint:web');
  const blueprint = typedManifest('blueprint:web', 'blueprint', '1.0.0', blueprintReceipt, 'blueprints/web/index.ts', [{ assetId: 'module:m', type: 'module', versionRange: '^1.0.0' }]);
  const result = admitShelfCandidate(blueprint, context([blueprintReceipt], [loaded(candidateModule)]));
  assert.notEqual(result.state, 'admitted');
  assert.match(result.findings.join(' '), /not admitted/);
  const moduleA = manifest(null, { assetId: 'module:a', type: 'module', repository: { id: 'repo', path: 'modules/a' }, capabilities: ['a'], capabilityAliases: {}, dependencies: [{ assetId: 'module:b', type: 'module', versionRange: '^1.0.0' }] });
  const moduleB = manifest(null, { assetId: 'module:b', type: 'module', repository: { id: 'repo', path: 'modules/b' }, capabilities: ['b'], capabilityAliases: {}, dependencies: [{ assetId: 'module:a', type: 'module', versionRange: '^1.0.0' }] });
  assert.match(validateShelfDependencyGraph([moduleA, moduleB]).join(' '), /circular dependency/);
});

test('a fully admitted Block to Module to Blueprint chain passes', () => {
  const receiptA = passingReceipt('block:a'); const receiptB = passingReceipt('block:b');
  const receiptM = passingReceipt('module:m'); const receiptBlueprint = passingReceipt('blueprint:web');
  const blockA = typedManifest('block:a', 'block', '1.0.0', receiptA, 'blocks/a/index.ts');
  const blockB = typedManifest('block:b', 'block', '1.0.0', receiptB, 'blocks/b/index.ts');
  const module = typedManifest('module:m', 'module', '1.0.0', receiptM, 'modules/m/index.ts', [
    { assetId: 'block:a', type: 'block', versionRange: '^1.0.0' }, { assetId: 'block:b', type: 'block', versionRange: '>=1.0.0 <2.0.0' },
  ]);
  const blueprint = typedManifest('blueprint:web', 'blueprint', '1.0.0', receiptBlueprint, 'blueprints/web/index.ts', [{ assetId: 'module:m', type: 'module', versionRange: '~1.0.0' }]);
  const catalog = [loaded(blockA), loaded(blockB), loaded(module), loaded(blueprint)];
  const admittedA = admitShelfCandidate(blockA, context([receiptA], catalog)).admittedAsset; assert.ok(admittedA); catalog[0] = loaded(admittedA, admittedA);
  const admittedB = admitShelfCandidate(blockB, context([receiptB], catalog)).admittedAsset; assert.ok(admittedB); catalog[1] = loaded(admittedB, admittedB);
  const admittedM = admitShelfCandidate(module, context([receiptM], catalog)).admittedAsset; assert.ok(admittedM); catalog[2] = loaded(admittedM, admittedM);
  assert.ok(admitShelfCandidate(blueprint, context([receiptBlueprint], catalog)).admittedAsset);
});

test('version ranges are validated and evaluated deterministically', () => {
  for (const range of ['1.2.3', '^1.2.3', '~1.2.3', '>=1.0.0 <2.0.0', '1.x', '1.2.x', '*']) assert.equal(validVersionRange(range), true, range);
  assert.equal(validVersionRange('latest'), false);
  assert.equal(versionSatisfiesRange('1.5.0', '^1.2.3'), true);
  assert.equal(versionSatisfiesRange('2.0.0', '^1.2.3'), false);
});

test('exact REUSE requires canonical capability or explicit alias; fuzzy overlap only EXTENDs', () => {
  const receipt = passingReceipt();
  const admitted = admitShelfCandidate(manifest(receipt), context([receipt])).admittedAsset;
  assert.ok(admitted);
  const catalog = [loaded(admitted, admitted)];
  assert.equal(decideShelfReuse({ capabilities: ['forms'], targetPlatforms: ['browser'] }, catalog).disposition, 'REUSE');
  assert.equal(decideShelfReuse({ capabilities: ['form-builder'], targetPlatforms: ['browser'] }, catalog).disposition, 'REUSE');
  const fuzzy = decideShelfReuse({ capabilities: ['secure-payment-forms'], targetPlatforms: ['browser'] }, catalog);
  assert.equal(fuzzy.disposition, 'EXTEND');
  assert.deepEqual(fuzzy.evaluated[0]?.matchedCapabilities, []);
  assert.deepEqual(fuzzy.evaluated[0]?.fuzzyMatchedCapabilities, ['secure-payment-forms']);
  assert.equal(decideShelfReuse({ capabilities: ['forms workflow'], targetPlatforms: ['browser'] }, catalog).disposition, 'EXTEND');
});

test('non-admitted reuse remains explicit EXTEND and CREATE records no-match evidence', () => {
  const candidate = manifest();
  assert.equal(decideShelfReuse({ capabilities: ['forms'], targetPlatforms: ['browser'] }, [loaded(candidate)]).disposition, 'CREATE');
  const permitted = decideShelfReuse({ capabilities: ['forms'], targetPlatforms: ['browser'], allowNonAdmittedAssetIds: [candidate.assetId] }, [loaded(candidate)]);
  assert.equal(permitted.disposition, 'EXTEND');
  assert.deepEqual(permitted.nonAdmittedUse.assetIds, [candidate.assetId]);
  assert.deepEqual(decideShelfReuse({ capabilities: ['payments'], targetPlatforms: ['browser'] }, []).noMatchEvidence, ['Shelf catalog contains no assets.']);
});

test('trust manifest still requires admitted evidence and includes exact-source proof digest', () => {
  const receipt = passingReceipt();
  const admitted = admitShelfCandidate(manifest(receipt), context([receipt])).admittedAsset;
  assert.ok(admitted);
  const trust = deriveFactoryTrustManifest(admitted, receipt);
  assert.equal(trust.provenance.repository, TRUSTED_REPOSITORY_ID);
  assert.match(trust.provenance.sourceVerificationDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(trust.claims, { independentCertification: false, aiApproved: false, sourceCodeIncluded: false });
  assert.throws(() => deriveFactoryTrustManifest(manifest(receipt) as never, receipt), /trusted Shelf boundary/);
});

test('canonical candidate manifests remain valid and current paths exist', async () => {
  for (const relative of ['blocks/forms-001/manifest.json', 'blocks/records-002/manifest.json']) {
    const candidate = JSON.parse(await readFile(path.join(repoRoot, relative), 'utf8')) as ShelfAssetManifest;
    assert.deepEqual(validateShelfManifest(candidate), []);
    assert.deepEqual(await shelfManifestPathsExist(repoRoot, candidate), []);
  }
});
