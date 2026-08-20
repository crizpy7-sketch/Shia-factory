/**
 * Integration: a runtime that hosts more than one agent.
 *
 * The point under test is not that two identities load — it is that they stay distinct once work
 * is running. An answer produced by the wrong agent, or a tool reached by an agent whose package
 * never granted it, is the failure this file exists to catch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentFor, convene, submitObjective } from '../../src/runtime.js';
import { WorkerService } from '../../src/worker/worker.js';
import { makeHarness } from '../helpers.js';
import { CompletionRequest } from '../../src/providers/types.js';
import { ScriptedTurn } from '../../src/providers/scripted.js';

/** Plays a fixed sequence of turns, one per call, then repeats the last. */
function turns(...sequence: ScriptedTurn[]): (r: CompletionRequest) => ScriptedTurn {
  let index = 0;
  return () => sequence[Math.min(index++, sequence.length - 1)] as ScriptedTurn;
}

const REPORT = (success: boolean, summary: string): ScriptedTurn =>
  ({ toolUses: [{ name: 'report_result', input: { success, summary } }] });

test('the runtime hosts both packaged agents, and neither is reported as certified', (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());

  assert.deepEqual([...h.runtime.roster.keys()].sort(), ['BORIS-001', 'GARY-001']);
  for (const { profile } of h.runtime.roster.values()) {
    assert.match(profile.identity.certificationStatus, /PENDING/);
  }
  // The primary agent is still reachable the way every caller before the roster expected.
  assert.equal(h.runtime.identity.agentId, 'BORIS-001');
  assert.equal(h.runtime.agent, h.runtime.roster.get('BORIS-001')?.agent);
});

test('work is addressed to an agent, and an agent this runtime cannot host is refused', (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());

  const gary = submitObjective(h.runtime, 'Plan the launch for the booking app.', { agentId: 'GARY-001' });
  assert.equal(gary.assignedAgent, 'GARY-001');

  const boris = submitObjective(h.runtime, 'Repair the failing median calculation.');
  assert.equal(boris.assignedAgent, 'BORIS-001', 'the primary agent is the default');

  assert.throws(
    () => submitObjective(h.runtime, 'Do something ambitious please.', { agentId: 'NOBODY-404' }),
    /no runtime hosts NOBODY-404/,
    'queueing work for an agent nobody hosts would mean it ran as someone else',
  );
});

test('a subagent id resolves to its parent, an unknown one to nobody', (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());

  assert.equal(agentFor(h.runtime, 'BORIS-001:reviewer')?.profile.agentId, 'BORIS-001');
  assert.equal(agentFor(h.runtime, 'GARY-001')?.profile.agentId, 'GARY-001');
  assert.equal(agentFor(h.runtime, 'NOBODY-404'), null);
});

test('the worker runs the agent the task names, briefed as that agent', async (t) => {
  const prompts: string[] = [];
  const h = makeHarness({
    policy: (request) => {
      prompts.push(request.system);
      return REPORT(true, 'Plan drafted for review.');
    },
  });
  t.after(() => h.cleanup());

  submitObjective(h.runtime, 'Draft a launch plan for the booking app.', { agentId: 'GARY-001' });
  const outcome = await new WorkerService(h.runtime, { maxTasks: 1 }).runOnce();
  assert.ok(outcome, 'the task should have been claimed and run');

  const system = prompts[0] ?? '';
  assert.match(system, /GARY-001/);
  assert.match(system, /is not Gary Vaynerchuk/, 'his simulation notice must reach the model');
  assert.match(system, /Choose one primary objective and one KPI/);
  assert.equal(/Principal Agentic Software Engineer/.test(system), false,
    'Gary must not be briefed as Boris');
  assert.equal(/Read → Plan → Act → Observe → Verify/.test(system), false);

  // The tools he is shown are his, not the registry's.
  assert.equal(/\bfs_write\b/.test(system), false, 'a tool he cannot call must not be offered');
  assert.equal(/\bgit_commit\b/.test(system), false);
  assert.match(system, /fs_read/);

  // And the run is attributed to him, in his own discipline — not "principal engineer".
  const run = h.runtime.storage.listRuns(outcome.taskId)[0];
  assert.equal(run?.agentId, 'GARY-001');
  assert.equal(run?.role, 'growth strategist');
  assert.equal(/bounded specialist/.test(system), false,
    'his own role is not a narrowed delegation of somebody else\'s');
});

test('a task naming an agent the runtime cannot host is blocked, never reassigned', async (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());

  // Submitted legitimately, then re-addressed in storage — the shape a task takes when a runtime
  // is restarted with a smaller roster than the one that queued the work.
  const task = submitObjective(h.runtime, 'Something for an agent who left.', { agentId: 'GARY-001' });
  h.runtime.storage.updateTask(task.id, { assignedAgent: 'DEPARTED-001' });

  const outcome = await new WorkerService(h.runtime, { maxTasks: 1 }).runOnce();
  assert.equal(outcome, null, 'nothing may run it');
  const after = h.runtime.storage.getTask(task.id);
  assert.equal(after?.status, 'blocked');
  assert.match(after?.error ?? '', /no runtime here hosts DEPARTED-001/);
});

test('Gary cannot reach a tool his package never gave him, even with a plan recorded', async (t) => {
  const h = makeHarness({
    // A plan first, so the refusal that follows is the capability boundary and not the plan gate.
    policy: turns(
      { toolUses: [{ name: 'plan', input: {
        summary: 'Draft a launch brief for the booking app and put it in the repository.',
        steps: [{ step: 'Draft the brief', reason: 'the owner asked for one', verification: 'read it back' }],
        risks: ['none'],
      } }] },
      { toolUses: [{ name: 'fs_write', input: { path: 'campaign.md', content: 'launch' } }] },
      REPORT(false, 'I have no authority to change this repository.'),
    ),
  });
  t.after(() => h.cleanup());

  submitObjective(h.runtime, 'Write a campaign brief into the repository.', { agentId: 'GARY-001' });
  const outcome = await new WorkerService(h.runtime, { maxTasks: 1 }).runOnce();
  assert.ok(outcome);

  const calls = h.runtime.storage.listToolCalls(outcome.taskId);
  assert.ok(calls.some((c) => c.tool === 'plan' && c.ok), 'the plan itself is allowed');

  const write = calls.find((c) => c.tool === 'fs_write');
  assert.ok(write, 'the attempt must be on the record, not silently dropped');
  assert.equal(write.status, 'denied');
  assert.equal(write.ok, false);
  // Denied for not being his, not merely for arriving before a plan.
  assert.equal(/no plan recorded/.test(write.error ?? ''), false,
    'the plan gate must not be what refused this — the capability boundary must');

  // Refusing in the prompt is not refusing. The file must not exist.
  assert.equal(existsSync(join(h.workspace, 'campaign.md')), false,
    'a tool outside his package must not be able to touch the disk');
});

test('a solo deployment hosts exactly one agent and says so', (t) => {
  /* This is the VPS shape: the same image, BORIS_AGENTS naming one id. Nothing about the runtime
     changes except who is in the room, which is the point — an agent must be deployable alone. */
  const solo = makeHarness({ config: { hostedAgents: ['GARY-001'], agentId: 'GARY-001' } });
  t.after(() => solo.cleanup());

  assert.deepEqual([...solo.runtime.roster.keys()], ['GARY-001']);
  assert.equal(solo.runtime.roster.get('GARY-001')?.profile.tools?.includes('fs_write'), false,
    'his boundary travels with him; it is not a property of sharing a runtime with Boris');

  // Work for an absent colleague is refused rather than run by the one who is here.
  assert.throws(() => submitObjective(solo.runtime, 'Repair the median calculation.', { agentId: 'BORIS-001' }),
    /no runtime hosts BORIS-001 \(hosted: GARY-001\)/);
  // And there is nobody to meet with.
  assert.throws(() => convene(solo.runtime, 'Should we launch in March?'),
    /at least two hosted agents/);

  const alone = submitObjective(solo.runtime, 'Draft the launch brief for the booking app.');
  assert.equal(alone.assignedAgent, 'GARY-001', 'the solo agent is the default assignee');
});

test('Boris keeps the tools Gary does not have', async (t) => {
  const prompts: string[] = [];
  const h = makeHarness({
    policy: (request) => {
      prompts.push(request.system);
      return REPORT(true, 'Inspected the workspace.');
    },
  });
  t.after(() => h.cleanup());

  writeFileSync(join(h.workspace, 'notes.md'), 'x');
  submitObjective(h.runtime, 'Inspect the workspace and report.');
  const outcome = await new WorkerService(h.runtime, { maxTasks: 1 }).runOnce();
  assert.ok(outcome);
  assert.equal(outcome.success, true);

  const system = prompts[0] ?? '';
  assert.match(system, /fs_write/);
  assert.match(system, /git_commit/);
  assert.match(system, /Principal Agentic Software Engineer/);
  assert.equal(h.runtime.storage.listRuns(outcome.taskId)[0]?.agentId, 'BORIS-001');
});
