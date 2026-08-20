/**
 * End-to-end acceptance: the same path a real operator uses.
 *
 * Objectives are submitted through the CLI, executed by a worker in a separate OS process, and the
 * worker is killed mid-flight to prove that outstanding work survives a restart. Nothing in this
 * file reaches into the agent internals — it observes the database and the filesystem, like an
 * operator would.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SqliteStorage } from '../../src/storage/sqlite.js';
import { FIXTURE, REPO_ROOT, waitFor } from '../helpers.js';

const CLI = resolve(REPO_ROOT, 'boris', 'dist', 'src', 'cli.js');
const OBJECTIVE =
  'Inspect this codebase. Determine its architecture. Identify the failing behaviour. Develop a repair plan. ' +
  'Implement the repair. Run the relevant tests. If the tests fail, diagnose and continue repairing until the ' +
  'defined verification criteria pass. Return a concise engineering report with evidence.';

interface Env {
  root: string;
  workspace: string;
  dbPath: string;
  env: NodeJS.ProcessEnv;
}

function setup(): Env {
  const root = mkdtempSync(join(tmpdir(), 'boris-e2e-'));
  const workspace = join(root, 'workspace');
  cpSync(FIXTURE, workspace, { recursive: true });
  const dbPath = join(root, 'boris.db');
  return {
    root, workspace, dbPath,
    env: {
      PATH: process.env['PATH'] ?? '',
      HOME: process.env['HOME'] ?? '/tmp',
      BORIS_REPO_ROOT: REPO_ROOT,
      BORIS_DB_PATH: dbPath,
      BORIS_WORKSPACE_ROOTS: workspace,
      BORIS_LOG_LEVEL: 'error',
      BORIS_WORKER_POLL_MS: '100',
      // The scripted provider is a test double and refuses to load without this explicit opt-in.
      BORIS_ALLOW_TEST_PROVIDER: 'true',
      BORIS_PROVIDER: 'scripted',
      BORIS_SCRIPT: 'fixture-repair',
    },
  };
}

function cli(env: Env, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [CLI, ...args], { env: env.env, encoding: 'utf8', cwd: env.root });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function openDb(env: Env): SqliteStorage {
  const storage = new SqliteStorage(env.dbPath);
  storage.migrate();
  return storage;
}

test('acceptance: an objective submitted through the CLI is executed, killed mid-run, recovered and completed', async (t) => {
  const env = setup();
  t.after(() => rmSync(env.root, { recursive: true, force: true }));

  // ---------------------------------------------------------- 1. operator setup
  assert.equal(cli(env, ['migrate']).status, 0);
  const bootstrapped = cli(env, ['bootstrap']);
  assert.equal(bootstrapped.status, 0);
  assert.match(bootstrapped.stdout, /seeded \d+ skills, imported \d+ memories/);
  assert.match(bootstrapped.stdout, /failure_library\.jsonl \(empty/, 'empty ledgers must be reported, not invented');

  // ------------------------------------------------------- 2. submit the work
  const submitted = cli(env, ['submit', OBJECTIVE, '--workspace', env.workspace]);
  assert.equal(submitted.status, 0, submitted.stderr);
  const taskId = submitted.stdout.split('\t')[0] as string;
  assert.match(taskId, /^task_/);

  let db = openDb(env);
  assert.equal(db.getTask(taskId)?.status, 'queued');

  // The defect is present before BORIS touches it.
  const before = spawnSync('npm', ['test'], { cwd: env.workspace, encoding: 'utf8', env: env.env });
  assert.equal(before.status, 1, 'the fixture should start out failing');

  // ------------------------------------- 3. run a worker and kill it mid-flight
  let worker: ChildProcess = spawn('node', [CLI, 'worker'], { env: env.env, cwd: env.root, stdio: 'ignore' });
  const killed = { pid: worker.pid };

  await waitFor(() => db.listToolCalls(taskId).length >= 1, {
    timeoutMs: 30000, what: 'the worker to start doing real work',
  });
  const toolCallsBeforeKill = db.listToolCalls(taskId).length;
  worker.kill('SIGKILL');
  await new Promise<void>((r) => worker.on('exit', () => r()));
  assert.ok(killed.pid, 'the worker process should have had a pid');

  // The task is mid-flight and its run is still marked running by a boot that no longer exists.
  db.close();
  db = openDb(env);
  const interrupted = db.getTask(taskId);
  assert.ok(interrupted);
  assert.ok(['planning', 'working', 'verifying'].includes(interrupted.status),
    `expected outstanding work, found ${interrupted.status}`);
  const runsAfterKill = db.listRuns(taskId);
  assert.ok(runsAfterKill.some((r) => r.status === 'running'), 'the killed run should still be marked running');

  // -------------------------------------------- 4. restart and recover the work
  const recovered = cli(env, ['recover']);
  assert.equal(recovered.status, 0);
  assert.match(recovered.stdout, /interrupted runs: [1-9]/);

  db.close();
  db = openDb(env);
  assert.equal(db.getTask(taskId)?.status, 'queued', 'the outstanding task should be back in the queue');
  assert.ok(db.listRuns(taskId).some((r) => r.status === 'interrupted'));

  worker = spawn('node', [CLI, 'worker'], { env: env.env, cwd: env.root, stdio: 'ignore' });
  t.after(() => worker.kill('SIGKILL'));

  await waitFor(() => {
    db.close();
    db = openDb(env);
    const status = db.getTask(taskId)?.status;
    return status === 'completed' || status === 'failed';
  }, { timeoutMs: 60000, intervalMs: 250, what: 'the recovered task to reach a terminal state' });

  // ------------------------------------------------------------- 5. the evidence
  const finalTask = db.getTask(taskId);
  assert.ok(finalTask);
  assert.equal(finalTask.status, 'completed', `task ended ${finalTask.status}: ${finalTask.error}`);
  assert.ok(finalTask.attempts >= 2, 'the recovered task should record more than one attempt');

  // Files really changed.
  const source = readFileSync(join(env.workspace, 'src', 'stats.js'), 'utf8');
  assert.match(source, /sorted\.length % 2 === 0/, 'the defect was not repaired on disk');

  // The project really passes now, verified by this test, not by the agent.
  const after = spawnSync('npm', ['test'], { cwd: env.workspace, encoding: 'utf8', env: env.env });
  assert.equal(after.status, 0, `the repaired fixture still fails:\n${after.stdout}${after.stderr}`);
  assert.match(`${after.stdout}${after.stderr}`, /pass 4/);

  // Real tools were used, and more of them than had run before the kill.
  const calls = db.listToolCalls(taskId);
  assert.ok(calls.length > toolCallsBeforeKill, 'no work happened after recovery');
  for (const tool of ['fs_list', 'fs_read', 'dev', 'fs_edit', 'report_result']) {
    assert.ok(calls.some((c) => c.tool === tool), `missing ${tool} in ${calls.map((c) => c.tool).join(', ')}`);
  }

  // The state machine went through plan → act → verify → repair → verify.
  const events = db.listEvents({ taskId, limit: 1000 }).map((e) => e.type);
  for (const expected of ['task.created', 'run.started', 'run.interrupted', 'task.recovered',
    'tool.completed', 'verification.started', 'verification.failed', 'repair.started',
    'verification.passed', 'task.completed']) {
    assert.ok(events.includes(expected as never), `expected a ${expected} event`);
  }

  // Usage is recorded per model call.
  const usage = db.usageForTask(taskId);
  assert.ok(usage.length > 0);
  assert.ok(usage.every((u) => u.provider === 'scripted'), 'the run must be attributed to the provider that ran it');

  // The report survives in storage and names what was verified.
  assert.match(String(finalTask.result), /median/i);
  assert.ok(finalTask.evidence.some((e) => e.kind === 'verification' && e.ok));

  // The CLI can read it all back.
  const inspected = cli(env, ['task', taskId]);
  assert.equal(inspected.status, 0);
  assert.match(inspected.stdout, /"status": "completed"/);

  db.close();
});

test('acceptance: the runtime refuses to start with a test provider unless explicitly allowed', () => {
  const env = setup();
  try {
    const blocked = spawnSync('node', [CLI, 'status'], {
      env: { ...env.env, BORIS_ALLOW_TEST_PROVIDER: '' }, encoding: 'utf8', cwd: env.root,
    });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /test double/);
  } finally {
    rmSync(env.root, { recursive: true, force: true });
  }
});

test('acceptance: with no credentials the real provider reports itself unavailable instead of pretending', () => {
  const env = setup();
  try {
    const result = spawnSync('node', [CLI, 'status'], {
      env: { ...env.env, BORIS_PROVIDER: 'anthropic', BORIS_ALLOW_TEST_PROVIDER: '' },
      encoding: 'utf8', cwd: env.root,
    });
    assert.equal(result.status, 0, result.stderr);
    const status = JSON.parse(result.stdout) as { provider: string; providerAvailable: boolean; certification: string };
    assert.equal(status.provider, 'anthropic');
    assert.equal(status.providerAvailable, false, 'without an API key the provider must report unavailable');
    assert.match(status.certification, /PENDING/);
  } finally {
    rmSync(env.root, { recursive: true, force: true });
  }
});

test('acceptance: the API and dashboard come up and report real state', async (t) => {
  const env = setup();
  t.after(() => rmSync(env.root, { recursive: true, force: true }));
  cli(env, ['migrate']);

  const port = 8790 + Math.floor(Math.random() * 200);
  const server = spawn('node', [CLI, 'serve'], {
    env: { ...env.env, BORIS_PORT: String(port) }, cwd: env.root, stdio: 'ignore',
  });
  t.after(() => server.kill('SIGKILL'));

  await waitFor(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/api/health`)).ok;
    } catch {
      return false;
    }
  }, { timeoutMs: 15000, what: 'the API to accept connections' });

  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json() as { ok: boolean; agent: string };
  assert.equal(health.ok, true);
  assert.equal(health.agent, 'BORIS-001');

  const page = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /BORIS-001 Control Center/);
  assert.match(html, /avatar\/sheet/, 'the dashboard should render the shipped avatar sprite sheet');

  const submitted = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objective: OBJECTIVE, workspace: env.workspace }),
  });
  assert.equal(submitted.status, 201);

  const status = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json() as {
    queueDepth: number; isTestDouble: boolean; recertification: string;
  };
  assert.equal(status.queueDepth, 1, 'the dashboard must show the real queue depth');
  assert.equal(status.isTestDouble, true);
  assert.equal(status.recertification, 'PENDING');
});

test('the fixture in the repository keeps its defect so the acceptance test stays meaningful', () => {
  const source = readFileSync(join(FIXTURE, 'src', 'stats.js'), 'utf8');
  assert.match(source, /return sorted\[middle\];/, 'the fixture defect was repaired in the repository');
  assert.equal(existsSync(join(FIXTURE, 'test', 'stats.test.js')), true);
});
