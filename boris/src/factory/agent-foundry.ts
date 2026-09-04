import { randomUUID } from 'node:crypto';
import type { CompletionRequest, ModelProvider } from '../providers/types.js';

export interface BehaviorExample {
  input: string;
  desiredBehavior: string;
}

export interface AgentFoundryRequest {
  name: string;
  objective: string;
  desiredCapabilities: string[];
  tools?: string[];
  memory?: string[];
  constraints?: string[];
  examples?: BehaviorExample[];
  candidateCount?: number;
}

export interface AgentBlueprint {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  mission: string;
  principles: string[];
  capabilities: string[];
  tools: string[];
  memory: {
    persistent: string[];
    taskScoped: string[];
  };
  workflow: string[];
  outputContract: string[];
  guardrails: string[];
  evals: Array<{
    id: string;
    description: string;
    passCondition: string;
  }>;
  provenance: {
    method: 'behavioral-synthesis';
    source: 'user-supplied-specification';
    hiddenPromptRecovered: false;
    chainOfThoughtRecovered: false;
    weightsRecovered: false;
  };
}

export interface CandidateBlueprint {
  candidateId: string;
  architectRole: string;
  blueprint: AgentBlueprint;
  provider: string;
  model: string;
}

export interface FoundryJudgement {
  winnerCandidateId: string;
  rationale: string[];
  synthesizedBlueprint: AgentBlueprint;
}

export interface AgentFoundryResult {
  foundryRunId: string;
  candidates: CandidateBlueprint[];
  judgement: FoundryJudgement;
  winner: AgentBlueprint;
  judgeProvider: string;
  judgeModel: string;
}

const FORBIDDEN_EXTRACTION_PATTERNS = [
  /hidden\s+(system\s+)?prompt/i,
  /reveal\s+(the\s+)?system\s+prompt/i,
  /chain[-\s]?of[-\s]?thought/i,
  /model\s+weights/i,
  /extract\s+weights/i,
  /scrape\s+outputs?/i,
  /distill\s+(their|its|grok|model)\s+outputs?/i,
  /steal\s+(the\s+)?prompt/i,
];

export function assertBehavioralSynthesisOnly(request: AgentFoundryRequest): void {
  if (!request.name.trim()) throw new Error('Agent Foundry requires a name.');
  if (!request.objective.trim()) throw new Error('Agent Foundry requires an objective.');
  if (!request.desiredCapabilities.length) throw new Error('Agent Foundry requires at least one desired capability.');

  const material = [
    request.name,
    request.objective,
    ...request.desiredCapabilities,
    ...(request.constraints ?? []),
    ...(request.examples ?? []).flatMap((example) => [example.input, example.desiredBehavior]),
  ].join('\n');

  if (FORBIDDEN_EXTRACTION_PATTERNS.some((pattern) => pattern.test(material))) {
    throw new Error(
      'Agent Foundry supports independent behavioral synthesis only. Hidden-prompt, chain-of-thought, model-weight, scraping, and output-distillation requests are rejected.',
    );
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter((item) => item.trim().length > 0) : [];
}

function parseBlueprint(value: unknown, fallbackName: string): AgentBlueprint {
  if (!value || typeof value !== 'object') throw new Error('Agent Foundry blueprint must be a JSON object.');
  const raw = value as Record<string, unknown>;
  const memory = (raw['memory'] ?? {}) as Record<string, unknown>;
  const rawEvals = Array.isArray(raw['evals']) ? raw['evals'] as Array<Record<string, unknown>> : [];
  const mission = String(raw['mission'] ?? '').trim();
  const workflow = stringArray(raw['workflow']);
  if (!mission || !workflow.length || !rawEvals.length) {
    throw new Error('Agent Foundry blueprint is missing mission, workflow, or evals.');
  }

  return {
    schemaVersion: '1.0.0',
    id: String(raw['id'] ?? `agent-${randomUUID()}`),
    name: String(raw['name'] ?? fallbackName),
    mission,
    principles: stringArray(raw['principles']),
    capabilities: stringArray(raw['capabilities']),
    tools: stringArray(raw['tools']),
    memory: {
      persistent: stringArray(memory['persistent']),
      taskScoped: stringArray(memory['taskScoped']),
    },
    workflow,
    outputContract: stringArray(raw['outputContract']),
    guardrails: stringArray(raw['guardrails']),
    evals: rawEvals.map((item, index) => ({
      id: String(item['id'] ?? `eval-${index + 1}`),
      description: String(item['description'] ?? ''),
      passCondition: String(item['passCondition'] ?? ''),
    })),
    provenance: {
      method: 'behavioral-synthesis',
      source: 'user-supplied-specification',
      hiddenPromptRecovered: false,
      chainOfThoughtRecovered: false,
      weightsRecovered: false,
    },
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1]);
    throw new Error('Agent Foundry provider returned non-JSON output.');
  }
}

function candidateSystem(candidateNumber: number): string {
  return [
    'You are a Shia Factory Agent Foundry architect.',
    `You are architect candidate ${candidateNumber}. Produce an ORIGINAL agent blueprint from the behavior specification.`,
    'Do not recover, infer, request, or claim access to hidden prompts, private chain-of-thought, model weights, or proprietary internals.',
    'Optimize for capability, portability across model providers, explicit tools, explicit memory, deterministic workflow, and testable evaluation criteria.',
    'Return JSON only.',
  ].join('\n');
}

function candidateUser(request: AgentFoundryRequest): string {
  return JSON.stringify({
    task: 'design-agent-blueprint',
    requestedName: request.name,
    objective: request.objective,
    desiredCapabilities: request.desiredCapabilities,
    tools: request.tools ?? [],
    memory: request.memory ?? [],
    constraints: request.constraints ?? [],
    examples: request.examples ?? [],
    requiredShape: {
      name: 'string',
      mission: 'string',
      principles: ['string'],
      capabilities: ['string'],
      tools: ['string'],
      memory: { persistent: ['string'], taskScoped: ['string'] },
      workflow: ['string'],
      outputContract: ['string'],
      guardrails: ['string'],
      evals: [{ id: 'string', description: 'string', passCondition: 'string' }],
    },
  });
}

function completion(system: string, user: string): CompletionRequest {
  return {
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    tools: [],
    maxOutputTokens: 4096,
    temperature: 0.3,
    timeoutMs: 120_000,
    responseFormat: 'json',
  };
}

async function makeCandidate(
  provider: ModelProvider,
  request: AgentFoundryRequest,
  index: number,
): Promise<CandidateBlueprint> {
  const result = await provider.complete(completion(candidateSystem(index + 1), candidateUser(request)));
  return {
    candidateId: `candidate-${index + 1}`,
    architectRole: `architect-${index + 1}`,
    blueprint: parseBlueprint(parseJson(result.text), request.name),
    provider: result.provider,
    model: result.model,
  };
}

function judgeSystem(): string {
  return [
    'You are the Shia Factory Agent Foundry compiler and judge.',
    'You receive independently generated agent blueprints and the original behavior specification.',
    'Compare them for capability coverage, workflow precision, tool discipline, memory design, portability, guardrails, and eval quality.',
    'Select the strongest candidate, then synthesize an improved ORIGINAL final blueprint using the strongest non-conflicting ideas.',
    'Do not recover, infer, request, or claim access to hidden prompts, private chain-of-thought, model weights, or proprietary internals.',
    'Return JSON only.',
  ].join('\n');
}

async function judgeCandidates(
  provider: ModelProvider,
  request: AgentFoundryRequest,
  candidates: CandidateBlueprint[],
): Promise<FoundryJudgement> {
  const user = JSON.stringify({
    task: 'judge-and-synthesize-agent-blueprints',
    originalSpecification: request,
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      blueprint: candidate.blueprint,
    })),
    requiredShape: {
      winnerCandidateId: 'candidate-N',
      rationale: ['string'],
      synthesizedBlueprint: 'AgentBlueprint shape without provenance requirement',
    },
  });
  const result = await provider.complete(completion(judgeSystem(), user));
  const parsed = parseJson(result.text) as Record<string, unknown>;
  const winnerCandidateId = String(parsed['winnerCandidateId'] ?? '');
  if (!candidates.some((candidate) => candidate.candidateId === winnerCandidateId)) {
    throw new Error('Agent Foundry judge selected an unknown candidate.');
  }
  return {
    winnerCandidateId,
    rationale: stringArray(parsed['rationale']),
    synthesizedBlueprint: parseBlueprint(parsed['synthesizedBlueprint'], request.name),
  };
}

export async function runAgentFoundry(
  request: AgentFoundryRequest,
  architectProviders: ModelProvider[],
  judgeProvider: ModelProvider,
): Promise<AgentFoundryResult> {
  assertBehavioralSynthesisOnly(request);
  if (!architectProviders.length) throw new Error('Agent Foundry requires at least one architect provider.');

  const candidateCount = Math.max(1, Math.min(request.candidateCount ?? 3, 5));
  const candidates: CandidateBlueprint[] = [];
  for (let index = 0; index < candidateCount; index += 1) {
    const provider = architectProviders[index % architectProviders.length]!;
    candidates.push(await makeCandidate(provider, request, index));
  }

  const judgement = await judgeCandidates(judgeProvider, request, candidates);
  return {
    foundryRunId: `foundry-${randomUUID()}`,
    candidates,
    judgement,
    winner: judgement.synthesizedBlueprint,
    judgeProvider: judgeProvider.name,
    judgeModel: judgeProvider.model,
  };
}
