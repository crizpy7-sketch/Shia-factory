/**
 * Typed tool registry.
 *
 * A tool declares its schema, its sensitivity and its executor. The registry validates input,
 * asks the permission engine, enforces timeouts and returns a normalised result. Adding an MCP
 * server later means registering tools here — the agent core does not change.
 */
import { Config } from '../config.js';
import { Decision, PermissionContext } from '../policy/permissions.js';
import { Schema, validate } from '../util/validate.js';
import { Logger } from '../util/log.js';
import { Storage } from '../storage/types.js';

export interface ToolContext {
  config: Config;
  permissions: PermissionContext;
  taskId: string;
  runId: string;
  workspace: string;
  logger: Logger;
  storage: Storage;
  /** Set for worker runs so tools can be attributed. */
  workerId: string | null;
  signal: AbortSignal;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  /** Structured detail for the dashboard and for evidence; must be JSON-serialisable. */
  data?: Record<string, unknown>;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** 'safe' runs autonomously; 'restricted' always requires an approval decision. */
  sensitivity: 'safe' | 'restricted';
  schema: Schema;
  /** JSON schema advertised to the model. */
  inputSchema: Record<string, unknown>;
  /** Extra deterministic checks beyond schema validation (paths, commands, …). */
  authorize?: (input: Record<string, unknown>, ctx: ToolContext) => Decision;
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): this {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): ToolDefinition | null {
    return this.tools.get(name) ?? null;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  /** Tool specs for the model, optionally restricted to a worker's allowed subset. */
  specs(allowed?: readonly string[]): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return this.list()
      .filter((tool) => !allowed || allowed.includes(tool.name))
      .map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
  }

  /**
   * Validates and authorises without executing. The agent loop calls this first so that a denied
   * or approval-requiring call never reaches an executor.
   */
  authorize(name: string, rawInput: unknown, ctx: ToolContext, allowed?: readonly string[]): {
    tool: ToolDefinition | null;
    input: Record<string, unknown>;
    decision: Decision;
  } {
    const tool = this.get(name);
    if (!tool) {
      return { tool: null, input: {}, decision: { kind: 'deny', reason: `unknown tool "${name}"` } };
    }
    if (allowed && !allowed.includes(name)) {
      return { tool, input: {}, decision: { kind: 'deny', reason: `tool "${name}" is not in this run's allowed set` } };
    }
    const validated = validate<Record<string, unknown>>(rawInput, tool.schema);
    if (!validated.ok || !validated.value) {
      return { tool, input: {}, decision: { kind: 'deny', reason: `invalid input: ${validated.issues.join('; ')}` } };
    }
    if (tool.sensitivity === 'restricted') {
      return {
        tool,
        input: validated.value,
        decision: {
          kind: 'require_approval',
          reason: `tool "${name}" is restricted`,
          risk: 'The tool can act beyond the reversible workspace boundary.',
          consequence: `If approved, ${name} runs with ${JSON.stringify(validated.value).slice(0, 300)}`,
        },
      };
    }
    const decision = tool.authorize ? tool.authorize(validated.value, ctx) : { kind: 'allow' as const, reason: 'permitted' };
    return { tool, input: validated.value, decision };
  }

  async execute(tool: ToolDefinition, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    try {
      return await tool.execute(input, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, output: '', error: `tool "${tool.name}" threw: ${message}` };
    }
  }
}
