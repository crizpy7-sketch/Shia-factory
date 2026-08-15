#!/usr/bin/env node
/**
 * BORIS command line. One binary drives migration, submission, inspection and the services.
 */
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { createRuntime, bootstrap, submitObjective, agentStatus, decideApproval, cancelTask, recoverOutstandingWork } from './runtime.js';
import { WorkerService } from './worker/worker.js';
import { Scheduler } from './scheduler/scheduler.js';
import { startApiServer } from './api/server.js';

const USAGE = `Shia agent runtime

Usage: boris <command> [options]

  migrate                     Create or update the database schema
  bootstrap                   Seed skills and import the primary agent's portable identity into memory
  agents                      List the agents this runtime can host
  submit "<objective>"        Queue an objective   [--agent <ID>] [--workspace <dir>] [--priority high]
  status                      Print agent status
  tasks [status]              List tasks
  task <id>                   Show a task with its evidence and tool calls
  approve <approvalId>        Approve a pending action   [--note "..."]
  reject <approvalId>         Reject a pending action    [--note "..."]
  worker                      Run the worker loop (claims and executes queued tasks)
  scheduler                   Run the scheduler loop
  serve                       Run the API and dashboard
  run                         Run API + worker + scheduler in one process (local development)
  recover                     Requeue work interrupted by a restart
  preflight                   Check identity, storage, workspaces, tooling and the live provider
  acceptance                  Run the full acceptance objective against the configured provider
`;

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

async function main(): Promise<number> {
  const [, , command, ...args] = process.argv;
  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(USAGE);
    return 0;
  }

  const runtime = createRuntime();

  switch (command) {
    case 'migrate': {
      process.stdout.write(`schema ready at ${runtime.config.dbPath}\n`);
      return 0;
    }
    case 'bootstrap': {
      const result = bootstrap(runtime);
      process.stdout.write(`seeded ${result.skills} skills, imported ${result.memories} memories\n`);
      for (const skipped of result.skipped) process.stdout.write(`  skipped: ${skipped}\n`);
      return 0;
    }
    case 'submit': {
      const objective = args.find((a) => !a.startsWith('--'));
      if (!objective) { process.stderr.write('submit needs an objective\n'); return 2; }
      try {
        const task = submitObjective(runtime, objective, {
          ...(flag(args, 'workspace') ? { workspace: flag(args, 'workspace') as string } : {}),
          ...(flag(args, 'priority') ? { priority: flag(args, 'priority') as 'low' | 'normal' | 'high' | 'critical' } : {}),
          ...(flag(args, 'agent') ? { agentId: flag(args, 'agent') as string } : {}),
        });
        process.stdout.write(`${task.id}\t${task.status}\t${task.assignedAgent}\t${task.title}\n`);
        return 0;
      } catch (error) {
        process.stderr.write(`${(error as Error).message}\n`);
        return 2;
      }
    }
    case 'agents': {
      for (const { profile } of runtime.roster.values()) {
        const tools = profile.tools ? `${profile.tools.length} tools` : 'all tools';
        const primary = profile.agentId === runtime.config.agentId ? ' (primary)' : '';
        process.stdout.write(
          `${profile.agentId}\t${profile.identity.displayName}${primary}\t${tools}\t${profile.identity.certificationStatus}\n`);
      }
      process.stdout.write('\nHosting is not certification. No agent above is certified.\n');
      return 0;
    }
    case 'status': {
      process.stdout.write(JSON.stringify(agentStatus(runtime), null, 2) + '\n');
      return 0;
    }
    case 'tasks': {
      const status = args.find((a) => !a.startsWith('--'));
      const tasks = runtime.storage.listTasks(status ? { status: status as never } : {});
      for (const task of tasks) {
        process.stdout.write(`${task.id}\t${task.status}\t${task.attempts}/${task.maxAttempts}\t${task.title}\n`);
      }
      if (!tasks.length) process.stdout.write('(no tasks)\n');
      return 0;
    }
    case 'task': {
      const taskId = args[0];
      if (!taskId) { process.stderr.write('task needs an id\n'); return 2; }
      const task = runtime.storage.getTask(taskId);
      if (!task) { process.stderr.write('task not found\n'); return 1; }
      process.stdout.write(JSON.stringify({
        task,
        runs: runtime.storage.listRuns(task.id),
        toolCalls: runtime.storage.listToolCalls(task.id).map((c) => ({
          tool: c.tool, status: c.status, ok: c.ok, durationMs: c.durationMs,
        })),
      }, null, 2) + '\n');
      return 0;
    }
    case 'approve':
    case 'reject': {
      const approvalId = args[0];
      if (!approvalId) { process.stderr.write(`${command} needs an approval id\n`); return 2; }
      const result = decideApproval(
        runtime, approvalId, command === 'approve' ? 'approved' : 'rejected',
        flag(args, 'by') ?? 'cli-operator', flag(args, 'note') ?? null,
      );
      process.stdout.write(`${result.approval.id} ${result.approval.state}; task ${result.task.id} is ${result.task.status}\n`);
      return 0;
    }
    case 'cancel': {
      const taskId = args[0];
      if (!taskId) { process.stderr.write('cancel needs a task id\n'); return 2; }
      process.stdout.write(`${cancelTask(runtime, taskId).status}\n`);
      return 0;
    }
    case 'recover': {
      const result = recoverOutstandingWork(runtime);
      process.stdout.write(`interrupted runs: ${result.runs}; requeued tasks: ${result.tasks.length}\n`);
      return 0;
    }
    case 'preflight': {
      // Everything that must be true before BORIS is given real work, checked rather than assumed.
      const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
      const record = (name: string, ok: boolean, detail: string): void => { checks.push({ name, ok, detail }); };

      record('identity', runtime.identity.agentId === 'BORIS-001',
        `${runtime.identity.agentId} v${runtime.identity.version} from ${runtime.identity.sourceDir}`);
      record('certification', true,
        `${runtime.identity.certificationStatus} · recertification ${agentStatus(runtime).recertification}`);
      try {
        runtime.storage.listTasks({ limit: 1 });
        record('storage', true, runtime.config.dbPath);
      } catch (error) {
        record('storage', false, (error as Error).message);
      }
      record('workspaces', runtime.config.workspaceRoots.every((root) => existsSync(root)),
        runtime.config.workspaceRoots.join(', '));
      const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
      record('git', git.status === 0, (git.stdout || git.stderr || 'not found').trim());
      const node = process.versions.node.split('.').map(Number);
      record('node', (node[0] ?? 0) > 22 || ((node[0] ?? 0) === 22 && (node[1] ?? 0) >= 5),
        `v${process.versions.node} (needs >= 22.5 for node:sqlite)`);

      const availability = runtime.provider.available();
      record('provider credentials', availability.ok, `${runtime.provider.name}/${runtime.provider.model}: ${availability.reason}`);
      if (runtime.provider.isTestDouble) {
        record('provider is real', false, 'a test double is configured; live work needs BORIS_PROVIDER=anthropic or openai');
      }

      // The only check that costs money: a single minimal completion, to prove the credentials work.
      if (availability.ok && !runtime.provider.isTestDouble) {
        try {
          const started = Date.now();
          const probe = await runtime.provider.complete({
            system: 'Reply with the single word: ready',
            messages: [{ role: 'user', content: [{ type: 'text', text: 'ready check' }] }],
            tools: [], maxOutputTokens: 16, timeoutMs: 30000,
          });
          record('live model call', true,
            `${probe.model} replied in ${Date.now() - started}ms · ${probe.usage.inputTokens}+${probe.usage.outputTokens} tokens · cost ${probe.costUsd === null ? 'not reported' : `$${probe.costUsd.toFixed(6)}`}`);
        } catch (error) {
          record('live model call', false, (error as Error).message);
        }
      }

      for (const check of checks) {
        process.stdout.write(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name.padEnd(20)} ${check.detail}\n`);
      }
      const failed = checks.filter((c) => !c.ok);
      process.stdout.write(failed.length
        ? `\n${failed.length} check(s) failed. BORIS is not ready for live work.\n`
        : '\nAll checks passed. BORIS is ready for live work.\n');
      return failed.length ? 1 : 0;
    }

    case 'acceptance': {
      // The same objective as the automated acceptance test, run against whatever provider is
      // configured — the honest way to find out whether a live model can do this work.
      const fixture = resolve(runtime.config.repoRoot, 'boris', 'fixtures', 'broken-calc');
      if (!existsSync(fixture)) { process.stderr.write('fixture not found\n'); return 1; }
      const root = runtime.config.workspaceRoots[0] as string;
      const workspace = join(root, `acceptance-${Date.now()}`);
      cpSync(fixture, workspace, { recursive: true });
      bootstrap(runtime);

      const objective = 'Inspect this codebase. Determine its architecture. Identify the failing behaviour. '
        + 'Develop a repair plan. Implement the repair. Run the relevant tests. If the tests fail, diagnose and '
        + 'continue repairing until the defined verification criteria pass. Return a concise engineering report with evidence.';
      const task = submitObjective(runtime, objective, { title: 'Acceptance run', workspace, priority: 'high' });
      process.stdout.write(`workspace: ${workspace}\ntask: ${task.id}\nprovider: ${runtime.provider.name}/${runtime.provider.model}`
        + `${runtime.provider.isTestDouble ? ' (TEST DOUBLE — this is not a live-model result)' : ''}\n\n`);

      const { WorkerService } = await import('./worker/worker.js');
      const outcome = await new WorkerService(runtime, { maxTasks: 1 }).runOnce();
      const finalTask = runtime.storage.getTask(task.id);

      process.stdout.write(`status: ${outcome?.status ?? 'no outcome'} · verified: ${outcome?.verified ?? false}\n`);
      process.stdout.write(`turns: ${outcome?.turns ?? 0} · model calls: ${finalTask?.usage.modelCalls ?? 0} · tool calls: ${finalTask?.usage.toolCalls ?? 0}\n`);
      process.stdout.write(`plan: ${finalTask?.plan ? `${finalTask.plan.steps.length} steps` : 'none recorded'}\n\nevidence:\n`);
      for (const item of finalTask?.evidence ?? []) {
        process.stdout.write(`  ${item.ok ? 'ok  ' : 'FAIL'} [${item.kind}] ${item.summary.slice(0, 140)}\n`);
      }

      // Independent check: this process runs the suite itself rather than trusting the report.
      const verify = spawnSync('npm', ['test'], {
        cwd: workspace, encoding: 'utf8',
        env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '/tmp' },
      });
      const repaired = readFileSync(join(workspace, 'src', 'stats.js'), 'utf8');
      process.stdout.write(`\nindependent verification: npm test exited ${verify.status}\n`);
      process.stdout.write(`workspace file changed: ${repaired.includes('% 2 === 0') ? 'yes' : 'no'}\n`);
      process.stdout.write(`\nreport:\n${finalTask?.result ?? finalTask?.error ?? '(none)'}\n`);
      return outcome?.verified && verify.status === 0 ? 0 : 1;
    }

    case 'worker': {
      const controller = new AbortController();
      const worker = new WorkerService(runtime, { signal: controller.signal });
      installShutdown(() => { worker.stop(); controller.abort(); });
      await worker.start();
      return 0;
    }
    case 'scheduler': {
      const controller = new AbortController();
      const scheduler = new Scheduler(runtime, { signal: controller.signal });
      installShutdown(() => { scheduler.stop(); controller.abort(); });
      await scheduler.start();
      return 0;
    }
    case 'serve': {
      const server = await startApiServer(runtime);
      installShutdown(() => server.close());
      await new Promise<void>((resolve) => server.on('close', resolve));
      return 0;
    }
    case 'run': {
      bootstrap(runtime);
      recoverOutstandingWork(runtime);
      const controller = new AbortController();
      const server = await startApiServer(runtime);
      const worker = new WorkerService(runtime, { signal: controller.signal });
      const scheduler = new Scheduler(runtime, { signal: controller.signal });
      installShutdown(() => { worker.stop(); scheduler.stop(); controller.abort(); server.close(); });
      process.stdout.write(`BORIS control center: http://${runtime.config.apiHost}:${runtime.config.apiPort}\n`);
      await Promise.all([worker.start(), scheduler.start()]);
      return 0;
    }
    default:
      process.stderr.write(`unknown command: ${command}\n\n${USAGE}`);
      return 2;
  }
}

function installShutdown(stop: () => void): void {
  let stopping = false;
  const handler = (): void => {
    if (stopping) process.exit(1);
    stopping = true;
    process.stdout.write('\nshutting down…\n');
    stop();
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
}

main()
  .then((code) => { if (code !== 0) process.exitCode = code; })
  .catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
