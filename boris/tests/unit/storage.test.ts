import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStorage } from '../../src/storage/sqlite.js';
import { Task, emptyUsage } from '../../src/domain/types.js';
import { id, now } from '../../src/util/ids.js';

function store(): SqliteStorage {
  const s = new SqliteStorage(':memory:');
  s.migrate();
  return s;
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: id('task'), parentTaskId: null, title: 'title', objective: 'objective text', description: '',
    status: 'queued', priority: 'normal', createdAt: now(), updatedAt: now(), startedAt: null,
    completedAt: null, assignedAgent: 'BORIS-001', workspace: '/tmp/ws', dependencies: [],
    attempts: 0, maxAttempts: 3, result: null, evidence: [], error: null, approvalState: 'none',
    usage: emptyUsage(), scheduleId: null, depth: 0, plan: null, failureSignature: null, ...over,
  };
}

test('tasks round-trip through storage with their structured fields intact', () => {
  const s = store();
  const created = s.createTask(task({ dependencies: ['a', 'b'], evidence: [{ kind: 'tool', summary: 's', detail: 'd', createdAt: now(), ok: true }] }));
  const loaded = s.getTask(created.id);
  assert.ok(loaded);
  assert.deepEqual(loaded.dependencies, ['a', 'b']);
  assert.equal(loaded.evidence[0]?.summary, 's');
  s.close();
});

test('claiming a task is atomic: only one claimant wins', () => {
  const s = store();
  const created = s.createTask(task());
  const first = s.claimNextTask(['queued'], 'planning');
  const second = s.claimNextTask(['queued'], 'planning');
  assert.equal(first?.id, created.id);
  assert.equal(first?.status, 'planning');
  assert.equal(second, null, 'a second claimant took the same task');
  s.close();
});

test('claiming respects priority then age', () => {
  const s = store();
  s.createTask(task({ priority: 'low', createdAt: '2020-01-01T00:00:00.000Z' }));
  const critical = s.createTask(task({ priority: 'critical', createdAt: '2024-01-01T00:00:00.000Z' }));
  assert.equal(s.claimNextTask(['queued'], 'planning')?.id, critical.id);
  s.close();
});

test('events are ordered and can be read incrementally', () => {
  const s = store();
  const ids = ['a', 'b', 'c'].map((suffix) => {
    const event = {
      id: `evt_${suffix}`, type: 'task.created' as const, taskId: 't1', runId: null, workerId: null,
      toolCallId: null, at: now(), level: 'info' as const, summary: suffix, data: {},
    };
    s.appendEvent(event);
    return event.id;
  });
  const all = s.listEvents({ taskId: 't1' });
  assert.deepEqual(all.map((e) => e.id), ids);
  const since = s.listEvents({ sinceId: 'evt_a' });
  assert.deepEqual(since.map((e) => e.id), ['evt_b', 'evt_c']);
  s.close();
});

test('an approval can only be decided once', () => {
  const s = store();
  const approval = s.createApproval({
    id: id('apr'), taskId: 't1', runId: null, action: 'deploy', tool: null, input: {},
    reason: 'r', risk: 'k', consequence: 'c', state: 'requested', requestedAt: now(),
    decidedAt: null, decidedBy: null, decisionNote: null,
  });
  s.decideApproval(approval.id, 'approved', 'operator', null);
  assert.throws(() => s.decideApproval(approval.id, 'rejected', 'operator', null), /already decided/);
  s.close();
});

test('orphaned runs are those owned by another boot', () => {
  const s = store();
  const base = {
    taskId: 't1', agentId: 'BORIS-001', role: 'engineer', status: 'running' as const,
    startedAt: now(), endedAt: null, provider: 'scripted', model: 'm', turns: 1,
    parentRunId: null, depth: 0, usage: emptyUsage(), error: null, heartbeat: 'working' as const,
    ownerPid: 1,
  };
  s.createRun({ ...base, id: id('run'), ownerBootId: 'boot-old' });
  s.createRun({ ...base, id: id('run'), ownerBootId: 'boot-current' });
  const orphans = s.findOrphanedRuns('boot-current');
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0]?.ownerBootId, 'boot-old');
  s.close();
});

test('memory upserts by stable id and supports supersession', () => {
  const s = store();
  const record = {
    id: 'mem_1', category: 'research' as const, title: 't', content: 'c', tags: ['x'],
    source: 'src', provenance: 'p', confidence: 0.7, verified: false, supersededBy: null,
    taskId: null, createdAt: now(), updatedAt: now(), lastUsedAt: null, useCount: 0,
  };
  s.putMemory(record);
  s.putMemory({ ...record, content: 'updated' });
  assert.equal(s.getMemory('mem_1')?.content, 'updated');
  assert.equal(s.queryMemory({ category: 'research' }).length, 1);
  s.supersedeMemory('mem_1', 'mem_2');
  assert.equal(s.queryMemory({ category: 'research' }).length, 0);
  assert.equal(s.queryMemory({ category: 'research', includeSuperseded: true }).length, 1);
  s.close();
});

test('due schedules are selected by time', () => {
  const s = store();
  const base = {
    name: 'nightly', kind: 'recurring' as const, intervalMs: 60000, lastRunAt: null, enabled: true,
    objective: 'objective', workspace: '/tmp/ws', priority: 'normal' as const, runCount: 0,
    maxRuns: null, createdAt: now(),
  };
  s.putSchedule({ ...base, id: 'sched_past', nextRunAt: '2020-01-01T00:00:00.000Z' });
  s.putSchedule({ ...base, id: 'sched_future', nextRunAt: '2999-01-01T00:00:00.000Z' });
  const due = s.dueSchedules(now());
  assert.deepEqual(due.map((d) => d.id), ['sched_past']);
  s.close();
});

test('usage records accumulate per task', () => {
  const s = store();
  for (let i = 0; i < 3; i++) {
    s.recordUsage({
      id: id('use'), taskId: 't1', runId: 'r1', provider: 'scripted', model: 'm',
      inputTokens: 10, outputTokens: 5, costUsd: null, at: now(), latencyMs: 3, ok: true,
    });
  }
  const usage = s.usageForTask('t1');
  assert.equal(usage.length, 3);
  assert.equal(usage.reduce((sum, u) => sum + u.inputTokens, 0), 30);
  assert.equal(usage[0]?.costUsd, null, 'cost must stay null rather than becoming 0');
  s.close();
});
