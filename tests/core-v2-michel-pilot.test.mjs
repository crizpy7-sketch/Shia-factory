import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pilot = new URL('docs/pilots/michel-os/', root);
const json = async (name) => JSON.parse(await readFile(new URL(name, pilot), 'utf8'));
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);

test('Michel OS profile is evidence-bound, private and T3', async () => {
  const profile = await readFile(new URL('APP_PROFILE.yaml', pilot), 'utf8');
  assert.match(profile, /id: michel-os/);
  assert.match(profile, /baseline_tier: T3/);
  assert.match(profile, /sensitivity: private/);
  assert.match(profile, /required_roles: \[shia-core, boris, quality-gate\]/);
  assert.match(profile, /human_before_deploy: true/);
  assert.match(profile, /reuse_search_required: true/);
});

test('persisted Shia Core contract records minimum routing and honest Shelf CREATE', async () => {
  const contract = await json('orchestration-contract.json');
  assert.equal(contract.repository.commit, '50403bcd52425d3f49788905ebd81962647e2d39');
  assert.equal(contract.risk.tier, 'T3');
  assert.deepEqual(contract.selectedRoles.map((role) => role.id), ['shia-core', 'boris', 'quality-gate']);
  assert.deepEqual(contract.selectedSkillPacks.map((pack) => pack.id), ['operations', 'engineering', 'quality']);
  assert.deepEqual(contract.selectedTools.map((tool) => tool.id), ['github', 'vps']);
  assert.equal(contract.reuse.shelfDecision.disposition, 'CREATE');
  assert.deepEqual(contract.reuse.shelfDecision.selectedAssetIds, []);
  assert.equal(contract.reuse.shelfDecision.nonAdmittedUse.permitted, false);
  assert.deepEqual(contract.approvalGates, ['Cristian', 'Cristian+quality-receipt']);
  assert.equal(contract.executionBlocked, false);
  assert.equal(contract.deployment.state, 'precondition-blocked');
  assert.equal(contract.deployment.productionMutationPerformed, false);
  assert.deepEqual(contract.deployment.preconditions.map((item) => [item.id, item.state]), [
    ['deployed-production-revision', 'satisfied'],
    ['runtime-identity', 'satisfied'],
    ['health-baseline', 'satisfied'],
    ['rollback-revision', 'mismatch'],
    ['backup-recovery', 'mismatch'],
    ['exact-release-provenance', 'mismatch'],
    ['exact-candidate-quality-receipt', 'missing'],
    ['cristian-deploy-approval', 'missing'],
  ]);
  assert.deepEqual(contract.migration.actions.map((item) => [item.capability, item.applicationAction]), [
    ['identity-auth-household-permissions', 'PRESERVE'],
    ['postgresql-persistence', 'PRESERVE'],
    ['scheduling-coordination', 'PRESERVE'],
    ['notifications-search', 'PRESERVE'],
    ['ai-provider-proposal-gateway', 'PRESERVE'],
    ['business-workflows', 'PRESERVE'],
    ['release-provenance-readiness', 'IMPLEMENT'],
  ]);
});

test('Cristian-observed live baseline is integrity-bound and keeps provenance/recovery gaps explicit', async () => {
  const evidence = await json('live-production-baseline.json');
  const { integrityDigest, ...baseline } = evidence.baseline;
  assert.equal(createHash('sha256').update(stable(baseline)).digest('hex'), integrityDigest);
  assert.equal(evidence.collection.recordedSecrets, false);
  assert.equal(evidence.collection.productionMutationPerformed, false);
  assert.deepEqual(evidence.observations.repository, {
    path: '/opt/michel-os',
    head: '50403bcd52425d3f49788905ebd81962647e2d39',
    workingTreeClean: true,
    deploymentStamp: '50403bcd52425d3f49788905ebd81962647e2d39',
    githubMain: '50403bcd52425d3f49788905ebd81962647e2d39',
  });
  assert.deepEqual([evidence.observations.runtime.applicationContainer.state, evidence.observations.runtime.applicationContainer.health], ['running', 'healthy']);
  assert.deepEqual([evidence.observations.runtime.databaseContainer.image, evidence.observations.runtime.databaseContainer.health], ['postgres:16-alpine', 'healthy']);
  assert.equal(evidence.observations.runtime.persistentPostgreSQLVolumePresent, true);
  assert.equal(evidence.observations.network.applicationListen, '127.0.0.1:3100');
  assert.equal(evidence.observations.network.hostname, 'michel-2-24-81-191.sslip.io');
  assert.deepEqual(evidence.observations.health.response, { ready: true });
  assert.deepEqual([evidence.observations.deploymentAutomation.enabled, evidence.observations.deploymentAutomation.active], [true, true]);
  assert.equal(evidence.baseline.backupRecovery.integrityDigest, 'd354b4efe2e9732708971c35b15688dbfd501f25f6cf46eae50f608c0eedcb29');
  assert.equal(evidence.baseline.backupRecovery.restoreTested, false);
  assert.equal(evidence.observations.imageProvenance.independentlyBindsRunningImageToGitSha, false);
  assert.equal(evidence.baseline.releaseProvenance.imageRevision, null);
});

test('Shelf analysis admits nothing and keeps Forms and Records as candidates', async () => {
  const analysis = await json('shelf-analysis.json');
  assert.deepEqual(analysis.admittedAssetsFound, []);
  assert.deepEqual(analysis.catalogCandidates.map((asset) => [asset.assetId, asset.lifecycle]), [
    ['block:forms-001', 'candidate'],
    ['block:records-002', 'candidate'],
  ]);
  assert.equal(analysis.normalReuseOutcome, 'CREATE');
  assert.equal(analysis.nonAdmittedUsePermitted, false);
  assert.equal(analysis.correctedRouting.supabaseSelected, false);
  assert.deepEqual(analysis.correctedRouting.selfHostedPostgreSQL, ['github', 'vps']);
  const release = analysis.capabilityDecisions.find((item) => item.capability === 'release-provenance-readiness');
  assert.equal(release.applicationAction, 'IMPLEMENT');
  assert.ok(analysis.capabilityDecisions.filter((item) => item.capability !== 'release-provenance-readiness')
    .every((item) => item.applicationAction === 'PRESERVE'));
  assert.equal(analysis.capabilityDecisions.some((item) => item.applicationAction === 'REBUILD'), false);
});

test('pilot remains a non-mutating proposal with explicit production gaps', async () => {
  const baseline = await readFile(new URL('BASELINE.md', pilot), 'utf8');
  const specification = await readFile(new URL('PILOT_SPEC.md', pilot), 'utf8');
  assert.match(baseline, /Production mutations performed: none/);
  assert.match(baseline, /marker-reconciled, image-unverified/);
  assert.match(baseline, /Backup-file integrity is not restore proof/);
  assert.match(specification, /No implementation is included/);
  assert.match(specification, /No SQL migration or production data mutation/);
  assert.match(specification, /Cristian approval/);
});

test('Phase 7 adds no role or standalone skill and marks only inspection/profile complete', async () => {
  const registry = JSON.parse(await readFile(new URL('factory/registry/core-v2.json', root), 'utf8'));
  assert.deepEqual(registry.permanent_roles.map((role) => role.id), ['shia-core', 'boris', 'design-director', 'gary', 'quality-gate']);
  for (const pack of ['product', 'design', 'engineering', 'ai', 'quality', 'growth', 'operations']) {
    assert.deepEqual((await readdir(new URL(`skills/${pack}/`, root))).sort(), ['PACK.json', 'README.md']);
  }
  const status = await readFile(new URL('docs/STATUS.md', root), 'utf8');
  const phase7 = status.split('## Phase 7')[1]?.split('## Phase 8')[0] ?? '';
  const tracker = phase7.split('\n').filter((line) => /^- \[[ x]\]/.test(line));
  assert.equal(tracker.length, 4);
  assert.equal(tracker.filter((line) => /^- \[x\]/.test(line)).length, 1);
  assert.match(tracker[0], /^- \[x\] Inspect and profile Michel OS/);
  assert.ok(tracker.slice(1).every((line) => /^- \[ \]/.test(line)));
  assert.match(phase7, /31\/41 = 75\.61%/);
  const phase8 = status.split('## Phase 8')[1] ?? '';
  assert.doesNotMatch(phase8, /\[x\]/);
});
