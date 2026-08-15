import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { SqliteStorage } from '../../src/storage/sqlite.js';
import { MemoryStore, tokenize } from '../../src/memory/store.js';
import { SkillRegistry } from '../../src/skills/registry.js';
import { loadIdentity, buildSystemPrompt } from '../../src/identity/loader.js';
import { DEFAULT_CHARTER, baseAgentId, loadRoster } from '../../src/identity/roster.js';
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
    charter: DEFAULT_CHARTER,
  });
  assert.match(prompt, /BORIS-001/);
  assert.match(prompt, /difficult to break/);
  assert.match(prompt, /may deploy: false/);
  assert.match(prompt, /final authority: Cristian/);
  assert.match(prompt, /Read → Plan → Act → Observe → Verify/);
  assert.equal(/Identity boundary/.test(prompt), false, 'Boris declares no simulation notice');
});

test('each agent is briefed from his own package, not from one shared description', () => {
  const roster = loadRoster(REPO_ROOT);
  assert.deepEqual(roster.map((p) => p.agentId), ['BORIS-001', 'GARY-001']);

  const gary = roster.find((p) => p.agentId === 'GARY-001');
  assert.ok(gary);
  const prompt = buildSystemPrompt(gary.identity, {
    workspace: '/tmp/ws', toolNames: gary.tools ?? [], memory: '', skills: '',
    objective: 'plan the launch', charter: gary.charter,
  });

  // His own boundaries, spelled his way — not Boris's five keys.
  assert.match(prompt, /GARY-001/);
  assert.match(prompt, /may publish without owner approval: false/);
  assert.match(prompt, /may spend money: false/);
  assert.match(prompt, /may generate campaigns: true/);
  assert.match(prompt, /final authority: Cristian/);

  // The notice his package insists on travels into the prompt itself.
  assert.match(prompt, /Identity boundary/);
  assert.match(prompt, /is not Gary Vaynerchuk/);

  // His operating rules and his own loop, not the engineering cycle.
  assert.match(prompt, /Operating rules \(from your package\)/);
  assert.match(prompt, /Separate evidence, inference, and opinion\./);
  assert.match(prompt, /Choose one primary objective and one KPI\./);
  assert.equal(/Read → Plan → Act → Observe → Verify/.test(prompt), false,
    'the engineering cycle is not his discipline');
  assert.equal(/Principal Agentic Software Engineer/.test(prompt), false);
});

test('an agent is offered only the tools his package gives him authority for', () => {
  const roster = loadRoster(REPO_ROOT);
  const boris = roster.find((p) => p.agentId === 'BORIS-001');
  const gary = roster.find((p) => p.agentId === 'GARY-001');
  assert.ok(boris && gary);

  assert.equal(boris.tools, undefined, 'Boris gets the full registry');
  for (const tool of ['fs_write', 'fs_edit', 'fs_delete', 'fs_move', 'shell_run', 'git', 'git_commit', 'dev']) {
    assert.equal(gary.tools?.includes(tool), false, `Gary must not be offered ${tool}`);
  }
  for (const tool of ['fs_read', 'fs_search', 'http_fetch', 'plan', 'report_result', 'request_approval']) {
    assert.ok(gary.tools?.includes(tool), `Gary needs ${tool} to do his work`);
  }
  assert.match(gary.toolsReason, /no authority to change a repository/i);
});

test('a subagent id resolves to the agent who spawned it', () => {
  assert.equal(baseAgentId('BORIS-001:reviewer'), 'BORIS-001');
  assert.equal(baseAgentId('GARY-001'), 'GARY-001');
  assert.equal(baseAgentId('UNKNOWN-999:role'), 'UNKNOWN-999');
});
