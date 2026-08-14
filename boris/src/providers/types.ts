/**
 * Model provider abstraction.
 *
 * The orchestrator depends only on these shapes. No vendor response structure escapes an adapter.
 */

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean };

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface CompletionRequest {
  system: string;
  messages: ModelMessage[];
  tools: ToolSpec[];
  maxOutputTokens: number;
  temperature?: number;
  timeoutMs: number;
  /** Ask the provider for a JSON object matching this shape, when it supports structured output. */
  responseFormat?: 'text' | 'json';
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'error' | 'unknown';

export interface CompletionResult {
  text: string;
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  stopReason: StopReason;
  usage: { inputTokens: number; outputTokens: number };
  /** null when the provider gives no pricing basis — never fabricated. */
  costUsd: number | null;
  model: string;
  provider: string;
  latencyMs: number;
  attempts: number;
}

export interface ProviderCapabilities {
  toolCalls: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  streaming: boolean;
}

export interface Availability {
  ok: boolean;
  reason: string;
}

export interface ModelProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities;
  /** True for deterministic test doubles. Never true for a vendor adapter. */
  readonly isTestDouble: boolean;
  available(): Availability;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<{ value: T; attempts: number }> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return { value: await fn(attempt), attempts: attempt };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ProviderError ? error.retryable : false;
      if (!retryable || attempt === options.attempts) break;
      const delay = Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
      await sleep(delay);
    }
  }
  throw lastError;
}
