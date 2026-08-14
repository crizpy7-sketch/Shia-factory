/**
 * Durable scheduler. State lives in the database, so a restart resumes the schedule instead of
 * losing it, and nothing depends on a browser being open.
 */
import { ScheduleRecord } from '../domain/types.js';
import { Runtime, submitObjective } from '../runtime.js';
import { now } from '../util/ids.js';

export interface SchedulerOptions {
  pollMs?: number;
  signal?: AbortSignal;
}

export class Scheduler {
  private stopped = false;

  constructor(private readonly runtime: Runtime, private readonly options: SchedulerOptions = {}) {}

  /** Fires every due schedule once. Returns the tasks it created. */
  tick(atIso: string = now()): string[] {
    const created: string[] = [];
    for (const schedule of this.runtime.storage.dueSchedules(atIso)) {
      try {
        const task = submitObjective(this.runtime, schedule.objective, {
          title: `[scheduled] ${schedule.name}`,
          workspace: schedule.workspace,
          priority: schedule.priority,
          scheduleId: schedule.id,
        });
        created.push(task.id);
        this.runtime.bus.emit('schedule.fired', `${schedule.name} created task ${task.id}`, {
          taskId: task.id, data: { scheduleId: schedule.id, kind: schedule.kind },
        });
        this.advance(schedule, atIso);
      } catch (error) {
        this.runtime.logger.error('schedule failed to fire', {
          scheduleId: schedule.id, error: (error as Error).message,
        });
        this.runtime.storage.updateSchedule(schedule.id, { enabled: false, lastRunAt: atIso });
      }
    }
    return created;
  }

  private advance(schedule: ScheduleRecord, atIso: string): void {
    const runCount = schedule.runCount + 1;
    const exhausted = schedule.maxRuns !== null && runCount >= schedule.maxRuns;
    if (schedule.kind === 'once' || exhausted || !schedule.intervalMs) {
      this.runtime.storage.updateSchedule(schedule.id, {
        enabled: false, lastRunAt: atIso, runCount,
      });
      return;
    }
    // Anchor the next run to now, so a stalled scheduler does not fire a backlog on restart.
    this.runtime.storage.updateSchedule(schedule.id, {
      lastRunAt: atIso,
      runCount,
      nextRunAt: new Date(Date.parse(atIso) + schedule.intervalMs).toISOString(),
    });
  }

  async start(): Promise<void> {
    const pollMs = this.options.pollMs ?? this.runtime.config.schedulerPollMs;
    this.runtime.logger.info('scheduler started', { pollMs });
    while (!this.stopped && !this.options.signal?.aborted) {
      try {
        this.tick();
      } catch (error) {
        this.runtime.logger.error('scheduler tick failed', { error: (error as Error).message });
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollMs);
        this.options.signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    this.runtime.logger.info('scheduler stopped');
  }

  stop(): void {
    this.stopped = true;
  }
}
