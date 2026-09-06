import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import type { QualityGateReceipt } from '../../src/quality/quality-gate.js';

export interface PersistenceWorkerInput {
  directory: string;
  receipts: QualityGateReceipt[];
  pauseReads?: boolean;
  pausePublish?: boolean;
  partialWrite?: boolean;
  writeFailure?: boolean;
  publishFailure?: string;
  legacyTemporarySentinel?: boolean;
}
export interface PersistenceWorkerEvent {
  type: string;
  pid?: number;
  temporary?: string;
  results?: Array<{ status: string; value?: string; error?: string }>;
}

function release(type: string): Promise<void> {
  return new Promise(resolve => {
    const listener = (message: { type?: string }) => {
      if (message.type === type) { process.off('message', listener); resolve(); }
    };
    process.on('message', listener);
  });
}
function report(event: PersistenceWorkerEvent): void { process.send?.({ ...event, pid: process.pid }); }

process.once('message', async (input: PersistenceWorkerInput) => {
  const receipt = input.receipts[0];
  if (!receipt) throw new Error('Receipt fixture required');
  const target = path.join(input.directory, `${receipt.taskId}-${receipt.candidateSha}-${receipt.evaluationScope}.json`);
  const original = { readFile: fs.readFile, writeFile: fs.writeFile, link: fs.link, rename: fs.rename };
  if (input.legacyTemporarySentinel) {
    await original.writeFile(`${target}.${process.pid}.tmp`, 'other-writer-sentinel', { flag: 'wx' });
  }
  // Schedule real syscalls at deterministic IPC barriers. No extracted persistence implementation.
  fs.readFile = (async (...args: Parameters<typeof fs.readFile>) => {
    try { return await original.readFile(...args); }
    catch (error) {
      if (input.pauseReads && args[0] === target && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        const gate = release('read'); report({ type: 'absent' }); await gate;
      }
      throw error;
    }
  }) as typeof fs.readFile;
  fs.writeFile = async (...args) => {
    if (input.partialWrite || input.writeFailure) {
      const [file, content, options] = args;
      if (typeof content !== 'string') throw new Error('Expected serialized receipt fixture');
      const split = Math.floor(content.length / 2);
      await original.writeFile(file, content.slice(0, split), options);
      if (input.writeFailure) throw Object.assign(new Error('injected write failure'), { code: 'EIO' });
      const gate = release('write'); report({ type: 'partial', temporary: String(file) }); await gate;
      await original.writeFile(file, content.slice(split), { encoding: 'utf8', flag: 'a' });
    } else await original.writeFile(...args);
  };
  const beforePublish = async (temporary: string): Promise<void> => {
    if (input.publishFailure) throw Object.assign(new Error(`injected ${input.publishFailure}`), { code: input.publishFailure });
    const gate = input.pausePublish ? release('publish') : Promise.resolve();
    report({ type: 'publish-ready', temporary }); await gate;
  };
  // Observe both the starting implementation and the repaired no-replace publication operation.
  fs.rename = async (from, to) => { await beforePublish(String(from)); await original.rename(from, to); };
  fs.link = async (from, to) => { await beforePublish(String(from)); await original.link(from, to); };
  syncBuiltinESMExports();
  const { persistQualityGateReceipt } = await import('../../src/quality/quality-gate.js');
  const settled = await Promise.allSettled(input.receipts.map(value => persistQualityGateReceipt(value, input.directory)));
  report({ type: 'done', results: settled.map(result => result.status === 'fulfilled'
    ? { status: result.status, value: result.value }
    : { status: result.status, error: String(result.reason) }) });
  process.disconnect?.();
});
