/**
 * The failure → learning loop.
 *
 * A meaningful failure is captured with its root-cause candidate and a stable signature. When the
 * same signature recurs, the runtime says so deterministically and asks for a permanent safeguard
 * — a test, a constraint or a skill — instead of another one-off repair.
 *
 * Nothing here invents a lesson. Every record is built from what actually happened in the run.
 */
import { createHash } from 'node:crypto';
import { MemoryRecord, Task } from '../domain/types.js';
import { Storage } from '../storage/types.js';
import { MemoryStore } from './store.js';

/** Volatile parts of a message that would otherwise make every occurrence look unique. */
const NOISE = [
  /\b[0-9a-f]{8,}\b/gi,          // hashes and ids
  /\b\d{4}-\d{2}-\d{2}t[\d:.]+z?/gi,  // timestamps (the message is lowercased first)
  /\b\d+ms\b/g,                  // durations
  /\/tmp\/[^\s'")]+/g,           // scratch paths
  /\b\d+\b/g,                    // remaining bare numbers
];

export function failureSignature(input: { kind: string; tool?: string | null; message: string }): string {
  let normalised = input.message.toLowerCase();
  for (const pattern of NOISE) normalised = normalised.replace(pattern, '·');
  const basis = `${input.kind}|${input.tool ?? ''}|${normalised.replace(/\s+/g, ' ').trim().slice(0, 300)}`;
  return createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

export interface CapturedFailure {
  record: MemoryRecord;
  signature: string;
  /** How many times this signature has now been recorded, including this one. */
  occurrences: number;
  recurring: boolean;
}

export interface FailureInput {
  kind: 'verification' | 'tool' | 'task' | 'provider';
  tool?: string | null;
  summary: string;
  detail: string;
  /** What the runtime can say about the cause without guessing. */
  rootCause?: string;
}

/**
 * Records a failure in memory and reports whether it has been seen before. Trivial noise is not
 * stored: only failures the runtime classifies as meaningful reach here.
 */
export function captureFailure(
  deps: { storage: Storage; memory: MemoryStore },
  task: Task,
  input: FailureInput,
): CapturedFailure {
  const signature = failureSignature({ kind: input.kind, tool: input.tool ?? null, message: input.summary });
  const tag = `sig:${signature}`;
  const prior = deps.storage.queryMemory({ category: 'failure', tags: [tag], text: tag, limit: 50 });
  const occurrences = prior.length + 1;

  const record = deps.memory.remember({
    category: 'failure',
    title: `${input.kind} failure: ${input.summary.slice(0, 180)}`,
    content: [
      `Objective: ${task.objective.slice(0, 400)}`,
      `Workspace: ${task.workspace}`,
      input.tool ? `Tool: ${input.tool}` : '',
      `What happened: ${input.summary}`,
      input.rootCause ? `Root cause (runtime assessment): ${input.rootCause}` : '',
      '',
      'Evidence:',
      input.detail.slice(0, 3000),
      '',
      occurrences > 1
        ? `This signature has now been recorded ${occurrences} times. A one-off repair is no longer the right answer — it needs a test, a constraint or a skill.`
        : 'First occurrence of this signature.',
    ].filter(Boolean).join('\n'),
    tags: ['failure', tag, input.kind, ...(input.tool ? [input.tool] : [])],
    source: `task:${task.id}`,
    provenance: `captured automatically by the runtime during task ${task.id}`,
    // A failure the runtime observed is evidence, not a guess — but the root cause is an assessment.
    confidence: input.rootCause ? 0.7 : 0.85,
    verified: true,
    taskId: task.id,
    stable: false,
  });

  return { record, signature, occurrences, recurring: occurrences > 1 };
}

/** How many times this signature has been seen before, without recording anything. */
export function countPriorOccurrences(storage: Storage, signature: string): number {
  return storage.queryMemory({ category: 'failure', text: `sig:${signature}`, limit: 50 }).length;
}
