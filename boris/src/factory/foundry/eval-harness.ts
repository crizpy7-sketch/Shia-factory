/**
 * Agent Foundry V1 Phase 2/3 — scripted EvaluationHarness.
 *
 * Runs EvalSuite items against DeterministicScriptedProvider FIRST
 * (ScriptedProvider / ModelProvider with isTestDouble). Produces numerical
 * scores + evidence blob stubs. Only admitted scores enter the tournament report.
 *
 * Phase 3: optional structured runners (permission / boundary / provider /
 * incomplete packet / fabricated evidence) beyond the keyword heuristic.
 */
import { createHash } from 'node:crypto';
import type { ModelProvider, ProviderCapabilities } from '../../providers/types.js';
import type { ScriptedProvider } from '../../providers/scripted.js';
import {
  createDefaultFoundryEvidenceGate,
  SCRIPTED_EVIDENCE_SOURCE,
} from './evidence-gate.js';
import {
  aggregateStructuredChecks,
  runKeywordHeuristicCheck,
  runStructuredEvalChecks,
} from './eval-runners.js';
import type {
  EvalCase,
  EvalHarnessScore,
  EvalSuite,
  EvalSuiteClass,
  FoundryEvidenceAdmission,
  FoundryEvidenceCandidate,
  FoundryEvidenceGate,
  FoundryEvidenceRef,
  PermissionManifest,
  ProviderRequirements,
  SourcePacket,
  TournamentReport,
} from './types.js';

export { createDefaultFoundryEvidenceGate } from './evidence-gate.js';

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
  /** Phase 3: enable structured runners beyond keyword heuristic (default true). */
  useStructuredRunners?: boolean;
  /** Optional packet for incomplete-packet / boundary structured checks. */
  packet?: Partial<SourcePacket> | SourcePacket | Record<string, unknown>;
  /** Optional permissions for least-privilege structured checks. */
  permissions?: PermissionManifest;
  /** Optional provider requirements / capabilities for INCOMPATIBLE matrix checks. */
  providerRequirements?: ProviderRequirements;
  providerCapabilities?: ProviderCapabilities;
  /** Optional fabricated-evidence probe. */
  fabricatedProbe?: FoundryEvidenceCandidate;
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

function scoreEvalCaseKeyword(
  evalCase: EvalCase,
  providerText: string,
): { score: number; passed: boolean; evidenceBlob: Record<string, unknown> } {
  const result = runKeywordHeuristicCheck(evalCase, providerText);
  return {
    score: result.score,
    passed: result.passed,
    evidenceBlob: result.evidenceBlob,
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
  const useStructured = input.useStructuredRunners !== false;

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

      const raw = useStructured
        ? aggregateStructuredChecks(
            runStructuredEvalChecks({
              provider: input.provider,
              evalCase,
              providerText: completion.text,
              packet: input.packet,
              permissions: input.permissions,
              providerRequirements: input.providerRequirements,
              providerCapabilities:
                input.providerCapabilities ?? input.provider.capabilities,
              fabricatedProbe: input.fabricatedProbe,
            }),
          )
        : scoreEvalCaseKeyword(evalCase, completion.text);

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
          sourceType: input.provider.isTestDouble
            ? SCRIPTED_EVIDENCE_SOURCE
            : completion.provider,
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
