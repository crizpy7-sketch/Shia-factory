/**
 * Deterministic permission engine.
 *
 * Nothing here consults the model. A tool call is authorised by code or it does not run.
 * Three outcomes only: allow, deny, or require human approval.
 */
import { realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

export type DecisionKind = 'allow' | 'deny' | 'require_approval';

export interface Decision {
  kind: DecisionKind;
  reason: string;
  risk?: string;
  consequence?: string;
}

export const allow = (reason = 'permitted'): Decision => ({ kind: 'allow', reason });
export const deny = (reason: string): Decision => ({ kind: 'deny', reason });
export const requireApproval = (reason: string, risk: string, consequence: string): Decision =>
  ({ kind: 'require_approval', reason, risk, consequence });

/**
 * Commands that are never run, with or without approval, because a mistake is unrecoverable
 * or the action has no place in an engineering workspace.
 */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bmkfs(\.|\b)/, reason: 'filesystem creation' },
  { pattern: /\bdd\b[^\n]*\bof=\/dev\//, reason: 'raw device write' },
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/, reason: 'host power control' },
  { pattern: /\brm\b[^\n]*\s\/(\s|$)/, reason: 'deletion of the filesystem root' },
  { pattern: /:\(\)\{.*\|.*&.*\};:/, reason: 'fork bomb' },
  { pattern: /\bchmod\b\s+(-R\s+)?777\s+\//, reason: 'world-writable root' },
  { pattern: /\b(curl|wget)\b[^\n]*\|\s*(ba)?sh\b/, reason: 'piping a download into a shell' },
  { pattern: /\bhistory\b\s+-c/, reason: 'audit-trail destruction' },
  { pattern: /\bgit\b[^\n]*\bpush\b[^\n]*--force(?!-with-lease)/, reason: 'force push' },
];

/** Binaries the agent may execute without asking. Anything else needs approval. */
export const DEFAULT_ALLOWED_BINARIES = [
  'node', 'npm', 'npx', 'tsc', 'eslint', 'jest', 'vitest', 'pnpm', 'yarn',
  'git', 'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'echo', 'pwd',
  'mkdir', 'cp', 'mv', 'touch', 'diff', 'sort', 'uniq', 'sed', 'awk', 'python3', 'make', 'true', 'false',
] as const;

/** Binaries permitted only with explicit human approval. */
const APPROVAL_BINARIES = new Set([
  'rm', 'docker', 'kubectl', 'terraform', 'ssh', 'scp', 'rsync', 'systemctl', 'apt', 'apt-get',
  'brew', 'curl', 'wget', 'psql', 'mysql', 'redis-cli', 'aws', 'gcloud', 'az', 'flyctl', 'vercel',
]);

/** Git subcommands that publish or destroy history. */
const APPROVAL_GIT_SUBCOMMANDS = new Set(['push', 'reset', 'clean', 'rebase', 'cherry-pick', 'tag', 'remote']);

/** Paths that hold credentials. Reads are denied outright, not escalated. */
const SECRET_PATH_PATTERN = /(^|[\/\\])(\.env(\..*)?|\.npmrc|\.netrc|id_[a-z0-9]+|.*\.pem|.*\.key|credentials|\.aws|\.ssh|\.git-credentials)($|[\/\\])/i;

/**
 * The same credential names as they appear inside a command line, where the boundary is a space
 * or a quote rather than a path separator (`cat .env`, `node --env-file=.env`).
 */
const SECRET_ARG_PATTERN = /(^|[\s/\\'"=])(\.env(\.[\w-]+)?|\.npmrc|\.netrc|id_[a-z0-9]+|[\w.-]*\.pem|[\w.-]*\.key|credentials|\.aws|\.ssh|\.git-credentials)($|[\s/\\'"])/i;

/**
 * Shell metacharacters. Their presence means the string is not a simple command.
 * `~` and `!` are omitted deliberately: without a shell they are literal characters, and git refs
 * such as HEAD~1 are legitimate arguments.
 */
const SHELL_METACHARACTERS = /[;&|><`$(){}\[\]\n\r\\*?]/;

export interface PermissionContext {
  workspaceRoots: string[];
  /** The task's own workspace; must itself be inside a workspace root. */
  workspace: string;
  allowedBinaries?: readonly string[];
  /** When true, restricted operations still create an approval request but auto-resolve. */
  autoApprove?: boolean;
}

export interface ParsedCommand {
  binary: string;
  args: string[];
}

export class CommandParseError extends Error {}

/**
 * Splits a command into binary + args, rejecting anything that would require a shell.
 * The shell tool never passes a string to `sh`, which removes shell injection as a class.
 */
export function parseCommand(command: string): ParsedCommand {
  const trimmed = command.trim();
  if (!trimmed) throw new CommandParseError('empty command');
  if (trimmed.length > 4000) throw new CommandParseError('command too long');
  if (SHELL_METACHARACTERS.test(trimmed)) {
    throw new CommandParseError(
      'command contains shell metacharacters; commands are executed without a shell, so pipes, ' +
      'redirection, substitution and chaining are not available',
    );
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const binary = parts[0];
  if (!binary) throw new CommandParseError('empty command');
  return { binary, args: parts.slice(1) };
}

export function isPathInside(root: string, candidate: string): boolean {
  const normalisedRoot = resolve(root);
  const normalisedCandidate = resolve(candidate);
  return normalisedCandidate === normalisedRoot
    || normalisedCandidate.startsWith(normalisedRoot.endsWith(sep) ? normalisedRoot : normalisedRoot + sep);
}

/**
 * Resolves a path for a tool call and proves it stays inside an authorised workspace,
 * following symlinks where the path already exists so a link cannot escape the sandbox.
 */
export function resolveWorkspacePath(ctx: PermissionContext, candidate: string): { ok: true; path: string } | { ok: false; reason: string } {
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    return { ok: false, reason: 'path is required' };
  }
  if (candidate.includes('\0')) return { ok: false, reason: 'path contains a null byte' };

  const base = resolve(ctx.workspace);
  const target = isAbsolute(candidate) ? resolve(candidate) : resolve(base, candidate);

  const roots = ctx.workspaceRoots.map((r) => resolve(r));
  const insideDeclared = roots.some((root) => isPathInside(root, target)) && isPathInside(base, target);
  if (!insideDeclared) {
    return { ok: false, reason: `path escapes the authorised workspace: ${target}` };
  }

  // Follow symlinks on the deepest existing ancestor; a link pointing outside is an escape.
  let probe = target;
  for (let i = 0; i < 64; i++) {
    try {
      const real = realpathSync(probe);
      const realTarget = probe === target ? real : resolve(real, target.slice(probe.length + 1));
      if (!roots.some((root) => isPathInside(root, realTarget))) {
        return { ok: false, reason: `path resolves outside the authorised workspace: ${realTarget}` };
      }
      break;
    } catch {
      const parent = resolve(probe, '..');
      if (parent === probe) break;
      probe = parent;
    }
  }

  if (SECRET_PATH_PATTERN.test(target)) {
    return { ok: false, reason: `path looks like a credential store: ${target}` };
  }
  return { ok: true, path: target };
}

export function checkPathAccess(ctx: PermissionContext, candidate: string, mode: 'read' | 'write'): Decision {
  const resolved = resolveWorkspacePath(ctx, candidate);
  if (!resolved.ok) return deny(resolved.reason);
  if (mode === 'write' && /(^|[\/\\])\.git([\/\\]|$)/.test(resolved.path)) {
    return deny('direct writes into .git are not permitted; use the git tool');
  }
  return allow(`${mode} within workspace`);
}

export function checkCommand(ctx: PermissionContext, command: string): Decision {
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(command)) return deny(`refused: ${reason}`);
  }
  let parsed: ParsedCommand;
  try {
    parsed = parseCommand(command);
  } catch (error) {
    return deny((error as Error).message);
  }

  if (SECRET_PATH_PATTERN.test(command) || SECRET_ARG_PATTERN.test(command)) {
    return deny('command references a credential path');
  }
  if (/\b(env|printenv|set)\b/.test(parsed.binary)) {
    return deny('environment dumps are not permitted; they leak credentials');
  }

  const allowed = new Set(ctx.allowedBinaries ?? DEFAULT_ALLOWED_BINARIES);
  if (APPROVAL_BINARIES.has(parsed.binary)) {
    return requireApproval(
      `"${parsed.binary}" is outside the autonomous set`,
      'The command can affect systems or data beyond the workspace.',
      `If approved, "${command}" runs in ${ctx.workspace}.`,
    );
  }
  if (!allowed.has(parsed.binary)) {
    return requireApproval(
      `"${parsed.binary}" is not on the allowed-binary list`,
      'An unrecognised binary has unknown side effects.',
      `If approved, "${command}" runs in ${ctx.workspace}.`,
    );
  }
  if (parsed.binary === 'git') {
    const sub = parsed.args.find((a) => !a.startsWith('-')) ?? '';
    if (APPROVAL_GIT_SUBCOMMANDS.has(sub)) {
      return requireApproval(
        `git ${sub} changes published or historical state`,
        'History rewrites and pushes are hard to reverse.',
        `If approved, "${command}" runs in ${ctx.workspace}.`,
      );
    }
  }
  if (parsed.binary === 'npm' || parsed.binary === 'pnpm' || parsed.binary === 'yarn') {
    const sub = parsed.args.find((a) => !a.startsWith('-')) ?? '';
    if (sub === 'publish' || sub === 'deploy') {
      return requireApproval(
        `${parsed.binary} ${sub} publishes outside the workspace`,
        'Publication is externally visible and effectively irreversible.',
        `If approved, "${command}" runs in ${ctx.workspace}.`,
      );
    }
  }
  return allow(`"${parsed.binary}" is permitted`);
}

/** Categories that always require a human, regardless of which tool proposes them. */
export const RESTRICTED_ACTIONS = [
  'production_deploy', 'external_communication', 'spending', 'legal_commitment',
  'destructive_production', 'irreversible_database_change', 'security_policy_change',
  'payment_policy_change', 'credential_change', 'critical_data_deletion',
  'outside_workspace',
] as const;

export type RestrictedAction = (typeof RESTRICTED_ACTIONS)[number];

export function checkRestrictedAction(action: RestrictedAction, detail: string): Decision {
  return requireApproval(
    `"${action}" requires human authorisation`,
    'This action is outside the agent\'s autonomous authority.',
    detail,
  );
}
