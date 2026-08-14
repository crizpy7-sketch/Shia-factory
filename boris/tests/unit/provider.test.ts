import test from 'node:test';
import assert from 'node:assert/strict';
import { AnthropicProvider } from '../../src/providers/anthropic.js';
import { ProviderError, withRetry } from '../../src/providers/types.js';
import { ScriptedProvider, scriptedSequence } from '../../src/providers/scripted.js';
import { parseLooseJson, validate } from '../../src/util/validate.js';
import { redact } from '../../src/util/log.js';

const request = {
  system: 'you are boris',
  messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hello' }] }],
  tools: [{ name: 'fs_read', description: 'read', inputSchema: { type: 'object' } }],
  maxOutputTokens: 512,
  timeoutMs: 5000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('the anthropic adapter reports itself unavailable without a key', () => {
  const provider = new AnthropicProvider({ apiKey: null, model: 'claude-sonnet-5' });
  const availability = provider.available();
  assert.equal(availability.ok, false);
  assert.match(availability.reason, /ANTHROPIC_API_KEY/);
});

test('a vendor response is normalised into the internal shape', async () => {
  const provider = new AnthropicProvider({
    apiKey: 'test-key', model: 'claude-sonnet-5',
    fetchImpl: async () => jsonResponse({
      model: 'claude-sonnet-5',
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'looking at the file' },
        { type: 'tool_use', id: 'toolu_1', name: 'fs_read', input: { path: 'a.ts' } },
      ],
      usage: { input_tokens: 120, output_tokens: 30 },
    }),
  });
  const result = await provider.complete(request);
  assert.equal(result.text, 'looking at the file');
  assert.equal(result.toolUses.length, 1);
  assert.equal(result.toolUses[0]?.name, 'fs_read');
  assert.deepEqual(result.toolUses[0]?.input, { path: 'a.ts' });
  assert.equal(result.stopReason, 'tool_use');
  assert.equal(result.usage.inputTokens, 120);
  assert.ok(result.costUsd && result.costUsd > 0, 'known model should produce a cost estimate');
});

test('an unknown model yields a null cost rather than a fabricated one', async () => {
  const provider = new AnthropicProvider({
    apiKey: 'test-key', model: 'some-unlisted-model',
    fetchImpl: async () => jsonResponse({ content: [], usage: { input_tokens: 10, output_tokens: 10 } }),
  });
  const result = await provider.complete(request);
  assert.equal(result.costUsd, null);
});

test('retryable status codes are retried and then succeed', async () => {
  let calls = 0;
  const provider = new AnthropicProvider({
    apiKey: 'test-key', model: 'claude-sonnet-5', baseDelayMs: 1, sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) return jsonResponse({ error: 'overloaded' }, 529);
      return jsonResponse({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } });
    },
  });
  const result = await provider.complete(request);
  assert.equal(calls, 3);
  assert.equal(result.attempts, 3);
  assert.equal(result.text, 'ok');
});

test('non-retryable status codes fail immediately', async () => {
  let calls = 0;
  const provider = new AnthropicProvider({
    apiKey: 'test-key', model: 'claude-sonnet-5', baseDelayMs: 1, sleep: async () => {},
    fetchImpl: async () => { calls += 1; return jsonResponse({ error: 'bad request' }, 400); },
  });
  await assert.rejects(() => provider.complete(request), /400/);
  assert.equal(calls, 1, 'a 400 must not be retried');
});

test('a timeout is surfaced as a retryable provider error', async () => {
  const provider = new AnthropicProvider({
    apiKey: 'test-key', model: 'claude-sonnet-5', attempts: 1,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      (init?.signal as AbortSignal).addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  });
  await assert.rejects(() => provider.complete({ ...request, timeoutMs: 20 }), /timed out/);
});

test('a non-JSON body is rejected rather than parsed loosely', async () => {
  const provider = new AnthropicProvider({
    apiKey: 'test-key', model: 'claude-sonnet-5', attempts: 1,
    fetchImpl: async () => new Response('<html>gateway</html>', { status: 200 }),
  });
  await assert.rejects(() => provider.complete(request), /non-JSON/);
});

test('withRetry stops at the attempt ceiling', async () => {
  let attempts = 0;
  await assert.rejects(() => withRetry(async () => {
    attempts += 1;
    throw new ProviderError('always fails', true);
  }, { attempts: 4, baseDelayMs: 1, maxDelayMs: 2, sleep: async () => {} }));
  assert.equal(attempts, 4);
});

test('the scripted provider is always marked as a test double', () => {
  const provider = new ScriptedProvider(() => ({ text: 'x' }));
  assert.equal(provider.isTestDouble, true);
  assert.equal(provider.available().ok, true);
});

test('a scripted sequence runs out gracefully instead of throwing', async () => {
  const provider = scriptedSequence([{ text: 'one' }]);
  await provider.complete(request);
  const second = await provider.complete(request);
  assert.equal(second.stopReason, 'end_turn');
});

// ------------------------------------------------------- structured output

test('model output is validated against a schema before it can act', () => {
  const schema = { path: { type: 'string' as const, required: true }, depth: { type: 'number' as const, max: 3 } };
  assert.equal(validate({ path: 'a.ts' }, schema).ok, true);
  assert.equal(validate({}, schema).ok, false);
  assert.equal(validate({ path: 1 }, schema).ok, false);
  assert.equal(validate({ path: 'a', depth: 9 }, schema).ok, false);
  assert.equal(validate('not an object', schema).ok, false);
  assert.equal(validate(null, schema).ok, false);
});

test('JSON wrapped in prose or fences is still recovered', () => {
  assert.deepEqual(parseLooseJson('```json\n{"a":1}\n```'), { ok: true, value: { a: 1 } });
  assert.deepEqual(parseLooseJson('Sure! {"a":2} hope that helps'), { ok: true, value: { a: 2 } });
  assert.equal(parseLooseJson('no json here').ok, false);
});

test('secrets are redacted from structured logs', () => {
  const redacted = redact({ apiKey: 'sk-abcdef123456', nested: { token: 'xyz', note: 'sk-livekey12345678' } }) as Record<string, unknown>;
  assert.equal(redacted['apiKey'], '[redacted]');
  assert.equal((redacted['nested'] as Record<string, unknown>)['token'], '[redacted]');
  assert.match(String((redacted['nested'] as Record<string, unknown>)['note']), /\[redacted\]/);
});
