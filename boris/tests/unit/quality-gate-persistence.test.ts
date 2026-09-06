import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import type { OrchestratorTaskContract } from '../../src/factory/orchestrator-core.js';
import { admitQualityGateInput } from '../../src/quality/evidence-admission.js';
import { evaluateQualityGate, persistQualityGateReceipt, validateCanonicalQualityGateReceipt } from '../../src/quality/quality-gate.js';
import type { PersistenceWorkerEvent, PersistenceWorkerInput } from '../helpers/quality-persistence-worker.js';

function receipt(evaluatedAt = '2026-09-06T10:00:00Z') {
  const taskContract: OrchestratorTaskContract = {
    schemaVersion: '1.0.0', id: 'PERSISTENCE-TEST', projectId: 'test', objective: 'Test persistence.', outcome: 'No overwrites.',
    repository: { commit: 'a'.repeat(40), branch: 'test' }, profileDigest: 'd'.repeat(64),
    risk: { tier: 'T2', reasons: ['test-only'] }, reuse: { searched: true, findings: [], creationDisposition: 'reuse-search-recorded' },
    selectedRoles: [], selectedSkillPacks: [], selectedTools: [],
    acceptanceCriteria: [{ id: 'AC-1', statement: 'Test criterion.', evidence: ['test'] }], requiredEvidence: ['test'],
    allowedActions: [], approvalGates: [], executionBlocked: false, executionBlockers: [],
    certificationReleaseBlocked: false, certificationReleaseBlockers: [], blocked: false, blockers: [],
  };
  // Missing evidence is intentional: no fixture receipt represents certification or approval.
  const result = evaluateQualityGate(admitQualityGateInput({
    taskId: taskContract.id, projectId: taskContract.projectId, repository: 'test/repository',
    candidateSha: taskContract.repository.commit, branch: 'test', riskTier: 'T2', taskContract,
    acceptanceCriteria: taskContract.acceptanceCriteria, requiredEvidence: taskContract.requiredEvidence,
    actualEvidence: [], changedPaths: ['test-only'],
    changeSignals: { userFacing: false, securitySurfaces: [], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: [] },
    dangerousActions: [], reviewer: null, repair: { attempt: 0, maxAttempts: 2 }, evaluatedAt,
  }, { evidenceAdapters: [] }));
  assert.deepEqual(validateCanonicalQualityGateReceipt(result), []);
  return result;
}
const first = receipt();
const conflicting = receipt('2026-09-06T10:00:01Z');
const serialized = (value = first) => `${JSON.stringify(value, null, 2)}\n`;
const basename = `${first.taskId}-${first.candidateSha}-${first.evaluationScope}.json`;

async function fixture(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'quality-persistence-'));
  const children: ChildProcess[] = [];
  t.after(async () => {
    await Promise.all(children.map(async child => {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, 'exit'); child.kill(); await exit;
      }
    }));
    await rm(directory, { recursive: true, force: true });
  });
  const worker = (options: Omit<PersistenceWorkerInput, 'directory'>) => {
    const child = fork(new URL('../helpers/quality-persistence-worker.js', import.meta.url), [],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child);
    const events: PersistenceWorkerEvent[] = [];
    const listeners = new Set<() => void>();
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    child.on('message', (message: PersistenceWorkerEvent) => { events.push(message); for (const notify of listeners) notify(); });
    const wait = (type: string, count = 1): Promise<PersistenceWorkerEvent[]> => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { listeners.delete(check); reject(new Error(`Timed out waiting for ${type}: ${stderr}`)); }, 10_000);
      const check = () => {
        const matching = events.filter(event => event.type === type);
        if (matching.length >= count) { clearTimeout(timer); listeners.delete(check); resolve(matching); }
      };
      listeners.add(check); check();
    });
    child.send({ ...options, directory });
    return { child, wait, send: (type: string) => child.send({ type }) };
  };
  return { directory, target: path.join(directory, basename), worker };
}

test('persistence initially saves complete bytes and sequential identical retries succeed', async t => {
  const f = await fixture(t);
  assert.equal(await persistQualityGateReceipt(first, f.directory), f.target);
  assert.equal(await readFile(f.target, 'utf8'), serialized());
  assert.equal(await persistQualityGateReceipt(first, f.directory), f.target);
  assert.deepEqual(await readdir(f.directory), [basename]);
});

test('persistence rejects a sequential conflict without changing the saved bytes', async t => {
  const f = await fixture(t);
  await persistQualityGateReceipt(first, f.directory);
  await assert.rejects(persistQualityGateReceipt(conflicting, f.directory), /already exists with different content/);
  assert.equal(await readFile(f.target, 'utf8'), serialized());
  assert.deepEqual(await readdir(f.directory), [basename]);
});

for (const identical of [false, true]) {
  test(`two-process ${identical ? 'identical writers both succeed' : 'conflicting writers cannot replace the first saved receipt'}`, async t => {
    const f = await fixture(t);
    const a = f.worker({ receipts: [first], pauseReads: true, pausePublish: true });
    const b = f.worker({ receipts: [identical ? first : conflicting], pauseReads: true, pausePublish: true });
    assert.notEqual(a.child.pid, b.child.pid);
    await Promise.all([a.wait('absent'), b.wait('absent')]);
    a.send('read'); b.send('read');
    const [readyA, readyB] = await Promise.all([a.wait('publish-ready'), b.wait('publish-ready')]);
    assert.notEqual(readyA[0]?.temporary, readyB[0]?.temporary);
    a.send('publish'); const doneA = await a.wait('done');
    assert.equal(doneA[0]?.results?.[0]?.status, 'fulfilled');
    assert.equal(await readFile(f.target, 'utf8'), serialized());
    b.send('publish'); const doneB = await b.wait('done');
    assert.equal(doneB[0]?.results?.[0]?.status, identical ? 'fulfilled' : 'rejected');
    if (!identical) assert.match(doneB[0]?.results?.[0]?.error ?? '', /already exists with different content/);
    assert.equal(await readFile(f.target, 'utf8'), serialized());
    assert.deepEqual(await readdir(f.directory), [basename]);
  });
}

test('same-process identical concurrent calls use separate temporary files and both succeed', async t => {
  const f = await fixture(t);
  const w = f.worker({ receipts: [first, first], pauseReads: true });
  await w.wait('absent', 2); w.send('read');
  const done = await w.wait('done');
  assert.deepEqual(done[0]?.results?.map(result => result.status), ['fulfilled', 'fulfilled']);
  const ready = await w.wait('publish-ready', 2);
  assert.notEqual(ready[0]?.temporary, ready[1]?.temporary);
  assert.equal(await readFile(f.target, 'utf8'), serialized());
  assert.deepEqual(await readdir(f.directory), [basename]);
});

test('readers cannot see a final receipt while its temporary file is partial or unpublished', async t => {
  const f = await fixture(t);
  const w = f.worker({ receipts: [first], partialWrite: true, pausePublish: true });
  const partial = await w.wait('partial');
  const temporary = partial[0]?.temporary; assert.ok(temporary);
  assert.equal(await readFile(temporary, 'utf8'), serialized().slice(0, Math.floor(serialized().length / 2)));
  await assert.rejects(readFile(f.target), { code: 'ENOENT' });
  w.send('write'); await w.wait('publish-ready');
  assert.equal(await readFile(temporary, 'utf8'), serialized());
  await assert.rejects(readFile(f.target), { code: 'ENOENT' });
  w.send('publish'); const done = await w.wait('done');
  assert.equal(done[0]?.results?.[0]?.status, 'fulfilled');
  assert.equal(await readFile(f.target, 'utf8'), serialized());
  assert.deepEqual(await readdir(f.directory), [basename]);
});

test('a colliding legacy temporary filename is neither overwritten nor deleted', async t => {
  const f = await fixture(t);
  const w = f.worker({ receipts: [first], legacyTemporarySentinel: true });
  const done = await w.wait('done');
  assert.equal(done[0]?.results?.[0]?.status, 'fulfilled');
  const sentinel = `${basename}.${w.child.pid}.tmp`;
  assert.equal(await readFile(path.join(f.directory, sentinel), 'utf8'), 'other-writer-sentinel');
  assert.equal(await readFile(f.target, 'utf8'), serialized());
  assert.deepEqual((await readdir(f.directory)).sort(), [basename, sentinel].sort());
});

for (const failure of ['write', 'EACCES', 'ENOTSUP']) {
  test(`${failure} failure cleans owned temporary files without publishing a final receipt`, async t => {
    const f = await fixture(t);
    const w = f.worker({ receipts: [first], writeFailure: failure === 'write', publishFailure: failure === 'write' ? undefined : failure });
    const done = await w.wait('done');
    assert.equal(done[0]?.results?.[0]?.status, 'rejected');
    assert.match(done[0]?.results?.[0]?.error ?? '', /injected/);
    await assert.rejects(readFile(f.target), { code: 'ENOENT' });
    assert.deepEqual(await readdir(f.directory), []);
  });
}
