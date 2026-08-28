import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { orchestrate, type OrchestrationRequest, type OrchestrationResult } from '../factory/orchestrator-core.js';
import { loadRoster, type AgentProfile } from './roster.js';

export const CANONICAL_ROLE_IDS = ['shia-core', 'boris', 'design-director', 'gary', 'quality-gate'] as const;
export type CanonicalRoleId = typeof CANONICAL_ROLE_IDS[number];
export type BootstrapCertification = 'approved' | 'legacy-mapped' | 'pending-cristian-approval';

interface RegistryRole {
  id: string;
  name: string;
  owns: string[];
  implementation_status: string;
  certification_status?: string;
  current_evidence: string[];
}

interface InvocationRole {
  role_id: string;
  invoke_as: string[];
  accepts: string[];
  requires: string[];
  produces: string[];
  implementation: { status: string; compatibility_paths: string[] };
}

interface LegacyMapping {
  alias: string;
  owner: CanonicalRoleId;
  classification: 'retained-compatibility-alias' | 'absorbed-capability' | 'deprecated';
  replacement: string;
}

export interface PermanentRoleAdapter {
  id: CanonicalRoleId;
  name: string;
  implementationStatus: string;
  certification: BootstrapCertification;
  callable: true;
  owns: string[];
  accepts: string[];
  requires: string[];
  produces: string[];
  aliases: string[];
  compatibilityPaths: string[];
  hostedIdentity: AgentProfile | null;
}

export interface PermanentWorkforce {
  roles: PermanentRoleAdapter[];
  legacyMappings: LegacyMapping[];
  byId(id: string): PermanentRoleAdapter | null;
  resolve(nameOrAlias: string): { role: PermanentRoleAdapter; mapping: LegacyMapping | null } | null;
}

export interface RoleInvocationRequest {
  role: string;
  capability: string;
  objective: string;
  evidence?: string[];
  exactCandidate?: string;
  bootstrapSubjectRole?: CanonicalRoleId;
  reviewerRole?: CanonicalRoleId;
  humanApproved?: boolean;
  inputs?: Record<string, unknown>;
  orchestrator?: { profileSource: string; request: OrchestrationRequest };
}

export interface RoleInvocationResult {
  roleId: CanonicalRoleId;
  status: 'completed' | 'routed' | 'rejected' | 'blocked' | 'needs-input' | 'evidence-gap';
  callable: true;
  capability: string;
  objective: string;
  evidence: string[];
  missingInputs: string[];
  producedOutputs: string[];
  dispatch: { mode: 'executed' | 'route-only' | 'none'; executed: boolean; runtimePaths: string[] };
  limitations: string[];
  approvalRequired: boolean;
  certified: boolean;
  orchestration?: OrchestrationResult;
}

function present(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function requiredInput(request: RoleInvocationRequest, field: string): unknown {
  switch (field) {
    case 'objective': case 'bounded-objective': return request.objective;
    case 'evidence': return request.evidence;
    case 'exact-candidate': return request.exactCandidate;
    case 'candidate-or-design-artifact': return request.exactCandidate ?? request.inputs?.[field];
    case 'project-or-app-profile': return request.orchestrator?.profileSource;
    case 'current-repository-state': return request.orchestrator?.request.repository;
    default: return request.inputs?.[field];
  }
}

function missingRequiredInputs(role: PermanentRoleAdapter, request: RoleInvocationRequest): string[] {
  return role.requires.filter((field) => !present(requiredInput(request, field)));
}

function routeOnlyPaths(role: PermanentRoleAdapter): string[] {
  if (role.id === 'boris') return ['boris/src/runtime.ts', 'boris/src/identity/roster.ts', 'agents/BORIS-001'];
  if (role.id === 'gary') return ['boris/src/runtime.ts', 'boris/src/identity/roster.ts', 'agents/gary.js', 'agents/GARY-001'];
  if (role.id === 'design-director') return ['skills/design/PACK.json', 'factory/registry/core-v2.json#tool_ownership'];
  if (role.id === 'quality-gate') return ['skills/quality/PACK.json', 'boris/tests', 'agents/tests'];
  return [];
}

function certificationFor(role: RegistryRole): BootstrapCertification {
  if (role.certification_status === 'pending-cristian-bootstrap-approval') return 'pending-cristian-approval';
  if (role.id === 'shia-core') return 'approved';
  return 'legacy-mapped';
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function loadPermanentWorkforce(repoRoot: string): Promise<PermanentWorkforce> {
  const core = JSON.parse(await readFile(path.join(repoRoot, 'factory/registry/core-v2.json'), 'utf8')) as { permanent_roles: RegistryRole[] };
  const invocations = JSON.parse(await readFile(path.join(repoRoot, 'factory/registry/invocation-contracts.json'), 'utf8')) as { roles: InvocationRole[] };
  const legacy = JSON.parse(await readFile(path.join(repoRoot, 'factory/registry/legacy-role-mapping.json'), 'utf8')) as { mappings: LegacyMapping[] };
  const ids = core.permanent_roles.map((role) => role.id);
  if (ids.length !== CANONICAL_ROLE_IDS.length || CANONICAL_ROLE_IDS.some((id) => !ids.includes(id))) {
    throw new Error('permanent registry must contain exactly the five canonical role IDs');
  }
  const hosted = new Map(loadRoster(repoRoot).map((profile) => [profile.agentId, profile]));
  const hostedByRole: Partial<Record<CanonicalRoleId, AgentProfile>> = {
    boris: hosted.get('BORIS-001'),
    gary: hosted.get('GARY-001'),
  };
  const roles = core.permanent_roles.map((role): PermanentRoleAdapter => {
    const id = role.id as CanonicalRoleId;
    const invocation = invocations.roles.find((item) => item.role_id === id);
    if (!invocation || invocation.implementation.status !== role.implementation_status) {
      throw new Error(`permanent invocation contract mismatch for ${id}`);
    }
    if (!role.implementation_status.startsWith('operational')) throw new Error(`permanent role ${id} is not callable`);
    return {
      id, name: role.name, implementationStatus: role.implementation_status,
      certification: certificationFor(role), callable: true, owns: [...role.owns],
      accepts: [...invocation.accepts], requires: [...invocation.requires], produces: [...invocation.produces],
      aliases: [...invocation.invoke_as], compatibilityPaths: [...invocation.implementation.compatibility_paths],
      hostedIdentity: hostedByRole[id] ?? null,
    };
  });
  const byId = (id: string): PermanentRoleAdapter | null => roles.find((role) => role.id === id) ?? null;
  return {
    roles, legacyMappings: legacy.mappings,
    byId,
    resolve(value) {
      const normalized = normalizeAlias(value);
      const direct = roles.find((role) => normalizeAlias(role.id) === normalized || normalizeAlias(role.name) === normalized
        || role.aliases.some((alias) => normalizeAlias(alias) === normalized));
      if (direct) return { role: direct, mapping: null };
      const mapping = legacy.mappings.find((item) => normalizeAlias(item.alias) === normalized);
      if (!mapping) return null;
      const owner = byId(mapping.owner);
      return owner ? { role: owner, mapping } : null;
    },
  };
}

export async function invokePermanentRole(repoRoot: string, request: RoleInvocationRequest): Promise<RoleInvocationResult> {
  const workforce = await loadPermanentWorkforce(repoRoot);
  const resolved = workforce.resolve(request.role);
  if (!resolved) throw new Error(`unknown permanent role or legacy alias: ${request.role}`);
  const role = resolved.role;
  if (!role.accepts.includes(request.capability)) {
    return { roleId: role.id, status: 'rejected', callable: true, capability: request.capability,
      objective: request.objective, evidence: request.evidence ?? [], limitations: [`${role.id} does not accept ${request.capability}`],
      missingInputs: [], producedOutputs: [], dispatch: { mode: 'none', executed: false, runtimePaths: [] },
      approvalRequired: false, certified: false };
  }

  const missingInputs = missingRequiredInputs(role, request);
  if (missingInputs.length > 0) {
    const evidenceGap = role.id === 'gary' || role.id === 'quality-gate';
    return { roleId: role.id, status: evidenceGap ? 'evidence-gap' : 'needs-input', callable: true,
      capability: request.capability, objective: request.objective, evidence: request.evidence ?? [], missingInputs,
      producedOutputs: [], dispatch: { mode: 'none', executed: false, runtimePaths: routeOnlyPaths(role) },
      limitations: [`Invocation contract requirements are unsatisfied: ${missingInputs.join(', ')}.`],
      approvalRequired: false, certified: false };
  }

  if (role.id === 'shia-core') {
    if (!request.orchestrator) throw new Error('validated Shia Core invocation is missing orchestrator input');
    const orchestration = await orchestrate(repoRoot, request.orchestrator.profileSource, request.orchestrator.request);
    return { roleId: role.id, status: orchestration.contract.executionBlocked ? 'blocked' : 'completed', callable: true,
      capability: request.capability, objective: request.objective, evidence: ['boris/src/factory/orchestrator-core.ts'],
      missingInputs: [], producedOutputs: ['task-contract', 'decision-receipt'],
      dispatch: { mode: 'executed', executed: true, runtimePaths: ['boris/src/factory/orchestrator-core.ts'] },
      limitations: orchestration.contract.certificationReleaseBlockers, approvalRequired: orchestration.contract.approvalGates.length > 0,
      certified: !orchestration.contract.certificationReleaseBlocked, orchestration };
  }

  const evidence = [...new Set(request.evidence ?? [])];
  const limitations: string[] = [];
  const status: RoleInvocationResult['status'] = 'routed';
  let approvalRequired = role.certification === 'pending-cristian-approval';
  const certified = false;

  limitations.push(`${role.name} was routed to its existing runtime/capability paths; this adapter did not execute the role or produce its contract outputs.`);

  if (role.id === 'design-director') {
    limitations.push('Phase 4 adapter routes existing design capabilities; it does not invent a missing artifact or certify its own bootstrap.');
  }
  if (role.id === 'quality-gate') {
    if (request.bootstrapSubjectRole === 'quality-gate') {
      approvalRequired = true;
      limitations.push('Quality Gate cannot independently certify its own bootstrap implementation; Cristian approval remains required.');
      if (request.reviewerRole === 'quality-gate') limitations.push('Self-review is recorded as non-independent and cannot satisfy certification.');
    }
  }
  if (request.bootstrapSubjectRole === role.id && role.certification === 'pending-cristian-approval') {
    approvalRequired = true;
    limitations.push(`${role.name} bootstrap approval remains unsatisfied until Cristian approves the exact candidate.`);
  }
  if (request.humanApproved === true && approvalRequired && request.bootstrapSubjectRole === role.id) {
    limitations.push('Runtime input cannot promote its own registry certification; approval must be recorded through repository governance.');
  }
  return { roleId: role.id, status, callable: true, capability: request.capability, objective: request.objective,
    evidence, missingInputs: [], producedOutputs: [],
    dispatch: { mode: 'route-only', executed: false, runtimePaths: routeOnlyPaths(role) },
    limitations, approvalRequired, certified };
}
