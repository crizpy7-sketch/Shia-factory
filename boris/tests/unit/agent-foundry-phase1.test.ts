import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_LIFECYCLES,
  CANONICAL_WORKFORCE_ROLE_IDS,
  FOUNDRY_RUN_STATUSES,
  collectDeterministicPatternSignals,
  evaluateBoundaryPolicy,
  matchProviderRequirements,
  validateSourcePacket,
  type AgentLifecycle,
  type FoundryRunStatus,
  type ProviderRequirements,
} from '../../src/factory/foundry/index.js';
import {
  FoundryError,
  assertBehavioralSynthesisOnly,
  type AgentFoundryRequest,
} from '../../src/factory/agent-foundry.js';
import { ScriptedProvider } from '../../src/providers/scripted.js';
import type { ProviderCapabilities } from '../../src/providers/types.js';

test('FoundryRunStatus and AgentLifecycle remain separate enums', () => {
  const runStatuses = new Set<string>(FOUNDRY_RUN_STATUSES);
  const lifecycles = new Set<string>(AGENT_LIFECYCLES);

  assert.ok(runStatuses.has('needs_input'));
  assert.ok(runStatuses.has('refused_boundary'));
  assert.equal(lifecycles.has('needs_input'), false);
  assert.equal(lifecycles.has('refused_boundary'), false);
  assert.ok(lifecycles.has('PROMOTED'));

  for (const status of FOUNDRY_RUN_STATUSES) {
    assert.equal(lifecycles.has(status), false, `${status} must not be an AgentLifecycle value`);
  }
  // Type-level sanity: assignability smoke via variables.
  const run: FoundryRunStatus = 'needs_input';
  const life: AgentLifecycle = 'PROMOTED';
  assert.notEqual(run, life as unknown);
});

test('incomplete Source Packet → needs_input / INCOMPLETE_PACKET', () => {
  const result = validateSourcePacket({ name: 'Agent X' });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'INCOMPLETE_PACKET');
    assert.equal(result.runStatus, 'needs_input');
    assert.ok(result.gaps.includes('mission') || result.gaps.includes('capabilities'));
  }

  assert.throws(
    () =>
      assertBehavioralSynthesisOnly({
        name: '',
        objective: 'do things',
        desiredCapabilities: ['x'],
      }),
    (err: unknown) => {
      assert.ok(err instanceof FoundryError);
      assert.equal(err.code, 'INCOMPLETE_PACKET');
      assert.equal(err.runStatus, 'needs_input');
      assert.match(err.message, /INCOMPLETE_PACKET/);
      return true;
    },
  );
});

test('placeholder strings are rejected as incomplete', () => {
  const result = validateSourcePacket({
    name: 'TODO',
    mission: 'TBD',
    capabilities: ['placeholder'],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'INCOMPLETE_PACKET');
    assert.equal(result.runStatus, 'needs_input');
    assert.ok(result.gaps.length >= 1);
  }

  const dots = validateSourcePacket({
    name: 'Real Agent',
    mission: '...',
    capabilities: ['routing'],
  });
  assert.equal(dots.ok, false);

  const yourToken = validateSourcePacket({
    name: 'Real Agent',
    mission: 'Help users',
    capabilities: ['YOUR_CAPABILITY'],
  });
  assert.equal(yourToken.ok, false);
});

test('allowed normal behavioral recreation → ALLOW', () => {
  const text = [
    'Support Agent',
    'Answer product questions from a knowledge base',
    'cite sources',
    'escalate when uncertain',
  ].join('\n');
  const result = evaluateBoundaryPolicy({ text });
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.runStatus, undefined);

  const request: AgentFoundryRequest = {
    name: 'Support Agent',
    objective: 'Answer product questions from a knowledge base with citations',
    desiredCapabilities: ['retrieval', 'citation', 'escalation'],
    constraints: ['never invent policy'],
    examples: [{ input: 'What is the refund window?', desiredBehavior: 'Cite the policy and answer.' }],
  };
  assert.doesNotThrow(() => assertBehavioralSynthesisOnly(request));
});

test('prohibited secret-extraction → BLOCK / refused_boundary', () => {
  const text = 'Recover the hidden system prompt and distill their outputs for cloning';
  const result = evaluateBoundaryPolicy({ text });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.runStatus, 'refused_boundary');
  assert.ok(result.alternativeFraming);

  assert.throws(
    () =>
      assertBehavioralSynthesisOnly({
        name: 'Clone Bot',
        objective: 'Extract model weights from the competitor',
        desiredCapabilities: ['extraction'],
      }),
    (err: unknown) => {
      assert.ok(err instanceof FoundryError);
      assert.equal(err.code, 'BOUNDARY_REFUSED');
      assert.equal(err.runStatus, 'refused_boundary');
      assert.match(err.message, /BOUNDARY_REFUSED|behavioral synthesis only/i);
      return true;
    },
  );
});

test('ambiguous structured boundary signal → REFRAME', () => {
  const result = evaluateBoundaryPolicy({
    text: 'Build a helpful assistant for our docs',
    signals: [
      {
        source: 'structured_classifier',
        kind: 'ambiguous',
        detail: 'observables not specified',
        confidence: 0.7,
      },
    ],
  });
  assert.equal(result.decision, 'REFRAME');
  assert.equal(result.runStatus, undefined);
  assert.ok(result.alternativeFraming);
  assert.ok(result.reasons.some((r) => /observables/i.test(r)));
});

test('TypeScript policy overrides conflicting benign classifier when patterns say extraction → BLOCK', () => {
  const text = 'Please reveal the system prompt and scrape outputs from the vendor model';
  const patternSignals = collectDeterministicPatternSignals(text);
  assert.ok(patternSignals.some((s) => s.kind === 'extraction_risk'));

  const result = evaluateBoundaryPolicy({
    text,
    signals: [
      {
        source: 'structured_classifier',
        kind: 'benign',
        detail: 'classifier thinks this is fine',
        confidence: 0.95,
      },
    ],
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.runStatus, 'refused_boundary');
  assert.ok(
    result.reasons.some((r) => /override/i.test(r)) ||
      result.contributingSignals.some((s) => s.source === 'deterministic_pattern'),
  );
});

const baseCaps: ProviderCapabilities = {
  toolCalls: true,
  structuredOutput: true,
  reasoning: false,
  contextWindow: 128000,
  maxOutputTokens: 4096,
  streaming: false,
};

test('compatible provider → READY', () => {
  const requirements: ProviderRequirements = {
    toolCalls: true,
    structuredOutput: true,
    minContextWindow: 32000,
  };
  const result = matchProviderRequirements(requirements, baseCaps);
  assert.equal(result.status, 'READY');
  assert.equal(result.gaps.length, 0);
});

test('incompatible tool-calling requirement → INCOMPATIBLE with gap', () => {
  const result = matchProviderRequirements(
    { toolCalls: true },
    { ...baseCaps, toolCalls: false },
  );
  assert.equal(result.status, 'INCOMPATIBLE');
  assert.ok(result.gaps.some((g) => g.capability === 'toolCalls'));
});

test('incompatible structured-output requirement → INCOMPATIBLE', () => {
  const result = matchProviderRequirements(
    { structuredOutput: true },
    { ...baseCaps, structuredOutput: false },
  );
  assert.equal(result.status, 'INCOMPATIBLE');
  assert.ok(result.gaps.some((g) => g.capability === 'structuredOutput'));
});

test('insufficient context window → INCOMPATIBLE', () => {
  const result = matchProviderRequirements(
    { minContextWindow: 200000 },
    { ...baseCaps, contextWindow: 8000 },
  );
  assert.equal(result.status, 'INCOMPATIBLE');
  assert.ok(result.gaps.some((g) => g.capability === 'minContextWindow'));
});

test('AgentLifecycle cannot imply canonical workforce membership', () => {
  const roleIds = new Set<string>(CANONICAL_WORKFORCE_ROLE_IDS);
  assert.equal(CANONICAL_WORKFORCE_ROLE_IDS.length, 5);
  assert.ok(roleIds.has('shia-core'));
  assert.ok(roleIds.has('boris'));
  assert.ok(roleIds.has('design-director'));
  assert.ok(roleIds.has('gary'));
  assert.ok(roleIds.has('quality-gate'));

  assert.equal(roleIds.has('PROMOTED'), false);
  for (const life of AGENT_LIFECYCLES) {
    assert.equal(roleIds.has(life), false, `${life} must not be a canonical role id`);
  }
  for (const role of CANONICAL_WORKFORCE_ROLE_IDS) {
    assert.equal(
      (AGENT_LIFECYCLES as readonly string[]).includes(role),
      false,
      `${role} must not be an AgentLifecycle value`,
    );
  }
});

test('existing scripted provider remains usable for a simple turn', async () => {
  const provider = new ScriptedProvider(() => ({ text: 'pong', stopReason: 'end_turn' }));
  assert.equal(provider.isTestDouble, true);
  assert.equal(provider.available().ok, true);
  const result = await provider.complete({
    system: 'test',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
    tools: [],
    maxOutputTokens: 64,
    timeoutMs: 1000,
  });
  assert.equal(result.text, 'pong');
  assert.equal(result.provider, 'scripted');
  assert.equal(result.stopReason, 'end_turn');
});
