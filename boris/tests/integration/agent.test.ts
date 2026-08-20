/**
 * Integration: the real loop against a real workspace.
 *
 * The model's decisions come from a deterministic policy, but everything else is genuine — real
 * files are read and edited, real processes run, real state is persisted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeHarness } from '../helpers.js';
import { approvalPolicy, delegationPolicy, fixtureRepairPolicy } from '../../src/providers/scripts.js';
import { ScriptedProvider } from '../../src/providers/scripted.js';
import { createRuntime, decideApproval, recoverOutstandingWork, submitObjective } from '../../src/runtime.js';
import { Logger } from '../../src/util/log.js';
import { WorkerService } from '../../src/worker/worker.js';
import { REPO_ROOT } from '../helpers.js';
import { resolve } from 'node:path';

const OBJECTIVE =
  'Inspect this codebase, determine its architecture, identify the failing behaviour, plan a repair, ' +
  'implement it, run the tests, diagnose any failure, repair until verification passes, and report evidence.';

test('BORIS repairs a real defect: recon, wrong fix, failed verification, repair, verified completion', async (t) => {
  const h = makeHarness({ policy: fixtureRepairPolicy });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, OBJECTIVE, { workspace: h.workspace });
  const outcome = await h.runtime.agent.runTask(task.id);

  // 1. the loop reached a verified completion
  assert.equal(outcome.status, 'completed', `run ended ${outcome.status}: ${outcome.report}`);
  assert.equal(outcome.success, true);
  assert.equal(outcome.verified, true, 'completion must be independently verified');

  // 2. a real file on disk actually changed
  const source = readFileSync(join(h.workspace, 'src', 'stats.js'), 'utf8');
  assert.match(source, /sorted\.length % 2 === 0/, 'the implementation was not repaired');
  assert.doesNotMatch(source, /return sorted\[middle\];\s*$/m);

  // 3. the repaired project genuinely passes its own suite, run by the test itself
  const verify = spawnSync('npm', ['test'], {
    cwd: h.workspace, encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '/tmp' },
  });
  assert.equal(verify.status, 0, `the repaired fixture still fails its own suite:\n${verify.stdout}\n${verify.stderr}`);
  assert.match(`${verify.stdout}${verify.stderr}`, /pass 4/);

  // 4. the tool calls that did the work are persisted
  const calls = h.runtime.storage.listToolCalls(task.id);
  const used = calls.map((c) => c.tool);
  for (const expected of ['fs_list', 'fs_read', 'dev', 'fs_edit', 'report_result']) {
    assert.ok(used.includes(expected), `expected a ${expected} tool call, saw: ${used.join(', ')}`);
  }
  assert.ok(calls.filter((c) => c.tool === 'fs_edit').length >= 2, 'expected a failed repair and a real one');
  assert.ok(calls.every((c) => c.durationMs === null || c.durationMs >= 0));

  // 5. the failed claim and the repair cycle are on the record
  const events = h.runtime.storage.listEvents({ taskId: task.id, limit: 500 }).map((e) => e.type);
  assert.ok(events.includes('verification.failed'), 'the first success claim should have been rejected');
  assert.ok(events.includes('repair.started'));
  assert.ok(events.includes('verification.passed'));
  assert.ok(events.includes('task.completed'));

  // 6. evidence records both the rejection and the eventual pass
  const finalTask = h.runtime.storage.getTask(task.id);
  assert.ok(finalTask);
  const verifications = finalTask.evidence.filter((e) => e.kind === 'verification');
  assert.ok(verifications.some((e) => !e.ok), 'the rejected claim should be in the evidence');
  assert.ok(verifications.some((e) => e.ok), 'the accepted verification should be in the evidence');
  assert.ok(finalTask.usage.modelCalls > 0 && finalTask.usage.toolCalls > 0);
});

test('an unverified success claim is rejected rather than accepted', async (t) => {
  // This policy claims success immediately, without doing anything and without a check.
  const h = makeHarness({
    policy: (request) => {
      const claimed = JSON.stringify(request.messages).includes('report_result');
      return {
        toolUses: [{
          name: 'report_result',
          input: claimed
            ? { success: true, summary: 'Fixed it, honestly.', evidence: ['trust me'] }
            : { success: true, summary: 'Fixed it.', evidence: ['trust me'], verificationCommand: 'npm test' },
        }],
      };
    },
  });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, OBJECTIVE, { workspace: h.workspace });
  const outcome = await h.runtime.agent.runTask(task.id);

  assert.equal(outcome.verified, false, 'nothing was actually verified');
  const events = h.runtime.storage.listEvents({ taskId: task.id, limit: 200 }).map((e) => e.type);
  assert.ok(events.includes('verification.failed'), 'the false claim must be caught by re-running the check');
  const finalTask = h.runtime.storage.getTask(task.id);
  assert.match(String(finalTask?.result ?? ''), /UNVERIFIED/, 'the result must be labelled unverified');
});

test('a restricted request pauses for approval and resumes when a human approves', async (t) => {
  const h = makeHarness({ policy: approvalPolicy });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, 'Deploy the repaired package to production once tests pass.', {
    workspace: h.workspace,
  });
  const paused = await h.runtime.agent.runTask(task.id);

  assert.equal(paused.status, 'awaiting_approval');
  const pending = h.runtime.storage.findPendingApprovalForTask(task.id);
  assert.ok(pending, 'an approval request should exist');
  assert.match(pending.risk, /reverse|risk|visible/i);
  assert.equal(h.runtime.storage.getTask(task.id)?.status, 'awaiting_approval');

  const decided = decideApproval(h.runtime, pending.id, 'approved', 'cristian', 'go ahead');
  assert.equal(decided.task.status, 'queued', 'approval should return the task to the queue');

  const resumed = await h.runtime.agent.runTask(task.id);
  assert.equal(resumed.status, 'completed');
  const events = h.runtime.storage.listEvents({ taskId: task.id, limit: 200 }).map((e) => e.type);
  assert.ok(events.includes('approval.requested'));
  assert.ok(events.includes('approval.approved'));
});

test('a rejected approval fails the task with the reason recorded', async (t) => {
  const h = makeHarness({ policy: approvalPolicy });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, 'Deploy to production immediately.', { workspace: h.workspace });
  await h.runtime.agent.runTask(task.id);
  const pending = h.runtime.storage.findPendingApprovalForTask(task.id);
  assert.ok(pending);

  const decided = decideApproval(h.runtime, pending.id, 'rejected', 'cristian', 'not now');
  assert.equal(decided.task.status, 'failed');
  assert.match(String(decided.task.error), /rejected by cristian/);
});

test('delegation is bounded and the worker result is returned as an unverified claim', async (t) => {
  const h = makeHarness({ policy: delegationPolicy });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, 'Understand this repository, delegating the inventory.', {
    workspace: h.workspace,
  });
  await h.runtime.agent.runTask(task.id);

  const children = h.runtime.storage.listTasks({ parentTaskId: task.id });
  assert.equal(children.length, 1, 'exactly one worker task should have been created');
  const child = children[0];
  assert.ok(child);
  assert.equal(child.depth, 1);
  assert.equal(child.parentTaskId, task.id);

  const parent = h.runtime.storage.getTask(task.id);
  assert.equal(parent?.usage.workers, 1, 'worker spend must roll up to the parent');

  const delegateCall = h.runtime.storage.listToolCalls(task.id).find((c) => c.tool === 'delegate');
  assert.ok(delegateCall);
  assert.match(String(delegateCall.output), /not established fact|NOT independently verified/i);

  // The worker only had the tools it was granted.
  const workerCalls = h.runtime.storage.listToolCalls(child.id).map((c) => c.tool);
  assert.ok(workerCalls.every((tool) => ['fs_list', 'fs_read', 'report_result'].includes(tool)),
    `worker used tools outside its grant: ${workerCalls.join(', ')}`);
});

test('worker depth is enforced by the runtime, not by the prompt', async (t) => {
  const h = makeHarness({ policy: delegationPolicy, config: { limits: { maxWorkerDepth: 0 } as never } });
  t.after(() => h.cleanup());

  const task = submitObjective(h.runtime, 'Understand this repository, delegating the inventory.', {
    workspace: h.workspace,
  });
  await h.runtime.agent.runTask(task.id);

  assert.equal(h.runtime.storage.listTasks({ parentTaskId: task.id }).length, 0, 'no worker should have been created');
  const events = h.runtime.storage.listEvents({ taskId: task.id, limit: 1000 });
  assert.ok(events.some((e) => e.type === 'worker.rejected'), 'the refusal should be on the record');
});

test('outstanding work survives a restart and is completed by the next process', async (t) => {
  const h = makeHarness({ policy: fixtureRepairPolicy });
  t.after(() => h.cleanup());

  // A task interrupted mid-flight: it is 'working' and owned by a boot id that no longer exists.
  const task = submitObjective(h.runtime, OBJECTIVE, { workspace: h.workspace });
  h.runtime.storage.updateTask(task.id, { status: 'planning' });
  h.runtime.storage.updateTask(task.id, { status: 'working', startedAt: new Date().toISOString() });
  h.runtime.storage.createRun({
    id: 'run_interrupted', taskId: task.id, agentId: 'BORIS-001', role: 'engineer', status: 'running',
    startedAt: new Date().toISOString(), endedAt: null, provider: 'scripted', model: 'm', turns: 3,
    parentRunId: null, depth: 0, usage: { modelCalls: 3, inputTokens: 0, outputTokens: 0, costUsd: 0, toolCalls: 2, workers: 0 },
    error: null, heartbeat: 'working', ownerPid: 999999, ownerBootId: 'previous-boot',
  });
  h.runtime.storage.close();

  // A fresh process: new runtime, new boot id, same database.
  const restarted = createRuntime({
    provider: new ScriptedProvider(fixtureRepairPolicy, 'scripted-test'),
    logger: new Logger('error', {}, () => {}),
    config: {
      repoRoot: REPO_ROOT,
      dbPath: join(h.root, 'boris.db'),
      workspaceRoots: [h.workspace],
      identityDir: resolve(REPO_ROOT, 'agents', 'BORIS-001'),
    },
  });
  t.after(() => restarted.storage.close());

  const recovery = recoverOutstandingWork(restarted);
  assert.equal(recovery.runs, 1, 'the interrupted run should be detected');
  assert.ok(recovery.tasks.includes(task.id), 'the outstanding task should be requeued');
  assert.equal(restarted.storage.getRun('run_interrupted')?.status, 'interrupted');
  assert.equal(restarted.storage.getTask(task.id)?.status, 'queued');

  // And the recovered work actually finishes.
  const worker = new WorkerService(restarted, { maxTasks: 1 });
  const outcome = await worker.runOnce();
  assert.equal(outcome?.status, 'completed');
  assert.equal(outcome?.verified, true);
  assert.match(readFileSync(join(h.workspace, 'src', 'stats.js'), 'utf8'), /sorted\.length % 2 === 0/);
});

test('the worker claims queued work and drives it to a terminal state', async (t) => {
  const h = makeHarness({ policy: fixtureRepairPolicy });
  t.after(() => h.cleanup());

  submitObjective(h.runtime, OBJECTIVE, { workspace: h.workspace });
  const worker = new WorkerService(h.runtime, { maxTasks: 1 });
  const outcome = await worker.runOnce();

  assert.equal(outcome?.status, 'completed');
  assert.equal(await worker.runOnce(), null, 'the queue should now be empty');
});
