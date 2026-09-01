import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ApprovalRequest } from '../domain/types.js';
import type { Storage } from '../storage/types.js';
import type { CanonicalQualityGateInput, QualityEvidence, QualityEvidenceKind, QualityGateInput } from './quality-gate.js';

export type EvidenceSourceType = 'github-actions' | 'boris-test-run' | 'browser-runner'
  | 'accessibility-runner' | 'security-runner' | 'performance-runner' | 'gstack'
  | 'independent-reviewer' | 'production-observer' | 'retained-artifact' | 'factory-governance';

export interface EvidenceProvenanceClaim { sourceType: EvidenceSourceType; sourceId: string; runId?: string; artifactId?: string }
export interface VerifiedEvidenceProvenance extends EvidenceProvenanceClaim {
  candidateSha: string; collector: string; observedAt: string; verificationState: 'verified'; integrityDigest: string;
}
export interface AdmittedQualityEvidence extends QualityEvidence { provenance: VerifiedEvidenceProvenance }
export interface EvidenceAdmissionFailure { evidenceId: string; candidateSha: string; claim: EvidenceProvenanceClaim | null; state: 'unverified'; reason: string }
export interface TrustedExecutionRecord extends Omit<QualityEvidence, 'id' | 'provenance'> {
  sourceType: Exclude<EvidenceSourceType, 'retained-artifact' | 'factory-governance'>; sourceId: string; runId?: string; collector: string; integrityDigest: string;
}
export interface RetainedArtifactRecord {
  artifactId: string; path: string; candidateSha: string; observedAt: string; collector: string; sha256: string; mediaType?: string;
  status: QualityEvidence['status']; source: string; summary: string; criterionIds: string[]; method?: QualityEvidence['method'];
  testedSurfaces?: string[]; untestedSurfaces?: string[]; findings?: QualityEvidence['findings'];
}
export interface EvidenceAdmissionAdapter {
  id: string; sourceTypes: EvidenceSourceType[];
  verify(raw: QualityEvidence, context: EvidenceAdmissionContext): AdmittedQualityEvidence | null;
}
export interface EvidenceAdmissionContext { taskId: string; repository: string; candidateSha: string }
export interface GovernanceApprovalResolver { id: string; provenance: string; resolve(approvalId: string): ApprovalRequest | null }
export interface VerifiedGovernanceApproval {
  approvalId: string; taskId: string; action: string; state: 'approved'; decidedBy: 'Cristian'; candidateSha: string;
  decidedAt: string; provenance: string; source: string;
}
export interface ApprovalAdmissionFailure { approvalId: string; state: 'unverified'; reason: string }
export interface EvidenceAdmissionDependencies { evidenceAdapters: EvidenceAdmissionAdapter[]; governanceApprovalResolver?: GovernanceApprovalResolver }
export interface AdmittedQualityGateInput extends Omit<CanonicalQualityGateInput, 'actualEvidence'> {
  actualEvidence: AdmittedQualityEvidence[]; rawEvidence: QualityEvidence[]; unverifiedEvidence: EvidenceAdmissionFailure[];
  governanceApprovals: VerifiedGovernanceApproval[]; unverifiedApprovals: ApprovalAdmissionFailure[];
}

const admittedEvidence = new WeakSet<object>();
const admittedApprovals = new WeakSet<object>();
const admittedInputs = new WeakSet<object>();
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
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
function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function markEvidence(evidence: AdmittedQualityEvidence): AdmittedQualityEvidence {
  const canonical = deepFreeze(canonicalCopy(evidence));
  admittedEvidence.add(canonical);
  return canonical;
}
function markApproval(approval: VerifiedGovernanceApproval): VerifiedGovernanceApproval {
  const canonical = deepFreeze(canonicalCopy(approval));
  admittedApprovals.add(canonical);
  return canonical;
}
function sourceMayAdmit(kind: QualityEvidenceKind, sourceType: EvidenceSourceType): boolean {
  const allowed: Record<QualityEvidenceKind, EvidenceSourceType[]> = {
    typecheck: ['github-actions', 'boris-test-run'], lint: ['github-actions', 'boris-test-run'], unit: ['github-actions', 'boris-test-run'],
    integration: ['github-actions', 'boris-test-run'], e2e: ['github-actions', 'boris-test-run'], browser: ['browser-runner', 'gstack'],
    visual: ['retained-artifact'], accessibility: ['accessibility-runner', 'gstack'], security: ['security-runner', 'gstack'],
    adversarial: ['security-runner', 'gstack'], performance: ['performance-runner'], permission: ['factory-governance'],
    'production-observation': ['production-observer'],
    'independent-review': ['independent-reviewer', 'gstack'], 'human-approval': ['factory-governance'], artifact: ['retained-artifact'],
  };
  return allowed[kind].includes(sourceType);
}
export const isAdmittedQualityEvidence = (value: object): boolean => admittedEvidence.has(value);
export const isVerifiedGovernanceApproval = (value: object): boolean => admittedApprovals.has(value);
export const isAdmittedQualityGateInput = (value: object): boolean => admittedInputs.has(value);

export function createTrustedExecutionEvidenceAdapter(
  id: string, sourceTypes: TrustedExecutionRecord['sourceType'][], resolve: (sourceId: string) => TrustedExecutionRecord | null,
): EvidenceAdmissionAdapter {
  return { id, sourceTypes, verify(raw, _context) {
    const claim = raw.provenance;
    if (!claim || !sourceTypes.includes(claim.sourceType as TrustedExecutionRecord['sourceType'])) return null;
    if (!sourceMayAdmit(raw.kind, claim.sourceType) || ['human-approval', 'visual', 'artifact'].includes(raw.kind)) return null;
    const record = resolve(claim.sourceId);
    if (!record || record.sourceId !== claim.sourceId || record.sourceType !== claim.sourceType || record.kind !== raw.kind) return null;
    if (!/^[0-9a-f]{64}$/i.test(record.integrityDigest)) return null;
    const { integrityDigest, ...integrityInput } = record;
    if (trustedRecordDigest(integrityInput) !== integrityDigest.toLowerCase()) return null;
    return markEvidence({
      id: raw.id, kind: record.kind, candidateSha: record.candidateSha, status: record.status, source: record.source,
      summary: record.summary, criterionIds: [...record.criterionIds], observedAt: record.observedAt, method: record.method,
      testedSurfaces: record.testedSurfaces ? [...record.testedSurfaces] : undefined,
      untestedSurfaces: record.untestedSurfaces ? [...record.untestedSurfaces] : undefined, browser: record.browser,
      artifact: record.artifact, findings: record.findings, thresholds: record.thresholds, measurements: record.measurements,
      provenance: { sourceType: record.sourceType, sourceId: record.sourceId, runId: record.runId, candidateSha: record.candidateSha,
        collector: record.collector, observedAt: record.observedAt, verificationState: 'verified', integrityDigest: record.integrityDigest },
    });
  } };
}

export function createRetainedArtifactEvidenceAdapter(
  id: string, retainedRoots: string[], resolve: (artifactId: string) => RetainedArtifactRecord | null,
): EvidenceAdmissionAdapter {
  const roots = retainedRoots.map((root) => path.resolve(root));
  return { id, sourceTypes: ['retained-artifact'], verify(raw, _context) {
    const claim = raw.provenance;
    if (!claim || claim.sourceType !== 'retained-artifact' || raw.kind !== 'visual' || !raw.artifact) return null;
    const artifactId = claim.artifactId ?? claim.sourceId;
    const record = resolve(artifactId);
    if (!record || record.artifactId !== artifactId || record.candidateSha !== raw.candidateSha) return null;
    const artifactPath = path.resolve(record.path);
    if (!roots.some((root) => inside(root, artifactPath))) return null;
    let bytes: Buffer;
    try { bytes = readFileSync(artifactPath); } catch { return null; }
    const computed = sha256(bytes);
    if (computed !== raw.artifact.sha256.toLowerCase() || computed !== record.sha256.toLowerCase()) return null;
    return markEvidence({ id: raw.id, kind: 'visual', candidateSha: record.candidateSha, status: record.status,
      source: record.source, summary: record.summary, criterionIds: [...record.criterionIds], observedAt: record.observedAt,
      method: record.method, testedSurfaces: record.testedSurfaces ? [...record.testedSurfaces] : undefined,
      untestedSurfaces: record.untestedSurfaces ? [...record.untestedSurfaces] : undefined, findings: record.findings,
      artifact: { path: artifactPath, sha256: computed, mediaType: record.mediaType ?? raw.artifact.mediaType },
      provenance: { ...claim, artifactId, candidateSha: record.candidateSha, collector: record.collector || id,
        observedAt: record.observedAt, verificationState: 'verified', integrityDigest: computed } });
  } };
}

export function createStorageGovernanceApprovalResolver(
  storage: Pick<Storage, 'getApproval'>, provenance = 'boris-approval-storage',
): GovernanceApprovalResolver {
  return { id: 'factory-governance-approval-resolver', provenance, resolve: (approvalId) => storage.getApproval(approvalId) };
}
export function admitGovernanceApprovalReference(approvalId: string, resolver: GovernanceApprovalResolver | undefined): VerifiedGovernanceApproval | ApprovalAdmissionFailure {
  if (!resolver) return { approvalId, state: 'unverified', reason: 'No trusted Factory governance approval resolver is configured.' };
  const record = resolver.resolve(approvalId);
  if (!record || record.id !== approvalId) return { approvalId, state: 'unverified', reason: 'Approval was not found in trusted Factory governance storage.' };
  const candidateSha = record.input['candidateSha'];
  const provenance = record.input['provenance'];
  if (record.state !== 'approved') return { approvalId, state: 'unverified', reason: `Governance approval state is ${record.state}, not approved.` };
  if (record.decidedBy !== 'Cristian') return { approvalId, state: 'unverified', reason: 'Governance approval was not decided by Cristian.' };
  if (!record.decidedAt || Number.isNaN(Date.parse(record.decidedAt))) return { approvalId, state: 'unverified', reason: 'Governance approval has no valid decision timestamp.' };
  if (typeof candidateSha !== 'string' || !/^[0-9a-f]{40,64}$/i.test(candidateSha)) return { approvalId, state: 'unverified', reason: 'Governance approval input has no exact candidate SHA.' };
  if (typeof provenance !== 'string' || !provenance.trim()) return { approvalId, state: 'unverified', reason: 'Governance approval input has no provenance.' };
  return markApproval({ approvalId: record.id, taskId: record.taskId, action: record.action, state: 'approved', decidedBy: 'Cristian',
    candidateSha, decidedAt: record.decidedAt, provenance, source: `${resolver.id}:${resolver.provenance}` });
}

export function admitQualityGateInput(input: QualityGateInput, dependencies: EvidenceAdmissionDependencies): AdmittedQualityGateInput {
  const evaluationScope = input.evaluationScope ?? 'full-lifecycle';
  const productionObservationRequirement = input.productionObservationRequirement
    ?? (input.evaluationScope === undefined ? 'not-applicable' : 'required');
  const normalized: CanonicalQualityGateInput = { ...canonicalCopy(input), evaluationScope, productionObservationRequirement };
  const context = { taskId: normalized.taskId, repository: normalized.repository, candidateSha: normalized.candidateSha };
  const actualEvidence: AdmittedQualityEvidence[] = [];
  const unverifiedEvidence: EvidenceAdmissionFailure[] = [];
  for (const raw of normalized.actualEvidence) {
    const claim = raw.provenance ?? null;
    const adapter = claim ? dependencies.evidenceAdapters.find((candidate) => candidate.sourceTypes.includes(claim.sourceType)) : undefined;
    const admitted = adapter?.verify(raw, context) ?? null;
    if (admitted && isAdmittedQualityEvidence(admitted)) actualEvidence.push(admitted);
    else unverifiedEvidence.push({ evidenceId: raw.id, candidateSha: raw.candidateSha, claim, state: 'unverified',
      reason: adapter ? `Adapter ${adapter.id} could not verify the claimed execution or artifact.` : 'No authorized adapter accepts this evidence provenance.' });
  }
  const governanceApprovals: VerifiedGovernanceApproval[] = [];
  const unverifiedApprovals: ApprovalAdmissionFailure[] = [];
  for (const approvalId of [...new Set(normalized.approvalReferences ?? [])]) {
    const result = admitGovernanceApprovalReference(approvalId, dependencies.governanceApprovalResolver);
    if (result.state === 'approved') governanceApprovals.push(result); else unverifiedApprovals.push(result);
  }
  const admitted = { ...normalized, actualEvidence, rawEvidence: canonicalCopy(normalized.actualEvidence), unverifiedEvidence,
    governanceApprovals, unverifiedApprovals } as AdmittedQualityGateInput;
  deepFreeze(admitted);
  admittedInputs.add(admitted);
  return admitted;
}
export function trustedRecordDigest(record: Omit<TrustedExecutionRecord, 'integrityDigest'>): string { return sha256(JSON.stringify(record)) }
