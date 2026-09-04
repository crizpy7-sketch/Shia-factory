/**
 * Agent Foundry V1 — Phase 1 domain types.
 *
 * FoundryRunStatus describes a single foundry *run*.
 * AgentLifecycle describes a *candidate agent*'s lifecycle state.
 * These must remain separate enums; run-only statuses must never appear on lifecycle.
 */

/** Status of a Foundry run (not agent lifecycle). */
export const FOUNDRY_RUN_STATUSES = [
  'running',
  'needs_input',
  'refused_boundary',
  'completed',
  'failed',
  'budget_exceeded',
  'blocked',
] as const;

export type FoundryRunStatus = (typeof FOUNDRY_RUN_STATUSES)[number];

/**
 * Lifecycle of a Foundry candidate agent.
 *
 * PROMOTED means the candidate passed Foundry promotion review for packaging /
 * deployment eligibility in later phases. It is NOT membership in the canonical
 * permanent workforce (shia-core / boris / design-director / gary / quality-gate).
 */
export const AGENT_LIFECYCLES = [
  'TEMPORARY_CANDIDATE',
  'CANDIDATE',
  'PROMOTION_REVIEW',
  'PROMOTED',
  'REJECTED',
  'ARCHIVED',
] as const;

export type AgentLifecycle = (typeof AGENT_LIFECYCLES)[number];

/** Canonical permanent workforce role ids — exactly five; never overlapped by AgentLifecycle. */
export const CANONICAL_WORKFORCE_ROLE_IDS = [
  'shia-core',
  'boris',
  'design-director',
  'gary',
  'quality-gate',
] as const;

export type CanonicalWorkforceRoleId = (typeof CANONICAL_WORKFORCE_ROLE_IDS)[number];

export interface BehaviorExample {
  input: string;
  desiredBehavior: string;
}

export interface SourcePacket {
  name: string;
  /** Preferred field; `objective` is accepted as an alias at validation time. */
  mission: string;
  capabilities: string[];
  tools?: string[];
  memory?: string[];
  constraints?: string[];
  examples?: BehaviorExample[];
  badBehaviors?: string[];
  goodExamples?: string[];
  deploymentTarget?: string;
}

export interface BehaviorContract {
  observables: string[];
  constraints: string[];
  goodExamples: BehaviorExample[];
  badExamples: string[];
  acceptanceCriteria: string[];
  uncertainties: string[];
}

/** Requirements a Foundry package may demand of a model provider (domain-side). */
export interface ProviderRequirements {
  toolCalls?: boolean;
  structuredOutput?: boolean;
  reasoning?: boolean;
  minContextWindow?: number;
  minMaxOutputTokens?: number;
  streaming?: boolean;
}

export type ProviderCompatibilityStatus = 'READY' | 'INCOMPATIBLE';

export interface ProviderCompatibilityGap {
  capability: string;
  required: unknown;
  actual: unknown;
  message: string;
}

export interface ProviderCompatibilityResult {
  status: ProviderCompatibilityStatus;
  gaps: ProviderCompatibilityGap[];
}

export const FOUNDRY_ERROR_CODES = [
  'INCOMPLETE_PACKET',
  'BOUNDARY_REFUSED',
  'PROVIDER_INCOMPATIBLE',
  'PERMISSION_DENIED',
  'BUDGET_EXCEEDED',
  'PROVENANCE_INCOMPLETE',
  'GOVERNANCE_REQUIRED',
  'QUALITY_GATE_REJECT',
  'REUSE_CONFLICT',
  'EVAL_THRESHOLD_FAIL',
] as const;

export type FoundryErrorCode = (typeof FOUNDRY_ERROR_CODES)[number];

export interface FoundryError {
  code: FoundryErrorCode;
  message: string;
  runStatus?: FoundryRunStatus;
  gaps?: string[];
  issues?: string[];
  details?: Record<string, unknown>;
}

export interface FoundryValidationResult {
  ok: boolean;
  error?: FoundryError;
  runStatus?: FoundryRunStatus;
}

/** Minimum Agent Package stubs for later phases (interfaces only). */
export interface AgentSpec {
  id: string;
  name: string;
  mission: string;
  version: string;
}

export interface CapabilityManifest {
  capabilities: string[];
}

export interface ToolManifest {
  tools: string[];
}

export interface MemoryContract {
  persistent: string[];
  taskScoped: string[];
}

export interface WorkflowContract {
  steps: string[];
}

export interface PermissionManifest {
  permissions: string[];
}

export interface EvalSuite {
  cases: Array<{ id: string; description: string; passCondition: string }>;
}

export interface ProvenanceManifest {
  method: string;
  source: string;
  hiddenPromptRecovered: boolean;
  chainOfThoughtRecovered: boolean;
  weightsRecovered: boolean;
}

export interface KnownLimitations {
  limitations: string[];
}

export interface AgentPackage {
  spec: AgentSpec;
  capabilities: CapabilityManifest;
  tools: ToolManifest;
  memory: MemoryContract;
  workflow: WorkflowContract;
  permissions: PermissionManifest;
  evals: EvalSuite;
  provenance: ProvenanceManifest;
  knownLimitations: KnownLimitations;
}

/**
 * Intended candidate-registry API (interface only — no persistence in Phase 1).
 */
export interface CandidateRegistryContract {
  get(candidateId: string): Promise<AgentPackage | null>;
  list(filter?: { lifecycle?: AgentLifecycle }): Promise<Array<{ id: string; lifecycle: AgentLifecycle }>>;
  register(packet: SourcePacket, pkg: AgentPackage): Promise<{ id: string; lifecycle: AgentLifecycle }>;
  updateLifecycle(candidateId: string, lifecycle: AgentLifecycle): Promise<void>;
}
