/**
 * The tools BORIS actually works with: files, search, shell, git, and the development loop.
 *
 * Every tool validates input, resolves paths against the workspace sandbox, and runs without a
 * shell. Subprocesses receive a minimal environment so credentials cannot leak into them.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { checkCommand, checkPathAccess, parseCommand, resolveWorkspacePath } from '../policy/permissions.js';
import { truncate } from '../util/ids.js';
import { ToolContext, ToolDefinition, ToolRegistry, ToolResult } from './registry.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.cache']);

function str(input: Record<string, unknown>, key: string, fallback = ''): string {
  const value = input[key];
  return typeof value === 'string' ? value : fallback;
}

function int(input: Record<string, unknown>, key: string, fallback: number): number {
  const value = input[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export interface ShellOutcome {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

/**
 * Runs a command with no shell: the binary is executed directly with an argument vector, so
 * metacharacters in any argument are inert.
 */
export function runProcess(
  binary: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputBytes: number; signal?: AbortSignal },
): Promise<ShellOutcome> {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const child = spawn(binary, args, {
      cwd: options.cwd,
      shell: false,
      env: {
        PATH: process.env['PATH'] ?? '/usr/local/bin:/usr/bin:/bin',
        HOME: process.env['HOME'] ?? '/tmp',
        LANG: process.env['LANG'] ?? 'C.UTF-8',
        NODE_ENV: 'test',
        CI: 'true',
        // Deliberately minimal: no API keys, no tokens, no inherited secrets.
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const cap = (existing: string, chunk: string): string => {
      if (existing.length >= options.maxOutputBytes) { truncated = true; return existing; }
      const room = options.maxOutputBytes - existing.length;
      if (chunk.length > room) { truncated = true; return existing + chunk.slice(0, room); }
      return existing + chunk;
    };

    child.stdout.on('data', (d: Buffer) => { stdout = cap(stdout, d.toString('utf8')); });
    child.stderr.on('data', (d: Buffer) => { stderr = cap(stderr, d.toString('utf8')); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);

    const onAbort = (): void => { child.kill('SIGKILL'); };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (code: number | null, signal: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolvePromise({ code, signal, stdout, stderr, durationMs: Date.now() - started, timedOut, truncated });
    };

    child.on('error', (error) => {
      stderr = cap(stderr, `\n${(error as Error).message}`);
      finish(null, null);
    });
    child.on('close', (code, signal) => finish(code, signal));
  });
}

function walk(root: string, dir: string, depth: number, out: string[], limit: number): void {
  if (depth < 0 || out.length >= limit) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries.sort()) {
    if (out.length >= limit) return;
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    out.push((relative(root, full) || entry) + (isDir ? '/' : ''));
    if (isDir) walk(root, full, depth - 1, out, limit);
  }
}

export function createBuiltinTools(): ToolDefinition[] {
  const fsList: ToolDefinition = {
    name: 'fs_list',
    description: 'List files and directories under a workspace path. Use this first to understand a repository.',
    sensitivity: 'safe',
    schema: { path: { type: 'string' }, depth: { type: 'number', min: 0, max: 8 } },
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory relative to the workspace. Defaults to the workspace root.' },
        depth: { type: 'number', description: 'How many levels to descend (0-8, default 2).' },
      },
    },
    authorize: (input, ctx) => checkPathAccess(ctx.permissions, str(input, 'path', '.'), 'read'),
    execute: async (input, ctx) => {
      const resolved = resolveWorkspacePath(ctx.permissions, str(input, 'path', '.'));
      if (!resolved.ok) return { ok: false, output: '', error: resolved.reason };
      if (!existsSync(resolved.path)) return { ok: false, output: '', error: `no such directory: ${resolved.path}` };
      const out: string[] = [];
      walk(resolved.path, resolved.path, int(input, 'depth', 2), out, 500);
      return { ok: true, output: out.join('\n') || '(empty)', data: { count: out.length } };
    },
  };

  const fsRead: ToolDefinition = {
    name: 'fs_read',
    description: 'Read a UTF-8 text file from the workspace.',
    sensitivity: 'safe',
    schema: { path: { type: 'string', required: true } },
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path relative to the workspace.' } },
      required: ['path'],
    },
    authorize: (input, ctx) => checkPathAccess(ctx.permissions, str(input, 'path'), 'read'),
    execute: async (input, ctx) => {
      const resolved = resolveWorkspacePath(ctx.permissions, str(input, 'path'));
      if (!resolved.ok) return { ok: false, output: '', error: resolved.reason };
      if (!existsSync(resolved.path)) return { ok: false, output: '', error: `no such file: ${str(input, 'path')}` };
      const size = statSync(resolved.path).size;
      if (size > ctx.config.limits.maxFileBytes) {
        return { ok: false, output: '', error: `file is ${size} bytes, over the ${ctx.config.limits.maxFileBytes} byte limit` };
      }
      const content = readFileSync(resolved.path, 'utf8');
      return { ok: true, output: content, data: { bytes: size, lines: content.split('\n').length } };
    },
  };

  const fsWrite: ToolDefinition = {
    name: 'fs_write',
    description: 'Create or overwrite a file in the workspace. Prefer fs_edit for changes to existing files.',
    sensitivity: 'safe',
    schema: { path: { type: 'string', required: true }, content: { type: 'string', required: true } },
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace.' },
        content: { type: 'string', description: 'Full file contents.' },
      },
      required: ['path', 'content'],
    },
    authorize: (input, ctx) => checkPathAccess(ctx.permissions, str(input, 'path'), 'write'),
    execute: async (input, ctx) => {
      const resolved = resolveWorkspacePath(ctx.permissions, str(input, 'path'));
      if (!resolved.ok) return { ok: false, output: '', error: resolved.reason };
      const content = str(input, 'content');
      if (content.length > ctx.config.limits.maxFileBytes) {
        return { ok: false, output: '', error: `content exceeds the ${ctx.config.limits.maxFileBytes} byte limit` };
      }
      const existed = existsSync(resolved.path);
      mkdirSync(dirname(resolved.path), { recursive: true });
      writeFileSync(resolved.path, content, 'utf8');
      return {
        ok: true,
        output: `${existed ? 'overwrote' : 'created'} ${str(input, 'path')} (${content.length} bytes)`,
        data: { path: resolved.path, bytes: content.length, created: !existed },
      };
    },
  };

  const fsEdit: ToolDefinition = {
    name: 'fs_edit',
    description: 'Replace an exact string in a workspace file. Fails if the string is absent or ambiguous.',
    sensitivity: 'safe',
    schema: {
      path: { type: 'string', required: true },
      find: { type: 'string', required: true, min: 1 },
      replace: { type: 'string', required: true },
      replaceAll: { type: 'boolean' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File to edit.' },
        find: { type: 'string', description: 'Exact text to replace.' },
        replace: { type: 'string', description: 'Replacement text.' },
        replaceAll: { type: 'boolean', description: 'Replace every occurrence instead of requiring uniqueness.' },
      },
      required: ['path', 'find', 'replace'],
    },
    authorize: (input, ctx) => checkPathAccess(ctx.permissions, str(input, 'path'), 'write'),
    execute: async (input, ctx) => {
      const resolved = resolveWorkspacePath(ctx.permissions, str(input, 'path'));
      if (!resolved.ok) return { ok: false, output: '', error: resolved.reason };
      if (!existsSync(resolved.path)) return { ok: false, output: '', error: `no such file: ${str(input, 'path')}` };
      const before = readFileSync(resolved.path, 'utf8');
      const find = str(input, 'find');
      const replaceAll = input['replaceAll'] === true;
      const occurrences = before.split(find).length - 1;
      if (occurrences === 0) return { ok: false, output: '', error: 'the text to replace was not found' };
      if (occurrences > 1 && !replaceAll) {
        return { ok: false, output: '', error: `the text occurs ${occurrences} times; pass replaceAll or use a longer unique anchor` };
      }
      const after = replaceAll ? before.split(find).join(str(input, 'replace')) : before.replace(find, str(input, 'replace'));
      writeFileSync(resolved.path, after, 'utf8');
      return {
        ok: true,
        output: `edited ${str(input, 'path')} (${occurrences} replacement${occurrences === 1 ? '' : 's'})`,
        data: { path: resolved.path, replacements: occurrences, bytesBefore: before.length, bytesAfter: after.length },
      };
    },
  };

  const fsSearch: ToolDefinition = {
    name: 'fs_search',
    description: 'Search workspace file contents for a regular expression. Returns matching lines with file and line number.',
    sensitivity: 'safe',
    schema: {
      query: { type: 'string', required: true, min: 1, max: 400 },
      path: { type: 'string' },
      extension: { type: 'string' },
      maxResults: { type: 'number', min: 1, max: 200 },
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'JavaScript regular expression.' },
        path: { type: 'string', description: 'Directory to search (default: workspace root).' },
        extension: { type: 'string', description: 'Restrict to files with this extension, e.g. "ts".' },
        maxResults: { type: 'number', description: 'Maximum matches to return (default 50).' },
      },
      required: ['query'],
    },
    authorize: (input, ctx) => checkPathAccess(ctx.permissions, str(input, 'path', '.'), 'read'),
    execute: async (input, ctx) => {
      const resolved = resolveWorkspacePath(ctx.permissions, str(input, 'path', '.'));
      if (!resolved.ok) return { ok: false, output: '', error: resolved.reason };
      let regex: RegExp;
      try {
        regex = new RegExp(str(input, 'query'), 'i');
      } catch (error) {
        return { ok: false, output: '', error: `invalid regular expression: ${(error as Error).message}` };
      }
      const extension = str(input, 'extension');
      const max = int(input, 'maxResults', 50);
      const files: string[] = [];
      walk(resolved.path, resolved.path, 8, files, 2000);
      const matches: string[] = [];
      for (const relPath of files) {
        if (matches.length >= max) break;
        if (relPath.endsWith('/')) continue;
        if (extension && !relPath.endsWith(`.${extension.replace(/^\./, '')}`)) continue;
        const full = join(resolved.path, relPath);
        let content: string;
        try {
          if (statSync(full).size > ctx.config.limits.maxFileBytes) continue;
          content = readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        content.split('\n').forEach((line, index) => {
          if (matches.length >= max) return;
          if (regex.test(line)) matches.push(`${relPath}:${index + 1}: ${line.trim().slice(0, 240)}`);
        });
      }
      return {
        ok: true,
        output: matches.length ? matches.join('\n') : 'no matches',
        data: { matches: matches.length, filesScanned: files.length },
      };
    },
  };

  const shellRun: ToolDefinition = {
    name: 'shell_run',
    description:
      'Run a command in the workspace. No shell is used, so pipes, redirection and chaining are unavailable — ' +
      'run one binary with arguments. Returns exit code, stdout and stderr.',
    sensitivity: 'safe',
    schema: {
      command: { type: 'string', required: true, min: 1, max: 4000 },
      cwd: { type: 'string' },
      timeoutMs: { type: 'number', min: 100, max: 600000 },
    },
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'e.g. "npm test" or "node --test tests/unit.test.js".' },
        cwd: { type: 'string', description: 'Directory relative to the workspace.' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds.' },
      },
      required: ['command'],
    },
    authorize: (input, ctx) => {
      const cwdDecision = checkPathAccess(ctx.permissions, str(input, 'cwd', '.'), 'read');
      if (cwdDecision.kind !== 'allow') return cwdDecision;
      return checkCommand(ctx.permissions, str(input, 'command'));
    },
    execute: async (input, ctx) => {
      const cwd = resolveWorkspacePath(ctx.permissions, str(input, 'cwd', '.'));
      if (!cwd.ok) return { ok: false, output: '', error: cwd.reason };
      let parsed;
      try {
        parsed = parseCommand(str(input, 'command'));
      } catch (error) {
        return { ok: false, output: '', error: (error as Error).message };
      }
      const outcome = await runProcess(parsed.binary, parsed.args, {
        cwd: cwd.path,
        timeoutMs: Math.min(int(input, 'timeoutMs', ctx.config.limits.shellTimeoutMs), ctx.config.limits.shellTimeoutMs),
        maxOutputBytes: ctx.config.limits.maxShellOutputBytes,
        signal: ctx.signal,
      });
      const body = [
        `$ ${str(input, 'command')}`,
        `exit=${outcome.timedOut ? 'timeout' : outcome.code}${outcome.signal ? ` signal=${outcome.signal}` : ''} duration=${outcome.durationMs}ms`,
        outcome.stdout ? `--- stdout ---\n${outcome.stdout}` : '',
        outcome.stderr ? `--- stderr ---\n${outcome.stderr}` : '',
        outcome.truncated ? '[output truncated]' : '',
      ].filter(Boolean).join('\n');
      return {
        ok: outcome.code === 0 && !outcome.timedOut,
        output: truncate(body, 20000),
        data: {
          exitCode: outcome.code,
          timedOut: outcome.timedOut,
          durationMs: outcome.durationMs,
          stdoutBytes: outcome.stdout.length,
          stderrBytes: outcome.stderr.length,
        },
        ...(outcome.timedOut ? { error: `command timed out` } : outcome.code === 0 ? {} : { error: `exit code ${outcome.code}` }),
      };
    },
  };

  const gitTool: ToolDefinition = {
    name: 'git',
    description: 'Inspect repository state: status, diff, log, branch listing, or create a working branch.',
    sensitivity: 'safe',
    schema: {
      operation: { type: 'string', required: true, enum: ['status', 'diff', 'log', 'branch_list', 'branch_create'] },
      branch: { type: 'string', max: 200 },
      path: { type: 'string' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['status', 'diff', 'log', 'branch_list', 'branch_create'] },
        branch: { type: 'string', description: 'Branch name for branch_create.' },
        path: { type: 'string', description: 'Optional path filter for diff.' },
      },
      required: ['operation'],
    },
    authorize: (input, ctx) => {
      const branch = str(input, 'branch');
      if (branch && !/^[A-Za-z0-9._\/-]{1,200}$/.test(branch)) {
        return { kind: 'deny', reason: 'branch name contains unsupported characters' };
      }
      return checkPathAccess(ctx.permissions, '.', 'read');
    },
    execute: async (input, ctx) => {
      const operation = str(input, 'operation');
      const argsByOp: Record<string, string[]> = {
        status: ['status', '--short', '--branch'],
        diff: ['diff', '--stat', '--patch'],
        log: ['log', '--oneline', '-20'],
        branch_list: ['branch', '--all', '--no-color'],
        branch_create: ['checkout', '-b', str(input, 'branch')],
      };
      const args = argsByOp[operation];
      if (!args) return { ok: false, output: '', error: `unsupported git operation: ${operation}` };
      if (operation === 'branch_create' && !str(input, 'branch')) {
        return { ok: false, output: '', error: 'branch is required for branch_create' };
      }
      if (operation === 'diff' && str(input, 'path')) {
        const p = resolveWorkspacePath(ctx.permissions, str(input, 'path'));
        if (!p.ok) return { ok: false, output: '', error: p.reason };
        args.push('--', p.path);
      }
      const outcome = await runProcess('git', args, {
        cwd: ctx.workspace,
        timeoutMs: 30000,
        maxOutputBytes: ctx.config.limits.maxShellOutputBytes,
        signal: ctx.signal,
      });
      return {
        ok: outcome.code === 0,
        output: truncate(outcome.stdout || outcome.stderr || '(no output)', 20000),
        data: { operation, exitCode: outcome.code },
        ...(outcome.code === 0 ? {} : { error: outcome.stderr.slice(0, 500) || `git exited ${outcome.code}` }),
      };
    },
  };

  const devTool: ToolDefinition = {
    name: 'dev',
    description: 'Run the project development loop: install, build, typecheck, lint or test. Uses the workspace package manager.',
    sensitivity: 'safe',
    schema: {
      action: { type: 'string', required: true, enum: ['install', 'build', 'typecheck', 'lint', 'test'] },
      cwd: { type: 'string' },
      args: { type: 'string', max: 500 },
    },
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['install', 'build', 'typecheck', 'lint', 'test'] },
        cwd: { type: 'string', description: 'Project directory relative to the workspace.' },
        args: { type: 'string', description: 'Extra arguments appended to the command.' },
      },
      required: ['action'],
    },
    authorize: (input, ctx) => {
      const extra = str(input, 'args');
      if (extra && /[;&|><`$(){}\n]/.test(extra)) return { kind: 'deny', reason: 'args contain shell metacharacters' };
      return checkPathAccess(ctx.permissions, str(input, 'cwd', '.'), 'read');
    },
    execute: async (input, ctx) => {
      const cwd = resolveWorkspacePath(ctx.permissions, str(input, 'cwd', '.'));
      if (!cwd.ok) return { ok: false, output: '', error: cwd.reason };
      const action = str(input, 'action');
      const scriptFor: Record<string, string[]> = {
        install: ['install', '--no-audit', '--no-fund'],
        build: ['run', 'build'],
        typecheck: ['run', 'typecheck'],
        lint: ['run', 'lint'],
        test: ['test'],
      };
      const args = scriptFor[action];
      if (!args) return { ok: false, output: '', error: `unsupported dev action: ${action}` };
      const extra = str(input, 'args').split(/\s+/).filter(Boolean);
      const outcome = await runProcess('npm', [...args, ...extra], {
        cwd: cwd.path,
        timeoutMs: ctx.config.limits.shellTimeoutMs,
        maxOutputBytes: ctx.config.limits.maxShellOutputBytes,
        signal: ctx.signal,
      });
      const body = [
        `$ npm ${[...args, ...extra].join(' ')} (in ${relative(ctx.workspace, cwd.path) || '.'})`,
        `exit=${outcome.timedOut ? 'timeout' : outcome.code} duration=${outcome.durationMs}ms`,
        outcome.stdout ? `--- stdout ---\n${outcome.stdout}` : '',
        outcome.stderr ? `--- stderr ---\n${outcome.stderr}` : '',
      ].filter(Boolean).join('\n');
      return {
        ok: outcome.code === 0 && !outcome.timedOut,
        output: truncate(body, 20000),
        data: { action, exitCode: outcome.code, durationMs: outcome.durationMs, timedOut: outcome.timedOut },
        ...(outcome.code === 0 && !outcome.timedOut ? {} : { error: outcome.timedOut ? 'timed out' : `exit code ${outcome.code}` }),
      };
    },
  };

  return [fsList, fsRead, fsWrite, fsEdit, fsSearch, shellRun, gitTool, devTool];
}

export function registerBuiltins(registry: ToolRegistry): ToolRegistry {
  for (const tool of createBuiltinTools()) registry.register(tool);
  return registry;
}

export type { ToolResult, ToolContext };
