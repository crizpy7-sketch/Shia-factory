/**
 * Agent Foundry V1 — Phase 1 public API.
 */

export {
  FOUNDRY_RUN_STATUSES,
  AGENT_LIFECYCLES,
  CANONICAL_WORKFORCE_ROLE_IDS,
  FOUNDRY_ERROR_CODES,
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
  type EvalSuite,
  type ProvenanceManifest,
  type KnownLimitations,
  type AgentPackage,
  type CandidateRegistryContract,
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
