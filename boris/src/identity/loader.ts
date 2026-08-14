/**
 * Loads BORIS-001's portable identity from agents/BORIS-001 — the canonical source of truth.
 * The runtime reads this package; it never rewrites it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Authority {
  advisory: boolean;
  challenge_rights: boolean;
  may_request_rework: boolean;
  may_merge: boolean;
  may_deploy: boolean;
  may_access_secrets: boolean;
  final_authority: string;
}

export interface BorisIdentity {
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
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) throw new Error(`Missing identity file: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

export function loadIdentity(identityDir: string): BorisIdentity {
  const identity = readJson(join(identityDir, 'identity', 'identity.json'));
  const passport = readJson(join(identityDir, 'identity', 'agent_passport.json'));
  const migration = existsSync(join(identityDir, 'runtime', 'migration_manifest.json'))
    ? readJson(join(identityDir, 'runtime', 'migration_manifest.json'))
    : {};
  const authority = (identity['authority'] as Authority | undefined) ?? {
    advisory: true, challenge_rights: true, may_request_rework: true,
    may_merge: false, may_deploy: false, may_access_secrets: false, final_authority: 'Cristian',
  };

  return {
    agentId: String(identity['agent_id'] ?? 'BORIS-001'),
    displayName: String(identity['display_name'] ?? 'Boris'),
    version: String(identity['version'] ?? 'unknown'),
    origin: String(identity['origin'] ?? ''),
    status: String(identity['status'] ?? ''),
    roles: Array.isArray(identity['roles']) ? (identity['roles'] as string[]) : [],
    authority,
    invocationAliases: Array.isArray(identity['invocation_aliases']) ? (identity['invocation_aliases'] as string[]) : [],
    cognitiveModel: readText(join(identityDir, 'identity', 'cognitive_model.md')),
    runtimeContract: readText(join(identityDir, 'runtime', 'runtime_contract.md')),
    certificationStatus: String(passport['certification_status'] ?? 'UNKNOWN'),
    requiredRecognitionTests: Array.isArray(passport['required_recognition_tests'])
      ? (passport['required_recognition_tests'] as string[]) : [],
    recertification: readText(join(identityDir, 'evals', 'RECERTIFICATION.md')),
    migrationStatus: String(migration['migration_status'] ?? 'UNKNOWN'),
    sourceDir: identityDir,
  };
}

/**
 * The system prompt. Identity and authority come from the package, not from a literal in code,
 * so the runtime cannot quietly drift from who Boris is.
 */
export function buildSystemPrompt(identity: BorisIdentity, extras: {
  workspace: string;
  toolNames: string[];
  memory: string;
  skills: string;
  objective: string;
  role?: string;
}): string {
  const a = identity.authority;
  return [
    `You are ${identity.displayName} (${identity.agentId}), a Principal Agentic Software Engineer.`,
    `Roles: ${identity.roles.join(', ')}.`,
    extras.role && extras.role !== 'principal engineer'
      ? `You are operating as a bounded specialist: ${extras.role}. Stay inside that remit, use only the tools you were granted, and report back rather than expanding scope.`
      : '',
    '',
    '## Cognitive model',
    identity.cognitiveModel.trim(),
    '',
    '## Runtime contract',
    identity.runtimeContract.trim(),
    '',
    '## Authority (enforced in code, not by your judgement)',
    `- may challenge and request rework: ${a.challenge_rights && a.may_request_rework}`,
    `- may merge: ${a.may_merge} · may deploy: ${a.may_deploy} · may access secrets: ${a.may_access_secrets}`,
    `- final authority: ${a.final_authority}`,
    'Restricted actions are refused by the permission engine before they run. If you need one,',
    'call request_approval with a clear reason, risk and consequence.',
    '',
    '## Operating cycle',
    'Read → Plan → Act → Observe → Verify → Repeat.',
    'Inspect before changing. Verify with commands, not assertions. Report evidence, never claims.',
    'A test you did not run is not a passing test.',
    '',
    `## Workspace`,
    `${extras.workspace} — all file and command tools are sandboxed to this directory.`,
    '',
    `## Tools available`,
    extras.toolNames.join(', '),
    '',
    extras.skills ? `## Relevant skills\n${extras.skills}` : '',
    extras.memory ? `## Relevant memory\n${extras.memory}` : '',
    '',
    '## Objective',
    extras.objective,
    '',
    '## Completion',
    'When the objective is met and verified, call report_result with a concise engineering report and',
    'the evidence that supports it. If you cannot complete it, call report_result with success=false and',
    'state precisely what blocked you. Do not claim success you have not verified.',
  ].filter((line) => line !== '').join('\n');
}
