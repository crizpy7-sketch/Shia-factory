/**
 * OpenAI Chat Completions adapter.
 *
 * Real HTTP against /v1/chat/completions with function calling, normalised into the same shapes
 * every other adapter produces. Requires OPENAI_API_KEY.
 *
 * Status: implemented, and **not yet exercised against the live API from this repository**. The
 * request/response mapping is covered by unit tests with a stubbed fetch. Cost is reported as
 * null rather than estimated, because this adapter ships without a pricing table it can stand
 * behind.
 */
import {
  Availability, CompletionRequest, CompletionResult, ContentBlock, ModelProvider,
  ProviderCapabilities, ProviderError, StopReason, withRetry,
} from './types.js';

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

interface OpenAIOptions {
  apiKey: string | null;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export class OpenAIProvider implements ModelProvider {
  readonly name = 'openai';
  readonly model: string;
  readonly isTestDouble = false;
  readonly capabilities: ProviderCapabilities = {
    toolCalls: true,
    structuredOutput: true,
    reasoning: false,
    contextWindow: 128000,
    maxOutputTokens: 16384,
    streaming: true,
  };

  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly attempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: ((ms: number) => Promise<void>) | undefined;

  constructor(options: OpenAIOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.attempts = options.attempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.sleep = options.sleep;
  }

  available(): Availability {
    if (!this.apiKey) {
      return { ok: false, reason: 'OPENAI_API_KEY is not set — the OpenAI adapter is configured but has no credentials.' };
    }
    return { ok: true, reason: 'api key present (adapter not yet verified against the live API)' };
  }

  /** Our block model is Anthropic-shaped; OpenAI needs assistant tool_calls plus role:"tool" replies. */
  private toWireMessages(request: CompletionRequest): WireMessage[] {
    const messages: WireMessage[] = [{ role: 'system', content: request.system }];
    for (const message of request.messages) {
      const text = message.content.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text).join('\n');
      const toolUses = message.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      const toolResults = message.content.filter((b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result');

      if (message.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: text || null,
          ...(toolUses.length ? {
            tool_calls: toolUses.map((use) => ({
              id: use.id, type: 'function' as const,
              function: { name: use.name, arguments: JSON.stringify(use.input) },
            })),
          } : {}),
        });
        continue;
      }
      // Tool results must each become their own message, keyed to the call they answer.
      for (const result of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: result.toolUseId,
          content: result.isError ? `ERROR: ${result.content}` : result.content,
        });
      }
      if (text) messages.push({ role: 'user', content: text });
    }
    return messages;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const availability = this.available();
    if (!availability.ok) throw new ProviderError(availability.reason, false);

    const body = {
      model: this.model,
      max_completion_tokens: Math.min(request.maxOutputTokens, this.capabilities.maxOutputTokens),
      temperature: request.temperature ?? 0,
      messages: this.toWireMessages(request),
      ...(request.tools.length ? {
        tools: request.tools.map((tool) => ({
          type: 'function',
          function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
        })),
        tool_choice: 'auto',
      } : {}),
    };

    const started = Date.now();
    const { value, attempts } = await withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey as string}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await response.text();
        if (!response.ok) {
          throw new ProviderError(
            `OpenAI API ${response.status}: ${text.slice(0, 400)}`,
            RETRYABLE_STATUS.has(response.status),
            response.status,
          );
        }
        try {
          return JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new ProviderError('OpenAI API returned a non-JSON body', true, response.status);
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if ((error as Error).name === 'AbortError') {
          throw new ProviderError(`OpenAI request timed out after ${request.timeoutMs}ms`, true);
        }
        throw new ProviderError(`OpenAI request failed: ${(error as Error).message}`, true);
      } finally {
        clearTimeout(timer);
      }
    }, {
      attempts: this.attempts,
      baseDelayMs: this.baseDelayMs,
      maxDelayMs: 8000,
      ...(this.sleep ? { sleep: this.sleep } : {}),
    });

    const choices = Array.isArray(value['choices']) ? (value['choices'] as Record<string, unknown>[]) : [];
    const first = (choices[0] ?? {}) as Record<string, unknown>;
    const message = (first['message'] ?? {}) as Record<string, unknown>;
    const rawCalls = Array.isArray(message['tool_calls']) ? (message['tool_calls'] as Record<string, unknown>[]) : [];

    const toolUses: CompletionResult['toolUses'] = [];
    for (const call of rawCalls) {
      const fn = (call['function'] ?? {}) as Record<string, unknown>;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(String(fn['arguments'] ?? '{}')) as Record<string, unknown>;
      } catch {
        // Malformed arguments are surfaced as an empty input; the registry's validation rejects it
        // with a message the model can act on, rather than the runtime guessing what was meant.
        parsed = {};
      }
      toolUses.push({ id: String(call['id'] ?? ''), name: String(fn['name'] ?? ''), input: parsed });
    }

    const finish = String(first['finish_reason'] ?? 'unknown');
    const stopReason: StopReason = finish === 'tool_calls' ? 'tool_use'
      : finish === 'stop' ? 'end_turn'
      : finish === 'length' ? 'max_tokens'
      : 'unknown';

    const usage = (value['usage'] ?? {}) as Record<string, unknown>;
    return {
      text: typeof message['content'] === 'string' ? message['content'] : '',
      toolUses,
      stopReason,
      usage: {
        inputTokens: Number(usage['prompt_tokens'] ?? 0),
        outputTokens: Number(usage['completion_tokens'] ?? 0),
      },
      costUsd: null,
      model: String(value['model'] ?? this.model),
      provider: this.name,
      latencyMs: Date.now() - started,
      attempts,
    };
  }
}
