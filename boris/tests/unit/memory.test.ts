import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { SqliteStorage } from '../../src/storage/sqlite.js';
import { MemoryStore, tokenize } from '../../src/memory/store.js';
import { SkillRegistry } from '../../src/skills/registry.js';
import { loadIdentity, buildSystemPrompt } from '../../src/identity/loader.js';
import { REPO_ROOT } from '../helpers.js';

const IDENTITY_DIR = resolve(REPO_ROOT, 'agents', 'BORIS-001');

function fresh(): { storage: SqliteStorage; memory: MemoryStore } {
  const storage = new SqliteStorage(':memory:');
  storage.migrate();
  return { storage, memory: new MemoryStore(storage) };
}

test('tokenizer drops stopwords and short tokens', () => {
  assert.deepEqual(tokenize('The median of the values is wrong'), ['median', 'values', 'wrong']);
});

test('retrieval prefers records that match the objective', () => {
  const { storage, memory } = fresh();
  memory.remember({ category: 'procedural', title: 'Repairing failing median calculations', content: 'median even length averaging', source: 's', provenance: 'p', confidence: 0.8 });
  memory.remember({ category: 'procedural', title: 'Kubernetes ingress debugging', content: 'ingress nginx tls', source: 's', provenance: 'p', confidence: 0.9 });
  const hits = memory.retrieve({ objective: 'fix the median calculation for even length input', limit: 5 });
  assert.ok(hits.length >= 1);
  assert.match(hits[0]?.record.title ?? '', /median/i);
  storage.close();
});

test('irrelevant memory is not retrieved at all', () => {
  const { storage, memory } = fresh();
  memory.remember({ category: 'research', title: 'Postgres vacuum tuning', content: 'autovacuum thresholds', source: 's', provenance: 'p' });
  const hits = memory.retrieve({ objective: 'repair the median function', limit: 5 });
  assert.equal(hits.filter((h) => h.record.title.includes('Postgres')).length, 0);
  storage.close();
});

test('identity memory is always eligible even without lexical overlap', () => {
  const { storage, memory } = fresh();
  memory.remember({ category: 'identity', title: 'BORIS authority', content: 'advisory; cannot deploy', source: 's', provenance: 'p', confidence: 1, verified: true });
  const hits = memory.retrieve({ objective: 'completely unrelated words here', limit: 5 });
  assert.equal(hits.length, 1);
  storage.close();
});

test('retrieval records usage so stale memory is visible', () => {
  const { storage, memory } = fresh();
  const record = memory.remember({ category: 'procedural', title: 'median repair', content: 'median', source: 's', provenance: 'p' });
  memory.retrieve({ objective: 'median repair', limit: 3 });
  const after = storage.getMemory(record.id);
  assert.equal(after?.useCount, 1);
  assert.ok(after?.lastUsedAt);
  storage.close();
});

test("importing BORIS's portable state is idempotent and preserves provenance", () => {
  const { storage, memory } = fresh();
  const first = memory.importPortableState(IDENTITY_DIR);
  const second = memory.importPortableState(IDENTITY_DIR);
  assert.ok(first.imported >= 3, 'identity, cognitive model and runtime contract should import');
  assert.equal(first.imported, second.imported, 'second import should update, not duplicate');
  const identityRecords = storage.queryMemory({ category: 'identity', limit: 50 });
  assert.ok(identityRecords.some((r) => r.title.includes('cognitive model')));
  assert.ok(identityRecords.every((r) => r.provenance.length > 0));
  storage.close();
});

test('empty ledgers are reported as skipped rather than invented', () => {
  const { storage, memory } = fresh();
  const result = memory.importPortableState(IDENTITY_DIR);
  assert.ok(result.skipped.some((s) => s.includes('failure_library.jsonl') && s.includes('empty')));
  assert.equal(storage.queryMemory({ category: 'failure', limit: 10 }).length, 0);
  storage.close();
});

test('skills are seeded once and selected by trigger overlap', () => {
  const storage = new SqliteStorage(':memory:');
  storage.migrate();
  const skills = new SkillRegistry(storage);
  assert.ok(skills.seed() >= 5);
  assert.equal(skills.seed(), 0, 'seeding twice must not duplicate');
  const selected = skills.select('the test suite is failing, repair the bug', 3);
  assert.ok(selected.some((s) => s.name === 'failing-test-repair'));
  assert.ok(selected.length <= 3, 'selection must be bounded, not the whole library');
  storage.close();
});

test('the system prompt is built from the shipped identity, not from a literal', () => {
  const identity = loadIdentity(IDENTITY_DIR);
  assert.equal(identity.agentId, 'BORIS-001');
  assert.equal(identity.authority.may_deploy, false);
  assert.equal(identity.authority.final_authority, 'Cristian');
  assert.match(identity.certificationStatus, /PENDING/);

  const prompt = buildSystemPrompt(identity, {
    workspace: '/tmp/ws', toolNames: ['fs_read'], memory: '', skills: '', objective: 'fix the bug',
  });
  assert.match(prompt, /BORIS-001/);
  assert.match(prompt, /difficult to break/);
  assert.match(prompt, /may deploy: false/);
  assert.match(prompt, /final authority: Cristian/);
  assert.match(prompt, /Read → Plan → Act → Observe → Verify/);
});
