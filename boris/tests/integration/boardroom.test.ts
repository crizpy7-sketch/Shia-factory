/**
 * Integration: the boardroom.
 *
 * A meeting is the one place in this runtime where agents read each other. The tests below are
 * mostly about what the record must refuse to do: flatten a disagreement, invent a consensus,
 * decide something, let one agent speak for another, or present silence as assent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { convene, meetingService } from '../../src/runtime.js';
import { assembleMinutes } from '../../src/domain/meetings.js';
import { makeHarness } from '../helpers.js';
import { CompletionRequest } from '../../src/providers/types.js';
import { ScriptedTurn } from '../../src/providers/scripted.js';

/** Answers as whichever agent the system prompt says is speaking. */
function speakAs(byAgent: Record<string, (round: number, system: string) => unknown>): (r: CompletionRequest) => ScriptedTurn {
  const seen = new Map<string, number>();
  return (request) => {
    const agentId = /\((BORIS-001|GARY-001)\)/.exec(request.system)?.[1] ?? 'UNKNOWN';
    const round = (seen.get(agentId) ?? 0) + 1;
    seen.set(agentId, round);
    const build = byAgent[agentId];
    if (!build) return { text: 'no comment' };
    return { toolUses: [{ name: 'contribute', input: build(round, request.system) as Record<string, unknown> }] };
  };
}

test('a meeting needs a real room: two hosted agents, and a topic', (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());

  assert.throws(() => convene(h.runtime, 'Growth strategy for Q2', { participants: ['GARY-001'] }),
    /at least two hosted agents/,
    'one agent talking to himself is a task, not a meeting');
  assert.throws(() => convene(h.runtime, 'Positioning for the booking app', { participants: ['GARY-001', 'NOBODY-404'] }),
    /no runtime hosts NOBODY-404/);
  assert.throws(() => convene(h.runtime, 'short'), /at least 8 characters/);

  const meeting = convene(h.runtime, 'Positioning for the booking app');
  assert.deepEqual(meeting.participants, ['BORIS-001', 'GARY-001'], 'everyone hosted is seated by default');
  assert.equal(meeting.status, 'scheduled');
  assert.equal(meeting.convenedBy, 'Cristian');
});

test('each agent speaks in his own voice, and reads the others from round two', async (t) => {
  const prompts: Array<{ agent: string; system: string; user: string }> = [];
  const h = makeHarness({
    policy: (request) => {
      const agentId = /\((BORIS-001|GARY-001)\)/.exec(request.system)?.[1] ?? 'UNKNOWN';
      prompts.push({
        agent: agentId, system: request.system,
        user: JSON.stringify(request.messages),
      });
      return { toolUses: [{ name: 'contribute', input: { position: `${agentId} speaking.` } }] };
    },
  });
  t.after(() => h.cleanup());

  const meeting = convene(h.runtime, 'Should we launch the booking app in March?', { rounds: 2 });
  await meetingService(h.runtime).run(meeting.id);

  assert.equal(prompts.length, 4, 'two agents, two rounds');
  assert.deepEqual(prompts.map((p) => p.agent), ['BORIS-001', 'GARY-001', 'BORIS-001', 'GARY-001']);

  // Boris is briefed as Boris and Gary as Gary — never blended.
  const boris = prompts[0]?.system ?? '';
  const gary = prompts[1]?.system ?? '';
  assert.match(boris, /You are Boris \(BORIS-001\)/);
  assert.match(gary, /You are Gary \(GARY-001\)/);
  assert.match(gary, /is not Gary Vaynerchuk/, 'his notice travels into the room too');
  assert.equal(/GARY-001, a growth strategist/.test(boris), false, 'Boris is not given Gary as his own identity');

  // Each is told who else is in the room, quoting that colleague's own package.
  assert.match(boris, /Colleagues in this runtime/);
  assert.match(boris, /Gary \(GARY-001\)/);
  assert.match(gary, /Boris \(BORIS-001\)/);
  assert.match(gary, /BORIS pressures Gary for truth, feasibility/);

  // Round one is blind; round two carries the transcript.
  assert.equal(/What has been said so far/.test(prompts[0]?.user ?? ''), false);
  assert.match(prompts[2]?.user ?? '', /What has been said so far/);
  assert.match(prompts[2]?.user ?? '', /GARY-001 speaking/, 'Boris must actually see what Gary said');
});

test('nobody in the room may act: only the contribute tool is on the table', async (t) => {
  const offered: string[][] = [];
  const h = makeHarness({
    policy: (request) => {
      offered.push(request.tools.map((tool) => tool.name));
      return { toolUses: [{ name: 'contribute', input: { position: 'Noted.' } }] };
    },
  });
  t.after(() => h.cleanup());

  const meeting = convene(h.runtime, 'Whether to rewrite the records block', { rounds: 1 });
  await meetingService(h.runtime).run(meeting.id);
  for (const tools of offered) {
    assert.deepEqual(tools, ['contribute'],
      'a meeting is speech: no file, shell, git or network tool may be reachable');
  }
});

test('disagreement survives into the minutes instead of being summarised away', async (t) => {
  const h = makeHarness({
    policy: speakAs({
      'BORIS-001': () => ({
        position: 'The booking flow has an unverified failure path. March is too early.',
        agreements: [{ point: 'The offer itself is clear.' }],
        challenges: [{
          toAgent: 'GARY-001',
          point: 'A launch date cannot be set before the refund path is verified.',
          wouldChangeMyMind: 'A green end-to-end run of the refund suite.',
        }],
        evidenceGaps: ['No load test exists for the booking endpoint.'],
        needsOwner: ['Whether to hold the date or ship with a known gap.'],
      }),
      'GARY-001': () => ({
        position: 'March captures the seasonal window. Slipping costs the whole quarter.',
        agreements: [{ withAgent: 'BORIS-001', point: 'The refund path must be verified before launch.' }],
        challenges: [{
          toAgent: 'BORIS-001',
          point: 'Verifying everything before any launch forfeits the window entirely.',
          wouldChangeMyMind: 'Evidence that the seasonal window extends into Q2.',
        }],
        needsOwner: ['Approval of the launch date.'],
      }),
    }),
  });
  t.after(() => h.cleanup());

  const meeting = convene(h.runtime, 'Should we launch the booking app in March?', { rounds: 1 });
  const held = await meetingService(h.runtime).run(meeting.id);

  assert.equal(held.status, 'concluded');
  const minutes = held.minutes;
  assert.ok(minutes);

  // Both challenges are on the record, addressed, and carry what would settle them.
  assert.equal(minutes.unresolved.length, 2);
  const toGary = minutes.unresolved.find((u) => u.to === 'GARY-001');
  assert.ok(toGary);
  assert.equal(toGary.from, 'BORIS-001');
  assert.match(toGary.wouldChangeMyMind, /refund suite/);

  // Gary's agreement with Boris is recorded even though he also challenges him: two agents can
  // converge on one point while still disagreeing about another.
  const converged = minutes.agreed.find((a) => /refund path must be verified/.test(a.point));
  assert.ok(converged, 'a real convergence must not be dropped because they disagree elsewhere');
  assert.equal(converged.from, 'GARY-001');
  assert.equal(converged.withAgent, 'BORIS-001');
  assert.equal(converged.reciprocated, false, 'Boris did not record agreeing back');

  // What only the owner can settle is kept separate from what the room worked out.
  assert.equal(minutes.forOwner.length, 2);
  assert.ok(minutes.forOwner.some((o) => /launch date/i.test(o)));
  assert.deepEqual(minutes.positions.map((p) => p.agentId), ['BORIS-001', 'GARY-001']);
  assert.equal(minutes.evidenceGaps.length, 1);
});

test('a challenge to somebody who is not in the room is dropped, not recorded', async (t) => {
  const h = makeHarness({
    policy: speakAs({
      'BORIS-001': () => ({
        position: 'Noted.',
        challenges: [
          { toAgent: 'BORIS-001', point: 'Arguing with myself.', wouldChangeMyMind: 'nothing' },
          { toAgent: 'GHOST-999', point: 'Arguing with a phantom.', wouldChangeMyMind: 'nothing' },
          { toAgent: 'GARY-001', point: 'A real disagreement.', wouldChangeMyMind: 'Evidence.' },
        ],
      }),
      'GARY-001': () => ({ position: 'Noted.' }),
    }),
  });
  t.after(() => h.cleanup());

  const meeting = convene(h.runtime, 'Whether the glue engine needs a rewrite', { rounds: 1 });
  const held = await meetingService(h.runtime).run(meeting.id);
  assert.equal(held.minutes?.unresolved.length, 1, 'only the challenge that can be answered survives');
  assert.equal(held.minutes?.unresolved[0]?.to, 'GARY-001');
});

test('an agent who cannot be reached is recorded absent, never spoken for', async (t) => {
  const h = makeHarness({
    policy: (request) => {
      const agentId = /\((BORIS-001|GARY-001)\)/.exec(request.system)?.[1];
      // Gary answers; Boris returns prose instead of calling the tool, so he said nothing usable.
      if (agentId === 'GARY-001') {
        return { toolUses: [{ name: 'contribute', input: { position: 'Ship in March.' } }] };
      }
      return { text: 'I would rather not use the tool.' };
    },
  });
  t.after(() => h.cleanup());

  const meeting = convene(h.runtime, 'Should we launch the booking app in March?', { rounds: 1 });
  const held = await meetingService(h.runtime).run(meeting.id);

  assert.equal(held.status, 'concluded', 'the meeting still happened');
  assert.deepEqual(held.minutes?.positions.map((p) => p.agentId), ['GARY-001'],
    'no position may be attributed to an agent who did not give one');
  const absences = h.runtime.storage.listEvents({ limit: 100 })
    .filter((e) => e.type === 'meeting.absent');
  assert.ok(absences.some((e) => /BORIS-001/.test(e.summary)), 'his absence is on the record');
});

test('a meeting nobody attended is blocked, not concluded with an empty record', async (t) => {
  const h = makeHarness({ policy: () => ({ text: 'silence' }) });
  t.after(() => h.cleanup());

  const meeting = convene(h.runtime, 'Whether to adopt a new records schema', { rounds: 1 });
  const held = await meetingService(h.runtime).run(meeting.id);

  assert.equal(held.status, 'blocked');
  assert.equal(held.minutes, null, 'an empty record must not read as a room that met and agreed');
  assert.match(held.error ?? '', /No participant could be reached/);
});

test('minutes are assembled, never summarised: the same input gives the same record', () => {
  const meeting = {
    id: 'm1', topic: 'T', agenda: '', convenedBy: 'Cristian',
    participants: ['BORIS-001', 'GARY-001'], status: 'in_session' as const,
    rounds: 1, roundsCompleted: 1, createdAt: 'now', startedAt: null, endedAt: null,
    minutes: null, error: null,
  };
  const contributions = [{
    id: 'c1', meetingId: 'm1', round: 1, agentId: 'BORIS-001', role: 'principal engineer',
    position: 'Hold the date.', agreements: [{ withAgent: null, point: 'The offer is clear.' }],
    challenges: [], evidenceGaps: ['No load test.'], needsOwner: ['The date.'], createdAt: 'now',
  }, {
    id: 'c2', meetingId: 'm1', round: 1, agentId: 'GARY-001', role: 'growth strategist',
    position: 'Ship it.', agreements: [{ withAgent: 'BORIS-001', point: 'The offer is clear.' }],
    challenges: [], evidenceGaps: [], needsOwner: [], createdAt: 'now',
  }];

  const a = assembleMinutes(meeting, contributions);
  const b = assembleMinutes(meeting, contributions);
  assert.deepEqual({ ...a, assembledAt: '' }, { ...b, assembledAt: '' });
  // Each agent's own statement is kept; the same point from two agents is two records, one of
  // which names the other — that is the room, not a duplicate.
  assert.equal(a.agreed.length, 2);
  assert.equal(a.agreed.filter((x) => x.reciprocated).length, 0);
  assert.equal(a.unresolved.length, 0);
});
