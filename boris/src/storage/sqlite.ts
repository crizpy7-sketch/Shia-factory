/**
 * SQLite storage adapter (node:sqlite — no external driver).
 *
 * Schema is intentionally plain: TEXT/INTEGER/REAL columns with JSON in TEXT, so the same
 * migrations port to Postgres with only type-name changes.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  AgentEvent, AgentRun, ApprovalRequest, MemoryRecord, ScheduleRecord, Skill, Task,
  TaskStatus, ToolCallRecord, UsageRecord, UsageTotals, Evidence, emptyUsage,
} from '../domain/types.js';
import { Storage, TaskQuery, EventQuery, MemoryQuery } from './types.js';

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS tasks (
     id TEXT PRIMARY KEY,
     parent_task_id TEXT,
     title TEXT NOT NULL,
     objective TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL,
     priority TEXT NOT NULL DEFAULT 'normal',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     started_at TEXT,
     completed_at TEXT,
     assigned_agent TEXT NOT NULL,
     workspace TEXT NOT NULL,
     dependencies TEXT NOT NULL DEFAULT '[]',
     attempts INTEGER NOT NULL DEFAULT 0,
     max_attempts INTEGER NOT NULL DEFAULT 3,
     result TEXT,
     evidence TEXT NOT NULL DEFAULT '[]',
     error TEXT,
     approval_state TEXT NOT NULL DEFAULT 'none',
     usage TEXT NOT NULL,
     schedule_id TEXT,
     depth INTEGER NOT NULL DEFAULT 0
   );`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, priority, created_at);`,
  `CREATE TABLE IF NOT EXISTS runs (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL,
     agent_id TEXT NOT NULL,
     role TEXT NOT NULL,
     status TEXT NOT NULL,
     started_at TEXT NOT NULL,
     ended_at TEXT,
     provider TEXT NOT NULL,
     model TEXT NOT NULL,
     turns INTEGER NOT NULL DEFAULT 0,
     parent_run_id TEXT,
     depth INTEGER NOT NULL DEFAULT 0,
     usage TEXT NOT NULL,
     error TEXT,
     heartbeat TEXT NOT NULL DEFAULT 'idle',
     owner_pid INTEGER NOT NULL,
     owner_boot_id TEXT NOT NULL
   );`,
  `CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(task_id);`,
  `CREATE TABLE IF NOT EXISTS events (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     id TEXT NOT NULL UNIQUE,
     type TEXT NOT NULL,
     task_id TEXT,
     run_id TEXT,
     worker_id TEXT,
     tool_call_id TEXT,
     at TEXT NOT NULL,
     level TEXT NOT NULL,
     summary TEXT NOT NULL,
     data TEXT NOT NULL
   );`,
  `CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id, seq);`,
  `CREATE TABLE IF NOT EXISTS tool_calls (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL,
     run_id TEXT NOT NULL,
     tool TEXT NOT NULL,
     input TEXT NOT NULL,
     status TEXT NOT NULL,
     started_at TEXT NOT NULL,
     ended_at TEXT,
     duration_ms INTEGER,
     ok INTEGER,
     output TEXT,
     error TEXT
   );`,
  `CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);`,
  `CREATE TABLE IF NOT EXISTS approvals (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL,
     run_id TEXT,
     action TEXT NOT NULL,
     tool TEXT,
     input TEXT NOT NULL,
     reason TEXT NOT NULL,
     risk TEXT NOT NULL,
     consequence TEXT NOT NULL,
     state TEXT NOT NULL,
     requested_at TEXT NOT NULL,
     decided_at TEXT,
     decided_by TEXT,
     decision_note TEXT
   );`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_state ON approvals(state);`,
  `CREATE TABLE IF NOT EXISTS memory (
     id TEXT PRIMARY KEY,
     category TEXT NOT NULL,
     title TEXT NOT NULL,
     content TEXT NOT NULL,
     tags TEXT NOT NULL DEFAULT '[]',
     source TEXT NOT NULL,
     provenance TEXT NOT NULL,
     confidence REAL NOT NULL DEFAULT 0.5,
     verified INTEGER NOT NULL DEFAULT 0,
     superseded_by TEXT,
     task_id TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     last_used_at TEXT,
     use_count INTEGER NOT NULL DEFAULT 0
   );`,
  `CREATE INDEX IF NOT EXISTS idx_memory_category ON memory(category, superseded_by);`,
  `CREATE TABLE IF NOT EXISTS skills (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     purpose TEXT NOT NULL,
     version TEXT NOT NULL,
     triggers TEXT NOT NULL DEFAULT '[]',
     required_tools TEXT NOT NULL DEFAULT '[]',
     instructions TEXT NOT NULL,
     verification TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL,
     source TEXT NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS schedules (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     kind TEXT NOT NULL,
     interval_ms INTEGER,
     next_run_at TEXT NOT NULL,
     last_run_at TEXT,
     enabled INTEGER NOT NULL DEFAULT 1,
     objective TEXT NOT NULL,
     workspace TEXT NOT NULL,
     priority TEXT NOT NULL DEFAULT 'normal',
     run_count INTEGER NOT NULL DEFAULT 0,
     max_runs INTEGER,
     created_at TEXT NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS usage (
     id TEXT PRIMARY KEY,
     task_id TEXT,
     run_id TEXT,
     provider TEXT NOT NULL,
     model TEXT NOT NULL,
     input_tokens INTEGER NOT NULL DEFAULT 0,
     output_tokens INTEGER NOT NULL DEFAULT 0,
     cost_usd REAL,
     at TEXT NOT NULL,
     latency_ms INTEGER NOT NULL DEFAULT 0,
     ok INTEGER NOT NULL DEFAULT 1
   );`,
  `CREATE INDEX IF NOT EXISTS idx_usage_task ON usage(task_id);`,
];

type Row = Record<string, unknown>;

const str = (row: Row, key: string): string => String(row[key] ?? '');
const strOrNull = (row: Row, key: string): string | null => (row[key] == null ? null : String(row[key]));
const int = (row: Row, key: string): number => Number(row[key] ?? 0);
const bool = (row: Row, key: string): boolean => Number(row[key] ?? 0) === 1;

function json<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class SqliteStorage implements Storage {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
  }

  migrate(): void {
    for (const sql of MIGRATIONS) this.db.exec(sql);
    const row = this.db.prepare('SELECT version FROM schema_version LIMIT 1').get() as Row | undefined;
    if (!row) this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(MIGRATIONS.length);
    else this.db.prepare('UPDATE schema_version SET version = ?').run(MIGRATIONS.length);
  }

  close(): void {
    this.db.close();
  }

  // ---------------------------------------------------------------- tasks

  private toTask(row: Row): Task {
    return {
      id: str(row, 'id'),
      parentTaskId: strOrNull(row, 'parent_task_id'),
      title: str(row, 'title'),
      objective: str(row, 'objective'),
      description: str(row, 'description'),
      status: str(row, 'status') as TaskStatus,
      priority: str(row, 'priority') as Task['priority'],
      createdAt: str(row, 'created_at'),
      updatedAt: str(row, 'updated_at'),
      startedAt: strOrNull(row, 'started_at'),
      completedAt: strOrNull(row, 'completed_at'),
      assignedAgent: str(row, 'assigned_agent'),
      workspace: str(row, 'workspace'),
      dependencies: json<string[]>(row['dependencies'], []),
      attempts: int(row, 'attempts'),
      maxAttempts: int(row, 'max_attempts'),
      result: strOrNull(row, 'result'),
      evidence: json<Evidence[]>(row['evidence'], []),
      error: strOrNull(row, 'error'),
      approvalState: str(row, 'approval_state') as Task['approvalState'],
      usage: json<UsageTotals>(row['usage'], emptyUsage()),
      scheduleId: strOrNull(row, 'schedule_id'),
      depth: int(row, 'depth'),
    };
  }

  createTask(task: Task): Task {
    this.db.prepare(`INSERT INTO tasks (
      id, parent_task_id, title, objective, description, status, priority, created_at, updated_at,
      started_at, completed_at, assigned_agent, workspace, dependencies, attempts, max_attempts,
      result, evidence, error, approval_state, usage, schedule_id, depth
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      task.id, task.parentTaskId, task.title, task.objective, task.description, task.status,
      task.priority, task.createdAt, task.updatedAt, task.startedAt, task.completedAt,
      task.assignedAgent, task.workspace, JSON.stringify(task.dependencies), task.attempts,
      task.maxAttempts, task.result, JSON.stringify(task.evidence), task.error,
      task.approvalState, JSON.stringify(task.usage), task.scheduleId, task.depth,
    );
    return task;
  }

  getTask(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toTask(row) : null;
  }

  listTasks(query: TaskQuery = {}): Task[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      clauses.push(`status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    if (query.parentTaskId !== undefined) {
      if (query.parentTaskId === null) clauses.push('parent_task_id IS NULL');
      else { clauses.push('parent_task_id = ?'); params.push(query.parentTaskId); }
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(query.limit ?? 200, 1000);
    const rows = this.db.prepare(
      `SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT ?`,
    ).all(...(params as never[]), limit) as Row[];
    return rows.map((r) => this.toTask(r));
  }

  updateTask(id: string, patch: Partial<Task>): Task {
    const current = this.getTask(id);
    if (!current) throw new Error(`Task not found: ${id}`);
    const next: Task = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.db.prepare(`UPDATE tasks SET
      parent_task_id=?, title=?, objective=?, description=?, status=?, priority=?, updated_at=?,
      started_at=?, completed_at=?, assigned_agent=?, workspace=?, dependencies=?, attempts=?,
      max_attempts=?, result=?, evidence=?, error=?, approval_state=?, usage=?, schedule_id=?, depth=?
      WHERE id=?`).run(
      next.parentTaskId, next.title, next.objective, next.description, next.status, next.priority,
      next.updatedAt, next.startedAt, next.completedAt, next.assignedAgent, next.workspace,
      JSON.stringify(next.dependencies), next.attempts, next.maxAttempts, next.result,
      JSON.stringify(next.evidence), next.error, next.approvalState, JSON.stringify(next.usage),
      next.scheduleId, next.depth, id,
    );
    return next;
  }

  claimNextTask(statuses: TaskStatus[], claimedStatus: TaskStatus): Task | null {
    const priority = `CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`;
    // Single-statement claim: the UPDATE itself selects the row, so two workers cannot win the
    // same task even without an explicit transaction.
    const claimedAt = new Date().toISOString();
    const result = this.db.prepare(
      `UPDATE tasks SET status = ?, updated_at = ?, started_at = COALESCE(started_at, ?)
       WHERE id = (
         SELECT id FROM tasks
         WHERE status IN (${statuses.map(() => '?').join(',')})
         ORDER BY ${priority}, created_at ASC LIMIT 1
       )
       RETURNING id`,
    ).get(claimedStatus, claimedAt, claimedAt, ...(statuses as never[])) as Row | undefined;
    if (!result) return null;
    return this.getTask(String(result['id']));
  }

  countTasks(status: TaskStatus): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE status = ?').get(status) as Row;
    return int(row, 'n');
  }

  // ----------------------------------------------------------------- runs

  private toRun(row: Row): AgentRun {
    return {
      id: str(row, 'id'),
      taskId: str(row, 'task_id'),
      agentId: str(row, 'agent_id'),
      role: str(row, 'role'),
      status: str(row, 'status') as AgentRun['status'],
      startedAt: str(row, 'started_at'),
      endedAt: strOrNull(row, 'ended_at'),
      provider: str(row, 'provider'),
      model: str(row, 'model'),
      turns: int(row, 'turns'),
      parentRunId: strOrNull(row, 'parent_run_id'),
      depth: int(row, 'depth'),
      usage: json<UsageTotals>(row['usage'], emptyUsage()),
      error: strOrNull(row, 'error'),
      heartbeat: str(row, 'heartbeat') as AgentRun['heartbeat'],
      ownerPid: int(row, 'owner_pid'),
      ownerBootId: str(row, 'owner_boot_id'),
    };
  }

  createRun(run: AgentRun): AgentRun {
    this.db.prepare(`INSERT INTO runs (
      id, task_id, agent_id, role, status, started_at, ended_at, provider, model, turns,
      parent_run_id, depth, usage, error, heartbeat, owner_pid, owner_boot_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      run.id, run.taskId, run.agentId, run.role, run.status, run.startedAt, run.endedAt,
      run.provider, run.model, run.turns, run.parentRunId, run.depth, JSON.stringify(run.usage),
      run.error, run.heartbeat, run.ownerPid, run.ownerBootId,
    );
    return run;
  }

  getRun(id: string): AgentRun | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toRun(row) : null;
  }

  updateRun(id: string, patch: Partial<AgentRun>): AgentRun {
    const current = this.getRun(id);
    if (!current) throw new Error(`Run not found: ${id}`);
    const next: AgentRun = { ...current, ...patch };
    this.db.prepare(`UPDATE runs SET status=?, ended_at=?, turns=?, usage=?, error=?, heartbeat=?
      WHERE id=?`).run(
      next.status, next.endedAt, next.turns, JSON.stringify(next.usage), next.error,
      next.heartbeat, id,
    );
    return next;
  }

  listRuns(taskId: string): AgentRun[] {
    const rows = this.db.prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY started_at ASC')
      .all(taskId) as Row[];
    return rows.map((r) => this.toRun(r));
  }

  findOrphanedRuns(currentBootId: string): AgentRun[] {
    const rows = this.db.prepare(
      `SELECT * FROM runs WHERE status = 'running' AND owner_boot_id != ?`,
    ).all(currentBootId) as Row[];
    return rows.map((r) => this.toRun(r));
  }

  // --------------------------------------------------------------- events

  appendEvent(event: AgentEvent): AgentEvent {
    this.db.prepare(`INSERT INTO events (id, type, task_id, run_id, worker_id, tool_call_id, at, level, summary, data)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      event.id, event.type, event.taskId, event.runId, event.workerId, event.toolCallId,
      event.at, event.level, event.summary, JSON.stringify(event.data),
    );
    return event;
  }

  listEvents(query: EventQuery = {}): AgentEvent[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.taskId) { clauses.push('task_id = ?'); params.push(query.taskId); }
    if (query.sinceId) {
      clauses.push('seq > (SELECT seq FROM events WHERE id = ?)');
      params.push(query.sinceId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(query.limit ?? 100, 1000);
    const rows = this.db.prepare(
      `SELECT * FROM events ${where} ORDER BY seq DESC LIMIT ?`,
    ).all(...(params as never[]), limit) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      type: str(row, 'type') as AgentEvent['type'],
      taskId: strOrNull(row, 'task_id'),
      runId: strOrNull(row, 'run_id'),
      workerId: strOrNull(row, 'worker_id'),
      toolCallId: strOrNull(row, 'tool_call_id'),
      at: str(row, 'at'),
      level: str(row, 'level') as AgentEvent['level'],
      summary: str(row, 'summary'),
      data: json<Record<string, unknown>>(row['data'], {}),
    })).reverse();
  }

  // ----------------------------------------------------------- tool calls

  private toToolCall(row: Row): ToolCallRecord {
    return {
      id: str(row, 'id'),
      taskId: str(row, 'task_id'),
      runId: str(row, 'run_id'),
      tool: str(row, 'tool'),
      input: json<Record<string, unknown>>(row['input'], {}),
      status: str(row, 'status') as ToolCallRecord['status'],
      startedAt: str(row, 'started_at'),
      endedAt: strOrNull(row, 'ended_at'),
      durationMs: row['duration_ms'] == null ? null : int(row, 'duration_ms'),
      ok: row['ok'] == null ? null : bool(row, 'ok'),
      output: strOrNull(row, 'output'),
      error: strOrNull(row, 'error'),
    };
  }

  recordToolCall(call: ToolCallRecord): ToolCallRecord {
    this.db.prepare(`INSERT INTO tool_calls (id, task_id, run_id, tool, input, status, started_at, ended_at, duration_ms, ok, output, error)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      call.id, call.taskId, call.runId, call.tool, JSON.stringify(call.input), call.status,
      call.startedAt, call.endedAt, call.durationMs, call.ok === null ? null : call.ok ? 1 : 0,
      call.output, call.error,
    );
    return call;
  }

  updateToolCall(id: string, patch: Partial<ToolCallRecord>): ToolCallRecord {
    const row = this.db.prepare('SELECT * FROM tool_calls WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new Error(`Tool call not found: ${id}`);
    const next: ToolCallRecord = { ...this.toToolCall(row), ...patch };
    this.db.prepare(`UPDATE tool_calls SET status=?, ended_at=?, duration_ms=?, ok=?, output=?, error=? WHERE id=?`).run(
      next.status, next.endedAt, next.durationMs, next.ok === null ? null : next.ok ? 1 : 0,
      next.output, next.error, id,
    );
    return next;
  }

  listToolCalls(taskId: string): ToolCallRecord[] {
    const rows = this.db.prepare('SELECT * FROM tool_calls WHERE task_id = ? ORDER BY started_at ASC')
      .all(taskId) as Row[];
    return rows.map((r) => this.toToolCall(r));
  }

  // ------------------------------------------------------------ approvals

  private toApproval(row: Row): ApprovalRequest {
    return {
      id: str(row, 'id'),
      taskId: str(row, 'task_id'),
      runId: strOrNull(row, 'run_id'),
      action: str(row, 'action'),
      tool: strOrNull(row, 'tool'),
      input: json<Record<string, unknown>>(row['input'], {}),
      reason: str(row, 'reason'),
      risk: str(row, 'risk'),
      consequence: str(row, 'consequence'),
      state: str(row, 'state') as ApprovalRequest['state'],
      requestedAt: str(row, 'requested_at'),
      decidedAt: strOrNull(row, 'decided_at'),
      decidedBy: strOrNull(row, 'decided_by'),
      decisionNote: strOrNull(row, 'decision_note'),
    };
  }

  createApproval(request: ApprovalRequest): ApprovalRequest {
    this.db.prepare(`INSERT INTO approvals (id, task_id, run_id, action, tool, input, reason, risk, consequence, state, requested_at, decided_at, decided_by, decision_note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      request.id, request.taskId, request.runId, request.action, request.tool,
      JSON.stringify(request.input), request.reason, request.risk, request.consequence,
      request.state, request.requestedAt, request.decidedAt, request.decidedBy, request.decisionNote,
    );
    return request;
  }

  getApproval(id: string): ApprovalRequest | null {
    const row = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toApproval(row) : null;
  }

  listApprovals(state?: ApprovalRequest['state']): ApprovalRequest[] {
    const rows = state
      ? this.db.prepare('SELECT * FROM approvals WHERE state = ? ORDER BY requested_at DESC').all(state) as Row[]
      : this.db.prepare('SELECT * FROM approvals ORDER BY requested_at DESC LIMIT 200').all() as Row[];
    return rows.map((r) => this.toApproval(r));
  }

  decideApproval(id: string, state: 'approved' | 'rejected', by: string, note: string | null): ApprovalRequest {
    const existing = this.getApproval(id);
    if (!existing) throw new Error(`Approval not found: ${id}`);
    if (existing.state !== 'requested') {
      throw new Error(`Approval ${id} already decided: ${existing.state}`);
    }
    const decidedAt = new Date().toISOString();
    this.db.prepare('UPDATE approvals SET state=?, decided_at=?, decided_by=?, decision_note=? WHERE id=? AND state=\'requested\'')
      .run(state, decidedAt, by, note, id);
    return { ...existing, state, decidedAt, decidedBy: by, decisionNote: note };
  }

  findPendingApprovalForTask(taskId: string): ApprovalRequest | null {
    const row = this.db.prepare(
      `SELECT * FROM approvals WHERE task_id = ? AND state = 'requested' ORDER BY requested_at DESC LIMIT 1`,
    ).get(taskId) as Row | undefined;
    return row ? this.toApproval(row) : null;
  }

  // --------------------------------------------------------------- memory

  private toMemory(row: Row): MemoryRecord {
    return {
      id: str(row, 'id'),
      category: str(row, 'category') as MemoryRecord['category'],
      title: str(row, 'title'),
      content: str(row, 'content'),
      tags: json<string[]>(row['tags'], []),
      source: str(row, 'source'),
      provenance: str(row, 'provenance'),
      confidence: Number(row['confidence'] ?? 0.5),
      verified: bool(row, 'verified'),
      supersededBy: strOrNull(row, 'superseded_by'),
      taskId: strOrNull(row, 'task_id'),
      createdAt: str(row, 'created_at'),
      updatedAt: str(row, 'updated_at'),
      lastUsedAt: strOrNull(row, 'last_used_at'),
      useCount: int(row, 'use_count'),
    };
  }

  putMemory(record: MemoryRecord): MemoryRecord {
    this.db.prepare(`INSERT INTO memory (id, category, title, content, tags, source, provenance, confidence, verified, superseded_by, task_id, created_at, updated_at, last_used_at, use_count)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET category=excluded.category, title=excluded.title,
        content=excluded.content, tags=excluded.tags, source=excluded.source,
        provenance=excluded.provenance, confidence=excluded.confidence, verified=excluded.verified,
        superseded_by=excluded.superseded_by, updated_at=excluded.updated_at`).run(
      record.id, record.category, record.title, record.content, JSON.stringify(record.tags),
      record.source, record.provenance, record.confidence, record.verified ? 1 : 0,
      record.supersededBy, record.taskId, record.createdAt, record.updatedAt,
      record.lastUsedAt, record.useCount,
    );
    return record;
  }

  getMemory(id: string): MemoryRecord | null {
    const row = this.db.prepare('SELECT * FROM memory WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toMemory(row) : null;
  }

  queryMemory(query: MemoryQuery): MemoryRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (!query.includeSuperseded) clauses.push('superseded_by IS NULL');
    if (query.category) { clauses.push('category = ?'); params.push(query.category); }
    if (query.taskId) { clauses.push('task_id = ?'); params.push(query.taskId); }
    if (query.text) {
      clauses.push('(LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(tags) LIKE ?)');
      const like = `%${query.text.toLowerCase()}%`;
      params.push(like, like, like);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(query.limit ?? 20, 200);
    const rows = this.db.prepare(
      `SELECT * FROM memory ${where} ORDER BY confidence DESC, updated_at DESC LIMIT ?`,
    ).all(...(params as never[]), limit) as Row[];
    return rows.map((r) => this.toMemory(r));
  }

  touchMemory(ids: string[]): void {
    if (!ids.length) return;
    const at = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE memory SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?');
    for (const memoryId of ids) stmt.run(at, memoryId);
  }

  supersedeMemory(id: string, bySupersedingId: string): void {
    this.db.prepare('UPDATE memory SET superseded_by = ?, updated_at = ? WHERE id = ?')
      .run(bySupersedingId, new Date().toISOString(), id);
  }

  // --------------------------------------------------------------- skills

  private toSkill(row: Row): Skill {
    return {
      id: str(row, 'id'),
      name: str(row, 'name'),
      purpose: str(row, 'purpose'),
      version: str(row, 'version'),
      triggers: json<string[]>(row['triggers'], []),
      requiredTools: json<string[]>(row['required_tools'], []),
      instructions: str(row, 'instructions'),
      verification: str(row, 'verification'),
      createdAt: str(row, 'created_at'),
      source: str(row, 'source'),
    };
  }

  putSkill(skill: Skill): Skill {
    this.db.prepare(`INSERT INTO skills (id, name, purpose, version, triggers, required_tools, instructions, verification, created_at, source)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(name) DO UPDATE SET purpose=excluded.purpose, version=excluded.version,
        triggers=excluded.triggers, required_tools=excluded.required_tools,
        instructions=excluded.instructions, verification=excluded.verification, source=excluded.source`).run(
      skill.id, skill.name, skill.purpose, skill.version, JSON.stringify(skill.triggers),
      JSON.stringify(skill.requiredTools), skill.instructions, skill.verification,
      skill.createdAt, skill.source,
    );
    return skill;
  }

  listSkills(): Skill[] {
    const rows = this.db.prepare('SELECT * FROM skills ORDER BY name ASC').all() as Row[];
    return rows.map((r) => this.toSkill(r));
  }

  getSkill(name: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as Row | undefined;
    return row ? this.toSkill(row) : null;
  }

  // ------------------------------------------------------------ schedules

  private toSchedule(row: Row): ScheduleRecord {
    return {
      id: str(row, 'id'),
      name: str(row, 'name'),
      kind: str(row, 'kind') as ScheduleRecord['kind'],
      intervalMs: row['interval_ms'] == null ? null : int(row, 'interval_ms'),
      nextRunAt: str(row, 'next_run_at'),
      lastRunAt: strOrNull(row, 'last_run_at'),
      enabled: bool(row, 'enabled'),
      objective: str(row, 'objective'),
      workspace: str(row, 'workspace'),
      priority: str(row, 'priority') as ScheduleRecord['priority'],
      runCount: int(row, 'run_count'),
      maxRuns: row['max_runs'] == null ? null : int(row, 'max_runs'),
      createdAt: str(row, 'created_at'),
    };
  }

  putSchedule(schedule: ScheduleRecord): ScheduleRecord {
    this.db.prepare(`INSERT INTO schedules (id, name, kind, interval_ms, next_run_at, last_run_at, enabled, objective, workspace, priority, run_count, max_runs, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      schedule.id, schedule.name, schedule.kind, schedule.intervalMs, schedule.nextRunAt,
      schedule.lastRunAt, schedule.enabled ? 1 : 0, schedule.objective, schedule.workspace,
      schedule.priority, schedule.runCount, schedule.maxRuns, schedule.createdAt,
    );
    return schedule;
  }

  listSchedules(onlyEnabled = false): ScheduleRecord[] {
    const rows = (onlyEnabled
      ? this.db.prepare('SELECT * FROM schedules WHERE enabled = 1 ORDER BY next_run_at ASC').all()
      : this.db.prepare('SELECT * FROM schedules ORDER BY next_run_at ASC').all()) as Row[];
    return rows.map((r) => this.toSchedule(r));
  }

  getSchedule(id: string): ScheduleRecord | null {
    const row = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toSchedule(row) : null;
  }

  updateSchedule(id: string, patch: Partial<ScheduleRecord>): ScheduleRecord {
    const current = this.getSchedule(id);
    if (!current) throw new Error(`Schedule not found: ${id}`);
    const next: ScheduleRecord = { ...current, ...patch };
    this.db.prepare(`UPDATE schedules SET name=?, kind=?, interval_ms=?, next_run_at=?, last_run_at=?, enabled=?, objective=?, workspace=?, priority=?, run_count=?, max_runs=? WHERE id=?`).run(
      next.name, next.kind, next.intervalMs, next.nextRunAt, next.lastRunAt, next.enabled ? 1 : 0,
      next.objective, next.workspace, next.priority, next.runCount, next.maxRuns, id,
    );
    return next;
  }

  dueSchedules(atIso: string): ScheduleRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM schedules WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC',
    ).all(atIso) as Row[];
    return rows.map((r) => this.toSchedule(r));
  }

  // ---------------------------------------------------------------- usage

  recordUsage(usage: UsageRecord): UsageRecord {
    this.db.prepare(`INSERT INTO usage (id, task_id, run_id, provider, model, input_tokens, output_tokens, cost_usd, at, latency_ms, ok)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      usage.id, usage.taskId, usage.runId, usage.provider, usage.model, usage.inputTokens,
      usage.outputTokens, usage.costUsd, usage.at, usage.latencyMs, usage.ok ? 1 : 0,
    );
    return usage;
  }

  usageForTask(taskId: string): UsageRecord[] {
    const rows = this.db.prepare('SELECT * FROM usage WHERE task_id = ? ORDER BY at ASC').all(taskId) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      taskId: strOrNull(row, 'task_id'),
      runId: strOrNull(row, 'run_id'),
      provider: str(row, 'provider'),
      model: str(row, 'model'),
      inputTokens: int(row, 'input_tokens'),
      outputTokens: int(row, 'output_tokens'),
      costUsd: row['cost_usd'] == null ? null : Number(row['cost_usd']),
      at: str(row, 'at'),
      latencyMs: int(row, 'latency_ms'),
      ok: bool(row, 'ok'),
    }));
  }
}
