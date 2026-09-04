/**
 * Deterministic boundary policy for Agent Foundry.
 *
 * Software (TypeScript patterns + policy rules) wins over conflicting classifier signals.
 * Secret-extraction requests are BLOCKED with refused_boundary; ambiguous specs are REFRAMED;
 * benign behavioral recreation is ALLOWED.
 */

export type BoundaryDecisionKind = 'ALLOW' | 'REFRAME' | 'BLOCK';

export type BoundarySignalKind = 'extraction_risk' | 'ambiguous' | 'benign' | 'other';

export interface BoundarySignal {
  source: 'deterministic_pattern' | 'structured_classifier';
  weight?: number;
  kind: BoundarySignalKind;
  detail: string;
  confidence?: number;
}

export interface BoundaryPolicyInput {
  text: string;
  signals?: BoundarySignal[];
}

export interface BoundaryPolicyResult {
  decision: BoundaryDecisionKind;
  runStatus?: 'refused_boundary';
  reasons: string[];
  alternativeFraming?: string;
  contributingSignals: BoundarySignal[];
}

const EXTRACTION_PATTERNS: Array<{ pattern: RegExp; detail: string }> = [
  { pattern: /hidden\s+(system\s+)?prompt/i, detail: 'requests hidden/system prompt recovery' },
  { pattern: /reveal\s+(the\s+)?system\s+prompt/i, detail: 'requests system prompt revelation' },
  { pattern: /steal\s+(the\s+)?prompt/i, detail: 'requests prompt theft' },
  { pattern: /chain[-\s]?of[-\s]?thought/i, detail: 'requests chain-of-thought recovery' },
  { pattern: /model\s+weights/i, detail: 'requests model weights' },
  { pattern: /extract\s+weights/i, detail: 'requests weight extraction' },
  { pattern: /scrape\s+outputs?/i, detail: 'requests output scraping' },
  { pattern: /distill\s+(their|its|grok|model|another|other)\s+outputs?/i, detail: 'requests output distillation' },
  { pattern: /bulk[-\s]?distill/i, detail: 'requests bulk distillation' },
  { pattern: /recover\s+(hidden|private|proprietary)/i, detail: 'requests recovery of proprietary internals' },
];

const FUNCTIONAL_RECREATION_FRAMING =
  'Agent Foundry supports independent behavioral synthesis only. Describe observable behaviors, tools, memory, and acceptance criteria for an original agent — do not request hidden prompts, private chain-of-thought, model weights, scraping, or output distillation.';

/** Collect deterministic pattern signals from free text. */
export function collectDeterministicPatternSignals(text: string): BoundarySignal[] {
  const signals: BoundarySignal[] = [];
  for (const { pattern, detail } of EXTRACTION_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({
        source: 'deterministic_pattern',
        kind: 'extraction_risk',
        detail,
        confidence: 1,
        weight: 1,
      });
    }
  }
  return signals;
}

/**
 * Evaluate boundary policy. Deterministic patterns override conflicting classifier signals:
 * if patterns say extraction_risk, decision is BLOCK even when a classifier says benign.
 */
export function evaluateBoundaryPolicy(input: BoundaryPolicyInput): BoundaryPolicyResult {
  const patternSignals = collectDeterministicPatternSignals(input.text ?? '');
  const structuredSignals = input.signals ?? [];
  const contributingSignals = [...patternSignals, ...structuredSignals];

  const strongPatternExtraction = patternSignals.some((s) => s.kind === 'extraction_risk');
  const strongStructuredExtraction = structuredSignals.some(
    (s) =>
      s.kind === 'extraction_risk' &&
      (s.confidence === undefined || s.confidence >= 0.5),
  );

  // CRITICAL: TypeScript policy overrides conflicting signals (software wins).
  if (strongPatternExtraction || strongStructuredExtraction) {
    const reasons = contributingSignals
      .filter((s) => s.kind === 'extraction_risk')
      .map((s) => s.detail);
    if (!reasons.length) {
      reasons.push('extraction risk detected');
    }
    // Note benign conflicts explicitly so audits show override.
    const conflictingBenign = structuredSignals.filter((s) => s.kind === 'benign');
    if (conflictingBenign.length && strongPatternExtraction) {
      reasons.push(
        'deterministic extraction patterns override conflicting benign classifier signal',
      );
    }
    return {
      decision: 'BLOCK',
      runStatus: 'refused_boundary',
      reasons,
      alternativeFraming: FUNCTIONAL_RECREATION_FRAMING,
      contributingSignals,
    };
  }

  const ambiguousOnly =
    structuredSignals.some((s) => s.kind === 'ambiguous') &&
    !structuredSignals.some((s) => s.kind === 'extraction_risk') &&
    !patternSignals.length;

  if (ambiguousOnly) {
    return {
      decision: 'REFRAME',
      reasons: structuredSignals
        .filter((s) => s.kind === 'ambiguous')
        .map((s) => s.detail || 'specification is ambiguous; provide observables'),
      alternativeFraming:
        'Clarify observable behaviors, acceptance criteria, and constraints before packaging an agent.',
      contributingSignals,
    };
  }

  return {
    decision: 'ALLOW',
    reasons: ['behavioral recreation within Foundry boundaries'],
    contributingSignals,
  };
}
