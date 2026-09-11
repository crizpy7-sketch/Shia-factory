/**
 * Agent Foundry V1 Phase 3 — FoundryEvidenceGate → Quality Gate admission adapter.
 *
 * Wraps patterns from evidence-admission.ts (integrity digests, fabricated rejection,
 * verified provenance shape) for Foundry harness scores. Phase 3 admits
 * scripted-deterministic evidence with integrity digests only.
 *
 * Does NOT claim production CI / browser / github-actions adapters are wired.
 */
import { createHash } from 'node:crypto';
import type {
  FoundryEvidenceAdmission,
  FoundryEvidenceCandidate,
  FoundryEvidenceGate,
  FoundryEvidenceRef,
} from './types.js';

export const SCRIPTED_EVIDENCE_SOURCE = 'scripted-deterministic';
const HEX64 = /^[0-9a-f]{64}$/i;

/** Phase 3 admitted source types — scripted only. Production adapters remain unwired. */
export const PHASE3_ADMITTED_SOURCE_TYPES = [SCRIPTED_EVIDENCE_SOURCE] as const;

export type Phase3AdmittedSourceType = (typeof PHASE3_ADMITTED_SOURCE_TYPES)[number];

export interface FoundryEvidenceGateOptions {
  /**
   * Additional source types to admit beyond scripted-deterministic.
   * Phase 3 default is empty — production CI/browser adapters are NOT wired.
   */
  additionalAdmittedSources?: readonly string[];
  /** When true, recompute digest from evidenceBlob and require match. Default false for harness-produced digests. */
  requireDigestMatch?: boolean;
}

function isHexDigest(value: string): boolean {
  return HEX64.test(value);
}

export function foundryEvidenceDigest(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Patterns mirrored from quality/evidence-admission.ts:
 * - integrityDigest must be sha256 hex
 * - fabricated claims are never admitted
 * - missing provenance/integrity → unverified
 * - only explicitly admitted source types pass
 *
 * This is a Foundry-narrow adapter; it does not call admitQualityGateInput
 * (different packet shape) but follows the same fail-closed integrity rules.
 */
export function createFoundryEvidenceGate(
  options: FoundryEvidenceGateOptions = {},
): FoundryEvidenceGate {
  const admittedSources = new Set<string>([
    ...PHASE3_ADMITTED_SOURCE_TYPES,
    ...(options.additionalAdmittedSources ?? []),
  ]);

  return {
    admit(candidate: FoundryEvidenceCandidate): FoundryEvidenceAdmission {
      if (candidate.fabricated) {
        return {
          admitted: false,
          state: 'unverified',
          reason: 'Fabricated score rejected — not produced by harness evidence.',
        };
      }

      const { integrity } = candidate;
      if (!integrity || typeof integrity !== 'object') {
        return {
          admitted: false,
          state: 'unverified',
          reason: 'Missing integrity fields — score unverified (evidence-admission pattern).',
        };
      }

      if (!integrity.evalId || !integrity.candidateId || !integrity.sourceType) {
        return {
          admitted: false,
          state: 'unverified',
          reason: 'Incomplete integrity identity fields — score unverified.',
        };
      }

      if (!integrity.integrityDigest || !isHexDigest(integrity.integrityDigest)) {
        return {
          admitted: false,
          state: 'unverified',
          reason: 'Missing or invalid integrityDigest — score unverified.',
        };
      }

      if (!admittedSources.has(integrity.sourceType)) {
        return {
          admitted: false,
          state: 'unverified',
          reason: `Source type "${integrity.sourceType}" is not admitted by the Phase 3 Foundry evidence gate (production CI/browser adapters not wired).`,
        };
      }

      if (options.requireDigestMatch) {
        const expected = foundryEvidenceDigest({
          candidateId: integrity.candidateId,
          evalId: integrity.evalId,
          score: candidate.score,
          passed: candidate.passed,
          evidenceBlob: candidate.evidenceBlob,
        });
        if (expected !== integrity.integrityDigest.toLowerCase()) {
          return {
            admitted: false,
            state: 'unverified',
            reason: 'integrityDigest does not match evidence payload — score unverified.',
          };
        }
      }

      const ref: FoundryEvidenceRef = {
        evalId: integrity.evalId,
        candidateId: integrity.candidateId,
        sourceType: integrity.sourceType,
        integrityDigest: integrity.integrityDigest.toLowerCase(),
        verificationState: 'verified',
        observedAt: integrity.observedAt,
      };

      return {
        admitted: true,
        ref,
        score: candidate.score,
        passed: candidate.passed,
      };
    },
  };
}

/**
 * Default gate used by the evaluation harness — scripted-deterministic only.
 * Alias kept for Phase 2 createDefaultFoundryEvidenceGate compatibility via re-export.
 */
export function createDefaultFoundryEvidenceGate(): FoundryEvidenceGate {
  return createFoundryEvidenceGate();
}
