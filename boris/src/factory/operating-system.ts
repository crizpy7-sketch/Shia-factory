export type FactoryWorkState = 'backlog' | 'ready' | 'running' | 'blocked' | 'review' | 'done' | 'cancelled';
export type RiskTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
export type EpistemicState = 'observed' | 'inferred' | 'assumed' | 'decided' | 'proven' | 'stale' | 'conflicting';
export type MemoryAuthority = 'candidate' | 'authoritative';
export type EvidenceKind = 'test' | 'command' | 'browser' | 'runtime' | 'security' | 'review' | 'human_approval' | 'artifact' | 'observation';

export interface AcceptanceCriterion {
  id: string;
  statement: string;
  evidenceRequired: EvidenceKind[];
}

export interface FactoryTaskContract {
  id: string;
  projectId: string;
  outcome: string;
  objective: string;
  riskTier: RiskTier;
  dependencies: string[];
  allowedPaths: string[];
  readOnlyPaths: string[];
  forbiddenPaths: string[];
  allowedTools: string[];
  forbiddenTools: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  requiredEvidence: EvidenceKind[];
  maxRepairAttempts: number;
  maxCostUsd: number | null;
  escalationConditions: string[];
  reviewerRequired: boolean;
  humanApprovalRequired: boolean;
}

export interface FactoryTaskSnapshot {
  id: string;
  state: FactoryWorkState;
}

export interface EvidenceItem {
  kind: EvidenceKind;
  summary: string;
  ok: boolean;
}

export interface CandidateReceipt {
  taskId: string;
  baseCandidate: string;
  candidate: string;
  changedPaths: string[];
  riskTier: RiskTier;
  evidence: EvidenceItem[];
  reviewedBy: string | null;
  reviewerApproved: boolean;
  humanApproved: boolean;
  authorizedAt: string | null;
}

export interface MemoryCandidate {
  content: string;
  state: EpistemicState;
  provenance: string;
  verified: boolean;
  supportCount: number;
  authority: MemoryAuthority;
}

export interface WorkerProfile {
  class: 'local' | 'mid' | 'frontier';
  provenTaskTypes: string[];
}

export interface MemoryBudget {
  maxCoreRules: number;
  maxTaskLessons: number;
  allowBroadHistory: boolean;
}

const TRANSITIONS: Record<FactoryWorkState, readonly FactoryWorkState[]> = {
  backlog: ['ready', 'cancelled'],
  ready: ['running', 'blocked', 'cancelled'],
  running: ['blocked', 'review', 'cancelled'],
  blocked: ['ready', 'cancelled'],
  review: ['ready', 'running', 'done', 'blocked', 'cancelled'],
  done: [],
  cancelled: [],
};

const REQUIRED_EVIDENCE: Record<RiskTier, readonly EvidenceKind[]> = {
  T0: [],
  T1: ['test'],
  T2: ['test', 'runtime'],
  T3: ['test', 'review'],
  T4: ['test', 'review', 'human_approval'],
};

export function canTransition(from: FactoryWorkState, to: FactoryWorkState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function missingDependencies(
  contract: FactoryTaskContract,
  tasks: readonly FactoryTaskSnapshot[],
): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task.state]));
  return contract.dependencies.filter((id) => byId.get(id) !== 'done');
}

export function validateTaskContract(contract: FactoryTaskContract): string[] {
  const violations: string[] = [];

  if (contract.outcome.trim().length === 0) violations.push('customer/product outcome is required');
  if (contract.objective.trim().length === 0) violations.push('bounded task objective is required');
  if (contract.acceptanceCriteria.length === 0) violations.push('acceptance criteria are required');
  if (contract.maxRepairAttempts < 0) violations.push('repair budget cannot be negative');
  if (contract.maxRepairAttempts > 2) violations.push('default factory repair budget cannot exceed 2 without an explicit policy exception');
  if (contract.maxCostUsd !== null && contract.maxCostUsd < 0) violations.push('cost budget cannot be negative');

  const duplicatedPathAuthority = contract.allowedPaths.filter((path) => contract.forbiddenPaths.includes(path));
  if (duplicatedPathAuthority.length > 0) violations.push(`paths cannot be both allowed and forbidden: ${duplicatedPathAuthority.join(', ')}`);

  const duplicatedToolAuthority = contract.allowedTools.filter((tool) => contract.forbiddenTools.includes(tool));
  if (duplicatedToolAuthority.length > 0) violations.push(`tools cannot be both allowed and forbidden: ${duplicatedToolAuthority.join(', ')}`);

  for (const required of REQUIRED_EVIDENCE[contract.riskTier]) {
    if (!contract.requiredEvidence.includes(required)) violations.push(`${contract.riskTier} requires ${required} evidence`);
  }

  if ((contract.riskTier === 'T3' || contract.riskTier === 'T4') && !contract.reviewerRequired) {
    violations.push(`${contract.riskTier} requires an independent reviewer`);
  }
  if (contract.riskTier === 'T4' && !contract.humanApprovalRequired) {
    violations.push('T4 requires explicit human approval');
  }

  for (const criterion of contract.acceptanceCriteria) {
    if (criterion.id.trim().length === 0) violations.push('acceptance criterion id is required');
    if (criterion.statement.trim().length === 0) violations.push(`acceptance criterion ${criterion.id || '<unknown>'} needs an observable statement`);
  }

  return violations;
}

export function readyToRun(
  contract: FactoryTaskContract,
  tasks: readonly FactoryTaskSnapshot[],
): { ready: boolean; reasons: string[] } {
  const reasons = [...validateTaskContract(contract)];
  const missing = missingDependencies(contract, tasks);
  if (missing.length > 0) reasons.push(`dependencies not done: ${missing.join(', ')}`);
  return { ready: reasons.length === 0, reasons };
}

export function evidenceSatisfiesContract(
  contract: FactoryTaskContract,
  evidence: readonly EvidenceItem[],
): { ok: boolean; missing: string[] } {
  const passedKinds = new Set(evidence.filter((item) => item.ok).map((item) => item.kind));
  const missing: string[] = [];

  for (const kind of contract.requiredEvidence) {
    if (!passedKinds.has(kind)) missing.push(`task evidence missing: ${kind}`);
  }

  for (const criterion of contract.acceptanceCriteria) {
    for (const kind of criterion.evidenceRequired) {
      if (!passedKinds.has(kind)) missing.push(`${criterion.id} missing evidence: ${kind}`);
    }
  }

  return { ok: missing.length === 0, missing: [...new Set(missing)] };
}

export function receiptAuthorizesCandidate(
  receipt: CandidateReceipt,
  currentCandidate: string,
  contract: FactoryTaskContract,
): { authorized: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (receipt.taskId !== contract.id) reasons.push('receipt belongs to a different task');
  if (receipt.candidate !== currentCandidate) reasons.push('candidate changed after review');
  if (receipt.riskTier !== contract.riskTier) reasons.push('receipt risk tier does not match task contract');

  const evidenceCheck = evidenceSatisfiesContract(contract, receipt.evidence);
  reasons.push(...evidenceCheck.missing);

  if (contract.reviewerRequired && !receipt.reviewerApproved) reasons.push('independent reviewer approval missing');
  if (contract.humanApprovalRequired && !receipt.humanApproved) reasons.push('human approval missing');
  if (receipt.authorizedAt === null) reasons.push('receipt has not been authorized');

  return { authorized: reasons.length === 0, reasons };
}

export function canPromoteMemory(candidate: MemoryCandidate): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (candidate.provenance.trim().length === 0) reasons.push('memory provenance is required');
  if (candidate.state === 'assumed' || candidate.state === 'inferred') reasons.push(`${candidate.state} knowledge cannot become authoritative without promotion evidence`);
  if (candidate.state === 'stale' || candidate.state === 'conflicting') reasons.push(`${candidate.state} knowledge cannot become authoritative`);
  if (!candidate.verified && candidate.state !== 'decided') reasons.push('non-decision memory must be verified before promotion');
  if (candidate.state === 'proven' && candidate.supportCount < 1) reasons.push('proven memory requires supporting evidence');
  return { allowed: reasons.length === 0, reasons };
}

export function memoryBudgetFor(worker: WorkerProfile): MemoryBudget {
  if (worker.class === 'local') {
    return { maxCoreRules: 5, maxTaskLessons: 5, allowBroadHistory: false };
  }
  if (worker.class === 'mid') {
    return { maxCoreRules: 8, maxTaskLessons: 12, allowBroadHistory: false };
  }
  return { maxCoreRules: 12, maxTaskLessons: 30, allowBroadHistory: true };
}

export function riskRequiresReadOnlyRecon(riskTier: RiskTier): boolean {
  return riskTier === 'T3' || riskTier === 'T4';
}

export function workMayRunConcurrently(
  left: FactoryTaskContract,
  right: FactoryTaskContract,
): { allowed: boolean; reason: string | null } {
  const leftWrites = new Set(left.allowedPaths);
  const overlappingWrites = right.allowedPaths.filter((path) => leftWrites.has(path));
  if (overlappingWrites.length > 0) {
    return { allowed: false, reason: `overlapping write authority: ${overlappingWrites.join(', ')}` };
  }

  if (left.dependencies.includes(right.id) || right.dependencies.includes(left.id)) {
    return { allowed: false, reason: 'tasks have a direct dependency and should not execute concurrently' };
  }

  return { allowed: true, reason: null };
}

export function acceptedWorkUnit(
  contract: FactoryTaskContract,
  receipt: CandidateReceipt,
  currentCandidate: string,
): boolean {
  return receiptAuthorizesCandidate(receipt, currentCandidate, contract).authorized;
}
