#!/usr/bin/env node
/**
 * BORIS command line. One binary drives migration, submission, inspection and the services.
 */
import { createRuntime, bootstrap, submitObjective, agentStatus, decideApproval, cancelTask, recoverOutstandingWork } from './runtime.js';
import { WorkerService } from './worker/worker.js';
import { Scheduler } from './scheduler/scheduler.js';
import { startApiServer } from './api/server.js';

const USAGE = `BORIS-001 runtime

Usage: boris <command> [options]

  migrate                     Create or update the database schema
  bootstrap                   Seed skills and import BORIS's portable identity into memory
  submit "<objective>"        Queue an objective   [--workspace <dir>] [--priority high]
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
      const task = submitObjective(runtime, objective, {
        ...(flag(args, 'workspace') ? { workspace: flag(args, 'workspace') as string } : {}),
        ...(flag(args, 'priority') ? { priority: flag(args, 'priority') as 'low' | 'normal' | 'high' | 'critical' } : {}),
      });
      process.stdout.write(`${task.id}\t${task.status}\t${task.title}\n`);
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
