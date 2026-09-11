/**
 * Agent Foundry V1 Phase 3 — BehaviorContract compiler.
 *
 * Compiles only observable clauses from SourcePacket fields/examples.
 * Marks uncertainties; never invents capabilities.
 */
import { validate } from '../../util/validate.js';
import type {
  BehaviorContract,
  BehaviorContractCompileResult,
  BehaviorExample,
  SourcePacket,
} from './types.js';

function uniquePreserve(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function observableFromCapability(capability: string): string {
  return `Observable capability: ${capability.trim()}`;
}

function observableFromExample(example: BehaviorExample, index: number): string {
  return `Example ${index + 1}: given "${example.input.trim()}", desired behavior is "${example.desiredBehavior.trim()}"`;
}

function acceptanceFromExample(example: BehaviorExample, index: number): string {
  return `Acceptance ${index + 1}: response to "${example.input.trim()}" matches desired behavior "${example.desiredBehavior.trim()}"`;
}

/**
 * Compile a BehaviorContract from a SourcePacket.
 * Returns needs_input when observables are insufficient — never invents capabilities.
 */
export function compileBehaviorContract(
  packet: SourcePacket | (Partial<SourcePacket> & Record<string, unknown>),
): BehaviorContractCompileResult {
  const structural = validate(packet as Record<string, unknown>, {
    name: { type: 'string', required: false },
    mission: { type: 'string', required: false },
    capabilities: { type: 'array', required: false },
    tools: { type: 'array', required: false },
    memory: { type: 'array', required: false },
    constraints: { type: 'array', required: false },
    examples: { type: 'array', required: false },
    badBehaviors: { type: 'array', required: false },
    goodExamples: { type: 'array', required: false },
  });

  const gaps: string[] = [];
  const issues: string[] = [];
  const uncertainties: string[] = [];

  if (!structural.ok) {
    return {
      ok: false,
      code: 'INCOMPLETE_PACKET',
      runStatus: 'needs_input',
      gaps: ['packet'],
      issues: structural.issues,
      uncertainties: ['packet structure is invalid'],
    };
  }

  const src = packet as Partial<SourcePacket>;
  const mission = typeof src.mission === 'string' ? src.mission.trim() : '';
  const capabilities = Array.isArray(src.capabilities)
    ? src.capabilities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const examples = Array.isArray(src.examples)
    ? src.examples.filter(
        (item): item is BehaviorExample =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as BehaviorExample).input === 'string' &&
          typeof (item as BehaviorExample).desiredBehavior === 'string' &&
          (item as BehaviorExample).input.trim().length > 0 &&
          (item as BehaviorExample).desiredBehavior.trim().length > 0,
      )
    : [];
  const constraints = Array.isArray(src.constraints)
    ? src.constraints.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const badExamples = Array.isArray(src.badBehaviors)
    ? src.badBehaviors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const goodExampleStrings = Array.isArray(src.goodExamples)
    ? src.goodExamples.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  if (!mission) {
    gaps.push('mission');
    issues.push('mission is required to derive observable mission clauses');
  }
  if (capabilities.length === 0 && examples.length === 0) {
    gaps.push('observables');
    issues.push(
      'insufficient observables: need at least one capability or behavior example — capabilities will not be invented',
    );
  }

  if (!Array.isArray(src.tools) || src.tools.length === 0) {
    uncertainties.push('tools not specified — tool observables remain open');
  }
  if (!Array.isArray(src.memory) || src.memory.length === 0) {
    uncertainties.push('memory contract not specified — persistence observables remain open');
  }
  if (constraints.length === 0) {
    uncertainties.push('constraints not specified — permission boundaries may be incomplete');
  }
  if (examples.length === 0) {
    uncertainties.push('no behavior examples supplied — acceptance criteria derived only from declared capabilities');
  }
  if (badExamples.length === 0) {
    uncertainties.push('no badBehaviors supplied — refusal/negative cases are underspecified');
  }
  if (!src.deploymentTarget) {
    uncertainties.push('deploymentTarget not specified — portability observables remain open');
  }

  if (gaps.length > 0) {
    return {
      ok: false,
      code: 'INCOMPLETE_PACKET',
      runStatus: 'needs_input',
      gaps: uniquePreserve(gaps),
      issues,
      uncertainties: uniquePreserve(uncertainties),
    };
  }

  const observables = uniquePreserve([
    `Mission observable: ${mission}`,
    ...capabilities.map(observableFromCapability),
    ...examples.map(observableFromExample),
    ...goodExampleStrings.map((item, index) => `Good example ${index + 1}: ${item}`),
    ...(Array.isArray(src.tools) ? src.tools.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => `Tool observable: ${t}`) : []),
    ...(Array.isArray(src.memory) ? src.memory.filter((m): m is string => typeof m === 'string' && m.trim().length > 0).map((m) => `Memory observable: ${m}`) : []),
  ]);

  const acceptanceCriteria = uniquePreserve([
    `Mission satisfied when agent behavior advances: ${mission}`,
    ...capabilities.map((cap) => `Capability "${cap}" produces observable correct behavior`),
    ...examples.map(acceptanceFromExample),
    ...constraints.map((c) => `Constraint held: ${c}`),
  ]);

  const goodExamples: BehaviorExample[] = [
    ...examples,
    ...goodExampleStrings.map((item) => ({
      input: 'user-supplied good example',
      desiredBehavior: item,
    })),
  ];

  const contract: BehaviorContract = {
    observables,
    constraints: uniquePreserve(constraints),
    goodExamples,
    badExamples: uniquePreserve(badExamples),
    acceptanceCriteria,
    uncertainties: uniquePreserve(uncertainties),
  };

  // Never invent capabilities beyond packet-declared ones.
  const invented = contract.observables.some(
    (obs) =>
      obs.startsWith('Observable capability:') &&
      !capabilities.some((cap) => obs === observableFromCapability(cap)),
  );
  if (invented) {
    return {
      ok: false,
      code: 'INCOMPLETE_PACKET',
      runStatus: 'needs_input',
      gaps: ['capabilities'],
      issues: ['compiler attempted to invent capabilities — refusing'],
      uncertainties: uniquePreserve(uncertainties),
    };
  }

  return { ok: true, contract };
}
