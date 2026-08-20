/**
 * Test support: temporary workspaces, temporary databases and runtimes wired to the scripted
 * provider. Nothing here is reachable from the production entry points.
 */
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CreateRuntimeOptions, Runtime, bootstrap, createRuntime } from '../src/runtime.js';
import { ScriptPolicy, ScriptedProvider } from '../src/providers/scripted.js';
import { ModelProvider } from '../src/providers/types.js';
import { Logger } from '../src/util/log.js';

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
export const FIXTURE = resolve(REPO_ROOT, 'boris', 'fixtures', 'broken-calc');

export interface Harness {
  runtime: Runtime;
  root: string;
  workspace: string;
  provider: ModelProvider;
  cleanup(): void;
}

export interface HarnessOptions {
  policy?: ScriptPolicy;
  provider?: ModelProvider;
  copyFixture?: boolean;
  bootstrapRuntime?: boolean;
  config?: CreateRuntimeOptions['config'];
}

export function makeHarness(options: HarnessOptions = {}): Harness {
  const root = mkdtempSync(join(tmpdir(), 'boris-test-'));
  const workspace = join(root, 'workspace');
  const provider = options.provider
    ?? new ScriptedProvider(options.policy ?? (() => ({ text: 'noop', stopReason: 'end_turn' })), 'scripted-test');

  const runtime = createRuntime({
    provider,
    logger: new Logger('error', {}, () => {}),
    config: {
      repoRoot: REPO_ROOT,
      dbPath: join(root, 'boris.db'),
      workspaceRoots: [workspace],
      identityDir: resolve(REPO_ROOT, 'agents', 'BORIS-001'),
      requireAuth: false,
      apiToken: null,
      ...(options.config ?? {}),
    },
  });

  if (options.copyFixture !== false) {
    cpSync(FIXTURE, workspace, { recursive: true });
  }
  if (options.bootstrapRuntime !== false) bootstrap(runtime);

  return {
    runtime,
    root,
    workspace,
    provider,
    cleanup(): void {
      try { runtime.storage.close(); } catch { /* already closed */ }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Waits for a predicate, polling. Fails loudly rather than hanging forever. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  { timeoutMs = 15000, intervalMs = 50, what = 'condition' } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timed out waiting for ${what}`);
}
