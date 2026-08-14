/**
 * The worker process: claims queued tasks and runs them to a terminal state.
 *
 * Claiming is a single atomic statement in storage, so two workers never execute the same task.
 */
import { Runtime, recoverOutstandingWork } from '../runtime.js';
import { RunOutcome } from '../agent/loop.js';

export interface WorkerOptions {
  concurrency?: number;
  pollMs?: number;
  /** Stop after this many tasks. Used by tests and by one-shot runs. */
  maxTasks?: number;
  signal?: AbortSignal;
}

export class WorkerService {
  private active = 0;
  private processed = 0;
  private stopped = false;

  constructor(private readonly runtime: Runtime, private readonly options: WorkerOptions = {}) {}

  get inFlight(): number {
    return this.active;
  }

  /** Claims and runs a single task. Returns null when the queue is empty. */
  async runOnce(): Promise<RunOutcome | null> {
    const task = this.runtime.storage.claimNextTask(['queued'], 'planning');
    if (!task) return null;
    this.active += 1;
    this.runtime.heartbeat = 'working';
    try {
      return await this.runtime.agent.runTask(task.id, {
        ...(this.options.signal ? { signal: this.options.signal } : {}),
      });
    } catch (error) {
      // A crash inside the loop must not lose the task: record it and let the attempt budget decide.
      const message = error instanceof Error ? error.message : String(error);
      this.runtime.logger.error('task run threw', { taskId: task.id, error: message });
      const current = this.runtime.storage.getTask(task.id);
      if (current && current.status !== 'completed' && current.status !== 'cancelled') {
        this.runtime.storage.updateTask(task.id, {
          status: current.attempts >= current.maxAttempts ? 'failed' : 'blocked',
          error: `runtime error: ${message}`,
        });
      }
      this.runtime.bus.emit('task.failed', `runtime error: ${message}`, { taskId: task.id, level: 'error' });
      return null;
    } finally {
      this.active -= 1;
      this.processed += 1;
      this.runtime.heartbeat = this.active > 0 ? 'working' : 'idle';
    }
  }

  /** Long-running loop. Resolves when stopped or when maxTasks is reached. */
  async start(): Promise<void> {
    recoverOutstandingWork(this.runtime);
    const pollMs = this.options.pollMs ?? this.runtime.config.workerPollMs;
    const concurrency = Math.max(1, this.options.concurrency ?? this.runtime.config.limits.maxConcurrentTasks);
    this.runtime.logger.info('worker started', { concurrency, pollMs });

    while (!this.stopped && !this.options.signal?.aborted) {
      if (this.options.maxTasks && this.processed >= this.options.maxTasks) break;
      if (this.active >= concurrency) {
        await this.sleep(pollMs);
        continue;
      }
      const outcome = await this.runOnce();
      if (!outcome) await this.sleep(pollMs);
    }
    this.runtime.logger.info('worker stopped', { processed: this.processed });
  }

  stop(): void {
    this.stopped = true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.options.signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}
