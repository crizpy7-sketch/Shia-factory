/**
 * Deterministic scripted provider — a TEST DOUBLE, never a production model.
 *
 * It answers from a policy function given the real conversation so far, which lets the full agent
 * loop (tools, permissions, verification, persistence, recovery) be exercised deterministically
 * without a model vendor. `isTestDouble` is true and the API reports it as such, so a scripted run
 * can never be mistaken for a live model run.
 */
import {
  Availability, CompletionRequest, CompletionResult, ModelProvider, ProviderCapabilities,
} from './types.js';

export interface ScriptedTurn {
  text?: string;
  toolUses?: Array<{ name: string; input: Record<string, unknown> }>;
  stopReason?: CompletionResult['stopReason'];
  /** Simulated failures, so retry and invalid-output handling can be tested for real. */
  throws?: Error;
  delayMs?: number;
}

export type ScriptPolicy = (request: CompletionRequest, turnIndex: number) => ScriptedTurn;

export class ScriptedProvider implements ModelProvider {
  readonly name = 'scripted';
  readonly isTestDouble = true;
  readonly capabilities: ProviderCapabilities = {
    toolCalls: true,
    structuredOutput: true,
    reasoning: false,
    contextWindow: 200000,
    maxOutputTokens: 8192,
    streaming: false,
  };

  private turnIndex = 0;
  readonly seen: CompletionRequest[] = [];

  constructor(
    private readonly policy: ScriptPolicy,
    readonly model = 'scripted-deterministic',
  ) {}

  available(): Availability {
    return { ok: true, reason: 'deterministic test double' };
  }

  get calls(): number {
    return this.turnIndex;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();
    this.seen.push(request);
    const turn = this.policy(request, this.turnIndex);
    this.turnIndex += 1;
    if (turn.delayMs) await new Promise<void>((r) => setTimeout(r, turn.delayMs));
    if (turn.throws) throw turn.throws;

    const toolUses = (turn.toolUses ?? []).map((t, i) => ({
      id: `toolu_scripted_${this.turnIndex}_${i}`,
      name: t.name,
      input: t.input,
    }));
    return {
      text: turn.text ?? '',
      toolUses,
      stopReason: turn.stopReason ?? (toolUses.length ? 'tool_use' : 'end_turn'),
      usage: {
        inputTokens: JSON.stringify(request.messages).length / 4 | 0,
        outputTokens: ((turn.text ?? '').length + JSON.stringify(toolUses).length) / 4 | 0,
      },
      costUsd: null,
      model: this.model,
      provider: this.name,
      latencyMs: Date.now() - started,
      attempts: 1,
    };
  }
}

/** Builds a script from a fixed list of turns; extra turns end the conversation. */
export function scriptedSequence(turns: ScriptedTurn[], model?: string): ScriptedProvider {
  return new ScriptedProvider(
    (_request, index) => turns[index] ?? { text: 'No further action.', stopReason: 'end_turn' },
    model,
  );
}
