import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const core = await readJson('factory/registry/core-v2.json');
const invocation = await readJson('factory/registry/invocation-contracts.json');
const authority = await readJson('factory/registry/authority-matrix.json');
const skills = await readJson('skills/registry.json');
const roleIds = core.permanent_roles.map((role) => role.id);
const packIds = core.skill_packs.map((pack) => pack.id);

test('invocation and authority contracts reuse exactly the existing five-role registry', () => {
  assert.deepEqual(invocation.roles.map((role) => role.role_id), roleIds);
  assert.deepEqual(Object.keys(authority.roles), roleIds);
  assert.equal(new Set(invocation.roles.flatMap((role) => role.invoke_as.map((alias) => alias.toLowerCase()))).size,
    invocation.roles.reduce((total, role) => total + role.invoke_as.length, 0));
});

test('every normalized invocation is observable and honest about implementation status', () => {
  for (const contract of invocation.roles) {
    assert.ok(contract.accepts.length > 0);
    assert.ok(contract.requires.length > 0);
    assert.ok(contract.produces.length > 0);
    assert.ok(contract.implementation.status);
    assert.ok(contract.on_unavailable);
    const registered = core.permanent_roles.find((role) => role.id === contract.role_id);
    assert.equal(contract.implementation.status, registered.implementation_status);
  }
});

test('dangerous authority defaults are explicit and Quality Gate stays independent', () => {
  for (const role of roleIds) {
    const grants = authority.roles[role];
    assert.deepEqual(Object.keys(grants), authority.actions);
    assert.notEqual(grants['access-secrets-directly'], 'allow');
    assert.notEqual(grants['mutate-reviewed-candidate'], 'allow');
  }
  assert.equal(authority.roles['quality-gate'].build, 'deny');
  assert.equal(authority.roles['quality-gate'].merge, 'deny');
  assert.equal(authority.roles['quality-gate'].deploy, 'deny');
  assert.match(authority.roles.boris.merge, /^gated:/);
  assert.match(authority.roles.boris.deploy, /^gated:/);
});

test('seven canonical pack indexes match the existing pack registry and referenced local paths exist', async () => {
  assert.deepEqual(skills.packs.map((pack) => pack.id), packIds);
  for (const pack of skills.packs) {
    const index = await readJson(pack.index);
    assert.equal(index.id, pack.id);
    assert.ok(Array.isArray(index.members));
    assert.ok(Array.isArray(index.gaps));
    for (const member of index.members) await access(new URL(member.reference, root));
  }
});

test('pack indexing creates no new standalone executable skill', async () => {
  for (const pack of packIds) {
    const files = await readdir(new URL(`skills/${pack}/`, root));
    assert.deepEqual(files.sort(), ['PACK.json', 'README.md']);
  }
  await access(new URL('skills/factory-runtime-wiring/SKILL.md', root));
  await access(new URL('skills/factory-learning-loop/SKILL.md', root));
  await access(new URL('agents/GARY-001/host-application/skills/growth-operator/SKILL.md', root));
});

test('legacy BORIS and Gary invocation registries remain in place', async () => {
  const legacy = await readFile(new URL('agents/registry.js', root), 'utf8');
  assert.match(legacy, /const BORIS=/);
  assert.match(legacy, /const GARY=/);
  await access(new URL('agents/BORIS-001/identity/identity.json', root));
  await access(new URL('agents/GARY-001/identity/identity.json', root));
});
