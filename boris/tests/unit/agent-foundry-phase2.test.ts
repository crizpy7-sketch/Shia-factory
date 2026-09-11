import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVAL_SUITE_CLASSES,
  analyzeReuse,
  buildEvalSuite,
  evalSuiteCoversRequiredClasses,
  createDefaultFoundryEvidenceGate,
  assertScriptedFirst,
  runEvaluationHarness,
  admitOrRejectScore,
  type FoundryEvidenceCandidate,
} from '../../src/factory/foundry/index.js';
import { ScriptedProvider } from '../../src/providers/scripted.js';
import type { ModelProvider, ProviderCapabilities } from '../../src/providers/types.js';
import { ToolRegistry, type ToolDefinition } from '../../src/tools/registry.js';

const caps: ProviderCapabilities = {
  toolCalls: true,
  structuredOutput: true,
  reasoning: false,
  contextWindow: 128000,
  maxOutputTokens: 4096,
  streaming: false,
};

function stubTool(name: string): ToolDefinition {
  return {
    name,
    description: name,
    sensitivity: 'safe',
    schema: {},
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ ok: true, output: 'ok' }),
  };
}

test('reuse map CREATE with no-match evidence when empty registries', () => {
  const result = analyzeReuse({
    capabilities: ['net-new-orchestrator'],
    toolRegistry: [],
    skillNames: [],
    now: () => '2026-09-10T00:00:00.000Z',
  });
  assert.equal(result.map.dispositions.length, 1);
  const disposition = result.map.dispositions[0]!;
  assert.equal(disposition.disposition, 'CREATE');
  assert.equal(result.map.hits.length, 0);
  assert.equal(result.map.gaps.length, 1);
  assert.ok(result.map.gaps[0]!.noMatchEvidence.length >= 1);
  assert.match(result.map.gaps[0]!.justification, /no-match evidence|CREATE/i);
  assert.ok(!result.map.gaps[0]!.justification.includes('90%'));
});

test('reuse map REUSE/hit when tool name exists', () => {
  const registry = new ToolRegistry().register(stubTool('fs_read'));
  const result = analyzeReuse({
    capabilities: ['fs_read'],
    toolRegistry: registry,
  });
  assert.equal(result.map.hits.length, 1);
  assert.equal(result.map.hits[0]!.kind, 'tool');
  assert.equal(result.map.hits[0]!.existingId, 'fs_read');
  assert.equal(result.map.dispositions[0]!.disposition, 'REUSE');
  assert.equal(result.map.gaps.length, 0);

  const fromNames = analyzeReuse({
    tools: ['fs_read'],
    toolRegistry: ['fs_read', 'shell_run'],
  });
  assert.equal(fromNames.map.dispositions[0]!.disposition, 'REUSE');
});

test('EvalSuite includes required classes', () => {
  const suite = buildEvalSuite({
    packet: {
      name: 'Support Agent',
      mission: 'Answer product questions',
      capabilities: ['retrieval', 'citation'],
      tools: ['kb_search'],
    },
  });
  assert.ok(evalSuiteCoversRequiredClasses(suite));
  for (const required of EVAL_SUITE_CLASSES) {
    assert.ok(
      suite.cases.some((item) => item.suiteClass === required),
      `missing suite class ${required}`,
    );
  }
  assert.deepEqual([...suite.requiredClasses], [...EVAL_SUITE_CLASSES]);
  for (const evalCase of suite.cases.filter((item) => !item.mapsBadBehavior)) {
    assert.equal(typeof evalCase.threshold, 'number');
    assert.equal(evalCase.thresholdTbd, undefined);
  }
});

test('BAD behavior maps to ≥1 eval when provided', () => {
  const suite = buildEvalSuite({
    packet: {
      name: 'Support Agent',
      mission: 'Help users',
      capabilities: ['answer'],
      badBehaviors: ['Invent refund policy', 'Bypass permission checks'],
    },
  });
  assert.equal(suite.badBehaviorCoverage.length, 2);
  for (const coverage of suite.badBehaviorCoverage) {
    assert.ok(coverage.evalIds.length >= 1);
    for (const id of coverage.evalIds) {
      assert.ok(suite.cases.some((item) => item.id === id && item.mapsBadBehavior === coverage.badBehavior));
    }
  }
});

test('harness runs with ScriptedProvider', async () => {
  const suite = buildEvalSuite({
    packet: {
      name: 'Portable Agent',
      mission: 'Stay portable',
      capabilities: ['routing'],
    },
  });
  const provider = new ScriptedProvider(() => ({
    text: 'pass ok capability regression hallucination adversarial tool-use permission memory-contamination portability failure-recovery',
    stopReason: 'end_turn',
  }));
  const result = await runEvaluationHarness({
    candidateId: 'candidate-scripted-1',
    suite,
    provider,
    now: () => '2026-09-10T12:00:00.000Z',
  });
  assert.equal(result.isTestDouble, true);
  assert.ok(result.scores.length >= EVAL_SUITE_CLASSES.length);
  assert.equal(result.report.candidateId, 'candidate-scripted-1');
  assert.ok(Object.keys(result.report.scoresBySuite).length >= EVAL_SUITE_CLASSES.length);
});

test('unverified/fabricated score rejected', () => {
  const gate = createDefaultFoundryEvidenceGate();
  const fabricated: FoundryEvidenceCandidate = {
    score: 0.99,
    passed: true,
    fabricated: true,
    evidenceBlob: { note: 'made up' },
    integrity: {
      integrityDigest: 'a'.repeat(64),
      sourceType: 'scripted-deterministic',
      candidateId: 'c1',
      evalId: 'eval-capability',
      observedAt: '2026-09-10T12:00:00.000Z',
    },
  };
  const rejected = admitOrRejectScore(gate, fabricated);
  assert.equal(rejected.admitted, false);
  if (!rejected.admitted) {
    assert.equal(rejected.state, 'unverified');
    assert.match(rejected.reason, /fabricated/i);
  }

  const missingDigest: FoundryEvidenceCandidate = {
    score: 1,
    passed: true,
    evidenceBlob: {},
    integrity: {
      integrityDigest: '',
      sourceType: 'scripted-deterministic',
      candidateId: 'c1',
      evalId: 'eval-capability',
      observedAt: '2026-09-10T12:00:00.000Z',
    },
  };
  const unverified = gate.admit(missingDigest);
  assert.equal(unverified.admitted, false);
});

test('admitted score appears in tournament report', async () => {
  const suite = buildEvalSuite({
    packet: {
      name: 'Eval Agent',
      mission: 'Be evaluable',
      capabilities: ['eval'],
    },
  });
  const provider = new ScriptedProvider(() => ({
    text: 'pass',
    stopReason: 'end_turn',
  }));
  const result = await runEvaluationHarness({
    candidateId: 'candidate-admitted-1',
    suite,
    provider,
  });
  assert.ok(result.report.evidenceRefs.length > 0);
  assert.ok(result.report.scoresBySuite.capability !== undefined);
  assert.equal(typeof result.report.scoresBySuite.capability, 'number');
  // Fabricated scores must not appear: only admitted refs
  for (const ref of result.report.evidenceRefs) {
    assert.equal(ref.verificationState, 'verified');
    assert.equal(ref.sourceType, 'scripted-deterministic');
    assert.match(ref.integrityDigest, /^[0-9a-f]{64}$/);
  }
});

test('scripted-first (isTestDouble) gate sanity', async () => {
  const provider = new ScriptedProvider(() => ({ text: 'pass', stopReason: 'end_turn' }));
  assert.equal(provider.isTestDouble, true);
  assert.equal(assertScriptedFirst(provider), null);

  const nonDouble: ModelProvider = {
    name: 'fake-vendor',
    model: 'fake-1',
    capabilities: caps,
    isTestDouble: false,
    available: () => ({ ok: true, reason: 'fake' }),
    complete: async () => ({
      text: 'pass',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1 },
      costUsd: null,
      model: 'fake-1',
      provider: 'fake-vendor',
      latencyMs: 1,
      attempts: 1,
    }),
  };
  assert.match(assertScriptedFirst(nonDouble) ?? '', /isTestDouble|Scripted/i);

  const suite = buildEvalSuite({
    packet: { name: 'X', mission: 'Y', capabilities: ['z'] },
  });
  const blocked = await runEvaluationHarness({
    candidateId: 'candidate-non-double',
    suite,
    provider: nonDouble,
  });
  assert.equal(blocked.report.pass, false);
  assert.ok(blocked.report.rejectReasons.some((reason) => /isTestDouble|Scripted/i.test(reason)));
  assert.deepEqual(blocked.report.scoresBySuite, {});
  assert.equal(blocked.report.evidenceRefs.length, 0);
});
