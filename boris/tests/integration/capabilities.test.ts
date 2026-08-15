/**
 * Integration: plan-before-act, delivery, research, learning and live cancellation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeHarness } from '../helpers.js';
import { cancelTask, submitObjective } from '../../src/runtime.js';
import { fixtureRepairPolicy } from '../../src/providers/scripts.js';
import { CompletionRequest } from '../../src/providers/types.js';
import { ScriptedTurn } from '../../src/providers/scripted.js';

const OBJECTIVE = 'Inspect the workspace, plan a repair, implement it and verify with the test suite.';

function afterFirst(name: string, first: ScriptedTurn, then: ScriptedTurn): (r: CompletionRequest) => ScriptedTurn {
  return (request) => (JSON.stringify(request.messages).includes(name) ? then : first);
}

// -------------------------------------------------------------- plan gate

test('the workspace cannot be changed before a plan is recorded', async (t) => {
  const h = makeHarness({
    policy: afterFirst('fs_edit',
      { toolUses: [{ name: 'fs_edit', input: { path: 'src/stats.js', find: 'return sorted[middle];', replace: 'return 0;' } }] },
      { toolUses: [{ name: 'report_result', input: { success: false, summary: 'The runtime required a plan first.' } }] }),
  });
  t.after(() => h.cleanup());

  const before = readFileSync(join(h.workspace, 'src', 'stats.js'), 'utf8');
  const task = submitObjective(h.runtime, OBJECTIVE, { workspace: h.workspace });
  await h.runtime.agent.runTask(task.id);

  const call = h.runtime.storage.listToolCalls(task.id).find((c) => c.tool === 'fs_edit');
  assert.equal(call?.status, 'denied');
  assert.match(String(call?.error), /no plan recorded/);
  assert.equal(readFileSync(join(h.workspace, 'src', 'stats.js'), 'utf8'), before, 'the file changed without a plan');
});

test('a recorded plan is persisted, evented, and unlocks the mutating tools', async (t) => {
  const h = makeHarness({ policy: fixtureRepairPolicy });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, OBJECTIVE, { workspace: h.workspace });
  const outcome = await h.runtime.agent.runTask(task.id);
  assert.equal(outcome.status, 'completed');

  const finalTask = h.runtime.storage.getTask(task.id);
  assert.ok(finalTask?.plan, 'the plan should be persisted on the task');
  assert.ok(finalTask.plan.steps.length >= 2);
  assert.ok(finalTask.plan.steps.every((step) => step.step && step.why && step.verification),
    'every step needs a reason and a verification');
  assert.equal(finalTask.plan.verificationCommand, 'npm test');

  const events = h.runtime.storage.listEvents({ taskId: task.id, limit: 500 });
  assert.ok(events.some((e) => e.type === 'plan.created'), 'plan.created should be emitted');
  assert.ok(finalTask.evidence.some((e) => e.kind === 'plan'), 'the plan belongs in the evidence');

  // The edits happened after the plan, not before.
  const calls = h.runtime.storage.listToolCalls(task.id);
  const planIndex = calls.findIndex((c) => c.tool === 'plan');
  const firstEdit = calls.findIndex((c) => c.tool === 'fs_edit');
  assert.ok(planIndex >= 0 && firstEdit > planIndex, 'the first edit must follow the plan');
  assert.ok(calls.filter((c) => c.tool === 'fs_edit').every((c) => c.status !== 'denied'));
});

test('read-only reconnaissance is still permitted before planning', async (t) => {
  const h = makeHarness({
    policy: afterFirst('fs_list',
      { toolUses: [{ name: 'fs_list', input: { path: '.', depth: 1 } }] },
      { toolUses: [{ name: 'report_result', input: { success: false, summary: 'Recon only.' } }] }),
  });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, OBJECTIVE, { workspace: h.workspace });
  await h.runtime.agent.runTask(task.id);
  const call = h.runtime.storage.listToolCalls(task.id).find((c) => c.tool === 'fs_list');
  assert.equal(call?.ok, true, 'inspection must not require a plan');
});

// -------------------------------------------------------------- delivery

test('committing work requires human approval and never pushes', async (t) => {
  const h = makeHarness({
    policy: afterFirst('git_commit',
      { toolUses: [
        { name: 'plan', input: { summary: 'Commit the repaired workspace so the change can be reviewed.', steps: [
          { step: 'commit the change', why: 'the repair needs to leave the workspace', verification: 'git log shows the commit' },
        ] } },
        { name: 'git_commit', input: { message: 'repair the median calculation' } },
      ] },
      { toolUses: [{ name: 'report_result', input: { success: false, summary: 'Commit awaited approval.' } }] }),
  });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, 'Commit the repaired workspace.', { workspace: h.workspace });
  const outcome = await h.runtime.agent.runTask(task.id);

  assert.equal(outcome.status, 'awaiting_approval');
  const approval = h.runtime.storage.findPendingApprovalForTask(task.id);
  assert.ok(approval);
  assert.equal(approval.tool, 'git_commit');
  assert.equal(h.runtime.tools.get('git_commit')?.sensitivity, 'restricted');
  assert.doesNotMatch(String(h.runtime.tools.get('git_commit')?.description), /push to a remote/i);
});

test('deleting a file requires approval; moving one inside the workspace does not', async (t) => {
  const h = makeHarness({
    policy: afterFirst('fs_move',
      { toolUses: [
        { name: 'plan', input: { summary: 'Reorganise the helper module into a lib directory.', steps: [
          { step: 'move stats.js', why: 'the project groups helpers under lib', verification: 'the file exists at the new path' },
        ] } },
        { name: 'fs_move', input: { from: 'src/stats.js', to: 'src/lib/stats.js' } },
      ] },
      { toolUses: [{ name: 'report_result', input: { success: false, summary: 'Move complete.' } }] }),
  });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, 'Reorganise the helper module.', { workspace: h.workspace });
  await h.runtime.agent.runTask(task.id);

  assert.equal(existsSync(join(h.workspace, 'src', 'lib', 'stats.js')), true, 'the file should have moved');
  assert.equal(existsSync(join(h.workspace, 'src', 'stats.js')), false);
  assert.equal(h.runtime.tools.get('fs_delete')?.sensitivity, 'restricted', 'deletion must stay behind approval');
});

test('a move that leaves the workspace is refused', async (t) => {
  const h = makeHarness({
    policy: afterFirst('fs_move',
      { toolUses: [
        { name: 'plan', input: { summary: 'Attempt to relocate a file outside the sandbox.', steps: [
          { step: 'move it out', why: 'testing the boundary', verification: 'should be denied' },
        ] } },
        { name: 'fs_move', input: { from: 'src/stats.js', to: '../../escaped.js' } },
      ] },
      { toolUses: [{ name: 'report_result', input: { success: false, summary: 'Denied as expected.' } }] }),
  });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, 'Try to move a file out of the workspace.', { workspace: h.workspace });
  await h.runtime.agent.runTask(task.id);

  const call = h.runtime.storage.listToolCalls(task.id).find((c) => c.tool === 'fs_move');
  assert.equal(call?.status, 'denied');
  assert.equal(existsSync(join(h.workspace, 'src', 'stats.js')), true, 'the source file should be untouched');
});

// -------------------------------------------------------------- research

test('research on a non-allowlisted host requires approval', async (t) => {
  const h = makeHarness({
    policy: afterFirst('http_fetch',
      { toolUses: [{ name: 'http_fetch', input: { url: 'https://example.com/some-article' } }] },
      { toolUses: [{ name: 'report_result', input: { success: false, summary: 'Research awaited approval.' } }] }),
  });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, 'Research the problem before repairing it.', { workspace: h.workspace });
  const outcome = await h.runtime.agent.runTask(task.id);

  assert.equal(outcome.status, 'awaiting_approval');
  const approval = h.runtime.storage.findPendingApprovalForTask(task.id);
  assert.match(String(approval?.reason), /not on the research allowlist/);
});

test('research pointed at internal infrastructure is denied outright', async (t) => {
  const h = makeHarness({
    policy: afterFirst('http_fetch',
      { toolUses: [{ name: 'http_fetch', input: { url: 'http://169.254.169.254/latest/meta-data/iam/' } }] },
      { toolUses: [{ name: 'report_result', input: { success: false, summary: 'SSRF attempt refused.' } }] }),
  });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, 'Fetch the cloud metadata endpoint.', { workspace: h.workspace });
  await h.runtime.agent.runTask(task.id);

  const call = h.runtime.storage.listToolCalls(task.id).find((c) => c.tool === 'http_fetch');
  // Either the allowlist check or the address check stops it — both are acceptable, silence is not.
  assert.ok(call?.status === 'denied' || call?.ok === false, 'the metadata endpoint must not be fetched');
  const events = h.runtime.storage.listEvents({ taskId: task.id, limit: 300 });
  assert.ok(events.some((e) => e.type === 'tool.denied' || e.type === 'approval.requested' || e.type === 'tool.failed'));
});

// -------------------------------------------------------------- learning

test('a failed verification is captured as a failure memory with a signature', async (t) => {
  const h = makeHarness({ policy: fixtureRepairPolicy });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, OBJECTIVE, { workspace: h.workspace });
  await h.runtime.agent.runTask(task.id);

  const failures = h.runtime.storage.queryMemory({ category: 'failure', limit: 20 });
  assert.ok(failures.length >= 1, 'the rejected repair should have been recorded');
  assert.ok(failures[0]?.tags.some((tag) => tag.startsWith('sig:')), 'a signature tag is needed for recurrence');
  assert.equal(failures[0]?.verified, true);
  assert.match(String(failures[0]?.content), /npm test/);

  const finalTask = h.runtime.storage.getTask(task.id);
  assert.ok(finalTask?.failureSignature, 'the signature should be recorded on the task');
});

test('the second occurrence of a failure is reported as recurring', async (t) => {
  const h = makeHarness({ policy: fixtureRepairPolicy });
  t.after(() => h.cleanup());

  // Two independent tasks hitting the same verification failure.
  for (const _ of [1, 2]) {
    const task = submitObjective(h.runtime, OBJECTIVE, { workspace: h.workspace });
    await h.runtime.agent.runTask(task.id);
    writeFileSync(join(h.workspace, 'src', 'stats.js'),
      readFileSync(join(h.workspace, 'src', 'stats.js'), 'utf8')
        .replace('return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];',
                 'return sorted[middle];'));
  }

  const failures = h.runtime.storage.queryMemory({ category: 'failure', limit: 20 });
  assert.ok(failures.length >= 2);
  assert.ok(failures.some((f) => /recorded 2 times/.test(f.content)), 'recurrence should be stated explicitly');

  const events = h.runtime.storage.listEvents({ limit: 1000 });
  assert.ok(events.some((e) => e.type === 'memory.created' && /recurring/.test(e.summary)));
});

// ---------------------------------------------------------- cancellation

test('cancelling a running task interrupts it rather than waiting for the next turn', async (t) => {
  const h = makeHarness({
    policy: (request) => {
      // A long-running command gives the operator a window to cancel.
      const started = JSON.stringify(request.messages).includes('sleeper.js');
      return started
        ? { toolUses: [{ name: 'report_result', input: { success: false, summary: 'Should not get here.' } }] }
        : { toolUses: [{ name: 'shell_run', input: { command: 'node sleeper.js', timeoutMs: 60000 } }] };
    },
  });
  t.after(() => h.cleanup());
  writeFileSync(join(h.workspace, 'sleeper.js'), 'setInterval(() => {}, 1000);');

  const task = submitObjective(h.runtime, 'Run a long command that will be cancelled.', { workspace: h.workspace });
  const { WorkerService } = await import('../../src/worker/worker.js');
  const worker = new WorkerService(h.runtime, { maxTasks: 1 });

  const started = Date.now();
  const running = worker.runOnce();
  // Wait until the command is genuinely in flight, then cancel.
  await new Promise((resolve) => setTimeout(resolve, 700));
  cancelTask(h.runtime, task.id);
  await running;
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 20000, `cancellation should interrupt promptly, took ${elapsed}ms`);
  assert.equal(h.runtime.storage.getTask(task.id)?.status, 'cancelled');
  const events = h.runtime.storage.listEvents({ taskId: task.id, limit: 200 });
  assert.ok(events.some((e) => e.type === 'task.cancelled' && e.data['interrupted'] === true),
    'the cancellation should record that a live run was interrupted');
});

test('cancelling a queued task does not claim to have interrupted anything', (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());
  const task = submitObjective(h.runtime, 'A task that will be cancelled before it runs.', { workspace: h.workspace });
  cancelTask(h.runtime, task.id);
  const event = h.runtime.storage.listEvents({ taskId: task.id, limit: 50 }).find((e) => e.type === 'task.cancelled');
  assert.equal(event?.data['interrupted'], false);
});

// ------------------------------------------------- preflight and delivery

test('the preflight command reports honestly when no live provider is configured', () => {
  const result = spawnSync('node', ['dist/src/cli.js', 'preflight'], {
    cwd: process.cwd(), encoding: 'utf8',
    env: {
      PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '/tmp',
      BORIS_PROVIDER: 'anthropic', BORIS_LOG_LEVEL: 'error',
    },
  });
  assert.notEqual(result.status, 0, 'preflight must fail when credentials are missing');
  assert.match(result.stdout, /FAIL {2}provider credentials/);
  assert.match(result.stdout, /PASS {2}identity/);
  assert.match(result.stdout, /not ready for live work/);
});
