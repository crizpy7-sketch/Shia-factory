import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
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

const SHA = /^[0-9a-f]{40,64}$/i;
const TIERS: RiskTier[] = ['T0', 'T1', 'T2', 'T3', 'T4'];
const UI_PATH = /(^|\/)(app|pages|components|ui|public|styles)(\/|$)|\.(tsx|jsx|css|scss|html)$/i;
const SECURITY_PATH = /auth|permission|policy|secret|payment|stripe|database|migration|infra|deploy|session|tenant/i;
const PERFORMANCE_PATH = /(^|\/)(api|server|backend|database|db|queries|media|images|video|audio|ai|models|workers|streams)(\/|$)/i;

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
  if (input.riskTier === 'T4' || input.changeSignals.subjectRoles.includes('quality-gate')) ensureCristian();
  if (input.dangerousActions.some((request) => request.action !== 'secret-access')) ensureCristian();

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
    const exact = verifiedApprovals.find((approval) => approval.approvalId === request.approvalId
      && approval.taskId === input.taskId && approval.action === request.action
      && approval.candidateSha === input.candidateSha && approval.decidedBy === 'Cristian');
    if (!exact && (input.evaluationScope === 'full-lifecycle' || request.authorization === 'approved')) {
      findings.push(finding(`permission:${request.action}`, 'P0', `${request.action} lacks Cristian approval bound to the exact candidate.`));
    }
  }
  const pending = approvals.filter((item) => item.state !== 'satisfied');
  const state: GateState = findings.length > 0 ? 'blocked'
    : input.evaluationScope === 'pre-deployment-release-readiness' ? 'pass'
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

const PRE_DEPLOYMENT_DEFERRED_REQUIREMENTS = new Set(['production-observation', 'human_approval']);

function criterionResults(input: CanonicalQualityGateInput, evidence: QualityEvidence[]): CriterionResult[] {
  return input.acceptanceCriteria.map((criterion) => {
    const relevant = evidence.filter((item) => item.criterionIds.includes(criterion.id));
    const failures = relevant.filter((item) => item.status === 'fail').flatMap((item) => item.findings?.length
      ? item.findings
      : [finding(`criterion:${criterion.id}:${item.id}`, 'P2', item.summary, [item.id], [criterion.id])]);
    const deferred = input.evaluationScope === 'pre-deployment-release-readiness'
      ? criterion.evidence.filter((required) => PRE_DEPLOYMENT_DEFERRED_REQUIREMENTS.has(required)) : [];
    const missing = criterion.evidence.filter((required) => {
      if (deferred.includes(required)) return false;
      const aliases = evidenceAliases(required);
      return aliases.length === 0 || !relevant.some((item) => aliases.includes(item.kind) && item.status === 'pass');
    });
    return {
      id: criterion.id, statement: criterion.statement,
      state: failures.length > 0 ? 'fail' : missing.length > 0 ? 'needs-evidence' : deferred.length > 0 ? 'not-evaluated' : 'pass',
      requiredEvidence: criterion.evidence, evidenceIds: relevant.map((item) => item.id), failures,
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
  const criteria = criterionResults(input, currentEvidence);
  const requiredEvidenceGaps = input.requiredEvidence.filter((required) => {
    if (input.evaluationScope === 'pre-deployment-release-readiness' && PRE_DEPLOYMENT_DEFERRED_REQUIREMENTS.has(required)) return false;
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

  const reviewerRequired = input.riskTier === 'T3' || input.riskTier === 'T4';
  const verifiedIndependentReview = currentEvidence.some((item) => item.kind === 'independent-review' && item.status === 'pass'
    && item.source === input.reviewer?.source);
  const selfReview = input.changeSignals.subjectRoles.includes('quality-gate')
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
  else if (evidenceGaps.length > 0 || criteriaGaps.length > 0 || requiredEvidenceGaps.length > 0) finalState = 'needs-evidence';
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
  });
  const base = {
    schemaVersion: '1.2.0' as const, evaluationScope: input.evaluationScope, receiptStatus: 'current' as const,
    scopeBindingId,
    scopeStatus: {
      productionDeploymentObservation,
      fullLifecycleEvaluation: input.evaluationScope === 'pre-deployment-release-readiness'
        ? 'required-after-production-observation' as const : 'current-evaluation' as const,
      cristianApproval: 'required-separately' as const,
      deploymentAuthority: 'not-granted' as const,
    },
    finalState, taskId: input.taskId, projectId: input.projectId,
    repository: input.repository, candidateSha: input.candidateSha, branch: input.branch, riskTier: input.riskTier,
    taskContract: input.taskContract, acceptanceCriteria: input.acceptanceCriteria, requiredEvidence: input.requiredEvidence,
    actualEvidence: currentEvidence, staleEvidence, rawEvidence: input.rawEvidence, unverifiedEvidence: input.unverifiedEvidence,
    governanceApprovals: input.governanceApprovals, unverifiedApprovals: input.unverifiedApprovals, criterionResults: criteria, gateResults: gates,
    knownLimitations: limitations, reworkRequests, approvalGates: permissions.approvals,
    independentReviewer: input.reviewer,
    controlPlane: { authority: 'shia-core' as const, qualityGateMayAcceptTask: false as const, gstackMayAcceptTask: false as const, qualityEvidenceGrantsActionAuthority: false as const },
    repair: { attempt: input.repair.attempt, maxAttempts: input.repair.maxAttempts, remainingAttempts: Math.max(0, input.repair.maxAttempts - input.repair.attempt) },
    evaluatedAt: input.evaluatedAt,
  };
  return { ...base, receiptId: digest(base) };
}

export function qualityGateScopeBindingId(identity: Pick<QualityGateReceipt,
  'schemaVersion' | 'taskId' | 'projectId' | 'repository' | 'candidateSha' | 'branch' | 'evaluationScope'>): string {
  return digest({
    schemaVersion: identity.schemaVersion,
    taskId: identity.taskId,
    projectId: identity.projectId,
    repository: identity.repository,
    candidateSha: identity.candidateSha,
    branch: identity.branch,
    evaluationScope: identity.evaluationScope,
  });
}

export function qualityGateReceiptDigest(receipt: QualityGateReceipt): string {
  const { receiptId: _receiptId, ...base } = receipt;
  return digest(base);
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
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return target;
}
