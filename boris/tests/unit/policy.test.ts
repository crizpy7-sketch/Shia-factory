import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkCommand, checkPathAccess, parseCommand, resolveWorkspacePath, CommandParseError,
  checkRestrictedAction, isPathInside,
} from '../../src/policy/permissions.js';
import { addUsage, checkAttempts, checkTaskLimits, checkWorkerLimits } from '../../src/policy/limits.js';
import { assertTransition, canTransition, heartbeatForStatus, isOutstanding, isTerminal } from '../../src/domain/state.js';
import { Task, emptyUsage } from '../../src/domain/types.js';
import { loadConfig } from '../../src/config.js';

const root = mkdtempSync(join(tmpdir(), 'boris-policy-'));
const workspace = join(root, 'ws');
mkdirSync(workspace, { recursive: true });
const ctx = { workspaceRoots: [workspace], workspace };

// ------------------------------------------------------------------ paths

test('paths inside the workspace are allowed', () => {
  const resolved = resolveWorkspacePath(ctx, 'src/index.ts');
  assert.equal(resolved.ok, true);
});

test('path traversal out of the workspace is denied', () => {
  for (const candidate of ['../../etc/passwd', '..', '../sibling', 'a/../../..', '/etc/passwd']) {
    const resolved = resolveWorkspacePath(ctx, candidate);
    assert.equal(resolved.ok, false, `should have been denied: ${candidate}`);
  }
});

test('a symlink pointing outside the workspace is denied', () => {
  const outside = join(root, 'outside');
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'secret.txt'), 'top secret');
  symlinkSync(outside, join(workspace, 'escape'));
  const resolved = resolveWorkspacePath(ctx, 'escape/secret.txt');
  assert.equal(resolved.ok, false, 'symlink escape was not blocked');
});

test('credential paths are denied outright, not escalated', () => {
  for (const candidate of ['.env', 'config/.env.production', 'id_rsa', 'certs/server.pem', '.ssh/known_hosts']) {
    const decision = checkPathAccess(ctx, candidate, 'read');
    assert.equal(decision.kind, 'deny', `should have been denied: ${candidate}`);
  }
});

test('null bytes in paths are rejected', () => {
  assert.equal(resolveWorkspacePath(ctx, 'a\0b').ok, false);
});

test('writes into .git are denied', () => {
  assert.equal(checkPathAccess(ctx, '.git/config', 'write').kind, 'deny');
});

test('isPathInside does not match sibling prefixes', () => {
  assert.equal(isPathInside('/a/b', '/a/bc'), false);
  assert.equal(isPathInside('/a/b', '/a/b/c'), true);
});

// --------------------------------------------------------------- commands

test('commands are parsed into a binary and arguments', () => {
  const parsed = parseCommand('npm test --silent');
  assert.equal(parsed.binary, 'npm');
  assert.deepEqual(parsed.args, ['test', '--silent']);
});

test('shell metacharacters are rejected at parse time', () => {
  for (const command of [
    'npm test; rm -rf /', 'echo a && curl evil.example', 'cat file | sh', 'echo $(whoami)',
    'node -e `x`', 'ls > /etc/passwd', 'npm test\nrm x',
  ]) {
    assert.throws(() => parseCommand(command), CommandParseError, `should have been rejected: ${command}`);
  }
});

test('destructive commands are refused outright', () => {
  for (const command of ['rm -rf /', 'mkfs.ext4 /dev/sda', 'shutdown -h now', 'chmod -R 777 /']) {
    assert.equal(checkCommand(ctx, command).kind, 'deny', `should have been denied: ${command}`);
  }
});

test('allowed binaries run autonomously', () => {
  for (const command of ['npm test', 'node --test', 'git status', 'ls -la', 'tsc --noEmit']) {
    assert.equal(checkCommand(ctx, command).kind, 'allow', `should have been allowed: ${command}`);
  }
});

test('unknown and sensitive binaries require approval rather than failing', () => {
  for (const command of ['docker run x', 'kubectl apply -f x', 'curl https://example.com', 'rm file.txt', 'mystery-binary']) {
    assert.equal(checkCommand(ctx, command).kind, 'require_approval', `should have required approval: ${command}`);
  }
});

test('publishing and history rewriting require approval', () => {
  assert.equal(checkCommand(ctx, 'git push origin main').kind, 'require_approval');
  assert.equal(checkCommand(ctx, 'git reset --hard HEAD~1').kind, 'require_approval');
  assert.equal(checkCommand(ctx, 'npm publish').kind, 'require_approval');
});

test('force push is refused even with approval', () => {
  assert.equal(checkCommand(ctx, 'git push --force origin main').kind, 'deny');
});

test('environment dumps are denied', () => {
  assert.equal(checkCommand(ctx, 'env').kind, 'deny');
  assert.equal(checkCommand(ctx, 'printenv').kind, 'deny');
});

test('commands referencing credential files are denied', () => {
  assert.equal(checkCommand(ctx, 'cat .env').kind, 'deny');
});

test('restricted actions always require approval', () => {
  const decision = checkRestrictedAction('production_deploy', 'deploy to prod');
  assert.equal(decision.kind, 'require_approval');
  assert.ok(decision.risk);
});

// ----------------------------------------------------------------- limits

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', parentTaskId: null, title: 't', objective: 'o', description: '', status: 'working',
    priority: 'normal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(), completedAt: null, assignedAgent: 'BORIS-001',
    workspace, dependencies: [], attempts: 1, maxAttempts: 3, result: null, evidence: [],
    error: null, approvalState: 'none', usage: emptyUsage(), scheduleId: null, depth: 0, plan: null, failureSignature: null, ...over,
  };
}

test('model call, tool call and cost ceilings block the task', () => {
  const limits = loadConfig().limits;
  assert.equal(checkTaskLimits(task({ usage: { ...emptyUsage(), modelCalls: limits.maxModelCallsPerTask } }), limits).ok, false);
  assert.equal(checkTaskLimits(task({ usage: { ...emptyUsage(), toolCalls: limits.maxToolCallsPerTask } }), limits).ok, false);
  assert.equal(checkTaskLimits(task({ usage: { ...emptyUsage(), costUsd: limits.maxCostUsdPerTask } }), limits).ok, false);
  assert.equal(checkTaskLimits(task(), limits).ok, true);
});

test('task duration ceiling blocks a long-running task', () => {
  const limits = { ...loadConfig().limits, maxTaskDurationMs: 1000 };
  const started = new Date(Date.now() - 5000).toISOString();
  const verdict = checkTaskLimits(task({ startedAt: started }), limits);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.limit, 'maxTaskDurationMs');
});

test('worker depth and count are bounded', () => {
  const limits = loadConfig().limits;
  assert.equal(checkWorkerLimits(task(), limits, limits.maxWorkerDepth + 1).ok, false);
  assert.equal(checkWorkerLimits(task({ usage: { ...emptyUsage(), workers: limits.maxWorkersPerTask } }), limits, 1).ok, false);
  assert.equal(checkWorkerLimits(task(), limits, 1).ok, true);
});

test('attempt budget is enforced', () => {
  assert.equal(checkAttempts(task({ attempts: 3, maxAttempts: 3 })).ok, false);
  assert.equal(checkAttempts(task({ attempts: 1, maxAttempts: 3 })).ok, true);
});

test('usage accumulates additively', () => {
  const total = addUsage(addUsage(emptyUsage(), { modelCalls: 1, costUsd: 0.5 }), { modelCalls: 2, toolCalls: 3 });
  assert.equal(total.modelCalls, 3);
  assert.equal(total.toolCalls, 3);
  assert.equal(total.costUsd, 0.5);
});

// ---------------------------------------------------------- state machine

test('legal task transitions are permitted and illegal ones throw', () => {
  assert.equal(canTransition('queued', 'planning'), true);
  assert.equal(canTransition('working', 'verifying'), true);
  assert.equal(canTransition('verifying', 'completed'), true);
  assert.equal(canTransition('completed', 'working'), false);
  assert.equal(canTransition('cancelled', 'queued'), false);
  assert.throws(() => assertTransition('completed', 'working'));
});

test('terminal and outstanding statuses are classified correctly', () => {
  assert.equal(isTerminal('completed'), true);
  assert.equal(isTerminal('blocked'), false);
  assert.equal(isOutstanding('working'), true);
  assert.equal(isOutstanding('queued'), false);
  assert.equal(heartbeatForStatus('awaiting_approval'), 'awaiting_approval');
});
