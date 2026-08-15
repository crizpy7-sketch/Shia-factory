/* Headquarters data layer: what the building is allowed to say, and what it must refuse to say. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const registry = require('../registry.js');
const hq = require('../hq.js');

test('the headquarters has four real rooms', () => {
  assert.deepEqual(hq.ROOMS.map((r) => r.id), ['office', 'workshop', 'lab', 'records']);
  assert.ok(hq.ROOMS.every((r) => r.name && r.tagline && r.icon));
});

test('the roster carries both agents with their authority intact', () => {
  const roster = hq.roster(registry);
  assert.deepEqual(roster.map((a) => a.id).sort(), ['BORIS-001', 'GARY-001']);
  for (const agent of roster) {
    assert.equal(agent.authority.may_deploy, false);
    assert.equal(agent.authority.may_access_secrets, false);
    assert.equal(agent.authority.final_authority, 'Cristian');
    assert.ok(agent.avatar, 'every seat needs something to display');
  }
});

test('a provisional agent is labelled as one everywhere the office looks', () => {
  const gary = hq.roster(registry).find((a) => a.id === 'GARY-001');
  assert.equal(gary.provisional, true);
  assert.equal(gary.packagePath, null);
  assert.equal(gary.certified, false);
  assert.match(gary.provisionalNote, /not yet transferred|not been invented/i);
  assert.match(gary.status, /AWAITING/i);

  const boris = hq.roster(registry).find((a) => a.id === 'BORIS-001');
  assert.equal(boris.provisional, false);
  assert.match(boris.packagePath, /agents\/BORIS-001/);
});

test('an unreachable runtime is reported as offline, with the command to start it', () => {
  const runtime = hq.describeRuntime(null, { endpoint: 'http://127.0.0.1:8787' });
  assert.equal(runtime.online, false);
  assert.match(runtime.headline, /offline/i);
  assert.match(runtime.detail, /127\.0\.0\.1:8787/);
  assert.match(runtime.startCommand, /cli\.js run/);
  assert.deepEqual(runtime.fields, [], 'an offline runtime reports no figures at all');
});

test('a live runtime is described from what it actually returned', () => {
  const runtime = hq.describeRuntime({
    displayName: 'Boris', agentId: 'BORIS-001', provider: 'anthropic', model: 'claude-sonnet-5',
    providerAvailable: true, isTestDouble: false, heartbeat: 'fixing', uptimeSeconds: 91,
    queueDepth: 2, currentTaskId: 'task_x', currentTool: 'fs_edit', recertification: 'PENDING',
  }, {});
  assert.equal(runtime.online, true);
  assert.equal(runtime.sprite, 'fixing');
  assert.equal(runtime.startCommand, null);
  const fields = Object.fromEntries(runtime.fields.map((f) => [f.label, f.value]));
  assert.equal(fields['Queue'], '2');
  assert.equal(fields['Current tool'], 'fs_edit');
  assert.equal(fields['Recertification'], 'PENDING');
});

test('a test-double runtime says so rather than passing as live', () => {
  const runtime = hq.describeRuntime({ isTestDouble: true, heartbeat: 'idle', provider: 'scripted' }, {});
  assert.match(runtime.headline, /test double/i);
  assert.match(runtime.detail, /Nothing here is a live-model result/i);
});

test('missing fields become "unknown" or "none", never a plausible number', () => {
  const runtime = hq.describeRuntime({ heartbeat: 'idle' }, {});
  const fields = Object.fromEntries(runtime.fields.map((f) => [f.label, f.value]));
  assert.equal(fields['Uptime'], 'unknown');
  assert.equal(fields['Queue'], 'unknown');
  assert.equal(fields['Current task'], 'none');
});

test('the certification gate is read from the document, including its unticked boxes', () => {
  const state = hq.certificationState([
    '# Claude Code Migration Recertification', '', 'Status: PENDING', '',
    '- [ ] Cognitive fidelity', '- [ ] Orchestration', '- [ ] Cristian approval',
  ].join('\n'));
  assert.equal(state.available, true);
  assert.equal(state.status, 'PENDING');
  assert.equal(state.total, 3);
  assert.equal(state.ticked, 0);
  assert.match(state.note, /not certification/i);
});

test('a ticked gate is shown with the caveat that ticks need evidence', () => {
  const state = hq.certificationState('Status: PENDING\n\n- [x] Cognitive fidelity\n- [ ] Orchestration');
  assert.equal(state.ticked, 1);
  assert.match(state.note, /executed evidence/i);
});

test('an unreadable certification document is unknown, not assumed', () => {
  const state = hq.certificationState('');
  assert.equal(state.available, false);
  assert.equal(state.status, 'unknown');
  assert.match(state.note, /could not be read/i);
});

test('the board counts only tasks the runtime returned', () => {
  const summary = hq.queueSummary([
    { status: 'queued' }, { status: 'working' }, { status: 'verifying' },
    { status: 'awaiting_approval' }, { status: 'completed' }, { status: 'nonsense' },
  ]);
  assert.equal(summary.total, 6);
  assert.equal(summary.active, 2);
  assert.equal(summary.needsYou, 1);
  assert.equal(summary.buckets.completed, 1);
  assert.deepEqual(hq.queueSummary(null).buckets.queued, 0);
});

test('the outstanding list names the real gaps, including its own', () => {
  const offline = hq.outstandingWork(registry, hq.describeRuntime(null, {}));
  const subjects = offline.map((item) => item.subject);
  assert.ok(subjects.includes('Gary'), 'a missing identity package is outstanding work');
  assert.ok(subjects.includes('Boris'), 'an uncertified runtime is outstanding work');
  assert.ok(subjects.includes('Runtime'), 'an offline runtime is outstanding work');

  const gary = offline.find((item) => item.subject === 'Gary');
  assert.match(gary.what, /identity package/i);
  assert.match(gary.blocking, /cannot be given work/i);
});

test('a healthy live runtime drops off the outstanding list', () => {
  const live = hq.describeRuntime({ heartbeat: 'idle', isTestDouble: false, provider: 'anthropic' }, {});
  const items = hq.outstandingWork(registry, live);
  assert.equal(items.some((item) => item.subject === 'Runtime'), false);
});

test('a test-double runtime stays on the outstanding list', () => {
  const double = hq.describeRuntime({ heartbeat: 'idle', isTestDouble: true, provider: 'scripted' }, {});
  const items = hq.outstandingWork(registry, double);
  assert.ok(items.some((item) => item.subject === 'Runtime' && /test double/i.test(item.what)));
});
