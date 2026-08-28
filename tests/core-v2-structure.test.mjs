import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const requiredIndexes = [
  'factory/orchestrator/README.md', 'factory/registry/core-v2.json',
  'factory/policies/README.md', 'factory/quality/README.md', 'factory/memory/README.md',
  'agents/shia-core/README.md', 'agents/boris/README.md',
  'agents/design-director/README.md', 'agents/gary/README.md', 'agents/quality-gate/README.md',
  'skills/product/README.md', 'skills/design/README.md', 'skills/engineering/README.md',
  'skills/ai/README.md', 'skills/quality/README.md', 'skills/growth/README.md',
  'skills/operations/README.md', 'blocks/forms-001/index.html', 'modules/README.md',
  'blueprints/README.md', 'adapters/README.md', 'dashboard/README.md',
  'docs/CORE_V2_ARCHITECTURE.md',
];

test('canonical Core v2 structural homes exist without moving legacy paths', async () => {
  for (const path of requiredIndexes) await access(new URL(path, root));
  await access(new URL('agents/BORIS-001/identity/identity.json', root));
  await access(new URL('agents/GARY-001/identity/identity.json', root));
  await access(new URL('boris/src/factory/operating-system.ts', root));
  await access(new URL('skills/factory-runtime-wiring/SKILL.md', root));
  await access(new URL('skills/factory-learning-loop/SKILL.md', root));
});

test('canonical destinations do not duplicate identity packages or standalone skills', async () => {
  const indexes = await Promise.all(requiredIndexes.filter((path) => path.endsWith('README.md'))
    .map((path) => readFile(new URL(path, root), 'utf8')));
  assert.ok(indexes.some((text) => /not an executable skill/.test(text)));
  for (const role of ['shia-core', 'boris', 'design-director', 'gary', 'quality-gate']) {
    assert.deepEqual(await readdir(new URL(`agents/${role}/`, root)), ['README.md']);
  }
});

test('canonical architecture covers every required Core v2 contract', async () => {
  const architecture = await readFile(new URL('docs/CORE_V2_ARCHITECTURE.md', root), 'utf8');
  for (const section of [
    'Five permanent roles', 'Seven skill packs', 'Reuse hierarchy', 'Tool ownership',
    'risk routing', 'Quality Gate', 'Permission model', 'Migration and deprecation rules',
  ]) assert.match(architecture, new RegExp(section, 'i'), `missing architecture section: ${section}`);
  for (const role of ['Shia Core', 'BORIS', 'Design Director', 'Gary', 'Quality Gate']) {
    assert.match(architecture, new RegExp(role));
  }
  for (const layer of ['Blocks', 'Modules', 'Blueprints', 'Applications']) {
    assert.match(architecture, new RegExp(layer));
  }
});
