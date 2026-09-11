/**
 * Agent Foundry V1 — domain types (Phase 1 + Phase 2).
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

/** Required eval suite classes for Foundry V1 Phase 2. */
export const EVAL_SUITE_CLASSES = [
  'capability',
  'regression',
  'hallucination',
  'adversarial',
  'tool-use',
  'permission',
  'memory-contamination',
  'portability',
  'failure-recovery',
] as const;

export type EvalSuiteClass = (typeof EVAL_SUITE_CLASSES)[number];

export interface EvalCase {
  id: string;
  description: string;
  passCondition: string;
  suiteClass: EvalSuiteClass;
  /** Concrete numeric pass threshold when known. */
  threshold?: number;
  /** True only when threshold is explicitly TBD (placeholder allowed with flag). */
  thresholdTbd?: boolean;
  /** Bad-behavior string this case covers, when mapped from SourcePacket.badBehaviors. */
  mapsBadBehavior?: string;
}

/**
 * Eval suite. Phase 1 callers only need cases[].id/description/passCondition;
 * Phase 2 populates suiteClass, thresholds, and badBehaviorCoverage.
 */
export interface EvalSuite {
  cases: EvalCase[];
  requiredClasses: readonly EvalSuiteClass[];
  badBehaviorCoverage: Array<{ badBehavior: string; evalIds: string[] }>;
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

// --- Phase 2: reuse analysis + harness types ---

export type ReuseDisposition = 'REUSE' | 'EXTEND' | 'CREATE';

export type ReuseAssetKind = 'tool' | 'skill' | 'shelf';

export interface ReuseHit {
  capability: string;
  kind: ReuseAssetKind;
  existingId: string;
  evidence: string;
}

export interface ReuseGap {
  capability: string;
  justification: string;
  noMatchEvidence: string[];
}

export interface ReuseCapabilityDisposition {
  capability: string;
  disposition: ReuseDisposition;
  kind?: ReuseAssetKind;
  existingId?: string;
  evidence: string[];
  justification?: string;
}

/** Map of reuse decisions across requested capabilities / tools. */
export interface ReuseMap {
  hits: ReuseHit[];
  gaps: ReuseGap[];
  dispositions: ReuseCapabilityDisposition[];
}

export interface ReuseAnalysisResult {
  map: ReuseMap;
  analyzedAt: string;
  inputCapabilities: string[];
}

export interface FoundryEvidenceIntegrity {
  /** Hex digest of the evidence payload (required for scripted admission). */
  integrityDigest: string;
  /** Source that produced the score — scripted doubles use this marker. */
  sourceType: string;
  /** Candidate / run identifier the evidence claims to cover. */
  candidateId: string;
  /** Eval id the score belongs to. */
  evalId: string;
  observedAt: string;
}

export interface FoundryEvidenceCandidate {
  score: number;
  passed: boolean;
  integrity: FoundryEvidenceIntegrity;
  evidenceBlob: Record<string, unknown>;
  /** When true, claim is fabricated / not from a harness run — must be rejected. */
  fabricated?: boolean;
}

export type FoundryEvidenceAdmission =
  | {
      admitted: true;
      ref: FoundryEvidenceRef;
      score: number;
      passed: boolean;
    }
  | {
      admitted: false;
      reason: string;
      state: 'unverified';
    };

export interface FoundryEvidenceRef {
  evalId: string;
  candidateId: string;
  sourceType: string;
  integrityDigest: string;
  verificationState: 'verified';
  observedAt: string;
}

/**
 * Narrow evidence gate for Foundry harness.
 * Can wrap admitQualityGateInput later; default accepts scripted deterministic
 * evidence when integrity fields are present.
 */
export interface FoundryEvidenceGate {
  admit(candidate: FoundryEvidenceCandidate): FoundryEvidenceAdmission;
}

export interface EvalHarnessScore {
  evalId: string;
  suiteClass: EvalSuiteClass;
  score: number;
  passed: boolean;
  evidenceBlob: Record<string, unknown>;
  admission: FoundryEvidenceAdmission;
}

export interface TournamentReport {
  candidateId: string;
  /** Suite-class → admitted numeric score only (unverified scores omitted). */
  scoresBySuite: Partial<Record<EvalSuiteClass, number>>;
  evidenceRefs: FoundryEvidenceRef[];
  pass: boolean;
  fail: boolean;
  rejectReasons: string[];
}
