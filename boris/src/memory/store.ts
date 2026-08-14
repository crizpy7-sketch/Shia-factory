/**
 * Memory: capture, curate, retrieve.
 *
 * Retrieval is selective by design — the whole store is never pushed into a prompt. Every record
 * carries provenance, a timestamp and a confidence, and can be superseded rather than deleted.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryCategory, MemoryRecord } from '../domain/types.js';
import { Storage } from '../storage/types.js';
import { now } from '../util/ids.js';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'when', 'then', 'than', 'you',
  'are', 'was', 'were', 'has', 'have', 'had', 'not', 'but', 'its', 'it', 'a', 'an', 'of', 'to',
  'in', 'on', 'is', 'be', 'by', 'as', 'at', 'or', 'if', 'do', 'does', 'run', 'use',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/** Weights bias retrieval towards durable knowledge over incidental history. */
const CATEGORY_WEIGHT: Record<MemoryCategory, number> = {
  identity: 1.4,
  procedural: 1.3,
  failure: 1.25,
  research: 1.1,
  episodic: 0.9,
  task: 0.8,
};

export interface RetrievalOptions {
  objective: string;
  taskId?: string;
  limit?: number;
  /** Categories to consider; defaults to everything except raw task memory. */
  categories?: MemoryCategory[];
}

export interface ScoredMemory {
  record: MemoryRecord;
  score: number;
}

export class MemoryStore {
  constructor(private readonly storage: Storage) {}

  private static stableId(source: string, title: string): string {
    return `mem_${createHash('sha256').update(`${source}::${title}`).digest('hex').slice(0, 20)}`;
  }

  remember(input: {
    category: MemoryCategory;
    title: string;
    content: string;
    tags?: string[];
    source: string;
    provenance: string;
    confidence?: number;
    verified?: boolean;
    taskId?: string | null;
    stable?: boolean;
  }): MemoryRecord {
    const timestamp = now();
    const record: MemoryRecord = {
      id: input.stable === false
        ? `mem_${createHash('sha256').update(`${input.source}${input.title}${timestamp}`).digest('hex').slice(0, 20)}`
        : MemoryStore.stableId(input.source, input.title),
      category: input.category,
      title: input.title.slice(0, 300),
      content: input.content,
      tags: input.tags ?? [],
      source: input.source,
      provenance: input.provenance,
      confidence: Math.min(1, Math.max(0, input.confidence ?? 0.6)),
      verified: input.verified ?? false,
      supersededBy: null,
      taskId: input.taskId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: null,
      useCount: 0,
    };
    return this.storage.putMemory(record);
  }

  /**
   * Scores candidates against the objective. Deterministic: keyword overlap, category weight,
   * confidence, verification and recency. No model call is involved in retrieval.
   */
  retrieve(options: RetrievalOptions): ScoredMemory[] {
    const limit = options.limit ?? 8;
    const terms = new Set(tokenize(options.objective));
    const categories = options.categories ?? ['identity', 'procedural', 'failure', 'research', 'episodic'];
    const candidates: MemoryRecord[] = [];
    for (const category of categories) {
      candidates.push(...this.storage.queryMemory({ category, limit: 100 }));
    }
    if (options.taskId) {
      candidates.push(...this.storage.queryMemory({ category: 'task', taskId: options.taskId, limit: 30 }));
    }

    const nowMs = Date.now();
    const seen = new Set<string>();
    const scored: ScoredMemory[] = [];
    for (const record of candidates) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      const haystack = new Set(tokenize(`${record.title} ${record.content} ${record.tags.join(' ')}`));
      let overlap = 0;
      for (const term of terms) if (haystack.has(term)) overlap += 1;
      const relevance = terms.size ? overlap / terms.size : 0;
      const ageDays = Math.max(0, (nowMs - Date.parse(record.updatedAt)) / 86_400_000);
      const recency = 1 / (1 + ageDays / 30);
      const score =
        (relevance * 3 + record.confidence + (record.verified ? 0.5 : 0) + recency * 0.5) *
        CATEGORY_WEIGHT[record.category];
      // Identity memory is always eligible; other categories need some lexical connection.
      if (relevance === 0 && record.category !== 'identity') continue;
      scored.push({ record, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);
    this.storage.touchMemory(top.map((s) => s.record.id));
    return top;
  }

  format(items: ScoredMemory[], maxChars = 4000): string {
    const lines: string[] = [];
    let used = 0;
    for (const { record } of items) {
      const entry = `- [${record.category}] ${record.title}\n  ${record.content.replace(/\s+/g, ' ').slice(0, 400)}\n  (source: ${record.source}; confidence ${record.confidence.toFixed(2)}${record.verified ? '; verified' : ''})`;
      if (used + entry.length > maxChars) break;
      lines.push(entry);
      used += entry.length;
    }
    return lines.join('\n');
  }

  /**
   * Imports BORIS-001's portable files into the memory store. Idempotent: ids are content-stable,
   * so re-running updates rather than duplicating. Empty ledgers stay empty — nothing is invented.
   */
  importPortableState(identityDir: string): { imported: number; skipped: string[] } {
    let imported = 0;
    const skipped: string[] = [];

    const identityPath = join(identityDir, 'identity', 'identity.json');
    if (existsSync(identityPath)) {
      const identity = JSON.parse(readFileSync(identityPath, 'utf8')) as Record<string, unknown>;
      this.remember({
        category: 'identity',
        title: `${String(identity['display_name'])} — identity and authority`,
        content: JSON.stringify(identity, null, 2),
        tags: ['identity', 'authority', 'boris'],
        source: 'agents/BORIS-001/identity/identity.json',
        provenance: 'portable package (transferred, checksum-verified)',
        confidence: 1,
        verified: true,
      });
      imported += 1;
    }

    const cognitivePath = join(identityDir, 'identity', 'cognitive_model.md');
    if (existsSync(cognitivePath)) {
      this.remember({
        category: 'identity',
        title: 'BORIS-001 cognitive model',
        content: readFileSync(cognitivePath, 'utf8'),
        tags: ['identity', 'principles', 'cognitive'],
        source: 'agents/BORIS-001/identity/cognitive_model.md',
        provenance: 'portable package',
        confidence: 1,
        verified: true,
      });
      imported += 1;
    }

    const contractPath = join(identityDir, 'runtime', 'runtime_contract.md');
    if (existsSync(contractPath)) {
      this.remember({
        category: 'identity',
        title: 'BORIS-001 runtime contract',
        content: readFileSync(contractPath, 'utf8'),
        tags: ['identity', 'runtime', 'contract'],
        source: 'agents/BORIS-001/runtime/runtime_contract.md',
        provenance: 'portable package',
        confidence: 1,
        verified: true,
      });
      imported += 1;
    }

    const ledgers: Array<{ file: string; category: MemoryCategory; tag: string }> = [
      { file: join(identityDir, 'knowledge', 'failure_library.jsonl'), category: 'failure', tag: 'failure-library' },
      { file: join(identityDir, 'knowledge', 'research_ledger.jsonl'), category: 'research', tag: 'research-ledger' },
      { file: join(identityDir, 'evals', 'exam_history.jsonl'), category: 'episodic', tag: 'exam-history' },
    ];
    for (const ledger of ledgers) {
      if (!existsSync(ledger.file)) { skipped.push(`${ledger.file} (absent)`); continue; }
      const raw = readFileSync(ledger.file, 'utf8').trim();
      if (!raw) { skipped.push(`${ledger.file} (empty — not fabricated)`); continue; }
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(line) as Record<string, unknown>;
        } catch {
          skipped.push(`${ledger.file} (unparseable line)`);
          continue;
        }
        this.remember({
          category: ledger.category,
          title: String(parsed['title'] ?? parsed['summary'] ?? parsed['id'] ?? 'untitled record'),
          content: JSON.stringify(parsed, null, 2),
          tags: [ledger.tag],
          source: ledger.file,
          provenance: 'portable package ledger',
          confidence: 0.9,
          verified: true,
        });
        imported += 1;
      }
    }

    const evalsDir = join(identityDir, 'evals');
    if (existsSync(evalsDir)) {
      for (const file of readdirSync(evalsDir)) {
        if (!file.endsWith('.md')) continue;
        const content = readFileSync(join(evalsDir, file), 'utf8');
        this.remember({
          category: file.toUpperCase().includes('EXAM') ? 'research' : 'identity',
          title: `Eval document: ${file}`,
          content: content.slice(0, 12000),
          tags: ['evals', 'evidence', file.replace(/\.md$/, '')],
          source: `agents/BORIS-001/evals/${file}`,
          provenance: 'portable package evals',
          confidence: 0.95,
          verified: true,
        });
        imported += 1;
      }
    }

    return { imported, skipped };
  }
}
