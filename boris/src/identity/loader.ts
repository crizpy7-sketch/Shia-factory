/**
 * Loads a portable agent identity from agents/<AGENT-ID> — the canonical source of truth.
 * The runtime reads these packages; it never rewrites them.
 *
 * Two packages live here and they do not agree in shape. BORIS-001 declares five authority keys;
 * GARY-001 declares twelve with different names, plus a simulation notice and operating rules Boris
 * has no equivalent for. The loader therefore keeps authority as the record the package supplied
 * rather than forcing both into one interface — flattening them would silently drop whichever keys
 * the shared shape had no slot for.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Whatever the package declared. `advisory` and `final_authority` are the only keys both packages
 * share; everything else is read by name and absent means "not declared", never "granted".
 */
export type Authority = Record<string, boolean | string | undefined>;

export interface AgentIdentity {
  agentId: string;
  displayName: string;
  version: string;
  origin: string;
  status: string;
  roles: string[];
  authority: Authority;
  invocationAliases: string[];
  cognitiveModel: string;
  runtimeContract: string;
  certificationStatus: string;
  requiredRecognitionTests: string[];
  recertification: string;
  migrationStatus: string;
  sourceDir: string;
  /** Present when the package insists on it. GARY-001 does; BORIS-001 does not. */
  simulationNotice: string | null;
  /** Package-declared operating rules, verbatim. Empty when the package declares none. */
  operatingRules: string[];
}

/** The name this module used when only one agent existed. Kept so callers need not all change. */
export type BorisIdentity = AgentIdentity;

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) throw new Error(`Missing identity file: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function loadIdentity(identityDir: string): AgentIdentity {
  const identity = readJson(join(identityDir, 'identity', 'identity.json'));
  const passport = readJson(join(identityDir, 'identity', 'agent_passport.json'));
  const migration = existsSync(join(identityDir, 'runtime', 'migration_manifest.json'))
    ? readJson(join(identityDir, 'runtime', 'migration_manifest.json'))
    : {};
  const declared = identity['authority'];
  const authority: Authority = declared && typeof declared === 'object'
    ? { ...(declared as Authority) }
    : {
      advisory: true, challenge_rights: true, may_request_rework: true,
      may_merge: false, may_deploy: false, may_access_secrets: false, final_authority: 'Cristian',
    };

  return {
    agentId: String(identity['agent_id'] ?? 'UNKNOWN'),
    displayName: String(identity['display_name'] ?? 'Unknown'),
    version: String(identity['version'] ?? 'unknown'),
    origin: String(identity['origin'] ?? identity['owner'] ?? ''),
    status: String(identity['status'] ?? ''),
    roles: strings(identity['roles']),
    authority,
    invocationAliases: strings(identity['invocation_aliases']),
    cognitiveModel: readText(join(identityDir, 'identity', 'cognitive_model.md')),
    runtimeContract: readText(join(identityDir, 'runtime', 'runtime_contract.md')),
    certificationStatus: String(passport['certification_status'] ?? 'UNKNOWN'),
    requiredRecognitionTests: strings(passport['required_recognition_tests']),
    recertification: readText(join(identityDir, 'evals', 'RECERTIFICATION.md')),
    migrationStatus: String(migration['migration_status'] ?? migration['migration_gate'] ?? 'UNKNOWN'),
    sourceDir: identityDir,
    simulationNotice: typeof identity['simulation_notice'] === 'string' ? identity['simulation_notice'] : null,
    operatingRules: strings(identity['operating_rules']),
  };
}

/**
 * How an agent is briefed. The discipline differs per agent and is drawn from that agent's own
 * package, not invented here — see roster.ts, which is where the values come from and cites them.
 */
export interface AgentCharter {
  /** The sentence that names what kind of agent he is. */
  headline: string;
  /** His default role, used to label runs. A delegation overrides it with a narrower one. */
  role: string;
  /** His operating cycle, in his own discipline's terms. */
  cycle: string[];
  /** What "done" means for him. */
  completion: string[];
}

/** Renders the authority record the package actually declared, in its own words. */
function renderAuthority(authority: Authority): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(authority)) {
    if (key === 'final_authority' || value === undefined) continue;
    lines.push(`- ${key.replace(/^may_/, 'may ').replace(/_/g, ' ')}: ${String(value)}`);
  }
  lines.push(`- final authority: ${String(authority['final_authority'] ?? 'the owner')}`);
  return lines;
}

/**
 * The system prompt. Identity, authority and discipline come from the package and its charter,
 * not from a literal in code, so the runtime cannot quietly drift from who an agent is.
 */
export function buildSystemPrompt(identity: AgentIdentity, extras: {
  workspace: string;
  toolNames: string[];
  memory: string;
  skills: string;
  objective: string;
  role?: string;
  charter: AgentCharter;
}): string {
  return [
    `You are ${identity.displayName} (${identity.agentId}), ${extras.charter.headline}`,
    `Roles: ${identity.roles.join(', ')}.`,
    extras.role && extras.role !== extras.charter.role
      ? `You are operating as a bounded specialist: ${extras.role}. Stay inside that remit, use only the tools you were granted, and report back rather than expanding scope.`
      : '',
    identity.simulationNotice ? `\n## Identity boundary\n${identity.simulationNotice}` : '',
    '',
    '## Cognitive model',
    identity.cognitiveModel.trim(),
    '',
    '## Runtime contract',
    identity.runtimeContract.trim(),
    '',
    identity.operatingRules.length
      ? `## Operating rules (from your package)\n${identity.operatingRules.map((r) => `- ${r}`).join('\n')}\n`
      : '',
    '## Authority (enforced in code, not by your judgement)',
    ...renderAuthority(identity.authority),
    'Restricted actions are refused by the permission engine before they run. If you need one,',
    'call request_approval with a clear reason, risk and consequence.',
    '',
    '## Operating cycle',
    ...extras.charter.cycle,
    '',
    `## Workspace`,
    `${extras.workspace} — all file and command tools are sandboxed to this directory.`,
    '',
    `## Tools available`,
    extras.toolNames.join(', '),
    'These are the only tools you have. A tool that is not listed does not exist for you and calling',
    'it will be refused.',
    '',
    extras.skills ? `## Relevant skills\n${extras.skills}` : '',
    extras.memory ? `## Relevant memory\n${extras.memory}` : '',
    '',
    '## Objective',
    extras.objective,
    '',
    '## Completion',
    ...extras.charter.completion,
  ].filter((line) => line !== '').join('\n');
}
