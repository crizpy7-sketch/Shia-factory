/**
 * Event bus. Every event is persisted first, then fanned out to live subscribers (the dashboard
 * stream). Persistence is the source of truth; subscribers are a convenience.
 */
import { AgentEvent, EventType } from '../domain/types.js';
import { Storage } from '../storage/types.js';
import { id, now } from '../util/ids.js';
import { Logger, redact } from '../util/log.js';

export type EventListener = (event: AgentEvent) => void;

export interface EmitOptions {
  taskId?: string | null;
  runId?: string | null;
  workerId?: string | null;
  toolCallId?: string | null;
  level?: AgentEvent['level'];
  data?: Record<string, unknown>;
}

export class EventBus {
  private readonly listeners = new Set<EventListener>();

  constructor(
    private readonly storage: Storage,
    private readonly logger: Logger,
  ) {}

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type: EventType, summary: string, options: EmitOptions = {}): AgentEvent {
    const event: AgentEvent = {
      id: id('evt'),
      type,
      taskId: options.taskId ?? null,
      runId: options.runId ?? null,
      workerId: options.workerId ?? null,
      toolCallId: options.toolCallId ?? null,
      at: now(),
      level: options.level ?? 'info',
      summary,
      data: (redact(options.data ?? {}) as Record<string, unknown>),
    };
    this.storage.appendEvent(event);
    this.logger.debug(`event ${type}`, { taskId: event.taskId, runId: event.runId, summary });
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.warn('event listener threw', { error: (error as Error).message });
      }
    }
    return event;
  }
}
