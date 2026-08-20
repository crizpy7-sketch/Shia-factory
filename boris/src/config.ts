/**
 * Runtime configuration. Everything comes from the environment; nothing sensitive is committed.
 * Limits are deterministic and enforced in code, not in a prompt.
 */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Walks up from the compiled module until it finds a directory that owns an agents/ package, so
 * the runtime works the same from src/, from dist/, and from an image that ships only one agent.
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'agents'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start, '..', '..');
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric env ${name}: ${raw}`);
  }
  return parsed;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export interface Limits {
  /** Hard ceiling on model calls for a single task, across all its runs and workers. */
  maxModelCallsPerTask: number;
  maxTurnsPerRun: number;
  maxWorkersPerTask: number;
  maxWorkerDepth: number;
  maxTaskDurationMs: number;
  maxAttempts: number;
  maxToolCallsPerTask: number;
  maxCostUsdPerTask: number;
  maxOutputTokens: number;
  shellTimeoutMs: number;
  /** How long one model completion may take. Also bounds a meeting participant's turn. */
  modelTimeoutMs: number;
  maxShellOutputBytes: number;
  maxFileBytes: number;
  maxConcurrentTasks: number;
}

export interface Config {
  bootId: string;
  /** The primary agent: the one a bare `submit` addresses and the one status reports as "the" agent. */
  agentId: string;
  /**
   * Which agents this runtime hosts. Empty = every package on disk, which is what the shared
   * headquarters wants. A solo deployment sets BORIS_AGENTS to one id and hosts only him.
   */
  hostedAgents: string[];
  repoRoot: string;
  /** Directories the agent may touch. Anything outside is denied deterministically. */
  workspaceRoots: string[];
  identityDir: string;
  dbPath: string;
  provider: string;
  model: string;
  apiKey: string | null;
  anthropicBaseUrl: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string;
  apiPort: number;
  apiHost: string;
  apiToken: string | null;
  requireAuth: boolean;
  /** Origins permitted to call the API from a browser. Empty means same-origin only. */
  allowedOrigins: string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  limits: Limits;
  autoApprove: boolean;
  workerPollMs: number;
  schedulerPollMs: number;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const repoRoot = resolve(str('BORIS_REPO_ROOT', findRepoRoot(import.meta.dirname)));
  const primaryAgent = str('BORIS_AGENT_ID', 'BORIS-001');
  const apiToken = process.env['BORIS_API_TOKEN'] ?? null;
  const cfg: Config = {
    bootId: randomUUID(),
    agentId: primaryAgent,
    hostedAgents: list('BORIS_AGENTS', []),
    repoRoot,
    workspaceRoots: list('BORIS_WORKSPACE_ROOTS', [resolve(repoRoot, 'boris', 'workspaces')]).map((p) => resolve(p)),
    /* Follows the primary agent, so BORIS_AGENT_ID=GARY-001 needs no second variable. */
    identityDir: resolve(str('BORIS_IDENTITY_DIR', resolve(repoRoot, 'agents', primaryAgent))),
    dbPath: resolve(str('BORIS_DB_PATH', resolve(repoRoot, 'boris', 'data', 'boris.db'))),
    provider: str('BORIS_PROVIDER', 'anthropic'),
    model: str('BORIS_MODEL', 'claude-sonnet-5'),
    apiKey: process.env['ANTHROPIC_API_KEY'] ?? process.env['BORIS_API_KEY'] ?? null,
    anthropicBaseUrl: str('BORIS_ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
    openaiApiKey: process.env['OPENAI_API_KEY'] ?? null,
    openaiBaseUrl: str('BORIS_OPENAI_BASE_URL', 'https://api.openai.com'),
    apiPort: num('BORIS_PORT', 8787),
    apiHost: str('BORIS_HOST', '127.0.0.1'),
    apiToken,
    requireAuth: str('BORIS_REQUIRE_AUTH', apiToken ? 'true' : 'false') === 'true',
    allowedOrigins: list('BORIS_ALLOWED_ORIGINS', []),
    logLevel: str('BORIS_LOG_LEVEL', 'info') as Config['logLevel'],
    autoApprove: str('BORIS_AUTO_APPROVE', 'false') === 'true',
    workerPollMs: num('BORIS_WORKER_POLL_MS', 1000),
    schedulerPollMs: num('BORIS_SCHEDULER_POLL_MS', 5000),
    limits: {
      maxModelCallsPerTask: num('BORIS_MAX_MODEL_CALLS', 40),
      maxTurnsPerRun: num('BORIS_MAX_TURNS', 25),
      maxWorkersPerTask: num('BORIS_MAX_WORKERS', 4),
      maxWorkerDepth: num('BORIS_MAX_WORKER_DEPTH', 2),
      maxTaskDurationMs: num('BORIS_MAX_TASK_MS', 20 * 60 * 1000),
      maxAttempts: num('BORIS_MAX_ATTEMPTS', 3),
      maxToolCallsPerTask: num('BORIS_MAX_TOOL_CALLS', 200),
      maxCostUsdPerTask: num('BORIS_MAX_COST_USD', 5),
      maxOutputTokens: num('BORIS_MAX_OUTPUT_TOKENS', 4096),
      shellTimeoutMs: num('BORIS_SHELL_TIMEOUT_MS', 120000),
      modelTimeoutMs: num('BORIS_MODEL_TIMEOUT_MS', 120000),
      maxShellOutputBytes: num('BORIS_MAX_SHELL_OUTPUT', 200000),
      maxFileBytes: num('BORIS_MAX_FILE_BYTES', 1000000),
      maxConcurrentTasks: num('BORIS_MAX_CONCURRENT_TASKS', 2),
    },
  };
  return { ...cfg, ...overrides, limits: { ...cfg.limits, ...(overrides.limits ?? {}) } };
}
