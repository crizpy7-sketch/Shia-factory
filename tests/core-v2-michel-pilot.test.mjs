import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pilot = new URL('docs/pilots/michel-os/', root);
const json = async (name) => JSON.parse(await readFile(new URL(name, pilot), 'utf8'));

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
  assert.equal(contract.reuse.shelfDecision.disposition, 'CREATE');
  assert.deepEqual(contract.reuse.shelfDecision.selectedAssetIds, []);
  assert.equal(contract.reuse.shelfDecision.nonAdmittedUse.permitted, false);
  assert.deepEqual(contract.approvalGates, ['Cristian', 'Cristian+quality-receipt']);
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
});

test('pilot remains a non-mutating proposal with explicit production gaps', async () => {
  const baseline = await readFile(new URL('BASELINE.md', pilot), 'utf8');
  const specification = await readFile(new URL('PILOT_SPEC.md', pilot), 'utf8');
  assert.match(baseline, /Production mutations performed: none/);
  assert.match(baseline, /Deployed Git SHA \| needs-evidence/);
  assert.match(specification, /No implementation is included/);
  assert.match(specification, /No SQL migration or production data mutation/);
  assert.match(specification, /Cristian approval/);
});

test('Phase 7 adds no role or standalone skill and marks no tracker item complete', async () => {
  const registry = JSON.parse(await readFile(new URL('factory/registry/core-v2.json', root), 'utf8'));
  assert.deepEqual(registry.permanent_roles.map((role) => role.id), ['shia-core', 'boris', 'design-director', 'gary', 'quality-gate']);
  for (const pack of ['product', 'design', 'engineering', 'ai', 'quality', 'growth', 'operations']) {
    assert.deepEqual((await readdir(new URL(`skills/${pack}/`, root))).sort(), ['PACK.json', 'README.md']);
  }
  const status = await readFile(new URL('docs/STATUS.md', root), 'utf8');
  const phase7 = status.split('## Phase 7')[1]?.split('## Phase 8')[0] ?? '';
  assert.doesNotMatch(phase7, /\[x\]/);
  assert.match(phase7, /30\/41 = 73\.17%/);
});
