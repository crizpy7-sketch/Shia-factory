/**
 * Minimal TypeSafe / Jev System One client.
 *
 * Native fetch only — no @typesafe-ai/sdk dependency. Judgment-only: asks typed
 * questions about state and returns probabilities / structured answers, never
 * free-form agent text. The API key is never logged.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Text, structured JSON, or null — matches TypeSafe EntryType. */
export type EntryType = string | { [key: string]: JsonValue } | JsonValue[] | null;

export interface NoulQuestion {
  type: 'noul';
  instructions?: EntryType;
  criteria?: { true?: EntryType; false?: EntryType } | null;
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions?: EntryType;
  criteria: Record<string, EntryType>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions?: EntryType;
  /** Ordered rubric; at least two entries. */
  criteria: EntryType[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type Questions = Record<string, Question>;

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  confidence: number;
  legend?: Record<string, EntryType>;
  probabilities: Record<string, number>;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface TypesafeUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface SystemOneResult {
  model: string;
  answers: Record<string, Answer>;
  usage: TypesafeUsage;
}

export interface SystemOneArgs {
  state: EntryType;
  questions: Questions;
  model?: string;
  signal?: AbortSignal;
}

export interface TypesafeClientOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-attempt timeout in ms. Default 30000. */
  timeoutMs?: number;
}

export class TypesafeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'TypesafeError';
  }
}

const DEFAULT_BASE_URL = 'https://api.typesafe.ai';
const DEFAULT_MODEL = 'jev-latest';

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Validates the questions map before any network call. Throws TypesafeError on
 * empty sets, unknown types, or malformed score criteria.
 */
export function validateQuestions(questions: unknown): Questions {
  if (questions === null || typeof questions !== 'object' || Array.isArray(questions)) {
    throw new TypesafeError('questions must be an object map of id → question');
  }
  const entries = Object.entries(questions as Record<string, unknown>);
  if (entries.length === 0) {
    throw new TypesafeError('At least one question is required');
  }
  const out: Questions = {};
  for (const [id, raw] of entries) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TypesafeError(`question "${id}" must be an object`);
    }
    const q = raw as Record<string, unknown>;
    const type = q['type'];
    if (type !== 'noul' && type !== 'choice' && type !== 'score') {
      throw new TypesafeError(
        `question "${id}" has invalid type ${JSON.stringify(type)}; expected noul, choice, or score`,
      );
    }
    if (type === 'choice') {
      const criteria = q['criteria'];
      if (criteria === null || typeof criteria !== 'object' || Array.isArray(criteria)) {
        throw new TypesafeError(`choice question "${id}" requires a criteria object`);
      }
      if (Object.keys(criteria as object).length === 0) {
        throw new TypesafeError(`choice question "${id}" requires at least one criteria label`);
      }
    }
    if (type === 'score') {
      const criteria = q['criteria'];
      if (!Array.isArray(criteria)) {
        throw new TypesafeError(`Score question "${id}" has criteria that are not a list`);
      }
      if (criteria.length < 2) {
        throw new TypesafeError(
          `Score question "${id}" has ${criteria.length} criteria; at least two scores are required.`,
        );
      }
    }
    out[id] = raw as Question;
  }
  return out;
}

export class TypesafeClient {
  /** Kept private so logging the client cannot leak credentials. */
  readonly #apiKey: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: TypesafeClientOptions) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new TypesafeError('TypeSafe API key is required');
    }
    this.#apiKey = options.apiKey;
    this.baseUrl = stripTrailingSlashes(options.baseUrl ?? DEFAULT_BASE_URL);
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /**
   * POST /v1/systemone — typed judgments over state.
   * Never logs the API key.
   */
  async systemOne(args: SystemOneArgs): Promise<SystemOneResult> {
    const questions = validateQuestions(args.questions);
    const model = args.model?.trim() || this.defaultModel;
    const url = `${this.baseUrl}/v1/systemone`;
    const body = JSON.stringify({
      state: args.state,
      questions,
      model,
    });

    const controller = new AbortController();
    const onAbort = (): void => controller.abort(args.signal?.reason);
    if (args.signal?.aborted) onAbort();
    args.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'boris-runtime/jev-system-one',
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (args.signal?.aborted) {
        throw new TypesafeError('TypeSafe request aborted by caller');
      }
      if ((error as Error).name === 'AbortError') {
        throw new TypesafeError(`TypeSafe request timed out after ${this.timeoutMs}ms`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new TypesafeError(`TypeSafe connection error: ${message}`);
    } finally {
      clearTimeout(timer);
      args.signal?.removeEventListener('abort', onAbort);
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text.length === 0 ? undefined : JSON.parse(text);
    } catch {
      throw new TypesafeError(
        `TypeSafe returned non-JSON body (HTTP ${response.status})`,
        response.status,
      );
    }

    if (!response.ok) {
      const detail = summariseErrorBody(parsed);
      throw new TypesafeError(
        `TypeSafe System One failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        response.status,
      );
    }

    return normaliseResult(parsed);
  }
}

function summariseErrorBody(body: unknown): string {
  if (body === null || body === undefined) return '';
  if (typeof body === 'string') return body.slice(0, 200);
  if (typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const err = record['error'] ?? record['message'] ?? record['detail'];
    if (typeof err === 'string') return err.slice(0, 200);
    if (err && typeof err === 'object' && typeof (err as Record<string, unknown>)['message'] === 'string') {
      return String((err as Record<string, unknown>)['message']).slice(0, 200);
    }
  }
  return '';
}

function normaliseResult(parsed: unknown): SystemOneResult {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypesafeError('TypeSafe response is not an object');
  }
  const record = parsed as Record<string, unknown>;
  const model = record['model'];
  const answers = record['answers'];
  const usage = record['usage'];
  if (typeof model !== 'string' || !model) {
    throw new TypesafeError('TypeSafe response missing model');
  }
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new TypesafeError('TypeSafe response missing answers object');
  }
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) {
    throw new TypesafeError('TypeSafe response missing usage object');
  }
  const usageRecord = usage as Record<string, unknown>;
  const inputTokens = usageRecord['input_tokens'];
  const outputTokens = usageRecord['output_tokens'];
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    throw new TypesafeError('TypeSafe usage must include input_tokens and output_tokens');
  }
  return {
    model,
    answers: answers as Record<string, Answer>,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}
