/**
 * Integration: scheduler and HTTP API against a live server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { createApiServer } from '../../src/api/server.js';
import { Scheduler } from '../../src/scheduler/scheduler.js';
import { createSchedule, submitObjective } from '../../src/runtime.js';
import { makeHarness } from '../helpers.js';

// ------------------------------------------------------------- scheduler

test('a one-shot schedule fires once and then disables itself', (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());
  const schedule = createSchedule(h.runtime, {
    name: 'nightly audit', kind: 'once', objective: 'Audit the workspace for reliability risks.',
    workspace: h.workspace, runAt: new Date(Date.now() - 1000).toISOString(),
  });

  const created = new Scheduler(h.runtime).tick();
  assert.equal(created.length, 1);
  assert.equal(h.runtime.storage.getSchedule(schedule.id)?.enabled, false);
  assert.equal(new Scheduler(h.runtime).tick().length, 0, 'a spent one-shot must not fire again');

  const task = h.runtime.storage.getTask(created[0] as string);
  assert.equal(task?.scheduleId, schedule.id);
  assert.equal(task?.status, 'queued');
});

test('a recurring schedule advances its next run instead of firing a backlog', (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());
  const schedule = createSchedule(h.runtime, {
    name: 'hourly sweep', kind: 'recurring', intervalMs: 3_600_000,
    objective: 'Sweep the workspace for regressions.', workspace: h.workspace,
    runAt: new Date(Date.now() - 86_400_000).toISOString(),
  });

  const scheduler = new Scheduler(h.runtime);
  assert.equal(scheduler.tick().length, 1);
  assert.equal(scheduler.tick().length, 0, 'a day of missed runs must not become a burst');

  const after = h.runtime.storage.getSchedule(schedule.id);
  assert.equal(after?.enabled, true);
  assert.equal(after?.runCount, 1);
  assert.ok(Date.parse(after?.nextRunAt ?? '') > Date.now());
});

test('a recurring schedule stops at maxRuns', (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());
  const schedule = createSchedule(h.runtime, {
    name: 'twice only', kind: 'recurring', intervalMs: 1000, maxRuns: 1,
    objective: 'Run a bounded number of times.', workspace: h.workspace,
    runAt: new Date(Date.now() - 1000).toISOString(),
  });
  new Scheduler(h.runtime).tick();
  assert.equal(h.runtime.storage.getSchedule(schedule.id)?.enabled, false);
});

test('a recurring schedule requires a sane interval', (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());
  assert.throws(() => createSchedule(h.runtime, {
    name: 'too fast', kind: 'recurring', intervalMs: 10, objective: 'spin', workspace: h.workspace,
  }), /intervalMs/);
});

// ------------------------------------------------------------------- api

async function json<T = Record<string, never>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function withServer(
  h: ReturnType<typeof makeHarness>,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server = createApiServer(h.runtime);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('the API exposes health, submission, inspection and cancellation', async (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());

  await withServer(h, async (base) => {
    const health = await json<{ ok: boolean; agent: string }>(await fetch(`${base}/api/health`));
    assert.equal(health.ok, true);
    assert.equal(health.agent, 'BORIS-001');

    const created = await fetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ objective: 'Inspect the workspace and report its structure.', workspace: h.workspace }),
    });
    assert.equal(created.status, 201);
    const { task } = await json<{ task: { id: string; status: string } }>(created);
    assert.equal(task.status, 'queued');

    const detail = await json<{ task: { id: string }; events: unknown[] }>(await fetch(`${base}/api/tasks/${task.id}`));
    assert.equal(detail.task.id, task.id);
    assert.ok(Array.isArray(detail.events));

    const status = await json<{ agentId: string; isTestDouble: boolean; recertification: string }>(await fetch(`${base}/api/status`));
    assert.equal(status.agentId, 'BORIS-001');
    assert.equal(status.isTestDouble, true, 'a scripted provider must be reported as a test double');
    assert.equal(status.recertification, 'PENDING');

    const cancelled = await json<{ task: { status: string } }>(await fetch(`${base}/api/tasks/${task.id}/cancel`, { method: 'POST' }));
    assert.equal(cancelled.task.status, 'cancelled');
  });
});

test('the API rejects malformed and oversized input', async (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());

  await withServer(h, async (base) => {
    const short = await fetch(`${base}/api/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ objective: 'too short' }),
    });
    assert.equal(short.status, 400);

    const notJson = await fetch(`${base}/api/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json',
    });
    assert.equal(notJson.status, 400);

    const huge = await fetch(`${base}/api/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ objective: 'x'.repeat(200_000) }),
    });
    assert.ok(huge.status === 400 || huge.status === 413, `expected rejection, got ${huge.status}`);

    const missing = await fetch(`${base}/api/nope`);
    assert.equal(missing.status, 404);
  });
});

test('a workspace outside the authorised roots is refused by the API', async (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());

  await withServer(h, async (base) => {
    const response = await fetch(`${base}/api/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ objective: 'Read every secret on this host.', workspace: '/etc' }),
    });
    assert.equal(response.status, 400);
    assert.match((await json<{ error: string }>(response)).error, /workspace rejected/);
  });
});

test('authentication is enforced on every route except health', async (t) => {
  const h = makeHarness({ config: { apiToken: 'super-secret-token', requireAuth: true } });
  t.after(() => h.cleanup());

  await withServer(h, async (base) => {
    assert.equal((await fetch(`${base}/api/health`)).status, 200, 'health must stay reachable for probes');
    assert.equal((await fetch(`${base}/api/status`)).status, 401);
    assert.equal((await fetch(`${base}/api/status`, { headers: { authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(`${base}/api/status`, { headers: { authorization: 'Bearer super-secret-tokenX' } })).status, 401);
    assert.equal((await fetch(`${base}/api/status`, { headers: { authorization: 'Bearer super-secret-token' } })).status, 200);

    const unauthorisedWrite = await fetch(`${base}/api/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ objective: 'Do something without credentials.' }),
    });
    assert.equal(unauthorisedWrite.status, 401);
  });
});

test('no configuration or credential is exposed through the API', async (t) => {
  const h = makeHarness({ config: { apiToken: 'leak-me-if-you-can' } });
  t.after(() => h.cleanup());

  await withServer(h, async (base) => {
    const bodies = await Promise.all(
      ['/api/status', '/api/health', '/api/identity', '/api/skills', '/api/memory']
        .map(async (path) => (await fetch(`${base}${path}`)).text()),
    );
    for (const body of bodies) {
      assert.doesNotMatch(body, /leak-me-if-you-can/, 'the API token must never appear in a response');
      assert.doesNotMatch(body, /apiKey|ANTHROPIC_API_KEY/, 'credential fields must not be serialised');
    }
  });
});

test('the dashboard and the avatar assets are served', async (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());

  await withServer(h, async (base) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /BORIS-001 Control Center/);

    const avatar = await fetch(`${base}/avatar/sheet`);
    assert.equal(avatar.status, 200);
    assert.equal(avatar.headers.get('content-type'), 'image/png');
    assert.ok(Number(avatar.headers.get('content-length')) > 1000);

    assert.equal((await fetch(`${base}/avatar/../../etc/passwd`)).status, 404);
  });
});

test('approvals can be listed and decided through the API', async (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());
  const task = submitObjective(h.runtime, 'A task that will need authorisation to proceed.', { workspace: h.workspace });
  const approval = h.runtime.storage.createApproval({
    id: 'apr_test', taskId: task.id, runId: null, action: 'deploy to production', tool: null,
    input: {}, reason: 'requested by the agent', risk: 'irreversible', consequence: 'production changes',
    state: 'requested', requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null, decisionNote: null,
  });
  h.runtime.storage.updateTask(task.id, { status: 'awaiting_approval' });

  await withServer(h, async (base) => {
    const pending = await json<{ approvals: unknown[] }>(await fetch(`${base}/api/approvals?state=requested`));
    assert.equal(pending.approvals.length, 1);

    const decided = await fetch(`${base}/api/approvals/${approval.id}/approve`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ by: 'operator', note: 'go ahead' }),
    });
    assert.equal(decided.status, 200);
    const body = await json<{ approval: { state: string }; task: { status: string } }>(decided);
    assert.equal(body.approval.state, 'approved');
    assert.equal(body.task.status, 'queued');

    const again = await fetch(`${base}/api/approvals/${approval.id}/approve`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(again.status, 400, 'an approval must not be decidable twice');
  });
});

test('the event stream delivers live events', async (t) => {
  const h = makeHarness();
  t.after(() => h.cleanup());

  await withServer(h, async (base) => {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/stream`, { signal: controller.signal });
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();

    submitObjective(h.runtime, 'An objective that should appear on the live stream.', { workspace: h.workspace });

    const deadline = Date.now() + 5000;
    let seen = '';
    while (Date.now() < deadline && !seen.includes('task.created')) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += new TextDecoder().decode(value);
    }
    controller.abort();
    assert.match(seen, /task\.created/);
  });
});
