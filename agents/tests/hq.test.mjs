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
    assert.equal(agent.authority.final_authority, 'Cristian');
    assert.equal(agent.certified, false);
    assert.ok(agent.avatar, 'every seat needs something to display');
    assert.ok(agent.packagePath, 'both identity packages are imported');
  }
});

test("each agent's authority is shown as his own package spells it", () => {
  const [boris, gary] = ['BORIS-001', 'GARY-001'].map((id) => hq.roster(registry).find((a) => a.id === id));
  assert.equal(boris.authority.may_deploy, false);
  assert.equal(boris.authority.may_access_secrets, false);
  /* Gary declares neither of those keys and four the other one does not have. The office shows
     what each package says rather than forcing both into one shape. */
  assert.equal(gary.authority.may_access_secrets_directly, false);
  assert.equal(gary.authority.may_publish_without_owner_approval, false);
  assert.equal(gary.authority.may_generate_campaigns, true);
});

test('both agents are hosted, and neither is certified by being hosted', () => {
  const gary = hq.roster(registry).find((a) => a.id === 'GARY-001');
  assert.equal(gary.provisional, false, 'his package arrived');
  assert.equal(gary.packagePath, 'agents/GARY-001');
  assert.equal(gary.packageVersion, '0.4.0-multi-model-research-in-progress');
  assert.equal(gary.hosted, true, 'the boris/ runtime loads his package and can execute him');
  assert.match(gary.host, /Shia agent runtime/);
  assert.match(gary.hostNote, /Hosting is not certification/i);
  assert.equal(gary.certified, false);
  assert.equal(gary.status, 'AVAILABLE');

  const boris = hq.roster(registry).find((a) => a.id === 'BORIS-001');
  assert.equal(boris.hosted, true);
  assert.equal(boris.certified, false);
});

test("Gary's simulation notice reaches the office, and his placeholder art is flagged", () => {
  const gary = hq.roster(registry).find((a) => a.id === 'GARY-001');
  assert.match(gary.simulationNotice, /is not Gary Vaynerchuk/);
  assert.equal(gary.avatarArtSupplied, false);
  const boris = hq.roster(registry).find((a) => a.id === 'BORIS-001');
  assert.equal(boris.avatarArtSupplied, true, 'Boris shipped real art; nothing to flag');
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
  assert.ok(subjects.includes('Gary'), 'an agent with no runtime is outstanding work');
  assert.ok(subjects.includes('Boris'), 'an uncertified runtime is outstanding work');
  assert.ok(subjects.includes('Runtime'), 'an offline runtime is outstanding work');

  const boris = offline.find((item) => item.subject === 'Boris');
  assert.match(boris.what, /recertification/i);

  const gary = offline.filter((item) => item.subject === 'Gary');
  assert.ok(gary.some((i) => /recertification/i.test(i.what)),
    'an uncertified runtime is outstanding work for him too');
  /* Missing art is listed, and listed as cosmetic — an honest gap is not an inflated one. */
  const art = gary.find((i) => /avatar art/i.test(i.what));
  assert.ok(art, 'the placeholder avatar should be visible as a gap');
  assert.match(art.blocking, /Cosmetic only/i);
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
