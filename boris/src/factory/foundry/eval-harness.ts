/**
 * Agent Foundry V1 Phase 2 — scripted EvaluationHarness skeleton.
 *
 * Runs EvalSuite items against DeterministicScriptedProvider FIRST
 * (ScriptedProvider / ModelProvider with isTestDouble). Produces numerical
 * scores + evidence blob stubs. Only admitted scores enter the tournament report.
 */
import { createHash } from 'node:crypto';
import type { ModelProvider } from '../../providers/types.js';
import type { ScriptedProvider } from '../../providers/scripted.js';
import type {
  EvalCase,
  EvalHarnessScore,
  EvalSuite,
  EvalSuiteClass,
  FoundryEvidenceAdmission,
  FoundryEvidenceCandidate,
  FoundryEvidenceGate,
  FoundryEvidenceRef,
  TournamentReport,
} from './types.js';

const SCRIPTED_SOURCE = 'scripted-deterministic';
const HEX64 = /^[0-9a-f]{64}$/i;

export interface EvalHarnessInput {
  candidateId: string;
  suite: EvalSuite;
  /**
   * Provider under test. Scripted / isTestDouble providers are preferred
   * (scripted-first gate). Non-doubles may still run but evidence defaults
   * to unverified unless a custom gate admits them.
   */
  provider: ModelProvider | ScriptedProvider;
  evidenceGate?: FoundryEvidenceGate;
  /** Optional fixed clock for deterministic digests/timestamps. */
  now?: () => string;
}

export interface EvalHarnessResult {
  candidateId: string;
  providerName: string;
  isTestDouble: boolean;
  scores: EvalHarnessScore[];
  report: TournamentReport;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isHexDigest(value: string): boolean {
  return HEX64.test(value);
}

/**
 * Default Foundry evidence gate: admits scripted deterministic evidence when
 * integrity fields are present and the claim is not fabricated.
 * Narrow interface — can wrap admitQualityGateInput in later phases.
 */
export function createDefaultFoundryEvidenceGate(): FoundryEvidenceGate {
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
          reason: 'Missing integrity fields — score unverified.',
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
      if (integrity.sourceType !== SCRIPTED_SOURCE) {
        return {
          admitted: false,
          state: 'unverified',
          reason: `Source type "${integrity.sourceType}" is not admitted by the default scripted gate.`,
        };
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
 * Scripted-first sanity: prefer providers with isTestDouble === true.
 * Returns an error string when the harness should refuse a non-double
 * without an explicit override; otherwise null.
 */
export function assertScriptedFirst(
  provider: ModelProvider,
  options: { allowNonDouble?: boolean } = {},
): string | null {
  if (provider.isTestDouble) return null;
  if (options.allowNonDouble) return null;
  return 'EvaluationHarness requires a DeterministicScriptedProvider / isTestDouble provider first.';
}

function scoreEvalCase(
  evalCase: EvalCase,
  providerText: string,
): { score: number; passed: boolean; evidenceBlob: Record<string, unknown> } {
  const threshold = evalCase.thresholdTbd ? 0 : (evalCase.threshold ?? 1);
  const haystack = providerText.toLowerCase();
  const mentions =
    haystack.includes(evalCase.id.toLowerCase()) ||
    haystack.includes(evalCase.suiteClass.toLowerCase()) ||
    haystack.includes('pass') ||
    haystack.includes('ok');
  const score = mentions ? 1 : 0;
  const passed = score >= threshold && !evalCase.thresholdTbd;
  return {
    score,
    passed,
    evidenceBlob: {
      evalId: evalCase.id,
      suiteClass: evalCase.suiteClass,
      providerExcerpt: providerText.slice(0, 500),
      threshold: evalCase.thresholdTbd ? 'TBD' : threshold,
      thresholdTbd: Boolean(evalCase.thresholdTbd),
      scoring: 'scripted-skeleton-v1',
    },
  };
}

/**
 * Run EvalSuite against a scripted-first provider and build a tournament report
 * that contains only admitted numerical scores.
 */
export async function runEvaluationHarness(
  input: EvalHarnessInput,
): Promise<EvalHarnessResult> {
  const gate = input.evidenceGate ?? createDefaultFoundryEvidenceGate();
  const now = input.now ?? (() => new Date().toISOString());
  const scriptedGateError = assertScriptedFirst(input.provider);
  const rejectReasons: string[] = [];
  if (scriptedGateError) {
    rejectReasons.push(scriptedGateError);
  }

  const scores: EvalHarnessScore[] = [];
  const evidenceRefs: FoundryEvidenceRef[] = [];
  const scoresBySuite: Partial<Record<EvalSuiteClass, number>> = {};
  const suitePassFlags: Partial<Record<EvalSuiteClass, boolean>> = {};

  if (!scriptedGateError) {
    for (const evalCase of input.suite.cases) {
      const observedAt = now();
      const completion = await input.provider.complete({
        system: 'You are the Foundry scripted evaluation subject. Reply with pass/fail for the eval.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  task: 'foundry-eval',
                  evalId: evalCase.id,
                  suiteClass: evalCase.suiteClass,
                  description: evalCase.description,
                  passCondition: evalCase.passCondition,
                }),
              },
            ],
          },
        ],
        tools: [],
        maxOutputTokens: 256,
        timeoutMs: 5_000,
        responseFormat: 'text',
      });

      const raw = scoreEvalCase(evalCase, completion.text);
      const integrityPayload = JSON.stringify({
        candidateId: input.candidateId,
        evalId: evalCase.id,
        score: raw.score,
        passed: raw.passed,
        evidenceBlob: raw.evidenceBlob,
        provider: completion.provider,
        model: completion.model,
        isTestDouble: input.provider.isTestDouble,
        observedAt,
      });
      const integrityDigest = sha256(integrityPayload);
      const candidate: FoundryEvidenceCandidate = {
        score: raw.score,
        passed: raw.passed,
        evidenceBlob: raw.evidenceBlob,
        integrity: {
          integrityDigest,
          sourceType: input.provider.isTestDouble ? SCRIPTED_SOURCE : completion.provider,
          candidateId: input.candidateId,
          evalId: evalCase.id,
          observedAt,
        },
      };
      const admission = gate.admit(candidate);
      scores.push({
        evalId: evalCase.id,
        suiteClass: evalCase.suiteClass,
        score: raw.score,
        passed: raw.passed,
        evidenceBlob: raw.evidenceBlob,
        admission,
      });

      if (admission.admitted) {
        evidenceRefs.push(admission.ref);
        const prev = scoresBySuite[evalCase.suiteClass];
        scoresBySuite[evalCase.suiteClass] =
          prev === undefined ? admission.score : Math.min(prev, admission.score);
        const prevPass = suitePassFlags[evalCase.suiteClass];
        suitePassFlags[evalCase.suiteClass] =
          prevPass === undefined ? admission.passed : prevPass && admission.passed;
      } else {
        rejectReasons.push(
          `Unverified/rejected score for ${evalCase.id}: ${admission.reason}`,
        );
      }
    }
  }

  const required = input.suite.requiredClasses;
  const missingAdmitted = required.filter((cls) => scoresBySuite[cls] === undefined);
  if (missingAdmitted.length > 0) {
    rejectReasons.push(
      `Tournament report missing admitted scores for suite classes: ${missingAdmitted.join(', ')}`,
    );
  }
  const anyFailed = Object.values(suitePassFlags).some((value) => value === false);
  const pass = rejectReasons.length === 0 && !anyFailed && missingAdmitted.length === 0;

  const report: TournamentReport = {
    candidateId: input.candidateId,
    scoresBySuite,
    evidenceRefs,
    pass,
    fail: !pass,
    rejectReasons,
  };

  return {
    candidateId: input.candidateId,
    providerName: input.provider.name,
    isTestDouble: input.provider.isTestDouble,
    scores,
    report,
  };
}

/**
 * Attempt to inject a fabricated / unverified score into a report.
 * Always rejected by the evidence gate — helper for tests and callers.
 */
export function admitOrRejectScore(
  gate: FoundryEvidenceGate,
  candidate: FoundryEvidenceCandidate,
): FoundryEvidenceAdmission {
  return gate.admit(candidate);
}
