/**
 * Agent Foundry V1 — public API (Phase 1 + Phase 2).
 */

export {
  FOUNDRY_RUN_STATUSES,
  AGENT_LIFECYCLES,
  CANONICAL_WORKFORCE_ROLE_IDS,
  FOUNDRY_ERROR_CODES,
  EVAL_SUITE_CLASSES,
  type FoundryRunStatus,
  type AgentLifecycle,
  type CanonicalWorkforceRoleId,
  type BehaviorExample,
  type SourcePacket,
  type BehaviorContract,
  type ProviderRequirements,
  type ProviderCompatibilityStatus,
  type ProviderCompatibilityGap,
  type ProviderCompatibilityResult,
  type FoundryErrorCode,
  type FoundryError,
  type FoundryValidationResult,
  type AgentSpec,
  type CapabilityManifest,
  type ToolManifest,
  type MemoryContract,
  type WorkflowContract,
  type PermissionManifest,
  type EvalSuiteClass,
  type EvalCase,
  type EvalSuite,
  type ProvenanceManifest,
  type KnownLimitations,
  type AgentPackage,
  type CandidateRegistryContract,
  type ReuseDisposition,
  type ReuseAssetKind,
  type ReuseHit,
  type ReuseGap,
  type ReuseCapabilityDisposition,
  type ReuseMap,
  type ReuseAnalysisResult,
  type FoundryEvidenceIntegrity,
  type FoundryEvidenceCandidate,
  type FoundryEvidenceAdmission,
  type FoundryEvidenceRef,
  type FoundryEvidenceGate,
  type EvalHarnessScore,
  type TournamentReport,
} from './types.js';

export {
  validateSourcePacket,
  sourcePacketFromFoundryRequest,
  type SourcePacketValidationResult,
  type SourcePacketValidationOk,
  type SourcePacketValidationFail,
  type FoundryRequestLike,
} from './source-packet.js';

export {
  collectDeterministicPatternSignals,
  evaluateBoundaryPolicy,
  type BoundaryDecisionKind,
  type BoundarySignal,
  type BoundarySignalKind,
  type BoundaryPolicyInput,
  type BoundaryPolicyResult,
} from './boundary-policy.js';

export { matchProviderRequirements } from './provider-compatibility.js';

export {
  analyzeReuse,
  loadSkillPackIndex,
  type ReuseAnalysisInput,
  type SkillRegistryLike,
  type SkillPackIndex,
} from './reuse-analysis.js';

export {
  buildEvalSuite,
  evalSuiteCoversRequiredClasses,
  type BuildEvalSuiteInput,
} from './eval-suite.js';

export {
  createDefaultFoundryEvidenceGate,
  assertScriptedFirst,
  runEvaluationHarness,
  admitOrRejectScore,
  type EvalHarnessInput,
  type EvalHarnessResult,
} from './eval-harness.js';
