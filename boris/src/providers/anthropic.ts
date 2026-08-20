/**
 * Anthropic Messages API adapter.
 *
 * Real HTTP. Requires ANTHROPIC_API_KEY. Without a key the adapter reports itself unavailable
 * rather than pretending to work.
 */
import {
  Availability, CompletionRequest, CompletionResult, ContentBlock, ModelProvider,
  ProviderCapabilities, ProviderError, StopReason, withRetry,
} from './types.js';

/** USD per million tokens. Absent model → cost reported as null, never guessed. */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
};

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

interface AnthropicOptions {
  apiKey: string | null;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  readonly model: string;
  readonly isTestDouble = false;
  readonly capabilities: ProviderCapabilities = {
    toolCalls: true,
    structuredOutput: true,
    reasoning: true,
    contextWindow: 200000,
    maxOutputTokens: 64000,
    streaming: true,
  };

  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly attempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: ((ms: number) => Promise<void>) | undefined;

  constructor(options: AnthropicOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.attempts = options.attempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.sleep = options.sleep;
  }

  available(): Availability {
    if (!this.apiKey) {
      return { ok: false, reason: 'ANTHROPIC_API_KEY is not set — the Anthropic adapter is configured but has no credentials.' };
    }
    if (typeof this.fetchImpl !== 'function') {
      return { ok: false, reason: 'global fetch is unavailable in this runtime.' };
    }
    return { ok: true, reason: 'api key present' };
  }

  private cost(inputTokens: number, outputTokens: number): number | null {
    const price = PRICING[this.model];
    if (!price) return null;
    return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  }

  private toWireContent(block: ContentBlock): Record<string, unknown> {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'tool_use':
        return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: block.toolUseId,
          content: block.content,
          is_error: block.isError,
        };
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const availability = this.available();
    if (!availability.ok) throw new ProviderError(availability.reason, false);

    const body = {
      model: this.model,
      max_tokens: Math.min(request.maxOutputTokens, this.capabilities.maxOutputTokens),
      system: request.system,
      temperature: request.temperature ?? 0,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content.map((c) => this.toWireContent(c)),
      })),
      ...(request.tools.length
        ? {
            tools: request.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema,
            })),
          }
        : {}),
    };

    const started = Date.now();
    const { value, attempts } = await withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey as string,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await response.text();
        if (!response.ok) {
          throw new ProviderError(
            `Anthropic API ${response.status}: ${text.slice(0, 400)}`,
            RETRYABLE_STATUS.has(response.status),
            response.status,
          );
        }
        try {
          return JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new ProviderError('Anthropic API returned a non-JSON body', true, response.status);
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if ((error as Error).name === 'AbortError') {
          throw new ProviderError(`Anthropic request timed out after ${request.timeoutMs}ms`, true);
        }
        throw new ProviderError(`Anthropic request failed: ${(error as Error).message}`, true);
      } finally {
        clearTimeout(timer);
      }
    }, {
      attempts: this.attempts,
      baseDelayMs: this.baseDelayMs,
      maxDelayMs: 8000,
      ...(this.sleep ? { sleep: this.sleep } : {}),
    });

    const content = Array.isArray(value['content']) ? (value['content'] as Record<string, unknown>[]) : [];
    const textParts: string[] = [];
    const toolUses: CompletionResult['toolUses'] = [];
    for (const block of content) {
      if (block['type'] === 'text' && typeof block['text'] === 'string') textParts.push(block['text']);
      if (block['type'] === 'tool_use') {
        toolUses.push({
          id: String(block['id'] ?? ''),
          name: String(block['name'] ?? ''),
          input: (block['input'] as Record<string, unknown>) ?? {},
        });
      }
    }
    const usage = (value['usage'] as Record<string, unknown>) ?? {};
    const inputTokens = Number(usage['input_tokens'] ?? 0);
    const outputTokens = Number(usage['output_tokens'] ?? 0);

    return {
      text: textParts.join('\n'),
      toolUses,
      stopReason: (String(value['stop_reason'] ?? 'unknown') as StopReason),
      usage: { inputTokens, outputTokens },
      costUsd: this.cost(inputTokens, outputTokens),
      model: String(value['model'] ?? this.model),
      provider: this.name,
      latencyMs: Date.now() - started,
      attempts,
    };
  }
}
