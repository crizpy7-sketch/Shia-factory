import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config.js';
import { createBuiltinTools } from '../../src/tools/builtin.js';
import { ToolContext } from '../../src/tools/registry.js';
import { TypesafeClient, TypesafeError, validateQuestions } from '../../src/judgments/typesafe.js';
import { Logger } from '../../src/util/log.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeCtx(overrides: Parameters<typeof loadConfig>[0] = {}): ToolContext {
  const root = mkdtempSync(join(tmpdir(), 'boris-jev-'));
  const workspace = join(root, 'ws');
  mkdirSync(workspace, { recursive: true });
  const config = loadConfig({
    jevEnabled: false,
    typesafeApiKey: null,
    ...overrides,
  });
  return {
    config,
    permissions: { workspaceRoots: [workspace], workspace },
    taskId: 'task-test',
    runId: 'run-test',
    workspace,
    logger: new Logger('error', {}, () => {}),
    storage: null as unknown as ToolContext['storage'],
    workerId: null,
    signal: new AbortController().signal,
  };
}

function jevTool(fetchImpl?: typeof fetch) {
  const tools = createBuiltinTools(undefined, fetchImpl ? { fetchImpl } : {});
  const tool = tools.find((t) => t.name === 'jev_system_one');
  assert.ok(tool, 'jev_system_one must be registered in createBuiltinTools');
  return tool;
}

test('jev_system_one denies when Jev is disabled', () => {
  const tool = jevTool();
  const ctx = makeCtx({ jevEnabled: false, typesafeApiKey: 'k' });
  const decision = tool.authorize!(
    { state: { x: 1 }, questions: { q: { type: 'noul', instructions: '?' } } },
    ctx,
  );
  assert.equal(decision.kind, 'deny');
  assert.match(decision.reason, /BORIS_JEV_ENABLED/i);
});

test('jev_system_one denies when the TypeSafe API key is missing', () => {
  const tool = jevTool();
  const ctx = makeCtx({ jevEnabled: true, typesafeApiKey: null });
  const decision = tool.authorize!(
    { state: { x: 1 }, questions: { q: { type: 'noul', instructions: '?' } } },
    ctx,
  );
  assert.equal(decision.kind, 'deny');
  assert.match(decision.reason, /TYPESAFE_API_KEY|API key/i);
});

test('jev_system_one allows and executes with a mock noul answer', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return jsonResponse({
      model: 'jev-latest',
      answers: { billing: { type: 'noul', noul: 0.91 } },
      usage: { input_tokens: 12, output_tokens: 3 },
    });
  };
  const tool = jevTool(fetchImpl);
  const ctx = makeCtx({
    jevEnabled: true,
    typesafeApiKey: 'test-secret-key',
    typesafeBaseUrl: 'https://api.typesafe.ai',
    typesafeModel: 'jev-latest',
  });
  const input = {
    state: { message: 'I was charged twice' },
    questions: { billing: { type: 'noul', instructions: 'Is this about billing?' } },
  };
  const decision = tool.authorize!(input, ctx);
  assert.equal(decision.kind, 'allow');

  const result = await tool.execute(input, ctx);
  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(requests[0]?.init?.method, 'POST');
  const headers = requests[0]?.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer test-secret-key');
  const body = JSON.parse(String(requests[0]?.init?.body));
  assert.equal(body.model, 'jev-latest');
  assert.deepEqual(body.state, { message: 'I was charged twice' });

  const parsed = JSON.parse(result.output);
  assert.equal(parsed.answers.billing.noul, 0.91);
  assert.equal(result.data?.['model'], 'jev-latest');
  // Key must not appear in output/error surfaces beyond the intentional Authorization header test above.
  assert.equal(result.output.includes('test-secret-key'), false);
  assert.equal(JSON.stringify(result.data).includes('test-secret-key'), false);
});

test('jev_system_one rejects an invalid questions payload', async () => {
  const tool = jevTool(async () => {
    throw new Error('fetch must not be called for invalid questions');
  });
  const ctx = makeCtx({ jevEnabled: true, typesafeApiKey: 'k' });
  const result = await tool.execute(
    { state: 's', questions: { q: { type: 'score', criteria: ['only-one'] } } },
    ctx,
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /at least two scores/i);
});

test('validateQuestions rejects empty and unknown types before any network call', () => {
  assert.throws(() => validateQuestions({}), /At least one question/);
  assert.throws(
    () => validateQuestions({ q: { type: 'essay', instructions: 'nope' } }),
    /noul, choice, or score/,
  );
  assert.throws(
    () => validateQuestions({ q: { type: 'score', criteria: { 0: 'a', 1: 'b' } } }),
    /not a list/,
  );
});

test('TypesafeClient.systemOne posts to /v1/systemone and never exposes the key on the instance', async () => {
  let sawAuth = '';
  const client = new TypesafeClient({
    apiKey: 'super-secret',
    baseUrl: 'https://example.test',
    fetchImpl: async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      sawAuth = headers.Authorization ?? '';
      return jsonResponse({
        model: 'jev-latest',
        answers: { q: { type: 'noul', noul: 0.5 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });
  assert.equal('apiKey' in client, false);
  assert.equal(JSON.stringify(client).includes('super-secret'), false);
  const result = await client.systemOne({
    state: 'hello',
    questions: { q: { type: 'noul', instructions: '?' } },
  });
  assert.equal(sawAuth, 'Bearer super-secret');
  assert.equal(result.answers['q']?.type, 'noul');
});

test('TypesafeClient surfaces HTTP errors without leaking the key', async () => {
  const client = new TypesafeClient({
    apiKey: 'super-secret',
    fetchImpl: async () => jsonResponse({ error: 'nope' }, 401),
  });
  await assert.rejects(
    () => client.systemOne({ state: 's', questions: { q: { type: 'noul', instructions: '?' } } }),
    (err: unknown) => {
      assert.ok(err instanceof TypesafeError);
      assert.match(err.message, /401/);
      assert.equal(err.message.includes('super-secret'), false);
      return true;
    },
  );
});

test('config loads Jev settings from the environment with safe defaults', () => {
  const previous = {
    BORIS_JEV_ENABLED: process.env['BORIS_JEV_ENABLED'],
    TYPESAFE_API_KEY: process.env['TYPESAFE_API_KEY'],
    BORIS_TYPESAFE_API_KEY: process.env['BORIS_TYPESAFE_API_KEY'],
    BORIS_TYPESAFE_BASE_URL: process.env['BORIS_TYPESAFE_BASE_URL'],
    BORIS_TYPESAFE_MODEL: process.env['BORIS_TYPESAFE_MODEL'],
  };
  try {
    delete process.env['BORIS_JEV_ENABLED'];
    delete process.env['TYPESAFE_API_KEY'];
    delete process.env['BORIS_TYPESAFE_API_KEY'];
    delete process.env['BORIS_TYPESAFE_BASE_URL'];
    delete process.env['BORIS_TYPESAFE_MODEL'];
    const defaults = loadConfig();
    assert.equal(defaults.jevEnabled, false);
    assert.equal(defaults.typesafeApiKey, null);
    assert.equal(defaults.typesafeBaseUrl, 'https://api.typesafe.ai');
    assert.equal(defaults.typesafeModel, 'jev-latest');

    process.env['BORIS_JEV_ENABLED'] = 'true';
    process.env['TYPESAFE_API_KEY'] = 'from-typesafe';
    process.env['BORIS_TYPESAFE_BASE_URL'] = 'https://custom.example';
    process.env['BORIS_TYPESAFE_MODEL'] = 'jev-custom';
    const enabled = loadConfig();
    assert.equal(enabled.jevEnabled, true);
    assert.equal(enabled.typesafeApiKey, 'from-typesafe');
    assert.equal(enabled.typesafeBaseUrl, 'https://custom.example');
    assert.equal(enabled.typesafeModel, 'jev-custom');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
