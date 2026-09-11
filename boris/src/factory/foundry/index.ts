/**
 * Agent Foundry V1 — public API (Phase 1 + Phase 2 + Phase 3).
 */

export {
  FOUNDRY_RUN_STATUSES,
  AGENT_LIFECYCLES,
  CANONICAL_WORKFORCE_ROLE_IDS,
  FOUNDRY_ERROR_CODES,
  EVAL_SUITE_CLASSES,
  EVAL_RUNNER_CHECK_KINDS,
  type FoundryRunStatus,
  type AgentLifecycle,
  type CanonicalWorkforceRoleId,
  type BehaviorExample,
  type SourcePacket,
  type BehaviorContract,
  type BehaviorContractCompileResult,
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
  type MaterializedCandidateDraft,
  type EvalRunnerCheckKind,
  type StructuredEvalCheckResult,
  type TournamentCandidateInput,
  type TournamentSynthesisInput,
  type TournamentJudgement,
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

export {
  compileBehaviorContract,
} from './behavior-contract.js';

export {
  materializeAgentPackage,
  buildLeastPrivilegePermissions,
  mintTemporaryCandidateId,
  type MaterializePackageInput,
} from './package-materialize.js';

export {
  createFoundryEvidenceGate,
  foundryEvidenceDigest,
  SCRIPTED_EVIDENCE_SOURCE,
  PHASE3_ADMITTED_SOURCE_TYPES,
  type FoundryEvidenceGateOptions,
  type Phase3AdmittedSourceType,
} from './evidence-gate.js';

export {
  runKeywordHeuristicCheck,
  runPermissionLeastPrivilegeCheck,
  runBoundaryRefusalCheck,
  runProviderIncompatibleCheck,
  runIncompletePacketCheck,
  runFabricatedEvidenceCheck,
  runStructuredEvalChecks,
  aggregateStructuredChecks,
  type EvalRunnerContext,
} from './eval-runners.js';

export {
  synthesizeFromTournament,
  toFoundryJudgementShape,
  mintFoundryRunId,
} from './tournament.js';
