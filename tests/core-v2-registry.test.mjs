import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const registry = JSON.parse(await readFile(new URL('../factory/registry/core-v2.json', import.meta.url), 'utf8'));

test('Core v2 has exactly the five approved permanent roles', () => {
  assert.deepEqual(registry.permanent_roles.map((role) => role.id), [
    'shia-core', 'boris', 'design-director', 'gary', 'quality-gate',
  ]);
});

test('Core v2 has exactly the seven approved skill packs', () => {
  assert.deepEqual(registry.skill_packs.map((pack) => pack.id), [
    'product', 'design', 'engineering', 'ai', 'quality', 'growth', 'operations',
  ]);
});

test('every owned tool maps to a permanent role', () => {
  const roles = new Set(registry.permanent_roles.map((role) => role.id));
  for (const [tool, owner] of Object.entries(registry.tool_ownership)) {
    assert.ok(roles.has(owner), `${tool} has unknown owner ${owner}`);
  }
});

test('implementation status never claims missing roles are operational', () => {
  for (const role of registry.permanent_roles) {
    if (role.current_evidence.length === 0) assert.equal(role.implementation_status, 'missing');
  }
});
