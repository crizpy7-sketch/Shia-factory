import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStorage } from '../../src/storage/sqlite.js';
import { MemoryStore } from '../../src/memory/store.js';
import { captureFailure, countPriorOccurrences, failureSignature } from '../../src/memory/learning.js';
import { assertPublicUrl, isPrivateAddress } from '../../src/tools/builtin.js';
import { OpenAIProvider } from '../../src/providers/openai.js';
import { Task, emptyUsage } from '../../src/domain/types.js';

function task(): Task {
  return {
    id: 'task_1', parentTaskId: null, title: 't', objective: 'repair the median function',
    description: '', status: 'working', priority: 'normal', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), startedAt: null, completedAt: null,
    assignedAgent: 'BORIS-001', workspace: '/tmp/ws', dependencies: [], attempts: 1, maxAttempts: 3,
    result: null, evidence: [], error: null, approvalState: 'none', usage: emptyUsage(),
    scheduleId: null, depth: 0, plan: null, failureSignature: null,
  };
}

// ------------------------------------------------------- failure learning

test('failure signatures ignore volatile detail so recurrence is detectable', () => {
  const first = failureSignature({ kind: 'verification', tool: 'npm test', message: 'npm test exited 1 after 412ms at 2026-01-01T00:00:00Z in /tmp/x9f2' });
  const second = failureSignature({ kind: 'verification', tool: 'npm test', message: 'npm test exited 1 after 980ms at 2026-02-02T00:00:00Z in /tmp/aa41' });
  assert.equal(first, second, 'the same failure with different timings should share a signature');

  const different = failureSignature({ kind: 'verification', tool: 'npm test', message: 'typecheck failed with 3 errors' });
  assert.notEqual(first, different);
});

test('a failure is captured with provenance and counted, and recurrence is detected', () => {
  const storage = new SqliteStorage(':memory:');
  storage.migrate();
  const memory = new MemoryStore(storage);
  const deps = { storage, memory };
  const input = {
    kind: 'verification' as const,
    tool: 'npm test',
    summary: 'independent verification failed: npm test exited 1',
    detail: '$ npm test\nexit=1\n1 of 4 failing',
    rootCause: 'the reported repair did not satisfy the verification command',
  };

  const first = captureFailure(deps, task(), input);
  assert.equal(first.occurrences, 1);
  assert.equal(first.recurring, false);
  assert.equal(first.record.category, 'failure');
  assert.equal(first.record.verified, true);
  assert.match(first.record.provenance, /captured automatically/);
  assert.match(first.record.content, /First occurrence/);

  const second = captureFailure(deps, task(), input);
  assert.equal(second.occurrences, 2);
  assert.equal(second.recurring, true);
  assert.match(second.record.content, /recorded 2 times/);
  assert.match(second.record.content, /test, a constraint or a skill/);

  assert.equal(countPriorOccurrences(storage, first.signature), 2);
  storage.close();
});

test('captured failures carry the evidence, not a summary of a summary', () => {
  const storage = new SqliteStorage(':memory:');
  storage.migrate();
  const captured = captureFailure({ storage, memory: new MemoryStore(storage) }, task(), {
    kind: 'tool', tool: 'dev', summary: 'dev test failed', detail: 'AssertionError: expected 2.5 got 3',
  });
  assert.match(captured.record.content, /AssertionError: expected 2\.5 got 3/);
  storage.close();
});

// ------------------------------------------------------------ SSRF guards

test('private, loopback, link-local and metadata addresses are recognised', () => {
  for (const address of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '224.0.0.1']) {
    assert.equal(isPrivateAddress(address), true, `${address} should be treated as private`);
  }
  for (const address of ['1.1.1.1', '93.184.216.34', '172.32.0.1', '8.8.8.8']) {
    assert.equal(isPrivateAddress(address), false, `${address} should be treated as public`);
  }
});

test('research URLs pointing at private or non-http targets are refused', async () => {
  for (const url of [
    'http://169.254.169.254/latest/meta-data/',   // cloud metadata
    'http://127.0.0.1:8787/api/status',            // BORIS's own API
    'http://10.1.2.3/internal',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'https://user:password@example.com/',
    'not-a-url',
  ]) {
    const result = await assertPublicUrl(url);
    assert.equal(result.ok, false, `should have been refused: ${url}`);
  }
});

// ------------------------------------------------------------ OpenAI shape

const baseRequest = {
  system: 'you are boris',
  messages: [
    { role: 'user' as const, content: [{ type: 'text' as const, text: 'inspect the repo' }] },
    { role: 'assistant' as const, content: [
      { type: 'text' as const, text: 'reading a file' },
      { type: 'tool_use' as const, id: 'call_1', name: 'fs_read', input: { path: 'a.ts' } },
    ] },
    { role: 'user' as const, content: [
      { type: 'tool_result' as const, toolUseId: 'call_1', content: 'file contents', isError: false },
    ] },
  ],
  tools: [{ name: 'fs_read', description: 'read', inputSchema: { type: 'object' } }],
  maxOutputTokens: 256,
  timeoutMs: 5000,
};

test('the OpenAI adapter is unavailable without a key', () => {
  const provider = new OpenAIProvider({ apiKey: null, model: 'gpt-4.1' });
  assert.equal(provider.available().ok, false);
  assert.match(provider.available().reason, /OPENAI_API_KEY/);
});

test('the OpenAI adapter maps our block model onto chat messages and tool calls', async () => {
  let sentBody: Record<string, unknown> = {};
  const provider = new OpenAIProvider({
    apiKey: 'test-key', model: 'gpt-4.1',
    fetchImpl: async (_url, init) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        model: 'gpt-4.1',
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: 'checking the tests',
            tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'dev', arguments: '{"action":"test"}' } }],
          },
        }],
        usage: { prompt_tokens: 40, completion_tokens: 12 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await provider.complete(baseRequest);

  const messages = sentBody['messages'] as Array<Record<string, unknown>>;
  assert.equal(messages[0]?.['role'], 'system');
  assert.equal(messages[1]?.['role'], 'user');
  assert.equal(messages[2]?.['role'], 'assistant');
  assert.ok(Array.isArray(messages[2]?.['tool_calls']), 'tool uses must become assistant tool_calls');
  assert.equal(messages[3]?.['role'], 'tool', 'a tool result must become its own tool message');
  assert.equal(messages[3]?.['tool_call_id'], 'call_1');

  assert.equal(result.text, 'checking the tests');
  assert.equal(result.toolUses[0]?.name, 'dev');
  assert.deepEqual(result.toolUses[0]?.input, { action: 'test' });
  assert.equal(result.stopReason, 'tool_use');
  assert.equal(result.usage.inputTokens, 40);
  assert.equal(result.costUsd, null, 'no pricing table means no invented cost');
  assert.equal(result.provider, 'openai');
});

test('malformed tool arguments from OpenAI become empty input rather than a crash', async () => {
  const provider = new OpenAIProvider({
    apiKey: 'test-key', model: 'gpt-4.1',
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'fs_read', arguments: '{not json' } },
      ] } }],
      usage: {},
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const result = await provider.complete(baseRequest);
  assert.deepEqual(result.toolUses[0]?.input, {});
});

test('OpenAI retryable and terminal statuses behave differently', async () => {
  let calls = 0;
  const flaky = new OpenAIProvider({
    apiKey: 'k', model: 'gpt-4.1', baseDelayMs: 1, sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return calls < 2
        ? new Response('{"error":"rate limited"}', { status: 429 })
        : new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage: {} }),
            { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal((await flaky.complete(baseRequest)).text, 'ok');
  assert.equal(calls, 2);

  let terminalCalls = 0;
  const terminal = new OpenAIProvider({
    apiKey: 'k', model: 'gpt-4.1', baseDelayMs: 1, sleep: async () => {},
    fetchImpl: async () => { terminalCalls += 1; return new Response('{"error":"bad"}', { status: 401 }); },
  });
  await assert.rejects(() => terminal.complete(baseRequest), /401/);
  assert.equal(terminalCalls, 1, 'an auth failure must not be retried');
});
