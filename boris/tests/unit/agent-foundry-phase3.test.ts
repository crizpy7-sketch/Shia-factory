import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileBehaviorContract,
  materializeAgentPackage,
  buildLeastPrivilegePermissions,
  createFoundryEvidenceGate,
  createDefaultFoundryEvidenceGate,
  synthesizeFromTournament,
  analyzeReuse,
  buildEvalSuite,
  runEvaluationHarness,
  admitOrRejectScore,
  type FoundryEvidenceCandidate,
  type TournamentReport,
  type TournamentCandidateInput,
} from '../../src/factory/foundry/index.js';
import { judgeFromTournamentReports } from '../../src/factory/agent-foundry.js';
import { ScriptedProvider } from '../../src/providers/scripted.js';
import { ToolRegistry, type ToolDefinition } from '../../src/tools/registry.js';

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

const completePacket = {
  name: 'Support Triage Agent',
  mission: 'Triage customer support tickets with citations',
  capabilities: ['retrieve-kb', 'classify-urgency', 'draft-reply'],
  tools: ['kb_search', 'ticket_read'],
  memory: ['task:current-ticket', 'persistent:user-locale'],
  constraints: ['never invent refund policy', 'deny unrestricted shell'],
  examples: [
    {
      input: 'User asks for refund policy',
      desiredBehavior: 'Cite the published policy; do not invent terms',
    },
  ],
  badBehaviors: ['Invent refund policy', 'Bypass permission checks'],
  deploymentTarget: 'cloud',
};

test('BehaviorContract from complete packet', () => {
  const result = compileBehaviorContract(completePacket);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.contract.observables.length >= 3);
  assert.ok(
    result.contract.observables.some((o) => o.includes('retrieve-kb')),
    'observables include declared capability',
  );
  assert.ok(result.contract.acceptanceCriteria.length >= 1);
  assert.ok(result.contract.goodExamples.length >= 1);
  assert.ok(result.contract.badExamples.includes('Invent refund policy'));
  // Uncertainties may still be present for underspecified optional fields, but capabilities are not invented.
  for (const obs of result.contract.observables) {
    if (obs.startsWith('Observable capability:')) {
      const cap = obs.replace('Observable capability:', '').trim();
      assert.ok(
        completePacket.capabilities.includes(cap),
        `invented capability observed: ${cap}`,
      );
    }
  }
});

test('insufficient packet → needs_input / no invented capabilities', () => {
  const result = compileBehaviorContract({
    name: 'Hollow Agent',
    mission: '',
    capabilities: [],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'INCOMPLETE_PACKET');
  assert.equal(result.runStatus, 'needs_input');
  assert.ok(result.gaps.includes('observables') || result.gaps.includes('mission'));
  assert.ok(result.issues.some((i) => /insufficient observables|will not be invented|mission/i.test(i)));

  const noCaps = compileBehaviorContract({
    name: 'No Caps',
    mission: 'Do something vague',
    capabilities: [],
  });
  assert.equal(noCaps.ok, false);
  if (!noCaps.ok) {
    assert.ok(noCaps.gaps.includes('observables'));
    assert.ok(noCaps.issues.some((i) => /not be invented/i.test(i)));
  }
});

test('package materialize uses reuse hits and records gaps', () => {
  const contractResult = compileBehaviorContract(completePacket);
  assert.equal(contractResult.ok, true);
  if (!contractResult.ok) return;

  const registry = new ToolRegistry()
    .register(stubTool('kb_search'))
    .register(stubTool('ticket_read'));
  const reuse = analyzeReuse({
    packet: completePacket,
    capabilities: completePacket.capabilities,
    tools: completePacket.tools,
    toolRegistry: registry,
  });

  // Force a gap capability with empty skill/tool match on an extra declared tool
  const reuseWithGap = analyzeReuse({
    packet: {
      ...completePacket,
      tools: [...completePacket.tools, 'unknown_crm_bridge'],
    },
    capabilities: [...completePacket.capabilities, 'net-new-crm'],
    tools: [...completePacket.tools, 'unknown_crm_bridge'],
    toolRegistry: registry,
  });

  const draft = materializeAgentPackage({
    packet: {
      ...completePacket,
      tools: [...completePacket.tools, 'unknown_crm_bridge'],
      capabilities: [...completePacket.capabilities, 'net-new-crm'],
    },
    contract: contractResult.contract,
    reuse: reuseWithGap,
    providerRequirements: { toolCalls: true, structuredOutput: true },
  });

  assert.equal(draft.lifecycle, 'TEMPORARY_CANDIDATE');
  assert.ok(draft.reuseHits.some((h) => h.existingId === 'kb_search'));
  assert.ok(draft.package.tools.tools.includes('kb_search'));
  assert.ok(draft.package.tools.tools.includes('ticket_read'));
  assert.equal(
    draft.package.tools.tools.includes('unknown_crm_bridge'),
    false,
    'must not invent missing tool integrations',
  );
  assert.ok(draft.openGaps.length >= 1);
  assert.ok(
    draft.package.knownLimitations.limitations.some((l) =>
      /unknown_crm_bridge|Reuse gap|net-new-crm/i.test(l),
    ),
  );
  assert.equal(draft.package.capabilities.capabilities.includes('net-new-crm'), true);
  assert.ok(draft.package.evals.cases.length >= 1);
  assert.equal(draft.package.providerRequirements?.toolCalls, true);
  // In-memory only — no filesystem side effects implied by API
  assert.equal(typeof draft.candidateId, 'string');
  assert.ok(reuse.map.hits.length >= 1);
});

test('default permissions deny unrestricted deploy/shell', () => {
  const perms = buildLeastPrivilegePermissions({
    name: 'Ops Agent',
    mission: 'Help with ops docs',
    capabilities: ['docs'],
    tools: ['shell_run', 'deploy_prod'],
  });
  assert.ok(perms.permissions.includes('deny-unrestricted-shell'));
  assert.ok(perms.permissions.includes('deny-deploy'));
  assert.ok(perms.permissions.includes('deny-prod-access'));
  assert.ok(perms.permissions.includes('deny-credential-access'));
  assert.equal(
    perms.permissions.some((p) => p === 'allow-deploy' || p === 'allow-unrestricted-shell'),
    false,
  );

  const contractResult = compileBehaviorContract(completePacket);
  assert.ok(contractResult.ok);
  if (!contractResult.ok) return;
  const reuse = analyzeReuse({
    capabilities: completePacket.capabilities,
    tools: completePacket.tools,
    toolRegistry: ['kb_search', 'ticket_read'],
  });
  const draft = materializeAgentPackage({
    packet: completePacket,
    contract: contractResult.contract,
    reuse,
  });
  for (const flag of [
    'deny-unrestricted-shell',
    'deny-deploy',
    'deny-prod-access',
    'deny-credential-access',
  ]) {
    assert.ok(draft.package.permissions.permissions.includes(flag), `missing ${flag}`);
  }
});

test('evidence gate admits scripted digest evidence, rejects fabricated', () => {
  const gate = createFoundryEvidenceGate();
  const defaultGate = createDefaultFoundryEvidenceGate();

  const good: FoundryEvidenceCandidate = {
    score: 1,
    passed: true,
    evidenceBlob: { ok: true },
    integrity: {
      integrityDigest: 'b'.repeat(64),
      sourceType: 'scripted-deterministic',
      candidateId: 'c-phase3',
      evalId: 'eval-capability',
      observedAt: '2026-09-10T12:00:00.000Z',
    },
  };
  const admitted = gate.admit(good);
  assert.equal(admitted.admitted, true);
  if (admitted.admitted) {
    assert.equal(admitted.ref.verificationState, 'verified');
    assert.equal(admitted.ref.sourceType, 'scripted-deterministic');
  }

  const fabricated: FoundryEvidenceCandidate = {
    ...good,
    fabricated: true,
    score: 0.99,
  };
  const rejected = admitOrRejectScore(defaultGate, fabricated);
  assert.equal(rejected.admitted, false);
  if (!rejected.admitted) {
    assert.equal(rejected.state, 'unverified');
    assert.match(rejected.reason, /fabricated/i);
  }

  const missing: FoundryEvidenceCandidate = {
    score: 1,
    passed: true,
    evidenceBlob: {},
    integrity: {
      integrityDigest: '',
      sourceType: 'scripted-deterministic',
      candidateId: 'c-phase3',
      evalId: 'eval-capability',
      observedAt: '2026-09-10T12:00:00.000Z',
    },
  };
  assert.equal(gate.admit(missing).admitted, false);

  const ciClaim: FoundryEvidenceCandidate = {
    ...good,
    integrity: {
      ...good.integrity,
      sourceType: 'github-actions',
      integrityDigest: 'c'.repeat(64),
    },
  };
  const ciRejected = gate.admit(ciClaim);
  assert.equal(ciRejected.admitted, false);
  if (!ciRejected.admitted) {
    assert.match(ciRejected.reason, /not admitted|not wired/i);
  }
});

test('tournament picks winner from admitted scores only', () => {
  const suite = buildEvalSuite({ packet: completePacket });
  const mkBlueprint = (
    id: string,
    name: string,
    extras: Partial<TournamentCandidateInput['blueprint']> = {},
  ): TournamentCandidateInput => ({
    candidateId: id,
    architectRole: id,
    blueprint: {
      id: `agent-${id}`,
      name,
      mission: completePacket.mission,
      principles: ['cite sources'],
      capabilities: completePacket.capabilities,
      tools: ['kb_search'],
      memory: { persistent: ['user-locale'], taskScoped: ['current-ticket'] },
      workflow: ['intake', 'retrieve', 'reply'],
      outputContract: ['json'],
      guardrails: ['no invented policy'],
      evals: suite.cases.slice(0, 3).map((c) => ({
        id: c.id,
        description: c.description,
        passCondition: c.passCondition,
      })),
      ...extras,
    },
  });

  const candidates = [
    mkBlueprint('candidate-1', 'Strong Agent'),
    mkBlueprint('candidate-2', 'Weak Agent'),
    mkBlueprint('candidate-3', 'Unverified Agent'),
  ];

  const reports: TournamentReport[] = [
    {
      candidateId: 'candidate-1',
      scoresBySuite: {
        capability: 1,
        regression: 1,
        hallucination: 1,
        adversarial: 1,
        'tool-use': 1,
        permission: 1,
        'memory-contamination': 1,
        portability: 1,
        'failure-recovery': 1,
      },
      evidenceRefs: [
        {
          evalId: 'eval-capability',
          candidateId: 'candidate-1',
          sourceType: 'scripted-deterministic',
          integrityDigest: 'd'.repeat(64),
          verificationState: 'verified',
          observedAt: '2026-09-10T12:00:00.000Z',
        },
      ],
      pass: true,
      fail: false,
      rejectReasons: [],
    },
    {
      candidateId: 'candidate-2',
      scoresBySuite: {
        capability: 0.2,
        regression: 0.2,
      },
      evidenceRefs: [],
      pass: false,
      fail: true,
      rejectReasons: ['below threshold'],
    },
    {
      candidateId: 'candidate-3',
      // No admitted scores — unverified only
      scoresBySuite: {},
      evidenceRefs: [],
      pass: false,
      fail: true,
      rejectReasons: ['Unverified/rejected score'],
    },
  ];

  const judgement = synthesizeFromTournament({
    candidates,
    reports,
    suite,
    passThreshold: 0.5,
    sourceName: completePacket.name,
    sourceMission: completePacket.mission,
  });

  assert.equal(judgement.winnerCandidateId, 'candidate-1');
  assert.ok(judgement.rejectedCandidateIds.includes('candidate-2'));
  assert.ok(judgement.rejectedCandidateIds.includes('candidate-3'));
  assert.equal(judgement.aggregatedScores['candidate-1']! > 0.5, true);
  assert.equal(judgement.aggregatedScores['candidate-3'], undefined);
  assert.ok(judgement.rationale.length >= 1);
});

test('synthesized blueprint has mission/workflow/evals', () => {
  const suite = buildEvalSuite({ packet: completePacket });
  const candidates: TournamentCandidateInput[] = [
    {
      candidateId: 'candidate-a',
      blueprint: {
        name: 'A',
        mission: completePacket.mission,
        capabilities: ['retrieve-kb'],
        workflow: ['step-a', 'step-b'],
        evals: [{ id: 'e1', description: 'd', passCondition: 'p' }],
        tools: ['kb_search'],
        principles: ['p1'],
      },
    },
    {
      candidateId: 'candidate-b',
      blueprint: {
        name: 'B',
        mission: completePacket.mission,
        capabilities: ['classify-urgency'],
        workflow: ['step-b', 'step-c'],
        evals: [{ id: 'e2', description: 'd2', passCondition: 'p2' }],
        tools: ['ticket_read'],
        principles: ['p2'],
      },
    },
  ];
  const fullScores = Object.fromEntries(
    suite.requiredClasses.map((cls) => [cls, 1]),
  ) as TournamentReport['scoresBySuite'];
  const reports: TournamentReport[] = [
    {
      candidateId: 'candidate-a',
      scoresBySuite: fullScores,
      evidenceRefs: [],
      pass: true,
      fail: false,
      rejectReasons: [],
    },
    {
      candidateId: 'candidate-b',
      scoresBySuite: { ...fullScores, capability: 0.9 },
      evidenceRefs: [],
      pass: true,
      fail: false,
      rejectReasons: [],
    },
  ];

  const judgement = synthesizeFromTournament({
    candidates,
    reports,
    suite,
    sourceMission: completePacket.mission,
    sourceName: completePacket.name,
  });

  assert.ok(judgement.synthesizedBlueprint.mission.length > 0);
  assert.ok(judgement.synthesizedBlueprint.workflow.length >= 2);
  assert.ok(judgement.synthesizedBlueprint.evals.length >= 1);
  assert.equal(judgement.synthesizedBlueprint.schemaVersion, '1.0.0');
  assert.equal(judgement.synthesizedBlueprint.provenance.hiddenPromptRecovered, false);

  const viaFoundry = judgeFromTournamentReports(
    candidates.map((c) => ({
      candidateId: c.candidateId,
      architectRole: c.candidateId,
      blueprint: {
        schemaVersion: '1.0.0' as const,
        id: c.blueprint.id ?? c.candidateId,
        name: c.blueprint.name,
        mission: c.blueprint.mission,
        principles: c.blueprint.principles ?? [],
        capabilities: c.blueprint.capabilities,
        tools: c.blueprint.tools ?? [],
        memory: {
          persistent: c.blueprint.memory?.persistent ?? [],
          taskScoped: c.blueprint.memory?.taskScoped ?? [],
        },
        workflow: c.blueprint.workflow,
        outputContract: c.blueprint.outputContract ?? [],
        guardrails: c.blueprint.guardrails ?? [],
        evals: c.blueprint.evals,
        provenance: {
          method: 'behavioral-synthesis' as const,
          source: 'user-supplied-specification' as const,
          hiddenPromptRecovered: false as const,
          chainOfThoughtRecovered: false as const,
          weightsRecovered: false as const,
        },
      },
      provider: 'scripted',
      model: 'scripted-deterministic',
    })),
    reports,
    suite,
    { sourceMission: completePacket.mission },
  );
  assert.ok(viaFoundry.synthesizedBlueprint.mission);
  assert.ok(viaFoundry.synthesizedBlueprint.workflow.length >= 1);
  assert.ok(viaFoundry.synthesizedBlueprint.evals.length >= 1);
});

test('structured runners still scripted-first with ScriptedProvider', async () => {
  const suite = buildEvalSuite({ packet: completePacket });
  const contract = compileBehaviorContract(completePacket);
  assert.ok(contract.ok);
  if (!contract.ok) return;
  const draft = materializeAgentPackage({
    packet: completePacket,
    contract: contract.contract,
    reuse: analyzeReuse({
      tools: completePacket.tools,
      toolRegistry: ['kb_search', 'ticket_read'],
    }),
  });
  const provider = new ScriptedProvider(() => ({
    text: 'pass ok capability regression hallucination adversarial tool-use permission memory-contamination portability failure-recovery',
    stopReason: 'end_turn',
  }));
  const result = await runEvaluationHarness({
    candidateId: draft.candidateId,
    suite,
    provider,
    packet: completePacket,
    permissions: draft.package.permissions,
    providerRequirements: draft.providerRequirements,
    now: () => '2026-09-10T15:00:00.000Z',
  });
  assert.equal(result.isTestDouble, true);
  assert.ok(result.report.evidenceRefs.length > 0);
  assert.ok(result.scores.some((s) => s.evidenceBlob['scoring'] === 'scripted-structured-v1'));
});
