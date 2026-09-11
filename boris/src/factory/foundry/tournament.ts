/**
 * Agent Foundry V1 Phase 3 — multi-candidate tournament → judgement / compiled blueprint.
 *
 * Aggregates admitted scores only; candidates below threshold are rejected from
 * synthesis unchanged. Produces FoundryJudgement-compatible output.
 * Deterministic synthesizeFromTournament() for tests — no LLM required.
 */
import { createHash, randomUUID } from 'node:crypto';
import type {
  EvalSuite,
  TournamentCandidateInput,
  TournamentJudgement,
  TournamentReport,
  TournamentSynthesisInput,
} from './types.js';

const DEFAULT_PASS_THRESHOLD = 0.5;

function meanAdmittedScore(report: TournamentReport): number | null {
  const values = Object.values(report.scoresBySuite).filter(
    (v): v is number => typeof v === 'number',
  );
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function blueprintEvalsFromSuite(suite: EvalSuite): Array<{
  id: string;
  description: string;
  passCondition: string;
}> {
  return suite.cases.map((c) => ({
    id: c.id,
    description: c.description,
    passCondition: c.passCondition,
  }));
}

function mergeUnique(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = item.trim().toLowerCase();
      if (!item.trim() || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/**
 * Deterministic tournament synthesis from ≥2 candidates + admitted harness reports.
 * Rejects below-threshold candidates from synthesis (left unchanged / listed in rejected).
 */
export function synthesizeFromTournament(
  input: TournamentSynthesisInput,
): TournamentJudgement {
  if (!input.candidates || input.candidates.length < 2) {
    throw new Error('Tournament requires at least 2 CandidateBlueprint-like inputs.');
  }
  if (!input.reports || input.reports.length === 0) {
    throw new Error('Tournament requires harness TournamentReport results.');
  }

  const threshold = input.passThreshold ?? DEFAULT_PASS_THRESHOLD;
  const reportById = new Map(input.reports.map((r) => [r.candidateId, r]));
  const aggregatedScores: Record<string, number> = {};
  const eligible: Array<{ candidate: TournamentCandidateInput; score: number; report: TournamentReport }> = [];
  const rejectedCandidateIds: string[] = [];
  const rationale: string[] = [];

  for (const candidate of input.candidates) {
    const report = reportById.get(candidate.candidateId);
    if (!report) {
      rejectedCandidateIds.push(candidate.candidateId);
      rationale.push(
        `Rejected ${candidate.candidateId}: no harness TournamentReport (no admitted scores).`,
      );
      continue;
    }

    // Only admitted scores — reports already omit unverified scores from scoresBySuite.
    const mean = meanAdmittedScore(report);
    if (mean === null) {
      rejectedCandidateIds.push(candidate.candidateId);
      rationale.push(
        `Rejected ${candidate.candidateId}: zero admitted scores in report.`,
      );
      continue;
    }
    aggregatedScores[candidate.candidateId] = mean;

    if (report.fail || mean < threshold) {
      rejectedCandidateIds.push(candidate.candidateId);
      rationale.push(
        `Rejected ${candidate.candidateId} below threshold: mean admitted score ${mean.toFixed(3)} < ${threshold}` +
          (report.rejectReasons.length
            ? ` (${report.rejectReasons.slice(0, 2).join('; ')})`
            : ''),
      );
      continue;
    }

    eligible.push({ candidate, score: mean, report });
  }

  if (eligible.length === 0) {
    // Fail closed: still pick the highest admitted-score candidate for a blueprint
    // shell, but mark all as rejected rationale — prefer strongest available blueprint
    // only when at least one candidate has *some* admitted score.
    const scored = input.candidates
      .map((candidate) => {
        const report = reportById.get(candidate.candidateId);
        const mean = report ? meanAdmittedScore(report) : null;
        return { candidate, score: mean ?? -1, report };
      })
      .filter((row) => row.score >= 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      throw new Error(
        'Tournament has no candidates with admitted scores — cannot synthesize blueprint.',
      );
    }

    const fallback = scored[0]!;
    rationale.push(
      `No candidate met pass threshold ${threshold}; using highest admitted-score candidate ${fallback.candidate.candidateId} as synthesis base only.`,
    );
    return buildJudgement({
      winner: fallback.candidate,
      score: fallback.score,
      suite: input.suite,
      rationale,
      rejectedCandidateIds: input.candidates
        .map((c) => c.candidateId)
        .filter((id) => id !== fallback.candidate.candidateId),
      aggregatedScores,
      peers: [],
      sourceName: input.sourceName,
      sourceMission: input.sourceMission,
      belowThresholdWinner: true,
    });
  }

  eligible.sort((a, b) => b.score - a.score);
  const winner = eligible[0]!;
  rationale.unshift(
    `Winner ${winner.candidate.candidateId} with mean admitted score ${winner.score.toFixed(3)} (threshold ${threshold}).`,
  );
  for (const peer of eligible.slice(1)) {
    rationale.push(
      `Eligible peer ${peer.candidate.candidateId} scored ${peer.score.toFixed(3)} — non-conflicting ideas merged where present.`,
    );
  }

  return buildJudgement({
    winner: winner.candidate,
    score: winner.score,
    suite: input.suite,
    rationale,
    rejectedCandidateIds,
    aggregatedScores,
    peers: eligible.slice(1).map((e) => e.candidate),
    sourceName: input.sourceName,
    sourceMission: input.sourceMission,
    belowThresholdWinner: false,
  });
}

function buildJudgement(args: {
  winner: TournamentCandidateInput;
  score: number;
  suite: EvalSuite;
  rationale: string[];
  rejectedCandidateIds: string[];
  aggregatedScores: Record<string, number>;
  peers: TournamentCandidateInput[];
  sourceName?: string;
  sourceMission?: string;
  belowThresholdWinner: boolean;
}): TournamentJudgement {
  const { winner, peers, suite } = args;
  const bp = winner.blueprint;
  const peerCapabilities = peers.map((p) => p.blueprint.capabilities ?? []);
  const peerTools = peers.map((p) => p.blueprint.tools ?? []);
  const peerPrinciples = peers.map((p) => p.blueprint.principles ?? []);
  const peerWorkflow = peers.map((p) => p.blueprint.workflow ?? []);
  const peerGuardrails = peers.map((p) => p.blueprint.guardrails ?? []);
  const peerOutput = peers.map((p) => p.blueprint.outputContract ?? []);

  const mission =
    (bp.mission && bp.mission.trim()) ||
    (args.sourceMission && args.sourceMission.trim()) ||
    'Unspecified mission';
  const name =
    (bp.name && bp.name.trim()) ||
    (args.sourceName && args.sourceName.trim()) ||
    'Synthesized Agent';

  const workflow = mergeUnique([bp.workflow ?? [], ...peerWorkflow]);
  const evals =
    bp.evals.length > 0
      ? bp.evals.map((e) => ({
          id: e.id,
          description: e.description,
          passCondition: e.passCondition,
        }))
      : blueprintEvalsFromSuite(suite);

  if (!mission || workflow.length === 0 || evals.length === 0) {
    throw new Error('Synthesized blueprint is missing mission, workflow, or evals.');
  }

  const idSeed = createHash('sha256')
    .update(`${winner.candidateId}:${mission}:${name}`)
    .digest('hex')
    .slice(0, 10);

  const synthesizedBlueprint: TournamentJudgement['synthesizedBlueprint'] = {
    schemaVersion: '1.0.0',
    id: bp.id?.trim() || `agent-${idSeed}`,
    name,
    mission,
    principles: mergeUnique([bp.principles ?? [], ...peerPrinciples]),
    capabilities: mergeUnique([bp.capabilities ?? [], ...peerCapabilities]),
    tools: mergeUnique([bp.tools ?? [], ...peerTools]),
    memory: {
      persistent: mergeUnique([
        bp.memory?.persistent ?? [],
        ...peers.map((p) => p.blueprint.memory?.persistent ?? []),
      ]),
      taskScoped: mergeUnique([
        bp.memory?.taskScoped ?? [],
        ...peers.map((p) => p.blueprint.memory?.taskScoped ?? []),
      ]),
    },
    workflow,
    outputContract: mergeUnique([bp.outputContract ?? [], ...peerOutput]),
    guardrails: mergeUnique([bp.guardrails ?? [], ...peerGuardrails]),
    evals,
    provenance: {
      method: 'behavioral-synthesis',
      source: 'user-supplied-specification',
      hiddenPromptRecovered: false,
      chainOfThoughtRecovered: false,
      weightsRecovered: false,
    },
  };

  if (args.belowThresholdWinner) {
    args.rationale.push(
      'Synthesized blueprint marked from below-threshold base — promotion review still required in later phases.',
    );
  }

  return {
    winnerCandidateId: winner.candidateId,
    rationale: args.rationale,
    synthesizedBlueprint,
    rejectedCandidateIds: args.rejectedCandidateIds,
    aggregatedScores: args.aggregatedScores,
  };
}

/**
 * Optional helper: convert TournamentJudgement into the agent-foundry FoundryJudgement shape.
 */
export function toFoundryJudgementShape(judgement: TournamentJudgement): {
  winnerCandidateId: string;
  rationale: string[];
  synthesizedBlueprint: TournamentJudgement['synthesizedBlueprint'];
} {
  return {
    winnerCandidateId: judgement.winnerCandidateId,
    rationale: judgement.rationale,
    synthesizedBlueprint: judgement.synthesizedBlueprint,
  };
}

/** Mint a foundry run id for tournament-only paths (no LLM). */
export function mintFoundryRunId(): string {
  return `foundry-${randomUUID()}`;
}
