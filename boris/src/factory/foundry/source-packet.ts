import { validate } from '../../util/validate.js';
import type { BehaviorExample, SourcePacket } from './types.js';

export type SourcePacketValidationOk = { ok: true; packet: SourcePacket };
export type SourcePacketValidationFail = {
  ok: false;
  code: 'INCOMPLETE_PACKET';
  runStatus: 'needs_input';
  gaps: string[];
  issues: string[];
};
export type SourcePacketValidationResult = SourcePacketValidationOk | SourcePacketValidationFail;

/** Minimal request shape accepted by the FoundryRequest adapter (avoids circular imports). */
export interface FoundryRequestLike {
  name: string;
  objective: string;
  desiredCapabilities: string[];
  tools?: string[];
  memory?: string[];
  constraints?: string[];
  examples?: BehaviorExample[];
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^\s*\.\.\.\s*$/,
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bplaceholder\b/i,
  /\blorem\s+ipsum\b/i,
  /<fill\b[^>]*>/i,
  /\bYOUR_[A-Z0-9_]+\b/,
];

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function fail(gaps: string[], issues: string[]): SourcePacketValidationFail {
  return {
    ok: false,
    code: 'INCOMPLETE_PACKET',
    runStatus: 'needs_input',
    gaps,
    issues,
  };
}

function asStringArray(value: unknown, field: string, gaps: string[], issues: string[]): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    gaps.push(field);
    issues.push(`${field} must be an array of strings`);
    return null;
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (typeof entry !== 'string') {
      gaps.push(field);
      issues.push(`${field}[${i}] must be a string`);
      return null;
    }
    if (isPlaceholder(entry)) {
      gaps.push(field);
      issues.push(`${field}[${i}] contains a placeholder or empty value`);
      return null;
    }
    out.push(entry);
  }
  return out;
}

function parseExamples(
  value: unknown,
  gaps: string[],
  issues: string[],
): BehaviorExample[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    gaps.push('examples');
    issues.push('examples must be an array of { input, desiredBehavior } objects');
    return null;
  }
  const out: BehaviorExample[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      gaps.push('examples');
      issues.push(`examples[${i}] must be an object with input and desiredBehavior strings`);
      return null;
    }
    const rec = entry as Record<string, unknown>;
    if (typeof rec['input'] !== 'string' || typeof rec['desiredBehavior'] !== 'string') {
      gaps.push('examples');
      issues.push(`examples[${i}] must have string input and desiredBehavior`);
      return null;
    }
    if (isPlaceholder(rec['input']) || isPlaceholder(rec['desiredBehavior'])) {
      gaps.push('examples');
      issues.push(`examples[${i}] contains a placeholder or empty value`);
      return null;
    }
    out.push({ input: rec['input'], desiredBehavior: rec['desiredBehavior'] });
  }
  return out;
}

/**
 * Validates an unknown input into a SourcePacket.
 * Incomplete / placeholder / malformed packets return needs_input + INCOMPLETE_PACKET.
 */
export function validateSourcePacket(input: unknown): SourcePacketValidationResult {
  const gaps: string[] = [];
  const issues: string[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return fail(['packet'], ['expected a Source Packet object']);
  }

  const src = input as Record<string, unknown>;

  // Soft structural pass via generic validate (keeps validate.ts Foundry-free).
  const structural = validate(src, {
    name: { type: 'string', required: false },
    mission: { type: 'string', required: false },
    objective: { type: 'string', required: false },
    capabilities: { type: 'array', required: false },
    desiredCapabilities: { type: 'array', required: false },
    tools: { type: 'array', required: false },
    memory: { type: 'array', required: false },
    constraints: { type: 'array', required: false },
    examples: { type: 'array', required: false },
    badBehaviors: { type: 'array', required: false },
    goodExamples: { type: 'array', required: false },
    deploymentTarget: { type: 'string', required: false },
  });
  if (!structural.ok) {
    return fail(['packet'], structural.issues);
  }

  const nameRaw = src['name'];
  if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
    gaps.push('name');
    issues.push('name is required');
  } else if (isPlaceholder(nameRaw)) {
    gaps.push('name');
    issues.push('name must not be a placeholder');
  }

  const missionRaw =
    typeof src['mission'] === 'string' && src['mission'].trim()
      ? src['mission']
      : typeof src['objective'] === 'string'
        ? src['objective']
        : undefined;
  if (typeof missionRaw !== 'string' || !missionRaw.trim()) {
    gaps.push('mission');
    issues.push('mission (or objective alias) is required');
  } else if (isPlaceholder(missionRaw)) {
    gaps.push('mission');
    issues.push('mission must not be a placeholder');
  }

  const capsRaw = src['capabilities'] ?? src['desiredCapabilities'];
  let capabilities: string[] = [];
  if (capsRaw === undefined || capsRaw === null) {
    gaps.push('capabilities');
    issues.push('capabilities is required');
  } else if (!Array.isArray(capsRaw) || capsRaw.length === 0) {
    gaps.push('capabilities');
    issues.push('capabilities must be a non-empty array of strings');
  } else {
    const parsed = asStringArray(capsRaw, 'capabilities', gaps, issues);
    if (parsed === null) {
      // issues already recorded
    } else if (parsed.length === 0) {
      gaps.push('capabilities');
      issues.push('capabilities must be a non-empty array of strings');
    } else {
      capabilities = parsed;
    }
  }

  const tools = asStringArray(src['tools'], 'tools', gaps, issues);
  const memory = asStringArray(src['memory'], 'memory', gaps, issues);
  const constraints = asStringArray(src['constraints'], 'constraints', gaps, issues);
  const badBehaviors = asStringArray(src['badBehaviors'], 'badBehaviors', gaps, issues);
  const goodExamples = asStringArray(src['goodExamples'], 'goodExamples', gaps, issues);
  const examples = parseExamples(src['examples'], gaps, issues);

  let deploymentTarget: string | undefined;
  if (src['deploymentTarget'] !== undefined && src['deploymentTarget'] !== null) {
    if (typeof src['deploymentTarget'] !== 'string') {
      gaps.push('deploymentTarget');
      issues.push('deploymentTarget must be a string');
    } else if (isPlaceholder(src['deploymentTarget'])) {
      gaps.push('deploymentTarget');
      issues.push('deploymentTarget must not be a placeholder');
    } else {
      deploymentTarget = src['deploymentTarget'];
    }
  }

  if (gaps.length || issues.length) {
    const seen = new Set<string>();
    const uniqueGaps = gaps.filter((g) => (seen.has(g) ? false : (seen.add(g), true)));
    return fail(uniqueGaps, issues);
  }

  const packet: SourcePacket = {
    name: (nameRaw as string).trim(),
    mission: (missionRaw as string).trim(),
    capabilities,
  };
  if (tools && tools.length) packet.tools = tools;
  if (memory && memory.length) packet.memory = memory;
  if (constraints && constraints.length) packet.constraints = constraints;
  if (examples && examples.length) packet.examples = examples;
  if (badBehaviors && badBehaviors.length) packet.badBehaviors = badBehaviors;
  if (goodExamples && goodExamples.length) packet.goodExamples = goodExamples;
  if (deploymentTarget) packet.deploymentTarget = deploymentTarget;

  return { ok: true, packet };
}

/** Adapter from the existing AgentFoundryRequest shape into SourcePacket validation. */
export function sourcePacketFromFoundryRequest(
  request: FoundryRequestLike,
): SourcePacketValidationResult {
  return validateSourcePacket({
    name: request.name,
    mission: request.objective,
    objective: request.objective,
    capabilities: request.desiredCapabilities,
    tools: request.tools,
    memory: request.memory,
    constraints: request.constraints,
    examples: request.examples,
  });
}
