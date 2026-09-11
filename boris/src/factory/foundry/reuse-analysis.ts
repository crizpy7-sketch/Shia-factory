/**
 * Agent Foundry V1 Phase 2 — reuse analysis.
 *
 * Evidence-driven REUSE / EXTEND / CREATE. CREATE only when no match —
 * there is no ≥90% quota forcing CREATE or REUSE.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ToolDefinition, ToolRegistry } from '../../tools/registry.js';
import {
  decideShelfReuse,
  type LoadedShelfAsset,
  type ShelfReuseDecision,
} from '../reusable-shelf.js';
import type {
  ReuseAnalysisResult,
  ReuseCapabilityDisposition,
  ReuseGap,
  ReuseHit,
  ReuseMap,
  SourcePacket,
} from './types.js';

export interface SkillRegistryLike {
  list(): Array<{ name: string; purpose?: string; triggers?: string[] }>;
}

export interface SkillPackIndex {
  schema_version?: string;
  packs: Array<{ id: string; index: string }>;
}

export interface ReuseAnalysisInput {
  /** Capabilities / tools to analyze (defaults from packet when provided). */
  capabilities?: string[];
  tools?: string[];
  packet?: Pick<SourcePacket, 'capabilities' | 'tools' | 'deploymentTarget'>;
  /** Live ToolRegistry, name list, or ToolDefinition list. */
  toolRegistry?: ToolRegistry | readonly string[] | readonly ToolDefinition[];
  /** Boris in-memory SkillRegistry-like API. */
  skillRegistry?: SkillRegistryLike;
  /** Optional skill names when no registry API is available. */
  skillNames?: readonly string[];
  /** Repo-root skills/registry.json pack index (paths only; optional enrichment). */
  skillPackIndex?: SkillPackIndex;
  /** When provided, shelf path uses decideShelfReuse. */
  shelfCatalog?: LoadedShelfAsset[];
  /** Platforms passed to decideShelfReuse (defaults from packet.deploymentTarget). */
  targetPlatforms?: string[];
  /** Fixed clock for deterministic tests. */
  now?: () => string;
}

function uniquePreserve(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function toolNamesFrom(
  toolRegistry: ReuseAnalysisInput['toolRegistry'],
): string[] {
  if (!toolRegistry) return [];
  if (Array.isArray(toolRegistry)) {
    return toolRegistry.map((entry) =>
      typeof entry === 'string' ? entry : (entry as ToolDefinition).name,
    );
  }
  return (toolRegistry as ToolRegistry).names();
}

function skillNamesFrom(input: ReuseAnalysisInput): Array<{
  name: string;
  purpose: string;
  triggers: string[];
}> {
  const fromRegistry =
    input.skillRegistry?.list().map((skill) => ({
      name: skill.name,
      purpose: skill.purpose ?? '',
      triggers: skill.triggers ?? [],
    })) ?? [];
  const fromNames = (input.skillNames ?? []).map((name) => ({
    name,
    purpose: '',
    triggers: [] as string[],
  }));
  const fromPacks = (input.skillPackIndex?.packs ?? []).map((pack) => ({
    name: pack.id,
    purpose: `skill-pack:${pack.index}`,
    triggers: [] as string[],
  }));
  const merged = [...fromRegistry, ...fromNames, ...fromPacks];
  const byName = new Map<string, (typeof merged)[number]>();
  for (const skill of merged) {
    const key = normalizeKey(skill.name);
    if (!byName.has(key)) byName.set(key, skill);
  }
  return [...byName.values()];
}

function matchTool(need: string, tools: string[]): string | null {
  const key = normalizeKey(need);
  return tools.find((name) => normalizeKey(name) === key) ?? null;
}

function matchSkill(
  need: string,
  skills: Array<{ name: string; purpose: string; triggers: string[] }>,
): { id: string; disposition: 'REUSE' | 'EXTEND'; evidence: string } | null {
  const key = normalizeKey(need);
  const exact = skills.find((skill) => normalizeKey(skill.name) === key);
  if (exact) {
    return {
      id: exact.name,
      disposition: 'REUSE',
      evidence: `Skill registry exact name match for "${need}" → ${exact.name}`,
    };
  }
  const partial = skills.find((skill) => {
    if (normalizeKey(skill.purpose).includes(key)) return true;
    return skill.triggers.some(
      (trigger) =>
        normalizeKey(trigger) === key ||
        normalizeKey(trigger).includes(key) ||
        key.includes(normalizeKey(trigger)),
    );
  });
  if (partial) {
    return {
      id: partial.name,
      disposition: 'EXTEND',
      evidence: `Skill registry partial match for "${need}" → ${partial.name} (extend required)`,
    };
  }
  return null;
}

function shelfDecisionFor(
  need: string,
  catalog: LoadedShelfAsset[],
  targetPlatforms: string[],
): ShelfReuseDecision {
  return decideShelfReuse(
    {
      capabilities: [need],
      targetPlatforms: targetPlatforms.length > 0 ? targetPlatforms : ['any'],
    },
    catalog,
  );
}

/**
 * Analyze requested capabilities/tools against tools, skills, and optional shelf catalog.
 * Pure/deterministic given the same registries and catalog.
 */
export function analyzeReuse(input: ReuseAnalysisInput = {}): ReuseAnalysisResult {
  const fromPacketCaps = input.packet?.capabilities ?? [];
  const fromPacketTools = input.packet?.tools ?? [];
  const needs = uniquePreserve([
    ...(input.capabilities ?? []),
    ...(input.tools ?? []),
    ...fromPacketCaps,
    ...fromPacketTools,
  ]);
  const tools = toolNamesFrom(input.toolRegistry);
  const skills = skillNamesFrom(input);
  const platforms =
    input.targetPlatforms ??
    (input.packet?.deploymentTarget ? [input.packet.deploymentTarget] : ['any']);
  const now = input.now ?? (() => new Date().toISOString());

  const hits: ReuseHit[] = [];
  const gaps: ReuseGap[] = [];
  const dispositions: ReuseCapabilityDisposition[] = [];

  for (const need of needs) {
    const noMatchEvidence: string[] = [];

    const toolHit = matchTool(need, tools);
    if (toolHit) {
      const evidence = `ToolRegistry exact name match for "${need}" → ${toolHit}`;
      hits.push({ capability: need, kind: 'tool', existingId: toolHit, evidence });
      dispositions.push({
        capability: need,
        disposition: 'REUSE',
        kind: 'tool',
        existingId: toolHit,
        evidence: [evidence],
      });
      continue;
    }
    noMatchEvidence.push(
      tools.length === 0
        ? 'ToolRegistry / tool name list is empty — no tool match.'
        : `No ToolRegistry name equals "${need}" (checked ${tools.length} tool(s)).`,
    );

    const skillHit = matchSkill(need, skills);
    if (skillHit) {
      if (skillHit.disposition === 'REUSE') {
        hits.push({
          capability: need,
          kind: 'skill',
          existingId: skillHit.id,
          evidence: skillHit.evidence,
        });
      }
      dispositions.push({
        capability: need,
        disposition: skillHit.disposition,
        kind: 'skill',
        existingId: skillHit.id,
        evidence: [skillHit.evidence],
        justification:
          skillHit.disposition === 'EXTEND'
            ? `Partial skill match; extend ${skillHit.id} rather than create net-new.`
            : undefined,
      });
      if (skillHit.disposition === 'EXTEND') {
        // EXTEND is not a CREATE gap; still record as non-gap with justification on disposition.
      }
      continue;
    }
    noMatchEvidence.push(
      skills.length === 0
        ? 'Skill registry / skill name list is empty — no skill match.'
        : `No skill name/purpose/trigger matched "${need}" (checked ${skills.length} skill(s)).`,
    );

    if (input.shelfCatalog) {
      const shelf = shelfDecisionFor(need, input.shelfCatalog, platforms);
      if (shelf.disposition === 'REUSE' || shelf.disposition === 'EXTEND') {
        const existingId = shelf.selectedAssetIds[0] ?? 'shelf:unknown';
        const evidence = `Shelf decideShelfReuse → ${shelf.disposition}: ${shelf.reason}`;
        if (shelf.disposition === 'REUSE') {
          hits.push({
            capability: need,
            kind: 'shelf',
            existingId,
            evidence,
          });
        }
        dispositions.push({
          capability: need,
          disposition: shelf.disposition,
          kind: 'shelf',
          existingId,
          evidence: [evidence, ...shelf.noMatchEvidence],
          justification: shelf.disposition === 'EXTEND' ? shelf.reason : undefined,
        });
        continue;
      }
      noMatchEvidence.push(...shelf.noMatchEvidence);
      noMatchEvidence.push(`Shelf decideShelfReuse → CREATE: ${shelf.reason}`);
    } else {
      noMatchEvidence.push('No shelf catalog provided — shelf path skipped.');
    }

    const justification =
      `CREATE for "${need}": no tool, skill, or admitted shelf asset matched. ` +
      'CREATE is allowed only with this no-match evidence.';
    gaps.push({ capability: need, justification, noMatchEvidence });
    dispositions.push({
      capability: need,
      disposition: 'CREATE',
      evidence: noMatchEvidence,
      justification,
    });
  }

  const map: ReuseMap = { hits, gaps, dispositions };
  return {
    map,
    analyzedAt: now(),
    inputCapabilities: needs,
  };
}

/**
 * Load skills/registry.json from a repo root (optional helper; analysis itself stays sync).
 */
export async function loadSkillPackIndex(repoRoot: string): Promise<SkillPackIndex> {
  const raw = await readFile(path.join(repoRoot, 'skills/registry.json'), 'utf8');
  return JSON.parse(raw) as SkillPackIndex;
}
