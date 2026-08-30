import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const json = async (relative) => JSON.parse(await readFile(new URL(relative, root), 'utf8'));

test('Shelf schema carries the canonical identity, provenance, evidence, risk and lifecycle fields', async () => {
  const schema = await json('factory/shelf/shelf-asset.schema.json');
  for (const field of ['assetId', 'type', 'lifecycle', 'version', 'owner', 'purpose', 'repository', 'dependencies',
    'supportedPlatforms', 'interfaces', 'compatibility', 'provenance', 'exactSource', 'qualityGate', 'security',
    'knownLimitations', 'maintenance', 'deprecation']) assert.ok(schema.required.includes(field), field);
  assert.deepEqual(schema.properties.lifecycle.enum, ['candidate', 'admitted', 'deprecated', 'revoked']);
  assert.deepEqual(schema.properties.type.enum, ['block', 'module', 'blueprint']);
  assert.equal(schema.allOf[0].then.properties.qualityGate.properties.admissionEvidenceState.const, 'verified');
  assert.ok(schema.required.includes('blueprint'));
  assert.ok(schema.$defs.blueprint.required.includes('appProfileDefaults'));
  assert.ok(schema.$defs.blueprint.required.includes('requiredRoles'));
  assert.ok(schema.$defs.blueprint.required.includes('skillPacks'));
});

test('canonical catalog contains only honest candidates and does not imply admission', async () => {
  const catalog = await json('factory/shelf/catalog.json');
  assert.deepEqual(catalog.manifests, ['blocks/forms-001/manifest.json', 'blocks/records-002/manifest.json']);
  for (const manifestPath of catalog.manifests) {
    const manifest = await json(manifestPath);
    assert.equal(manifest.lifecycle, 'candidate');
    assert.equal(manifest.qualityGate.receipt, null);
    assert.equal(manifest.qualityGate.admissionEvidenceState, 'missing');
    await access(new URL(manifest.repository.path, root));
  }
});

test('inventory covers required reusable capability areas and records confirmed gaps', async () => {
  const inventory = await json('factory/shelf/inventory.json');
  const categories = new Set(inventory.findings.map((item) => item.category));
  for (const category of ['identity-auth-permissions', 'forms-records', 'scheduling-coordination', 'coordination-realtime',
    'ai-provider-integration', 'data-backend', 'ui-design-patterns', 'quality-runtime', 'deployment-operations']) {
    assert.ok(categories.has(category), category);
  }
  for (const classification of inventory.findings.map((item) => item.classification)) {
    assert.ok(['reusable-now', 'reusable-after-extraction', 'application-specific', 'legacy', 'duplicate', 'deprecated'].includes(classification), classification);
  }
  for (const finding of inventory.findings) for (const path of finding.paths) await access(new URL(path, root));
  assert.ok(inventory.confirmed_gaps.some((item) => /Stripe/.test(item)));
  assert.ok(inventory.confirmed_gaps.some((item) => /notification/.test(item)));
});

test('admission policy requires trusted Phase 5 evidence and forbids existence-based certification', async () => {
  const policy = await json('factory/shelf/admission-policy.json');
  assert.equal(policy.principles.existing_means_admitted, false);
  assert.equal(policy.principles.manifest_means_admitted, false);
  assert.equal(policy.principles.raw_caller_claims_may_admit, false);
  assert.equal(policy.principles.trusted_phase_5_receipt_required, true);
  assert.equal(policy.principles.quality_gate_grants_action_authority, false);
  assert.equal(policy.dependency_rules.circular_dependency, 'reject');
});

test('trust contract is factual, provider-neutral and excludes independent/AI certification claims', async () => {
  const schema = await json('factory/shelf/trust-manifest.schema.json');
  assert.equal(schema.properties.documentType.const, 'shia-factory-trust-manifest');
  assert.equal(schema.properties.claims.properties.independentCertification.const, false);
  assert.equal(schema.properties.claims.properties.aiApproved.const, false);
  assert.equal(schema.properties.claims.properties.sourceCodeIncluded.const, false);
  assert.ok(schema.properties.identity.properties.type.enum.includes('application'));
  assert.equal(JSON.stringify(schema).includes('OpenAI'), false);
  assert.equal(JSON.stringify(schema).includes('Anthropic'), false);
});

test('Phase 6 preserves exactly five permanent roles and creates no standalone skill', async () => {
  const registry = await json('factory/registry/core-v2.json');
  assert.deepEqual(registry.permanent_roles.map((role) => role.id), ['shia-core', 'boris', 'design-director', 'gary', 'quality-gate']);
  for (const pack of ['product', 'design', 'engineering', 'ai', 'quality', 'growth', 'operations']) {
    assert.deepEqual((await readdir(new URL(`skills/${pack}/`, root))).sort(), ['PACK.json', 'README.md']);
  }
  assert.deepEqual((await readdir(new URL('skills/factory-runtime-wiring/', root))).sort(), ['SKILL.md']);
  assert.deepEqual((await readdir(new URL('skills/factory-learning-loop/', root))).sort(), ['SKILL.md']);
});

test('Phase 7 Michel OS remains untouched and unstarted', async () => {
  const status = await readFile(new URL('docs/STATUS.md', root), 'utf8');
  const phase7 = status.split('## Phase 7')[1]?.split('## Phase 8')[0] ?? '';
  assert.doesNotMatch(phase7, /\[x\]/);
  assert.match(phase7, /Inspect and profile Michel OS/);
  const changedScope = await readFile(new URL('docs/factory/REUSABLE_SHELF_V1.md', root), 'utf8');
  assert.match(changedScope, /Michel OS was not inspected or modified/);
});
