/**
 * Agent Foundry V1 Phase 3 — in-memory package materialization from reuse.
 *
 * Builds a minimum AgentPackage from SourcePacket + BehaviorContract +
 * ReuseAnalysisResult + ProviderRequirements. Tool/skill ids come only from
 * ReuseMap hits; gaps are recorded in KnownLimitations / openGaps.
 * No filesystem candidate registry writeout.
 */
import { createHash, randomUUID } from 'node:crypto';
import { buildEvalSuite } from './eval-suite.js';
import type {
  AgentLifecycle,
  AgentPackage,
  BehaviorContract,
  MaterializedCandidateDraft,
  PermissionManifest,
  ProviderRequirements,
  ReuseAnalysisResult,
  ReuseHit,
  SourcePacket,
  WorkflowContract,
} from './types.js';

const DENY_BY_DEFAULT_FLAGS = [
  'deny-unrestricted-shell',
  'deny-prod-access',
  'deny-credential-access',
  'deny-deploy',
] as const;

const PRIVILEGED_SCOPE_PATTERNS: Array<{ pattern: RegExp; permission: string }> = [
  { pattern: /\bshell\b|unrestricted.?shell|bash|exec/i, permission: 'shell' },
  { pattern: /\bprod(uction)?\b|prod.?access/i, permission: 'prod-access' },
  { pattern: /\bcredential|secret|api.?key|token.?vault/i, permission: 'credential-access' },
  { pattern: /\bdeploy|release|ship.?to.?prod/i, permission: 'deploy' },
];

export interface MaterializePackageInput {
  packet: SourcePacket;
  contract: BehaviorContract;
  reuse: ReuseAnalysisResult;
  providerRequirements?: ProviderRequirements;
  /** Optional stable candidate id (defaults to deterministic hash of packet name + mission). */
  candidateId?: string;
  /** Draft lifecycle — TEMPORARY_CANDIDATE (default) or CANDIDATE. In-memory only. */
  lifecycle?: Extract<AgentLifecycle, 'TEMPORARY_CANDIDATE' | 'CANDIDATE'>;
  /** Optional version string for AgentSpec. */
  version?: string;
}

function slugId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base.length > 0 ? base : 'candidate';
}

function deterministicCandidateId(packet: SourcePacket): string {
  const digest = createHash('sha256')
    .update(`${packet.name}\n${packet.mission}\n${packet.capabilities.join(',')}`)
    .digest('hex')
    .slice(0, 12);
  return `candidate-${slugId(packet.name)}-${digest}`;
}

function packetExplicitlyRequires(packet: SourcePacket, permission: string): boolean {
  const haystack = [
    ...(packet.constraints ?? []),
    ...(packet.tools ?? []),
    ...(packet.capabilities ?? []),
    packet.mission,
    packet.deploymentTarget ?? '',
  ]
    .join('\n')
    .toLowerCase();

  switch (permission) {
    case 'shell':
      return /\ballow[- ]?unrestricted[- ]?shell\b|\brequire[- ]?shell\b|\bshell[- ]?access[- ]?required\b/.test(
        haystack,
      );
    case 'prod-access':
      return /\ballow[- ]?prod[- ]?access\b|\brequire[- ]?prod\b/.test(haystack);
    case 'credential-access':
      return /\ballow[- ]?credential\b|\brequire[- ]?credential\b/.test(haystack);
    case 'deploy':
      return /\ballow[- ]?deploy\b|\brequire[- ]?deploy\b/.test(haystack);
    default:
      return false;
  }
}

/**
 * Least-privilege permission manifest.
 * Unrestricted shell / prod / credential / deploy are denied by default unless
 * the packet explicitly requires them — and deny-by-default flags still remain.
 */
export function buildLeastPrivilegePermissions(packet: SourcePacket): PermissionManifest {
  const permissions: string[] = [...DENY_BY_DEFAULT_FLAGS];
  const requestedHints = [
    ...(packet.tools ?? []),
    ...(packet.capabilities ?? []),
    ...(packet.constraints ?? []),
  ];

  for (const hint of requestedHints) {
    for (const { pattern, permission } of PRIVILEGED_SCOPE_PATTERNS) {
      if (pattern.test(hint) && packetExplicitlyRequires(packet, permission)) {
        permissions.push(`allow-${permission}-with-approval`);
      }
    }
  }

  // Safe read-only / declared tool scopes from packet tools (non-privileged).
  for (const tool of packet.tools ?? []) {
    const lower = tool.toLowerCase();
    if (
      /shell|deploy|credential|prod|exec|bash/.test(lower) &&
      !packetExplicitlyRequires(packet, 'shell') &&
      !packetExplicitlyRequires(packet, 'deploy') &&
      !packetExplicitlyRequires(packet, 'credential-access') &&
      !packetExplicitlyRequires(packet, 'prod-access')
    ) {
      // Do not grant privileged tool scopes from mere name mention.
      continue;
    }
    permissions.push(`tool:${tool}`);
  }

  return { permissions: [...new Set(permissions)] };
}

function workflowFrom(packet: SourcePacket, contract: BehaviorContract): WorkflowContract {
  const steps: string[] = [
    `Interpret mission: ${packet.mission}`,
    'Apply behavior contract observables',
  ];
  for (const cap of packet.capabilities) {
    steps.push(`Execute capability: ${cap}`);
  }
  if ((packet.tools ?? []).length > 0) {
    steps.push('Invoke permitted tools only');
  }
  steps.push('Emit output under output contract');
  steps.push('Record provenance and known limitations');
  if (contract.acceptanceCriteria.length > 0) {
    steps.push('Self-check against acceptance criteria');
  }
  return { steps };
}

function toolsFromReuse(hits: ReuseHit[], packet: SourcePacket): { tools: string[]; openGaps: string[] } {
  const tools: string[] = [];
  const openGaps: string[] = [];
  const toolHits = hits.filter((hit) => hit.kind === 'tool' || hit.kind === 'skill');
  for (const hit of toolHits) {
    tools.push(hit.existingId);
  }

  // Packet-declared tools that were not reuse hits remain gaps — do not invent integrations.
  for (const declared of packet.tools ?? []) {
    const matched = hits.some(
      (hit) =>
        hit.existingId.toLowerCase() === declared.toLowerCase() ||
        hit.capability.toLowerCase() === declared.toLowerCase(),
    );
    if (!matched && !tools.some((t) => t.toLowerCase() === declared.toLowerCase())) {
      openGaps.push(`No reuse hit for declared tool "${declared}" — not inventing integration`);
    }
  }
  return { tools: [...new Set(tools)], openGaps };
}

/**
 * Materialize a minimum AgentPackage in memory from reuse analysis.
 * Lifecycle starts as TEMPORARY_CANDIDATE (or CANDIDATE draft) — no registry persistence.
 */
export function materializeAgentPackage(input: MaterializePackageInput): MaterializedCandidateDraft {
  const { packet, contract, reuse } = input;
  const providerRequirements: ProviderRequirements = {
    ...(input.providerRequirements ?? {}),
  };
  // Sensible defaults when packet implies tools / structured evals.
  if ((packet.tools ?? []).length > 0 && providerRequirements.toolCalls === undefined) {
    providerRequirements.toolCalls = true;
  }
  if (providerRequirements.structuredOutput === undefined) {
    providerRequirements.structuredOutput = true;
  }

  const lifecycle = input.lifecycle ?? 'TEMPORARY_CANDIDATE';
  const candidateId = input.candidateId ?? deterministicCandidateId(packet);
  const version = input.version ?? '0.0.0-candidate';

  const { tools, openGaps: toolGaps } = toolsFromReuse(reuse.map.hits, packet);
  const openGaps: string[] = [
    ...toolGaps,
    ...reuse.map.gaps.map(
      (gap) => `Reuse gap for "${gap.capability}": ${gap.justification}`,
    ),
    ...contract.uncertainties.map((u) => `Contract uncertainty: ${u}`),
  ];

  const limitations = [
    ...openGaps,
    'Phase 3 materialization is in-memory only — no candidate registry persistence',
    'No xAI/Gemini/local provider adapters wired',
    'Production CI/browser evidence adapters are not claimed wired',
    ...DENY_BY_DEFAULT_FLAGS.map((flag) => `Permission default: ${flag}`),
  ];

  // Capabilities only from packet — never invent from gaps.
  const capabilities = [...packet.capabilities];

  const evals = buildEvalSuite({ packet, contract });
  const permissions = buildLeastPrivilegePermissions(packet);
  const memoryPersistent = (packet.memory ?? []).filter((m) =>
    /persist|long.?term|profile|user.?pref/i.test(m),
  );
  const memoryTask = (packet.memory ?? []).filter((m) => !memoryPersistent.includes(m));

  const pkg: AgentPackage = {
    spec: {
      id: candidateId,
      name: packet.name,
      mission: packet.mission,
      version,
    },
    capabilities: { capabilities },
    tools: { tools },
    memory: {
      persistent: memoryPersistent,
      taskScoped: memoryTask.length > 0 ? memoryTask : (packet.memory ?? []).map((m) => `task:${m}`),
    },
    workflow: workflowFrom(packet, contract),
    permissions,
    evals,
    providerRequirements,
    provenance: {
      method: 'behavioral-synthesis',
      source: 'user-supplied-specification',
      hiddenPromptRecovered: false,
      chainOfThoughtRecovered: false,
      weightsRecovered: false,
    },
    knownLimitations: { limitations: [...new Set(limitations)] },
  };

  return {
    candidateId,
    package: pkg,
    providerRequirements,
    lifecycle,
    openGaps: [...new Set(openGaps)],
    reuseHits: [...reuse.map.hits],
  };
}

/** Convenience: mint a fresh ephemeral candidate id (still in-memory only). */
export function mintTemporaryCandidateId(prefix = 'tmp'): string {
  return `${prefix}-${randomUUID()}`;
}
