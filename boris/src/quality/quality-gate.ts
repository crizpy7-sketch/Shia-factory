import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OrchestratorTaskContract } from '../factory/orchestrator-core.js';
import type { RiskTier } from '../factory/operating-system.js';
import { isAdmittedQualityEvidence, isAdmittedQualityGateInput, isVerifiedGovernanceApproval,
  type AdmittedQualityEvidence, type AdmittedQualityGateInput, type ApprovalAdmissionFailure,
  type EvidenceAdmissionFailure, type EvidenceProvenanceClaim, type VerifiedGovernanceApproval } from './evidence-admission.js';

export type QualityFinalState = 'pass' | 'reject' | 'blocked' | 'needs-evidence';
export type GateState = 'pass' | 'fail' | 'blocked' | 'needs-evidence' | 'not-applicable';
export type QualityEvaluationScope = 'pre-deployment-release-readiness' | 'full-lifecycle';
export type ProductionObservationRequirement = 'required' | 'not-applicable';
export type ProductionObservationState = 'not-evaluated-pre-deployment' | 'pass' | 'fail' | 'needs-evidence' | 'not-applicable';
export type QualityGateId = 'automated-checks' | 'browser-visual' | 'accessibility'
  | 'security-adversarial' | 'performance' | 'production-observation' | 'dangerous-action-permission';
export type QualityEvidenceKind = 'typecheck' | 'lint' | 'unit' | 'integration' | 'e2e'
  | 'browser' | 'visual' | 'accessibility' | 'security' | 'adversarial' | 'performance'
  | 'production-observation' | 'permission' | 'independent-review' | 'human-approval' | 'artifact';
export type DangerousAction = 'merge' | 'deploy' | 'secret-access' | 'destructive-database'
  | 'external-publish-send' | 'spending-payment' | 'irreversible-infrastructure';

export interface QualityFinding {
  id: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  summary: string;
  criterionIds: string[];
  evidenceIds: string[];
}

export interface QualityEvidence {
  id: string;
  kind: QualityEvidenceKind;
  candidateSha: string;
  status: 'pass' | 'fail' | 'unavailable';
  source: string;
  summary: string;
  criterionIds: string[];
  observedAt: string;
  method?: 'automated-tool' | 'real-browser' | 'source-inspection' | 'manual-observation' | 'gstack-workflow';
  testedSurfaces?: string[];
  untestedSurfaces?: string[];
  browser?: { name: string; version: string; viewport: { width: number; height: number }; device?: string };
  artifact?: { path: string; sha256: string; mediaType?: string };
  findings?: QualityFinding[];
  thresholds?: Array<{ metric: string; comparator: 'lte' | 'gte'; value: number; unit: string }>;
  measurements?: Array<{ metric: string; value: number; unit: string }>;
  provenance?: EvidenceProvenanceClaim;
}

export interface DangerousActionRequest {
  action: DangerousAction;
  authorization: 'denied' | 'pending' | 'approved';
  approvedBy?: string;
  candidateSha?: string;
  source?: string;
  approvalId?: string;
}

export interface QualityChangeSignals {
  userFacing: boolean;
  securitySurfaces: string[];
  performanceSurfaces: Array<'frontend' | 'api-backend' | 'large-data-database' | 'ai-media'>;
  performanceFailureMaterial: boolean;
  subjectRoles: string[];
}

export interface QualityGateInput {
  taskId: string;
  projectId: string;
  repository: string;
  candidateSha: string;
  branch: string;
  riskTier: RiskTier;
  taskContract: OrchestratorTaskContract;
  acceptanceCriteria: Array<{ id: string; statement: string; evidence: string[] }>;
  requiredEvidence: string[];
  actualEvidence: QualityEvidence[];
  approvalReferences?: string[];
  changedPaths: string[];
  changeSignals: QualityChangeSignals;
  dangerousActions: DangerousActionRequest[];
  reviewer: { id: string; source: string; independent: boolean } | null;
  repair: { attempt: number; maxAttempts: number };
  evaluatedAt: string;
  /** Omitted legacy inputs retain the historical full-lifecycle behavior. */
  evaluationScope?: QualityEvaluationScope;
  /** Explicit scoped inputs default to required; only legacy unscoped inputs default to not-applicable. */
  productionObservationRequirement?: ProductionObservationRequirement;
}

export interface CanonicalQualityGateInput extends Omit<QualityGateInput, 'evaluationScope' | 'productionObservationRequirement'> {
  evaluationScope: QualityEvaluationScope;
  productionObservationRequirement: ProductionObservationRequirement;
}

export interface CriterionResult {
  id: string;
  statement: string;
  state: 'pass' | 'fail' | 'needs-evidence' | 'not-evaluated';
  requiredEvidence: string[];
  evidenceIds: string[];
  failures: QualityFinding[];
}

export interface IndividualGateResult {
  id: QualityGateId;
  applicable: boolean;
  state: GateState;
  mode: string;
  requiredEvidenceKinds: QualityEvidenceKind[];
  evidenceIds: string[];
  findings: QualityFinding[];
  untestedSurfaces: string[];
  limitations: string[];
}

export interface ReworkRequest {
  owner: 'boris';
  candidateSha: string;
  failedCriterionId: string;
  reason: string;
  evidenceIds: string[];
  repairAttempt: number;
  remainingAttempts: number;
  newCandidateRequired: true;
}

export interface QualityGateReceipt {
  schemaVersion: '1.2.0';
  receiptId: string;
  evaluationScope: QualityEvaluationScope;
  receiptStatus: 'current';
  scopeBindingId: string;
  productionObservationRequirement: ProductionObservationRequirement;
  scopeStatus: {
    productionDeploymentObservation: ProductionObservationState;
    fullLifecycleEvaluation: 'required-after-production-observation' | 'current-evaluation';
    cristianApproval: 'required-separately';
    deploymentAuthority: 'not-granted';
  };
  finalState: QualityFinalState;
  taskId: string;
  projectId: string;
  repository: string;
  candidateSha: string;
  branch: string;
  riskTier: RiskTier;
  changedPaths: string[];
  changeSignals: QualityChangeSignals;
  taskContract: OrchestratorTaskContract;
  acceptanceCriteria: Array<{ id: string; statement: string; evidence: string[] }>;
  requiredEvidence: string[];
  actualEvidence: AdmittedQualityEvidence[];
  staleEvidence: AdmittedQualityEvidence[];
  rawEvidence: QualityEvidence[];
  unverifiedEvidence: EvidenceAdmissionFailure[];
  governanceApprovals: VerifiedGovernanceApproval[];
  unverifiedApprovals: ApprovalAdmissionFailure[];
  criterionResults: CriterionResult[];
  gateResults: IndividualGateResult[];
  knownLimitations: string[];
  reworkRequests: ReworkRequest[];
  approvalGates: Array<{ name: string; state: 'satisfied' | 'pending' | 'denied'; evidenceId: string | null }>;
  independentReviewer: { id: string; source: string; independent: boolean } | null;
  controlPlane: {
    authority: 'shia-core';
    qualityGateMayAcceptTask: false;
    gstackMayAcceptTask: false;
    qualityEvidenceGrantsActionAuthority: false;
  };
  repair: { attempt: number; maxAttempts: number; remainingAttempts: number };
  evaluatedAt: string;
}

export interface TrustedQualityGateReceiptRecord {
  sourceId: string;
  evaluator: 'shia-factory-permanent-quality-gate/1.2.0';
  receipt: QualityGateReceipt;
  collector: string;
  observedAt: string;
  integrityDigest: string;
}

export interface VerifiedQualityGateReceiptResolution {
  receipt: QualityGateReceipt;
  provenance: {
    sourceId: string;
    evaluator: 'shia-factory-permanent-quality-gate/1.2.0';
    resolverId: string;
    resolverProvenance: string;
    collector: string;
    observedAt: string;
    verificationState: 'verified';
    integrityDigest: string;
  };
}

export interface QualityGateReceiptResolver {
  id: string;
  provenance: string;
  resolve(referenceId: string): VerifiedQualityGateReceiptResolution | null;
}

const SHA = /^[0-9a-f]{40,64}$/i;
const TIERS: RiskTier[] = ['T0', 'T1', 'T2', 'T3', 'T4'];
const UI_PATH = /(^|\/)(app|pages|components|ui|public|styles)(\/|$)|\.(tsx|jsx|css|scss|html)$/i;
const SECURITY_PATH = /auth|permission|policy|secret|payment|stripe|database|migration|infra|deploy|session|tenant/i;
const PERFORMANCE_PATH = /(^|\/)(api|server|backend|database|db|queries|media|images|video|audio|ai|models|workers|streams)(\/|$)/i;
const QUALITY_SELF_CHANGE_PATH = /^(boris\/src\/quality\/|factory\/quality\/|agents\/quality-gate\/)|^boris\/src\/identity\/permanent-workforce\.ts$|^factory\/registry\/invocation-contracts\.json$/i;
const EXPECTED_GATE_IDS: QualityGateId[] = ['automated-checks', 'browser-visual', 'accessibility',
  'security-adversarial', 'performance', 'production-observation', 'dangerous-action-permission'];
const PRE_DEPLOYMENT_DEFERRED_REQUIREMENTS = new Set(['production-observation', 'human_approval']);
const mintedReceipts = new WeakSet<object>();
const mintedReceiptRecords = new WeakSet<object>();
const verifiedReceiptResolutions = new WeakSet<object>();

export const QUALITY_GATE_RISK_MATRIX = {
  T0: { security: 'baseline', adversarial: false, cristianApproval: false },
  T1: { security: 'baseline', adversarial: false, cristianApproval: false },
  T2: { security: 'when-security-surface', adversarial: false, cristianApproval: false },
  T3: { security: 'mandatory', adversarial: true, cristianApproval: false },
  T4: { security: 'mandatory', adversarial: true, cristianApproval: true },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

function canonicalCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function evidenceAliases(kind: string): QualityEvidenceKind[] {
  const aliases: Record<string, QualityEvidenceKind[]> = {
    test: ['unit', 'integration', 'e2e'], runtime: ['e2e', 'browser'], browser: ['browser'], visual: ['visual'],
    accessibility: ['accessibility'], security: ['security'], review: ['independent-review', 'adversarial'],
    human_approval: ['human-approval'], performance: ['performance'], typecheck: ['typecheck'], lint: ['lint'],
    unit: ['unit'], integration: ['integration'], e2e: ['e2e'], adversarial: ['adversarial'], permission: ['permission'],
    'production-observation': ['production-observation'],
  };
  return aliases[kind] ?? [];
}

function changesQualityGate(input: Pick<CanonicalQualityGateInput, 'changedPaths' | 'changeSignals'>): boolean {
  return input.changeSignals.subjectRoles.includes('quality-gate')
    || input.changedPaths.some((changedPath) => QUALITY_SELF_CHANGE_PATH.test(changedPath));
}

function validateInput(input: CanonicalQualityGateInput): string[] {
  const errors: string[] = [];
  if (!input.taskId.trim()) errors.push('taskId is required');
  if (!input.projectId.trim()) errors.push('projectId is required');
  if (!input.repository.trim()) errors.push('repository is required');
  if (!SHA.test(input.candidateSha)) errors.push('candidateSha must be an exact 40-64 character hexadecimal digest');
  if (!input.branch.trim()) errors.push('branch is required');
  if (!TIERS.includes(input.riskTier)) errors.push('riskTier is unsupported');
  if (!input.taskContract || input.taskContract.id !== input.taskId) errors.push('taskContract must be bound to taskId');
  if (input.taskContract?.projectId !== input.projectId) errors.push('taskContract must be bound to projectId');
  if (input.taskContract?.risk.tier !== input.riskTier) errors.push('taskContract risk tier must match receipt risk tier');
  if (input.taskContract?.repository.branch !== input.branch) errors.push('taskContract branch must match receipt branch');
  if (stable(input.taskContract?.acceptanceCriteria) !== stable(input.acceptanceCriteria)) errors.push('acceptanceCriteria must match the taskContract snapshot');
  if (stable(input.taskContract?.requiredEvidence) !== stable(input.requiredEvidence)) errors.push('requiredEvidence must match the taskContract snapshot');
  if (input.acceptanceCriteria.length === 0) errors.push('acceptanceCriteria are required');
  if (input.requiredEvidence.length === 0) errors.push('requiredEvidence is required');
  if (input.repair.attempt < 0 || input.repair.maxAttempts < 0 || input.repair.attempt > input.repair.maxAttempts) errors.push('repair budget is invalid');
  if (input.repair.maxAttempts > 2) errors.push('repair budget exceeds the Factory default maximum of 2');
  if (Number.isNaN(Date.parse(input.evaluatedAt))) errors.push('evaluatedAt must be ISO-8601');
  if (!['pre-deployment-release-readiness', 'full-lifecycle'].includes(input.evaluationScope)) errors.push('evaluationScope is unsupported');
  if (!['required', 'not-applicable'].includes(input.productionObservationRequirement)) errors.push('productionObservationRequirement is unsupported');
  if (input.evaluationScope === 'pre-deployment-release-readiness' && input.productionObservationRequirement !== 'required') {
    errors.push('pre-deployment release-readiness requires a later production-observation evaluation');
  }
  const deploymentLifecycle = input.dangerousActions.some((request) => request.action === 'deploy')
    || input.taskContract?.allowedActions.some((decision) => decision.action === 'deploy');
  if (input.evaluationScope === 'full-lifecycle' && deploymentLifecycle
    && input.productionObservationRequirement !== 'required') {
    errors.push('full-lifecycle deployment evaluation requires production-observation evidence');
  }
  const ids = input.actualEvidence.map((item) => item.id);
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) errors.push('actualEvidence IDs must be non-empty and unique');
  for (const evidence of input.actualEvidence) {
    if (!evidence.source.trim() || !evidence.summary.trim()) errors.push(`evidence ${evidence.id || '<unknown>'} requires source and summary`);
    if (!SHA.test(evidence.candidateSha)) errors.push(`evidence ${evidence.id || '<unknown>'} has an invalid candidate SHA`);
    if (Number.isNaN(Date.parse(evidence.observedAt))) errors.push(`evidence ${evidence.id || '<unknown>'} observedAt must be ISO-8601`);
  }
  return unique(errors);
}

function finding(id: string, severity: QualityFinding['severity'], summary: string, evidenceIds: string[] = [], criterionIds: string[] = []): QualityFinding {
  return { id, severity, summary, evidenceIds, criterionIds };
}

function gate(
  id: QualityGateId,
  applicable: boolean,
  mode: string,
  required: QualityEvidenceKind[],
  evidence: QualityEvidence[],
  limitations: string[] = [],
): IndividualGateResult {
  if (!applicable) return { id, applicable, state: 'not-applicable', mode, requiredEvidenceKinds: [], evidenceIds: [], findings: [], untestedSurfaces: [], limitations };
  const relevant = evidence.filter((item) => required.includes(item.kind));
  const evidenceIds = relevant.map((item) => item.id);
  const missing = required.filter((kind) => !relevant.some((item) => item.kind === kind && item.status === 'pass'));
  const failures = relevant.filter((item) => item.status === 'fail').flatMap((item) => item.findings?.length
    ? item.findings
    : [finding(`${id}:${item.id}`, 'P2', item.summary, [item.id], item.criterionIds)]);
  const unavailable = relevant.filter((item) => item.status === 'unavailable');
  const untestedSurfaces = unique(relevant.flatMap((item) => item.untestedSurfaces ?? []));
  if (failures.length > 0) return { id, applicable, state: 'fail', mode, requiredEvidenceKinds: required, evidenceIds, findings: failures, untestedSurfaces, limitations };
  if (missing.length > 0 || unavailable.length > 0) {
    return { id, applicable, state: 'needs-evidence', mode, requiredEvidenceKinds: required, evidenceIds, findings: [], untestedSurfaces,
      limitations: [...limitations, `Missing passing exact-candidate evidence: ${missing.join(', ') || unavailable.map((item) => item.kind).join(', ')}.`] };
  }
  return { id, applicable, state: 'pass', mode, requiredEvidenceKinds: required, evidenceIds, findings: [], untestedSurfaces, limitations };
}

function browserVisualGate(applicable: boolean, evidence: QualityEvidence[]): IndividualGateResult {
  const result = gate('browser-visual', applicable, 'real-browser-artifacts', ['browser', 'visual'], evidence);
  if (!applicable || result.state === 'fail') return result;
  const browser = evidence.find((item) => item.kind === 'browser' && item.status === 'pass');
  const visual = evidence.find((item) => item.kind === 'visual' && item.status === 'pass');
  const limitations: string[] = [];
  if (browser && (browser.method !== 'real-browser' || !browser.browser || !browser.testedSurfaces?.length)) {
    limitations.push('Browser evidence lacks a real-browser method, viewport/device metadata, or tested critical flows.');
  }
  if (visual && (!visual.artifact?.path || !/^[0-9a-f]{64}$/i.test(visual.artifact.sha256))) {
    limitations.push('Visual evidence lacks a retained artifact path and SHA-256 digest.');
  }
  if (limitations.length > 0) return { ...result, state: 'needs-evidence', limitations: [...result.limitations, ...limitations] };
  return result;
}

function accessibilityGate(applicable: boolean, evidence: QualityEvidence[]): IndividualGateResult {
  const result = gate('accessibility', applicable, 'deterministic-ui-accessibility', ['accessibility'], evidence);
  if (!applicable || result.state === 'fail') return result;
  const item = evidence.find((candidate) => candidate.kind === 'accessibility' && candidate.status === 'pass');
  if (item && (item.method === 'source-inspection' || !item.testedSurfaces?.length)) {
    return { ...result, state: 'needs-evidence', untestedSurfaces: unique([...(result.untestedSurfaces), ...(item.untestedSurfaces ?? [])]),
      limitations: [...result.limitations, 'Source inspection alone cannot establish accessibility compliance; deterministic tool or observed interaction evidence is required.'] };
  }
  return result;
}

function securityGate(input: CanonicalQualityGateInput, evidence: QualityEvidence[]): IndividualGateResult {
  const policy = QUALITY_GATE_RISK_MATRIX[input.riskTier];
  const pathSensitive = input.changedPaths.some((item) => SECURITY_PATH.test(item));
  const securitySensitive = pathSensitive || input.changeSignals.securitySurfaces.length > 0;
  const applicable = policy.security === 'mandatory' || policy.security === 'baseline' || securitySensitive;
  const required: QualityEvidenceKind[] = policy.adversarial ? ['security', 'adversarial'] : applicable ? ['security'] : [];
  return gate('security-adversarial', applicable, policy.security, required, evidence,
    applicable ? [] : ['T2 change has no declared or path-derived meaningful security surface.']);
}

function performanceGate(input: CanonicalQualityGateInput, evidence: QualityEvidence[]): IndividualGateResult {
  const materialHighRisk = (input.riskTier === 'T3' || input.riskTier === 'T4') && input.changeSignals.performanceFailureMaterial;
  const pathSensitive = input.changedPaths.some((item) => PERFORMANCE_PATH.test(item));
  const applicable = input.changeSignals.performanceSurfaces.length > 0 || pathSensitive || materialHighRisk;
  const result = gate('performance', applicable, applicable ? 'threshold-measurement' : 'risk-filtered', applicable ? ['performance'] : [], evidence,
    applicable ? [] : ['No performance-sensitive surface or material high-risk performance consequence was declared.']);
  if (!applicable || result.state === 'fail') return result;
  const item = evidence.find((candidate) => candidate.kind === 'performance' && candidate.status === 'pass');
  if (!item) return result;
  if (!item.thresholds?.length || !item.measurements?.length) {
    return { ...result, state: 'needs-evidence', limitations: [...result.limitations, 'Performance evidence requires explicit thresholds and measurements.'] };
  }
  const failures: QualityFinding[] = [];
  for (const threshold of item.thresholds) {
    const measurement = item.measurements.find((candidate) => candidate.metric === threshold.metric && candidate.unit === threshold.unit);
    if (!measurement) {
      return { ...result, state: 'needs-evidence', limitations: [...result.limitations, `Missing measurement for ${threshold.metric} (${threshold.unit}).`] };
    }
    const passed = threshold.comparator === 'lte' ? measurement.value <= threshold.value : measurement.value >= threshold.value;
    if (!passed) failures.push(finding(`performance:${threshold.metric}`, 'P2', `${threshold.metric} ${measurement.value}${measurement.unit} failed ${threshold.comparator} ${threshold.value}${threshold.unit}.`, [item.id]));
  }
  return failures.length > 0 ? { ...result, state: 'fail', findings: failures } : result;
}

function productionObservationGate(input: CanonicalQualityGateInput, evidence: QualityEvidence[]): IndividualGateResult {
  if (input.evaluationScope === 'pre-deployment-release-readiness') {
    return gate('production-observation', false, 'deferred-to-full-lifecycle', [], evidence,
      ['Production deployment and observation are not evaluated before deployment and are never inferred as passing.']);
  }
  if (input.productionObservationRequirement === 'not-applicable') {
    return gate('production-observation', false, 'not-applicable', [], evidence,
      ['The caller declared production deployment observation not applicable to this lifecycle evaluation.']);
  }
  return gate('production-observation', true, 'trusted-production-observation', ['production-observation'], evidence);
}

function permissionGate(input: AdmittedQualityGateInput, evidence: AdmittedQualityEvidence[]): { result: IndividualGateResult; approvals: QualityGateReceipt['approvalGates'] } {
  const findings: QualityFinding[] = [];
  const approvalNames = unique(input.taskContract.approvalGates.flatMap((name) => name.split('+').map((part) => part.trim()).filter(Boolean)));
  const approvals: QualityGateReceipt['approvalGates'] = approvalNames.map((name) => ({ name, state: 'pending', evidenceId: null }));
  const verifiedApprovals = input.governanceApprovals.filter((item) => isVerifiedGovernanceApproval(item));
  const ensureCristian = (): void => {
    if (!approvals.some((item) => item.name === 'Cristian')) approvals.push({ name: 'Cristian', state: 'pending', evidenceId: null });
  };
  if (input.riskTier === 'T4' || changesQualityGate(input)) ensureCristian();
  if (input.dangerousActions.some((request) => request.action !== 'secret-access')) ensureCristian();
  if (input.requiredEvidence.includes('human_approval')
    || input.acceptanceCriteria.some((criterion) => criterion.evidence.includes('human_approval'))) ensureCristian();

  for (const approval of approvals) {
    const match = verifiedApprovals.find((item) => item.taskId === input.taskId && item.candidateSha === input.candidateSha
      && item.decidedBy === 'Cristian' && item.state === 'approved'
      && (item.action === 'quality-certification' || input.dangerousActions.some((request) => request.action === item.action && request.approvalId === item.approvalId)));
    if (approval.name === 'Cristian' && match) { approval.state = 'satisfied'; approval.evidenceId = match.approvalId; }
    if (approval.name === 'quality-receipt') { approval.state = 'satisfied'; approval.evidenceId = 'current-quality-receipt'; }
    const independentEvidence = evidence.find((item) => item.kind === 'independent-review' && item.status === 'pass' && item.source === input.reviewer?.source);
    if (approval.name === 'independent-review' && input.reviewer?.independent && independentEvidence) {
      approval.state = 'satisfied';
      approval.evidenceId = independentEvidence.id;
    }
  }
  for (const request of input.dangerousActions) {
    if (request.action === 'secret-access') {
      findings.push(finding(`permission:${request.action}`, 'P0', 'Quality Gate cannot grant direct secret access; the permanent authority matrix denies it.'));
      continue;
    }
    if (request.authorization === 'denied') {
      findings.push(finding(`permission:${request.action}`, 'P0', `${request.action} is explicitly denied; Quality cannot override denial.`));
      continue;
    }
    const exact = verifiedApprovals.find((approval) => approval.approvalId === request.approvalId
      && approval.taskId === input.taskId && approval.action === request.action
      && approval.candidateSha === input.candidateSha && approval.decidedBy === 'Cristian');
    if (!exact && (input.evaluationScope === 'full-lifecycle' || request.authorization === 'approved')) {
      findings.push(finding(`permission:${request.action}`, 'P0', `${request.action} lacks Cristian approval bound to the exact candidate.`));
    }
  }
  const pending = approvals.filter((item) => item.state !== 'satisfied');
  const state: GateState = findings.length > 0 ? 'blocked'
    : input.evaluationScope === 'pre-deployment-release-readiness' ? pending.some((item) => item.name !== 'Cristian') ? 'blocked' : 'pass'
      : pending.length > 0 ? 'blocked' : 'pass';
  return {
    result: {
      id: 'dangerous-action-permission', applicable: true, state,
      mode: input.evaluationScope === 'pre-deployment-release-readiness' ? 'authorization-deferred-authority-preserving' : 'authority-preserving',
      requiredEvidenceKinds: approvals.length > 0 ? ['human-approval'] : [], evidenceIds: verifiedApprovals.map((item) => item.approvalId),
      findings, untestedSurfaces: [], limitations: [
        'Quality evidence records authorization; it never grants or executes a dangerous action.',
        ...(input.evaluationScope === 'pre-deployment-release-readiness' && pending.length > 0
          ? ['Cristian authorization remains pending and independently required outside this Quality scope.'] : []),
      ],
    },
    approvals,
  };
}

function criterionResults(input: CanonicalQualityGateInput, evidence: QualityEvidence[], governanceApprovalId: string | null): CriterionResult[] {
  return input.acceptanceCriteria.map((criterion) => {
    const relevant = evidence.filter((item) => item.criterionIds.includes(criterion.id));
    const failures = relevant.filter((item) => item.status === 'fail').flatMap((item) => item.findings?.length
      ? item.findings
      : [finding(`criterion:${criterion.id}:${item.id}`, 'P2', item.summary, [item.id], [criterion.id])]);
    const deferred = input.evaluationScope === 'pre-deployment-release-readiness'
      ? criterion.evidence.filter((required) => PRE_DEPLOYMENT_DEFERRED_REQUIREMENTS.has(required)) : [];
    const missing = criterion.evidence.filter((required) => {
      if (deferred.includes(required)) return false;
      if (required === 'human_approval') return governanceApprovalId === null;
      const aliases = evidenceAliases(required);
      return aliases.length === 0 || !relevant.some((item) => aliases.includes(item.kind) && item.status === 'pass');
    });
    return {
      id: criterion.id, statement: criterion.statement,
      state: failures.length > 0 ? 'fail' : missing.length > 0 ? 'needs-evidence' : deferred.length > 0 ? 'not-evaluated' : 'pass',
      requiredEvidence: criterion.evidence, evidenceIds: [...relevant.map((item) => item.id),
        ...(input.evaluationScope === 'full-lifecycle' && criterion.evidence.includes('human_approval') && governanceApprovalId
          ? [governanceApprovalId] : [])], failures,
    };
  });
}

export function evaluateQualityGate(input: AdmittedQualityGateInput): QualityGateReceipt {
  if (!isAdmittedQualityGateInput(input) || input.actualEvidence.some((item) => !isAdmittedQualityEvidence(item))
    || input.governanceApprovals.some((item) => !isVerifiedGovernanceApproval(item))) {
    throw new Error('Quality Gate requires input produced by the trusted evidence-admission boundary');
  }
  const structuralErrors = validateInput(input);
  const currentEvidence = input.actualEvidence.filter((item) => item.candidateSha === input.candidateSha);
  const staleEvidence = input.actualEvidence.filter((item) => item.candidateSha !== input.candidateSha);
  const uiApplicable = input.changeSignals.userFacing || input.changedPaths.some((item) => UI_PATH.test(item));
  const gates: IndividualGateResult[] = [
    gate('automated-checks', true, 'standard', ['typecheck', 'lint', 'unit', 'integration'], currentEvidence),
    browserVisualGate(uiApplicable, currentEvidence),
    accessibilityGate(uiApplicable, currentEvidence),
    securityGate(input, currentEvidence),
    performanceGate(input, currentEvidence),
    productionObservationGate(input, currentEvidence),
  ];
  const permissions = permissionGate(input, currentEvidence);
  gates.push(permissions.result);
  // Authorization remains a governance record, never a generic QualityEvidence claim.
  const governanceApprovalId = permissions.approvals.find((item) => item.name === 'Cristian' && item.state === 'satisfied')?.evidenceId ?? null;
  const criteria = criterionResults(input, currentEvidence, governanceApprovalId);
  const requiredEvidenceGaps = input.requiredEvidence.filter((required) => {
    if (input.evaluationScope === 'pre-deployment-release-readiness' && PRE_DEPLOYMENT_DEFERRED_REQUIREMENTS.has(required)) return false;
    if (required === 'human_approval') return governanceApprovalId === null;
    const aliases = evidenceAliases(required);
    return aliases.length === 0 || !currentEvidence.some((item) => aliases.includes(item.kind) && item.status === 'pass');
  });
  const limitations = unique([
    ...structuralErrors,
    ...gates.flatMap((item) => item.limitations),
    ...(staleEvidence.length > 0 ? [`${staleEvidence.length} evidence item(s) belong to a different candidate and were excluded.`] : []),
    ...(requiredEvidenceGaps.length > 0 ? [`Task-contract evidence missing on the exact candidate: ${requiredEvidenceGaps.join(', ')}.`] : []),
    ...(input.evaluationScope === 'pre-deployment-release-readiness'
      ? ['Production deployment/observation and Cristian deployment authorization are outside this pre-deployment Quality evaluation.'] : []),
  ]);

  const reviewerRequired = input.riskTier === 'T3' || input.riskTier === 'T4' || changesQualityGate(input);
  const verifiedIndependentReview = currentEvidence.some((item) => item.kind === 'independent-review' && item.status === 'pass'
    && item.source === input.reviewer?.source);
  const selfReview = changesQualityGate(input)
    && (!input.reviewer || input.reviewer.id === 'quality-gate' || /quality-gate/i.test(input.reviewer.source));
  if (reviewerRequired && (!input.reviewer || !input.reviewer.independent || !verifiedIndependentReview)) limitations.push('Verified independent-review execution evidence and matching reviewer identity/source are required for T3/T4.');
  if (input.unverifiedEvidence.length > 0) limitations.push(`${input.unverifiedEvidence.length} raw evidence item(s) were preserved but excluded because provenance was not verified.`);
  if (input.unverifiedApprovals.length > 0) limitations.push(`${input.unverifiedApprovals.length} approval claim(s) were preserved but excluded because Factory governance could not verify them.`);
  if (selfReview) limitations.push('Quality Gate cannot independently certify a candidate that implements or changes itself.');

  const failedGates = gates.filter((item) => item.state === 'fail');
  const blockedGates = gates.filter((item) => item.state === 'blocked');
  const evidenceGaps = gates.filter((item) => item.state === 'needs-evidence');
  const failedCriteria = criteria.filter((item) => item.state === 'fail');
  const criteriaGaps = criteria.filter((item) => item.state === 'needs-evidence');
  const exhausted = (failedGates.length > 0 || failedCriteria.length > 0) && input.repair.attempt >= input.repair.maxAttempts;
  const reviewerBlocked = selfReview || (reviewerRequired && (!input.reviewer || !input.reviewer.independent || !verifiedIndependentReview));
  let finalState: QualityFinalState;
  if (structuralErrors.length > 0 || blockedGates.length > 0 || reviewerBlocked || exhausted) finalState = 'blocked';
  else if (failedGates.length > 0 || failedCriteria.length > 0) finalState = 'reject';
  else if (evidenceGaps.length > 0 || criteriaGaps.length > 0 || requiredEvidenceGaps.length > 0
    || staleEvidence.length > 0 || input.unverifiedEvidence.length > 0 || input.unverifiedApprovals.length > 0) finalState = 'needs-evidence';
  else finalState = 'pass';

  const failed = unique([
    ...failedCriteria.map((item) => item.id),
    ...failedGates.flatMap((item) => item.findings.flatMap((entry) => entry.criterionIds)),
  ]);
  const reworkRequests: ReworkRequest[] = finalState === 'reject' ? (failed.length > 0 ? failed : ['gate-policy']).map((criterionId) => ({
    owner: 'boris', candidateSha: input.candidateSha, failedCriterionId: criterionId,
    reason: `Repair failed Quality Gate criterion ${criterionId} and produce a new exact candidate.`,
    evidenceIds: unique([...failedGates.flatMap((item) => item.evidenceIds), ...failedCriteria.flatMap((item) => item.evidenceIds)]),
    repairAttempt: input.repair.attempt + 1, remainingAttempts: Math.max(0, input.repair.maxAttempts - input.repair.attempt), newCandidateRequired: true,
  })) : [];

  const observationGate = gates.find((item) => item.id === 'production-observation');
  const productionDeploymentObservation: ProductionObservationState = input.evaluationScope === 'pre-deployment-release-readiness'
    ? 'not-evaluated-pre-deployment'
    : !observationGate?.applicable ? 'not-applicable'
      : observationGate.state === 'pass' ? 'pass'
        : observationGate.state === 'fail' ? 'fail' : 'needs-evidence';
  const scopeBindingId = qualityGateScopeBindingId({
    schemaVersion: '1.2.0', taskId: input.taskId, projectId: input.projectId, repository: input.repository,
    candidateSha: input.candidateSha, branch: input.branch, evaluationScope: input.evaluationScope,
    productionObservationRequirement: input.productionObservationRequirement,
  });
  const base = {
    schemaVersion: '1.2.0' as const, evaluationScope: input.evaluationScope, receiptStatus: 'current' as const,
    scopeBindingId, productionObservationRequirement: input.productionObservationRequirement,
    scopeStatus: {
      productionDeploymentObservation,
      fullLifecycleEvaluation: input.evaluationScope === 'pre-deployment-release-readiness'
        ? 'required-after-production-observation' as const : 'current-evaluation' as const,
      cristianApproval: 'required-separately' as const,
      deploymentAuthority: 'not-granted' as const,
    },
    finalState, taskId: input.taskId, projectId: input.projectId,
    repository: input.repository, candidateSha: input.candidateSha, branch: input.branch, riskTier: input.riskTier,
    changedPaths: [...input.changedPaths], changeSignals: canonicalCopy(input.changeSignals),
    taskContract: input.taskContract, acceptanceCriteria: input.acceptanceCriteria, requiredEvidence: input.requiredEvidence,
    actualEvidence: currentEvidence, staleEvidence, rawEvidence: input.rawEvidence, unverifiedEvidence: input.unverifiedEvidence,
    governanceApprovals: input.governanceApprovals, unverifiedApprovals: input.unverifiedApprovals, criterionResults: criteria, gateResults: gates,
    knownLimitations: limitations, reworkRequests, approvalGates: permissions.approvals,
    independentReviewer: input.reviewer,
    controlPlane: { authority: 'shia-core' as const, qualityGateMayAcceptTask: false as const, gstackMayAcceptTask: false as const, qualityEvidenceGrantsActionAuthority: false as const },
    repair: { attempt: input.repair.attempt, maxAttempts: input.repair.maxAttempts, remainingAttempts: Math.max(0, input.repair.maxAttempts - input.repair.attempt) },
    evaluatedAt: input.evaluatedAt,
  };
  const receipt = deepFreeze({ ...base, receiptId: digest(base) });
  mintedReceipts.add(receipt);
  return receipt;
}

export function qualityGateScopeBindingId(identity: Pick<QualityGateReceipt,
  'schemaVersion' | 'taskId' | 'projectId' | 'repository' | 'candidateSha' | 'branch' | 'evaluationScope' | 'productionObservationRequirement'>): string {
  return digest({
    schemaVersion: identity.schemaVersion,
    taskId: identity.taskId,
    projectId: identity.projectId,
    repository: identity.repository,
    candidateSha: identity.candidateSha,
    branch: identity.branch,
    evaluationScope: identity.evaluationScope,
    productionObservationRequirement: identity.productionObservationRequirement,
  });
}

export function qualityGateReceiptDigest(receipt: QualityGateReceipt): string {
  const { receiptId: _receiptId, ...base } = receipt;
  return digest(base);
}

/** Structural rejection is fail-closed; validation alone never establishes trusted provenance. */
export function validateCanonicalQualityGateReceipt(value: unknown): string[] {
  try {
    if (!isRecord(value)) return ['malformed Quality Gate receipt'];
    return validateReceiptSemantics(value as unknown as QualityGateReceipt);
  } catch {
    return ['malformed Quality Gate receipt'];
  }
}

function validateReceiptSemantics(receipt: QualityGateReceipt): string[] {
  const errors: string[] = [];
  if (receipt.schemaVersion !== '1.2.0' || receipt.receiptStatus !== 'current') errors.push('receipt is not canonical schema 1.2.0');
  if (!['pre-deployment-release-readiness', 'full-lifecycle'].includes(receipt.evaluationScope)) errors.push('unsupported evaluation scope');
  if (!SHA.test(receipt.candidateSha)) errors.push('candidate SHA is invalid');
  if (qualityGateReceiptDigest(receipt) !== receipt.receiptId.toLowerCase()) errors.push('receipt digest mismatch');
  if (qualityGateScopeBindingId(receipt) !== receipt.scopeBindingId.toLowerCase()) errors.push('scope binding mismatch');
  if (receipt.controlPlane.authority !== 'shia-core' || receipt.controlPlane.qualityGateMayAcceptTask !== false
    || receipt.controlPlane.gstackMayAcceptTask !== false || receipt.controlPlane.qualityEvidenceGrantsActionAuthority !== false
    || receipt.scopeStatus.cristianApproval !== 'required-separately' || receipt.scopeStatus.deploymentAuthority !== 'not-granted') {
    errors.push('receipt violates Quality authority boundaries');
  }
  if (receipt.taskContract.id !== receipt.taskId || receipt.taskContract.projectId !== receipt.projectId
    || receipt.taskContract.repository.branch !== receipt.branch
    || receipt.taskContract.risk.tier !== receipt.riskTier) errors.push('task contract identity mismatch');
  if (stable(receipt.taskContract.acceptanceCriteria) !== stable(receipt.acceptanceCriteria)
    || stable(receipt.taskContract.requiredEvidence) !== stable(receipt.requiredEvidence)) errors.push('task contract evidence snapshot mismatch');
  if (receipt.criterionResults.length !== receipt.acceptanceCriteria.length
    || new Set(receipt.criterionResults.map((item) => item.id)).size !== receipt.acceptanceCriteria.length
    || receipt.acceptanceCriteria.some((criterion) => !receipt.criterionResults.some((result) => result.id === criterion.id))) {
    errors.push('criterion results are incomplete');
  }
  const gateIds = receipt.gateResults.map((item) => item.id);
  if (gateIds.length !== EXPECTED_GATE_IDS.length || new Set(gateIds).size !== EXPECTED_GATE_IDS.length
    || EXPECTED_GATE_IDS.some((id) => !gateIds.includes(id))) errors.push('gate results are incomplete');
  if (receipt.actualEvidence.some((item) => item.candidateSha !== receipt.candidateSha
    || item.provenance.candidateSha !== receipt.candidateSha || item.provenance.taskId !== receipt.taskId
    || item.provenance.repository !== receipt.repository || item.provenance.verificationState !== 'verified')) {
    errors.push('admitted evidence identity mismatch');
  }
  if (receipt.evaluationScope === 'pre-deployment-release-readiness') {
    const observation = receipt.gateResults.find((item) => item.id === 'production-observation');
    if (receipt.productionObservationRequirement !== 'required'
      || receipt.scopeStatus.productionDeploymentObservation !== 'not-evaluated-pre-deployment'
      || receipt.scopeStatus.fullLifecycleEvaluation !== 'required-after-production-observation'
      || observation?.applicable !== false || observation.state !== 'not-applicable') {
      errors.push('pre-deployment scope falsely evaluates production observation');
    }
    if (receipt.criterionResults.some((item) => item.state === 'not-evaluated'
      && !item.requiredEvidence.some((kind) => PRE_DEPLOYMENT_DEFERRED_REQUIREMENTS.has(kind)))) {
      errors.push('pre-deployment receipt defers a non-deferred criterion');
    }
  } else {
    if (receipt.scopeStatus.fullLifecycleEvaluation !== 'current-evaluation'
      || receipt.scopeStatus.productionDeploymentObservation === 'not-evaluated-pre-deployment') {
      errors.push('full-lifecycle scope has pre-deployment status');
    }
    if (receipt.productionObservationRequirement === 'required'
      && receipt.scopeStatus.productionDeploymentObservation !== 'pass' && receipt.finalState === 'pass') {
      errors.push('full-lifecycle pass lacks production observation');
    }
  }
  if (receipt.finalState === 'pass' && (receipt.staleEvidence.length > 0 || receipt.unverifiedEvidence.length > 0
    || receipt.unverifiedApprovals.length > 0 || receipt.gateResults.some((item) => item.applicable && item.state !== 'pass')
    || receipt.criterionResults.some((item) => !['pass', 'not-evaluated'].includes(item.state)))) {
    errors.push('pass receipt contains unresolved evidence or gate state');
  }
  return unique(errors);
}

function receiptRecordDigest(record: Omit<TrustedQualityGateReceiptRecord, 'integrityDigest'>): string {
  return digest(record);
}

export function createQualityGateReceiptRecord(
  receipt: QualityGateReceipt, sourceId: string, collector: string, observedAt: string,
): TrustedQualityGateReceiptRecord {
  if (!mintedReceipts.has(receipt)) throw new Error('Only the permanent Quality Gate evaluator can create a trusted receipt record');
  if (!sourceId.trim() || !collector.trim() || Number.isNaN(Date.parse(observedAt))) throw new Error('Trusted receipt provenance is incomplete');
  const base = { sourceId, evaluator: 'shia-factory-permanent-quality-gate/1.2.0' as const,
    receipt: canonicalCopy(receipt), collector, observedAt };
  const record = deepFreeze({ ...base, integrityDigest: receiptRecordDigest(base) });
  mintedReceiptRecords.add(record);
  return record;
}

/** Serialization is not proof of minting. Re-admit evidence and rerun the permanent evaluator after restart. */
export function revalidateStoredQualityGateReceipt(
  stored: QualityGateReceipt, admittedInput: AdmittedQualityGateInput, collector: string,
): TrustedQualityGateReceiptRecord {
  const regenerated = evaluateQualityGate(admittedInput);
  if (stored.receiptId !== regenerated.receiptId || qualityGateReceiptDigest(stored) !== regenerated.receiptId) {
    throw new Error('Stored receipt differs from the permanent evaluator result for re-admitted exact-scope evidence');
  }
  return createQualityGateReceiptRecord(regenerated, regenerated.receiptId, collector, regenerated.evaluatedAt);
}

export function createTrustedQualityGateReceiptResolver(
  id: string, provenance: string, resolveRecord: (sourceId: string) => TrustedQualityGateReceiptRecord | null,
): QualityGateReceiptResolver {
  if (!id.trim() || !provenance.trim()) throw new Error('Trusted Quality Gate receipt resolver identity is required');
  return { id, provenance, resolve(referenceId) {
    const record = resolveRecord(referenceId);
    if (!record || !mintedReceiptRecords.has(record) || record.sourceId !== referenceId || record.receipt.receiptId !== referenceId
      || record.evaluator !== 'shia-factory-permanent-quality-gate/1.2.0') return null;
    const { integrityDigest, ...base } = record;
    if (receiptRecordDigest(base) !== integrityDigest.toLowerCase()
      || validateCanonicalQualityGateReceipt(record.receipt).length > 0) return null;
    const resolution = deepFreeze({ receipt: canonicalCopy(record.receipt), provenance: {
      sourceId: record.sourceId, evaluator: record.evaluator, resolverId: id, resolverProvenance: provenance,
      collector: record.collector, observedAt: record.observedAt, verificationState: 'verified' as const,
      integrityDigest: record.integrityDigest,
    } });
    verifiedReceiptResolutions.add(resolution);
    return resolution;
  } };
}

export function isVerifiedQualityGateReceiptResolution(value: object): boolean {
  return verifiedReceiptResolutions.has(value);
}

export async function persistQualityGateReceipt(receipt: QualityGateReceipt, directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `${receipt.taskId}-${receipt.candidateSha}-${receipt.evaluationScope}.json`);
  const content = `${JSON.stringify(receipt, null, 2)}\n`;
  try {
    const existing = await readFile(target, 'utf8');
    if (existing === content) return target;
    throw new Error(`Quality Gate receipt already exists with different content: ${target}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // A private directory prevents concurrent calls (including this process) sharing cleanup ownership.
  const temporaryDirectory = await mkdtemp(`${target}.`);
  const temporary = path.join(temporaryDirectory, 'receipt.json');
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    try {
      // Publish complete bytes atomically without replacing a winner from another process.
      // Unsupported hard links fail closed; never fall back to overwrite or an in-place write.
      await link(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (await readFile(target, 'utf8') !== content) {
        throw new Error(`Quality Gate receipt already exists with different content: ${target}`);
      }
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  return target;
}
