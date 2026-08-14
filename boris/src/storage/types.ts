/**
 * Storage port. The agent core depends on this interface, never on a driver.
 * The SQLite adapter is the reference implementation; a Postgres adapter can be added by
 * implementing this interface without touching the runtime.
 */
import {
  AgentEvent, AgentRun, ApprovalRequest, MemoryRecord, MemoryCategory, ScheduleRecord,
  Skill, Task, TaskStatus, ToolCallRecord, UsageRecord,
} from '../domain/types.js';

export interface TaskQuery {
  status?: TaskStatus | TaskStatus[];
  parentTaskId?: string | null;
  limit?: number;
}

export interface EventQuery {
  taskId?: string;
  sinceId?: string;
  limit?: number;
}

export interface MemoryQuery {
  category?: MemoryCategory;
  tags?: string[];
  text?: string;
  taskId?: string;
  limit?: number;
  includeSuperseded?: boolean;
}

export interface Storage {
  migrate(): void;
  close(): void;

  createTask(task: Task): Task;
  getTask(id: string): Task | null;
  listTasks(query?: TaskQuery): Task[];
  updateTask(id: string, patch: Partial<Task>): Task;
  /**
   * Atomically moves one runnable task out of the queue. Returns null when nothing is claimable.
   * This is what prevents two workers from executing the same task.
   */
  claimNextTask(statuses: TaskStatus[], claimedStatus: TaskStatus): Task | null;
  countTasks(status: TaskStatus): number;

  createRun(run: AgentRun): AgentRun;
  getRun(id: string): AgentRun | null;
  updateRun(id: string, patch: Partial<AgentRun>): AgentRun;
  listRuns(taskId: string): AgentRun[];
  /** Runs recorded as running by a boot id that is no longer alive. */
  findOrphanedRuns(currentBootId: string): AgentRun[];

  appendEvent(event: AgentEvent): AgentEvent;
  listEvents(query?: EventQuery): AgentEvent[];

  recordToolCall(call: ToolCallRecord): ToolCallRecord;
  updateToolCall(id: string, patch: Partial<ToolCallRecord>): ToolCallRecord;
  listToolCalls(taskId: string): ToolCallRecord[];

  createApproval(request: ApprovalRequest): ApprovalRequest;
  getApproval(id: string): ApprovalRequest | null;
  listApprovals(state?: ApprovalRequest['state']): ApprovalRequest[];
  decideApproval(id: string, state: 'approved' | 'rejected', by: string, note: string | null): ApprovalRequest;
  findPendingApprovalForTask(taskId: string): ApprovalRequest | null;

  putMemory(record: MemoryRecord): MemoryRecord;
  getMemory(id: string): MemoryRecord | null;
  queryMemory(query: MemoryQuery): MemoryRecord[];
  touchMemory(ids: string[]): void;
  supersedeMemory(id: string, bySupersedingId: string): void;

  putSkill(skill: Skill): Skill;
  listSkills(): Skill[];
  getSkill(name: string): Skill | null;

  putSchedule(schedule: ScheduleRecord): ScheduleRecord;
  listSchedules(onlyEnabled?: boolean): ScheduleRecord[];
  getSchedule(id: string): ScheduleRecord | null;
  updateSchedule(id: string, patch: Partial<ScheduleRecord>): ScheduleRecord;
  dueSchedules(atIso: string): ScheduleRecord[];

  recordUsage(usage: UsageRecord): UsageRecord;
  usageForTask(taskId: string): UsageRecord[];
}
