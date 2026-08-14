/**
 * Agent-control tools: memory, skills, approval requests, delegation and the final report.
 *
 * The three control tools (report_result, request_approval, delegate) are intercepted by the agent
 * loop, which owns task state. They are registered here so the model sees a single coherent tool
 * surface and so their input is schema-validated by the same registry as everything else.
 */
import { MemoryStore } from '../memory/store.js';
import { SkillRegistry } from '../skills/registry.js';
import { ToolDefinition } from './registry.js';
import { MemoryCategory } from '../domain/types.js';

export const CONTROL_TOOLS = ['report_result', 'request_approval', 'delegate'] as const;
export type ControlTool = (typeof CONTROL_TOOLS)[number];

export function isControlTool(name: string): name is ControlTool {
  return (CONTROL_TOOLS as readonly string[]).includes(name);
}

const handledByLoop = async (): Promise<never> => {
  throw new Error('control tool reached the executor; the agent loop should have intercepted it');
};

export function createAgentTools(deps: { memory: MemoryStore; skills: SkillRegistry }): ToolDefinition[] {
  const reportResult: ToolDefinition = {
    name: 'report_result',
    description:
      'Finish the task. Provide a concise engineering report and the evidence behind it. ' +
      'If you claim success and give a verificationCommand, the runtime re-runs that command itself — ' +
      'an unverified success claim will be rejected and sent back to you for repair.',
    sensitivity: 'safe',
    schema: {
      success: { type: 'boolean', required: true },
      summary: { type: 'string', required: true, min: 10, max: 8000 },
      evidence: { type: 'array', of: 'string', max: 40 },
      verificationCommand: { type: 'string', max: 400 },
      filesChanged: { type: 'array', of: 'string', max: 100 },
    },
    inputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'True only if the objective is met and verified.' },
        summary: { type: 'string', description: 'Engineering report: what changed, what was verified, what remains.' },
        evidence: { type: 'array', items: { type: 'string' }, description: 'Commands run, exit codes, file changes.' },
        verificationCommand: { type: 'string', description: 'A command the runtime can re-run to independently confirm success, e.g. "npm test".' },
        filesChanged: { type: 'array', items: { type: 'string' }, description: 'Paths you modified.' },
      },
      required: ['success', 'summary'],
    },
    execute: handledByLoop,
  };

  const requestApproval: ToolDefinition = {
    name: 'request_approval',
    description:
      'Pause and ask a human to authorise an action outside your authority (deploys, publishing, ' +
      'spending, credential or production changes). State the action, why you want it, the risk, and ' +
      'what happens if approved.',
    sensitivity: 'safe',
    schema: {
      action: { type: 'string', required: true, min: 3, max: 400 },
      reason: { type: 'string', required: true, min: 3, max: 2000 },
      risk: { type: 'string', required: true, min: 3, max: 2000 },
      consequence: { type: 'string', required: true, min: 3, max: 2000 },
    },
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'The exact action you want authorised.' },
        reason: { type: 'string', description: 'Why it is necessary for the objective.' },
        risk: { type: 'string', description: 'What could go wrong, honestly stated.' },
        consequence: { type: 'string', description: 'What will happen if it is approved.' },
      },
      required: ['action', 'reason', 'risk', 'consequence'],
    },
    execute: handledByLoop,
  };

  const delegate: ToolDefinition = {
    name: 'delegate',
    description:
      'Delegate one bounded piece of work to a specialist worker. You remain accountable: the ' +
      'worker\'s output is a claim, not a fact, and you must verify it before relying on it.',
    sensitivity: 'safe',
    schema: {
      role: { type: 'string', required: true, min: 3, max: 80 },
      objective: { type: 'string', required: true, min: 10, max: 4000 },
      allowedTools: { type: 'array', of: 'string', max: 12 },
      completionCriteria: { type: 'string', required: true, min: 5, max: 2000 },
      maxTurns: { type: 'number', min: 1, max: 15 },
    },
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'e.g. "repository investigator", "testing specialist".' },
        objective: { type: 'string', description: 'A single bounded objective with enough context to act on.' },
        allowedTools: { type: 'array', items: { type: 'string' }, description: 'Tool names the worker may use. Keep it minimal.' },
        completionCriteria: { type: 'string', description: 'How the worker knows it is done.' },
        maxTurns: { type: 'number', description: 'Turn budget for the worker.' },
      },
      required: ['role', 'objective', 'completionCriteria'],
    },
    execute: handledByLoop,
  };

  const memoryWrite: ToolDefinition = {
    name: 'memory_write',
    description:
      'Store a durable lesson: a reusable procedure, a verified research finding, or a failure and its ' +
      'root cause. Do not store routine logs — memory is for what will matter next time.',
    sensitivity: 'safe',
    schema: {
      category: { type: 'string', required: true, enum: ['procedural', 'episodic', 'failure', 'research', 'task'] },
      title: { type: 'string', required: true, min: 5, max: 300 },
      content: { type: 'string', required: true, min: 10, max: 8000 },
      tags: { type: 'array', of: 'string', max: 12 },
      confidence: { type: 'number', min: 0, max: 1 },
      verified: { type: 'boolean' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['procedural', 'episodic', 'failure', 'research', 'task'] },
        title: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number', description: '0-1. Be honest; unverified findings are not 1.0.' },
        verified: { type: 'boolean', description: 'True only if you confirmed it by execution.' },
      },
      required: ['category', 'title', 'content'],
    },
    execute: async (input, ctx) => {
      const record = deps.memory.remember({
        category: input['category'] as MemoryCategory,
        title: String(input['title']),
        content: String(input['content']),
        tags: (input['tags'] as string[]) ?? [],
        source: `task:${ctx.taskId}`,
        provenance: `written by ${ctx.config.agentId} during run ${ctx.runId}`,
        confidence: typeof input['confidence'] === 'number' ? input['confidence'] : 0.6,
        verified: input['verified'] === true,
        taskId: ctx.taskId,
        stable: false,
      });
      return { ok: true, output: `stored ${record.category} memory ${record.id}`, data: { id: record.id } };
    },
  };

  const memorySearch: ToolDefinition = {
    name: 'memory_search',
    description: 'Search your own memory for prior lessons, failures and research before solving something from scratch.',
    sensitivity: 'safe',
    schema: {
      query: { type: 'string', required: true, min: 2, max: 400 },
      category: { type: 'string', enum: ['identity', 'procedural', 'episodic', 'failure', 'research', 'task'] },
      limit: { type: 'number', min: 1, max: 20 },
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        category: { type: 'string', enum: ['identity', 'procedural', 'episodic', 'failure', 'research', 'task'] },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
    execute: async (input) => {
      const results = deps.memory.retrieve({
        objective: String(input['query']),
        limit: typeof input['limit'] === 'number' ? input['limit'] : 5,
        ...(input['category'] ? { categories: [input['category'] as MemoryCategory] } : {}),
      });
      return {
        ok: true,
        output: results.length ? deps.memory.format(results) : 'no relevant memory found',
        data: { hits: results.length },
      };
    },
  };

  const skillCreate: ToolDefinition = {
    name: 'skill_create',
    description:
      'Turn a repeated lesson into a reusable, versioned procedure. Use this when the same failure or ' +
      'the same manual sequence has now appeared more than once.',
    sensitivity: 'safe',
    schema: {
      name: { type: 'string', required: true, min: 3, max: 80, pattern: /^[a-z0-9-]+$/ },
      purpose: { type: 'string', required: true, min: 10, max: 500 },
      triggers: { type: 'array', of: 'string', max: 15 },
      requiredTools: { type: 'array', of: 'string', max: 15 },
      instructions: { type: 'string', required: true, min: 20, max: 6000 },
      verification: { type: 'string', required: true, min: 10, max: 1000 },
      version: { type: 'string', max: 20 },
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'kebab-case identifier.' },
        purpose: { type: 'string' },
        triggers: { type: 'array', items: { type: 'string' } },
        requiredTools: { type: 'array', items: { type: 'string' } },
        instructions: { type: 'string', description: 'Numbered, executable steps.' },
        verification: { type: 'string', description: 'How to know the skill worked.' },
        version: { type: 'string' },
      },
      required: ['name', 'purpose', 'instructions', 'verification'],
    },
    execute: async (input, ctx) => {
      const skill = deps.skills.create({
        name: String(input['name']),
        purpose: String(input['purpose']),
        version: String(input['version'] ?? '1.0.0'),
        triggers: (input['triggers'] as string[]) ?? [],
        requiredTools: (input['requiredTools'] as string[]) ?? [],
        instructions: String(input['instructions']),
        verification: String(input['verification']),
        source: `task:${ctx.taskId}`,
      });
      return { ok: true, output: `created skill "${skill.name}" v${skill.version}`, data: { id: skill.id } };
    },
  };

  return [reportResult, requestApproval, delegate, memoryWrite, memorySearch, skillCreate];
}
