import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RiskTier } from './operating-system.js';
import { decideShelfReuse, loadShelfCatalog,
  type LoadedShelfAsset, type ShelfCatalogVerificationDependencies, type ShelfReuseDecision } from './reusable-shelf.js';

type JsonObject = Record<string, unknown>;
type ReuseState = 'verified' | 'unverified' | 'legacy' | 'candidate';

export interface ReuseCertification {
  provenanceVerified: boolean;
  shelfAdmission: 'not-evaluated' | 'candidate' | 'admitted' | 'deprecated' | 'revoked';
  qualityCertification: 'not-evaluated' | 'trusted-pass';
}

export interface NormalizedAppProfile {
  schemaVersion: '1.0';
  app: { id: string; name: string; type: string; lifecycleStage: string };
  blueprint: string | null;
  risk: { baselineTier: RiskTier; reasons: string[] };
  data: { sensitivity: 'public' | 'internal' | 'private' | 'regulated'; irreversibleAuthority: boolean };
  stack: Record<string, string | string[]>;
  requiredRoles: string[];
  conditionalRoles: string[];
  quality: Record<string, string>;
  approvals: Record<string, boolean>;
  reuseSearchRequired: true;
  statusDocument: string;
}

export interface CoreRegistry {
  permanent_roles: Array<{
    id: string;
    name: string;
    owns: string[];
    implementation_status: string;
    certification_status?: string;
    current_evidence: string[];
  }>;
  skill_packs: Array<{ id: string; status: string; index: string }>;
  tool_ownership: Record<string, string>;
}

export interface InvocationRegistry {
  roles: Array<{
    role_id: string;
    accepts: string[];
    implementation: { status: string; compatibility_paths: string[] };
  }>;
}

export interface AuthorityMatrix {
  actions: string[];
  roles: Record<string, Record<string, string>>;
}

export interface SkillPackRegistry {
  packs: Array<{ id: string; index: string }>;
}

export interface OrchestratorRegistries {
  core: CoreRegistry;
  invocation: InvocationRegistry;
  authority: AuthorityMatrix;
  skills: SkillPackRegistry;
}

export interface ReuseAsset {
  id: string;
  kind: 'block' | 'module' | 'blueprint' | 'skill' | 'implementation';
  path: string;
  state: ReuseState;
  certification: ReuseCertification;
  capabilities: string[];
  evidence: string[];
}

export interface ReuseFinding extends ReuseAsset {
  matchedCapabilities: string[];
}

export interface OrchestrationRequest {
  taskId: string;
  objective: string;
  outcome: string;
  repository: { commit: string; branch: string };
  requestedCapabilities: string[];
  requestedActions: string[];
  acceptanceCriteria: Array<{ id: string; statement: string; evidence: string[] }>;
  changedPaths?: string[];
  capabilityCreationRequested?: boolean;
  targetPlatforms?: string[];
  allowNonAdmittedAssetIds?: string[];
  now: string;
}

export interface RoleSelection {
  id: string;
  reason: string;
  availability: 'available' | 'limited' | 'unavailable';
  implementationStatus: string;
}

export interface ToolSelection {
  id: string;
  owner: string;
  reason: string;
}

export interface ActionDecision {
  action: string;
  role: string;
  authority: string;
  allowed: boolean;
}

export interface OrchestratorTaskContract {
  schemaVersion: '1.0.0';
  id: string;
  projectId: string;
  objective: string;
  outcome: string;
  repository: { commit: string; branch: string };
  profileDigest: string;
  risk: { tier: RiskTier; reasons: string[] };
  reuse: { searched: true; findings: ReuseFinding[]; creationDisposition: string; shelfDecision?: ShelfReuseDecision };
  selectedRoles: RoleSelection[];
  selectedSkillPacks: Array<{ id: string; reason: string }>;
  selectedTools: ToolSelection[];
  acceptanceCriteria: Array<{ id: string; statement: string; evidence: string[] }>;
  requiredEvidence: string[];
  allowedActions: ActionDecision[];
  approvalGates: string[];
  executionBlocked: boolean;
  executionBlockers: string[];
  certificationReleaseBlocked: boolean;
  certificationReleaseBlockers: string[];
  /** Compatibility alias for executionBlocked. */
  blocked: boolean;
  /** Compatibility alias for executionBlockers. */
  blockers: string[];
}

export interface DecisionReceipt {
  schemaVersion: '1.0.0';
  receiptId: string;
  taskId: string;
  projectId: string;
  repository: { commit: string; branch: string };
  profileDigest: string;
  contractDigest: string;
  decisions: Array<{ stage: string; decision: string; reason: string; evidence: string[] }>;
  createdAt: string;
}

export interface OrchestrationResult {
  contract: OrchestratorTaskContract;
  receipt: DecisionReceipt;
}

const TIERS: RiskTier[] = ['T0', 'T1', 'T2', 'T3', 'T4'];
const TOP_LEVEL_KEYS = new Set([
  'schema_version', 'app', 'blueprint', 'risk', 'data', 'stack', 'required_roles',
  'conditional_roles', 'quality', 'approvals', 'reuse_search_required', 'status_document',
]);

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

function parseScalar(source: string, line: number): unknown {
  const value = source.trim();
  if (value === '') throw new Error(`line ${line}: missing scalar value`);
  if (/^[&*!]|[|>]$/.test(value)) throw new Error(`line ${line}: YAML anchors, tags and block scalars are unsupported`);
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new Error(`line ${line}: unterminated inline array`);
    const body = value.slice(1, -1).trim();
    if (body === '') return [];
    return body.split(',').map((part) => parseScalar(part, line));
  }
  if (value.startsWith('{')) throw new Error(`line ${line}: inline objects are unsupported`);
  if (value.startsWith('"')) {
    try { return JSON.parse(value) as unknown; } catch { throw new Error(`line ${line}: invalid quoted string`); }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw new Error(`line ${line}: unterminated quoted string`);
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (/[\[\]{}]/.test(value)) throw new Error(`line ${line}: unsupported YAML syntax`);
  return value;
}

interface YamlLine { indent: number; text: string; number: number }

function yamlLines(source: string): YamlLine[] {
  const lines: YamlLine[] = [];
  source.split(/\r?\n/).forEach((raw, index) => {
    if (raw.includes('\t')) throw new Error(`line ${index + 1}: tabs are unsupported`);
    const withoutComment = raw.replace(/\s+#.*$/, '');
    if (withoutComment.trim() === '') return;
    const indent = withoutComment.length - withoutComment.trimStart().length;
    if (indent % 2 !== 0) throw new Error(`line ${index + 1}: indentation must use two spaces`);
    lines.push({ indent, text: withoutComment.trim(), number: index + 1 });
  });
  return lines;
}

function parseBlock(lines: YamlLine[], start: number, indent: number): { value: unknown; next: number } {
  const first = lines[start];
  if (!first || first.indent !== indent) throw new Error('invalid YAML block indentation');
  const listMode = first.text.startsWith('- ');
  const container: unknown[] | JsonObject = listMode ? [] : {};
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (!line) break;
    if (line.indent < indent) break;
    if (line.indent > indent) throw new Error(`line ${line.number}: unexpected indentation`);
    if (listMode) {
      if (!line.text.startsWith('- ')) throw new Error(`line ${line.number}: mixed list and mapping`);
      (container as unknown[]).push(parseScalar(line.text.slice(2), line.number));
      index += 1;
      continue;
    }
    if (line.text.startsWith('- ')) throw new Error(`line ${line.number}: mixed mapping and list`);
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(line.text);
    if (!match) throw new Error(`line ${line.number}: expected key: value`);
    const key = match[1];
    if (!key) throw new Error(`line ${line.number}: key is required`);
    if (Object.hasOwn(container as JsonObject, key)) throw new Error(`line ${line.number}: duplicate key ${key}`);
    const remainder = match[2]?.trim() ?? '';
    if (remainder !== '') {
      (container as JsonObject)[key] = parseScalar(remainder, line.number);
      index += 1;
    } else {
      const next = lines[index + 1];
      if (!next || next.indent <= indent) throw new Error(`line ${line.number}: empty mapping key ${key}`);
      if (next.indent !== indent + 2) throw new Error(`line ${next.number}: child indentation must increase by two spaces`);
      const child = parseBlock(lines, index + 1, indent + 2);
      (container as JsonObject)[key] = child.value;
      index = child.next;
    }
  }
  return { value: container, next: index };
}

export function parseYamlStrict(source: string): JsonObject {
  const lines = yamlLines(source);
  if (lines.length === 0) throw new Error('APP_PROFILE is empty');
  if (lines[0]?.indent !== 0) throw new Error('APP_PROFILE must start at indentation zero');
  const parsed = parseBlock(lines, 0, 0);
  if (parsed.next !== lines.length || !isObject(parsed.value)) throw new Error('APP_PROFILE root must be a mapping');
  return parsed.value;
}

function stringField(parent: JsonObject, key: string, location: string): string {
  const value = parent[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${location}.${key} must be a non-empty string`);
  return value;
}

function stringArray(parent: JsonObject, key: string, location: string): string[] {
  const value = parent[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${location}.${key} must be an array of strings`);
  }
  return [...new Set(value as string[])];
}

function objectField(parent: JsonObject, key: string, location: string): JsonObject {
  const value = parent[key];
  if (!isObject(value)) throw new Error(`${location}.${key} must be a mapping`);
  return value;
}

export function parseAndValidateAppProfile(source: string, registry: CoreRegistry): NormalizedAppProfile {
  const raw = parseYamlStrict(source);
  for (const key of Object.keys(raw)) if (!TOP_LEVEL_KEYS.has(key)) throw new Error(`unsupported APP_PROFILE key: ${key}`);
  if (raw.schema_version !== '1.0') throw new Error('unsupported APP_PROFILE schema_version; expected 1.0');

  const app = objectField(raw, 'app', 'profile');
  const risk = objectField(raw, 'risk', 'profile');
  const stack = objectField(raw, 'stack', 'profile');
  const quality = objectField(raw, 'quality', 'profile');
  const approvals = objectField(raw, 'approvals', 'profile');
  const knownRoles = new Set(registry.permanent_roles.map((role) => role.id));
  const requiredRoles = stringArray(raw, 'required_roles', 'profile');
  const conditionalRoles = stringArray(raw, 'conditional_roles', 'profile');
  for (const role of [...requiredRoles, ...conditionalRoles]) if (!knownRoles.has(role)) throw new Error(`APP_PROFILE references unknown role: ${role}`);
  if (!requiredRoles.includes('shia-core')) throw new Error('APP_PROFILE.required_roles must include shia-core');
  if (raw.reuse_search_required !== true) throw new Error('APP_PROFILE must require reuse search');

  const tier = stringField(risk, 'baseline_tier', 'profile.risk') as RiskTier;
  if (!TIERS.includes(tier)) throw new Error(`unsupported baseline risk tier: ${tier}`);
  const reasons = stringArray(risk, 'reasons', 'profile.risk');
  if (reasons.length === 0) throw new Error('profile.risk.reasons cannot be empty');

  const normalizedStack: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(stack)) {
    if (typeof value === 'string') normalizedStack[key] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) normalizedStack[key] = value as string[];
    else throw new Error(`profile.stack.${key} must be a string or string array`);
  }
  const normalizedQuality: Record<string, string> = {};
  for (const [key, value] of Object.entries(quality)) {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`profile.quality.${key} must be a non-empty string`);
    normalizedQuality[key] = value;
  }
  const normalizedApprovals: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(approvals)) {
    if (typeof value !== 'boolean') throw new Error(`profile.approvals.${key} must be boolean`);
    normalizedApprovals[key] = value;
  }

  const data = raw.data === undefined ? {} : objectField(raw, 'data', 'profile');
  const sensitivity = (data.sensitivity ?? 'internal') as NormalizedAppProfile['data']['sensitivity'];
  if (!['public', 'internal', 'private', 'regulated'].includes(sensitivity)) throw new Error(`unsupported data sensitivity: ${String(sensitivity)}`);
  const irreversible = data.irreversible_authority ?? false;
  if (typeof irreversible !== 'boolean') throw new Error('profile.data.irreversible_authority must be boolean');

  const blueprint = raw.blueprint;
  if (blueprint !== null && typeof blueprint !== 'string') throw new Error('profile.blueprint must be a string or null');

  return {
    schemaVersion: '1.0',
    app: {
      id: stringField(app, 'id', 'profile.app'),
      name: stringField(app, 'name', 'profile.app'),
      type: stringField(app, 'type', 'profile.app'),
      lifecycleStage: stringField(app, 'lifecycle_stage', 'profile.app'),
    },
    blueprint: blueprint as string | null,
    risk: { baselineTier: tier, reasons },
    data: { sensitivity, irreversibleAuthority: irreversible },
    stack: normalizedStack,
    requiredRoles,
    conditionalRoles,
    quality: normalizedQuality,
    approvals: normalizedApprovals,
    reuseSearchRequired: true,
    statusDocument: stringField(raw, 'status_document', 'profile'),
  };
}

async function directories(parent: string): Promise<string[]> {
  try {
    const entries = await readdir(parent, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch { return []; }
}

async function exists(target: string): Promise<boolean> {
  try { await stat(target); return true; } catch { return false; }
}

function tokens(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1))];
}

export async function loadOrchestratorRegistries(repoRoot: string): Promise<OrchestratorRegistries> {
  const load = async <T>(relative: string): Promise<T> => JSON.parse(await readFile(path.join(repoRoot, relative), 'utf8')) as T;
  return {
    core: await load<CoreRegistry>('factory/registry/core-v2.json'),
    invocation: await load<InvocationRegistry>('factory/registry/invocation-contracts.json'),
    authority: await load<AuthorityMatrix>('factory/registry/authority-matrix.json'),
    skills: await load<SkillPackRegistry>('skills/registry.json'),
  };
}

export async function scanReuseCatalog(repoRoot: string, registries: OrchestratorRegistries, shelfCatalog?: LoadedShelfAsset[]): Promise<ReuseAsset[]> {
  const assets: ReuseAsset[] = [];
  const loadedShelf = shelfCatalog ?? await loadShelfCatalog(repoRoot);
  const shelfPaths = new Set<string>();
  for (const item of loadedShelf) {
    const manifest = item.manifest;
    shelfPaths.add(manifest.repository.path);
    const shelfAdmission = item.admitted ? 'admitted' : manifest.lifecycle;
    assets.push({
      id: manifest.assetId, kind: manifest.type, path: manifest.repository.path, state: 'verified',
      certification: { provenanceVerified: true, shelfAdmission, qualityCertification: item.admitted ? 'trusted-pass' : 'not-evaluated' },
      capabilities: [...manifest.capabilities],
      evidence: [`${manifest.repository.path}/manifest.json`, ...manifest.provenance.evidence],
    });
  }
  for (const [kind, folder] of [['block', 'blocks'], ['module', 'modules'], ['blueprint', 'blueprints']] as const) {
    for (const name of await directories(path.join(repoRoot, folder))) {
      const relative = `${folder}/${name}`;
      if (shelfPaths.has(relative)) continue;
      const manifest = await exists(path.join(repoRoot, relative, 'manifest.json'));
      assets.push({
        id: `${kind}:${name}`, kind, path: relative, state: manifest ? 'verified' : kind === 'block' ? 'legacy' : 'candidate',
        certification: { provenanceVerified: manifest, shelfAdmission: 'not-evaluated', qualityCertification: 'not-evaluated' },
        capabilities: tokens(name), evidence: manifest ? [`${relative}/manifest.json`] : [relative],
      });
    }
  }

  for (const pack of registries.skills.packs) {
    const packPath = path.join(repoRoot, pack.index);
    const index = JSON.parse(await readFile(packPath, 'utf8')) as { members: Array<{ kind: string; reference: string; surfaces?: string[] }> };
    for (const member of index.members) {
      const state: ReuseState = member.kind === 'local-skill' ? 'verified' : member.kind === 'imported-local-skill' ? 'legacy' : 'unverified';
      assets.push({
        id: `skill:${pack.id}:${member.reference}`, kind: 'skill', path: member.reference, state,
        certification: { provenanceVerified: member.kind === 'local-skill', shelfAdmission: 'not-evaluated', qualityCertification: 'not-evaluated' },
        capabilities: [...tokens(pack.id), ...tokens(member.reference), ...(member.surfaces ?? []).flatMap(tokens)], evidence: [pack.index, member.reference],
      });
    }
  }

  for (const role of registries.core.permanent_roles) {
    for (const evidence of role.current_evidence) {
      assets.push({
        id: `implementation:${role.id}:${evidence}`, kind: 'implementation', path: evidence,
        state: role.implementation_status.startsWith('operational') ? 'unverified' : 'candidate',
        certification: { provenanceVerified: false, shelfAdmission: 'not-evaluated', qualityCertification: 'not-evaluated' },
        capabilities: [...tokens(role.id), ...role.owns.flatMap(tokens), ...tokens(evidence)], evidence: [evidence],
      });
    }
  }
  return assets;
}

export function discoverReuse(capabilities: string[], catalog: ReuseAsset[]): ReuseFinding[] {
  const requested = new Map(capabilities.map((item) => [item, new Set(tokens(item))]));
  return catalog.flatMap((asset) => {
    const assetTokens = new Set([...asset.capabilities, ...tokens(asset.path)]);
    const matched = [...requested.entries()].filter(([, wanted]) => [...wanted].some((token) => assetTokens.has(token))).map(([name]) => name);
    return matched.length === 0 ? [] : [{ ...asset, matchedCapabilities: matched }];
  }).sort((left, right) => {
    const rank: Record<ReuseState, number> = { verified: 0, legacy: 1, unverified: 2, candidate: 3 };
    return rank[left.state] - rank[right.state] || left.id.localeCompare(right.id);
  });
}

function maxTier(left: RiskTier, right: RiskTier): RiskTier {
  return TIERS[Math.max(TIERS.indexOf(left), TIERS.indexOf(right))] ?? 'T4';
}

export function classifyRisk(profile: NormalizedAppProfile, request: Pick<OrchestrationRequest, 'objective' | 'requestedActions' | 'requestedCapabilities' | 'changedPaths'>): { tier: RiskTier; reasons: string[] } {
  let tier = profile.risk.baselineTier;
  const reasons = [`APP_PROFILE baseline ${tier}: ${profile.risk.reasons.join('; ')}`];
  const signal = `${request.objective} ${request.requestedActions.join(' ')} ${request.requestedCapabilities.join(' ')}`.toLowerCase();
  if (profile.data.sensitivity === 'regulated' || profile.data.irreversibleAuthority || /safety-critical|regulated|irreversible|production infrastructure|delete production/.test(signal)) {
    tier = maxTier(tier, 'T4'); reasons.push('T4 consequence: regulated, irreversible, safety-critical, or production-infrastructure authority');
  } else if (profile.data.sensitivity === 'private' || /auth|payment|stripe|secret|private data|database migration|production deploy/.test(signal)) {
    tier = maxTier(tier, 'T3'); reasons.push('T3 consequence: authentication, payment, secrets, private data, or important migration/deployment');
  } else if (/feature|api|realtime|browser|user flow|integration/.test(signal)) {
    tier = maxTier(tier, 'T2'); reasons.push('T2 consequence: normal product or integration behavior');
  } else if (!/docs?|copy|format|typo/.test(signal)) {
    tier = maxTier(tier, 'T1'); reasons.push('T1 consequence: isolated bounded change');
  } else {
    reasons.push('T0 signal is documentation/presentation only');
  }
  if ((request.changedPaths?.length ?? 0) <= 1 && TIERS.indexOf(tier) >= 3) reasons.push('Consequence overrides superficial diff size');
  return { tier, reasons };
}

function implementationAvailability(status: string): RoleSelection['availability'] {
  if (status.startsWith('operational')) return 'available';
  if (status === 'partial') return 'limited';
  return 'unavailable';
}

const CAPABILITY_ROLE: Array<[RegExp, string]> = [
  [/design|ux|visual|figma|motion|accessibility/, 'design-director'],
  [/growth|marketing|launch|position|customer|analytics|campaign/, 'gary'],
  [/test|quality|browser|security|performance|adversarial|release-verification/, 'quality-gate'],
  [/build|engineering|architecture|frontend|backend|database|ai|debug|devops|deploy|release/, 'boris'],
];

const ROLE_PACKS: Record<string, string[]> = {
  'shia-core': ['operations'], boris: ['engineering'], 'design-director': ['design'],
  gary: ['product', 'growth'], 'quality-gate': ['quality'],
};

const ACTION_OWNER: Record<string, string> = {
  inspect: 'shia-core', plan: 'shia-core', route: 'shia-core', design: 'design-director',
  build: 'boris', test: 'quality-gate', reject: 'quality-gate', 'request-rework': 'quality-gate',
  merge: 'boris', deploy: 'boris', publish: 'gary', spend: 'gary',
  'access-secrets-directly': 'boris', 'change-factory-governance': 'shia-core',
  'mutate-reviewed-candidate': 'boris',
};

function toolSignals(profile: NormalizedAppProfile, request: OrchestrationRequest): string[] {
  const signal = `${request.objective} ${request.requestedCapabilities.join(' ')} ${request.requestedActions.join(' ')}`.toLowerCase();
  const tools: string[] = [];
  if (/repo|code|build|merge|github/.test(signal)) tools.push('github');
  if (/figma|design system|ux|visual/.test(signal)) tools.push('figma');
  if (/canva|marketing design/.test(signal)) tools.push('canva');
  if (/database|supabase|postgres/.test(signal)) tools.push('supabase');
  if (/\bai\b|openai|model|prompt/.test(signal)) tools.push('openai');
  if (/browser|e2e|visual qa/.test(signal)) tools.push('browser-testing');
  if (/stripe|payment/.test(signal)) tools.push('stripe');
  if (/analytics|event instrumentation/.test(signal)) tools.push('analytics');
  if (/memory|gbrain/.test(signal)) tools.push('gbrain');
  if (/gstack/.test(signal)) tools.push('gstack');
  if (/deploy|release/.test(signal)) {
    const deployments = profile.stack.deployment;
    const values = Array.isArray(deployments) ? deployments : deployments ? [deployments] : [];
    if (values.some((value) => value.toLowerCase() === 'vps')) tools.push('vps');
    if (values.some((value) => value.toLowerCase() === 'vercel')) tools.push('vercel');
  }
  return [...new Set(tools)];
}

function requiredEvidenceFor(tier: RiskTier, profile: NormalizedAppProfile, request: OrchestrationRequest): string[] {
  const evidence = new Set<string>();
  if (tier !== 'T0') evidence.add('test');
  if (TIERS.indexOf(tier) >= 2) evidence.add('runtime');
  if (TIERS.indexOf(tier) >= 3) { evidence.add('review'); evidence.add('security'); }
  if (tier === 'T4') evidence.add('human_approval');
  const signal = `${request.objective} ${request.requestedCapabilities.join(' ')}`.toLowerCase();
  if (/browser|ui|ux|visual|user flow/.test(signal)) evidence.add('browser');
  for (const [mode, requirement] of Object.entries(profile.quality)) {
    if (requirement === 'required') evidence.add(mode);
    if (requirement.includes('ui') && /ui|ux|visual|browser/.test(signal)) evidence.add(mode);
    if (requirement.includes('runtime') && /runtime|performance|api/.test(signal)) evidence.add(mode);
  }
  return [...evidence].sort();
}

export function buildTaskContract(profile: NormalizedAppProfile, registries: OrchestratorRegistries, request: OrchestrationRequest, findings: ReuseFinding[], shelfDecision?: ShelfReuseDecision): OrchestratorTaskContract {
  if (!request.taskId.trim() || !request.objective.trim() || !request.outcome.trim()) throw new Error('taskId, objective and outcome are required');
  if (!/^[A-Za-z0-9._-]+$/.test(request.taskId)) throw new Error('taskId contains unsupported characters');
  if (!/^[0-9a-f]{7,64}$/i.test(request.repository.commit)) throw new Error('repository.commit must be a Git SHA');
  if (!request.repository.branch.trim()) throw new Error('repository.branch is required');
  if (request.acceptanceCriteria.length === 0) throw new Error('acceptance criteria are required');
  for (const criterion of request.acceptanceCriteria) {
    if (!criterion.id.trim() || !criterion.statement.trim() || criterion.evidence.length === 0) throw new Error('every acceptance criterion requires id, statement and evidence');
  }

  const risk = classifyRisk(profile, request);
  const selected = new Map<string, string>();
  selected.set('shia-core', 'Every task is routed by Shia Core.');
  for (const role of profile.requiredRoles) selected.set(role, 'Required by APP_PROFILE.');
  const signal = `${request.objective} ${request.requestedCapabilities.join(' ')} ${request.requestedActions.join(' ')}`;
  for (const [pattern, role] of CAPABILITY_ROLE) if (pattern.test(signal.toLowerCase())) selected.set(role, `Required by requested capability/action matching ${pattern.source}.`);
  if (TIERS.indexOf(risk.tier) >= 2) selected.set('quality-gate', `${risk.tier} requires Quality Gate evidence.`);
  for (const action of request.requestedActions) {
    const owner = ACTION_OWNER[action];
    if (!owner) throw new Error(`unsupported action: ${action}`);
    selected.set(owner, `Owns requested action ${action}.`);
  }

  const selectedRoles: RoleSelection[] = [...selected.entries()].map(([id, reason]) => {
    const role = registries.core.permanent_roles.find((item) => item.id === id);
    const invocation = registries.invocation.roles.find((item) => item.role_id === id);
    if (!role || !invocation) throw new Error(`registry contract missing for role ${id}`);
    if (role.implementation_status !== invocation.implementation.status) throw new Error(`implementation status mismatch for role ${id}`);
    return { id, reason, availability: implementationAvailability(role.implementation_status), implementationStatus: role.implementation_status };
  });

  const packSet = new Map<string, string>();
  for (const role of selectedRoles) for (const pack of ROLE_PACKS[role.id] ?? []) packSet.set(pack, `Supports selected role ${role.id}.`);
  if (/\bai\b|openai|model|prompt/i.test(signal)) packSet.set('ai', 'Requested AI capability.');
  const registeredPacks = new Set(registries.core.skill_packs.map((pack) => pack.id));
  const selectedSkillPacks = [...packSet.entries()].map(([id, reason]) => {
    if (!registeredPacks.has(id)) throw new Error(`selected unregistered skill pack ${id}`);
    return { id, reason };
  });

  const roleSet = new Set(selectedRoles.map((role) => role.id));
  const selectedTools: ToolSelection[] = toolSignals(profile, request).map((id) => {
    const owner = registries.core.tool_ownership[id];
    if (!owner) throw new Error(`tool ${id} has no registered owner`);
    if (!roleSet.has(owner)) throw new Error(`tool ${id} selected without its owner ${owner}`);
    return { id, owner, reason: `Required by the requested objective/capabilities and owned by ${owner}.` };
  });

  const approvalGates = new Set<string>();
  const executionBlockers: string[] = [];
  const certificationReleaseBlockers: string[] = [];
  const allowedActions: ActionDecision[] = request.requestedActions.map((action) => {
    const role = ACTION_OWNER[action];
    if (!role || !roleSet.has(role)) throw new Error(`action ${action} has no selected owner`);
    const authority = registries.authority.roles[role]?.[action];
    if (!authority) throw new Error(`authority matrix missing ${role}.${action}`);
    const allowed = authority.startsWith('allow') || authority.startsWith('gated');
    if (authority.startsWith('gated:')) approvalGates.add(authority.slice('gated:'.length));
    if (!allowed) executionBlockers.push(`${role} cannot ${action}: ${authority}`);
    return { action, role, authority, allowed };
  });
  for (const role of selectedRoles) {
    if (role.availability !== 'unavailable') continue;
    const missing = `selected role ${role.id} is unavailable (${role.implementationStatus}); its work and approval remain unsatisfied`;
    certificationReleaseBlockers.push(missing);
    const ownsRequestedExecution = request.requestedActions.some((action) => ACTION_OWNER[action] === role.id);
    if (ownsRequestedExecution) executionBlockers.push(`${missing}; requested owned action cannot execute`);
  }
  for (const selectedRole of selectedRoles) {
    const registryRole = registries.core.permanent_roles.find((role) => role.id === selectedRole.id);
    if (registryRole?.certification_status?.startsWith('pending-cristian-')) {
      certificationReleaseBlockers.push(`selected role ${selectedRole.id} certification is pending Cristian approval (${registryRole.certification_status})`);
      approvalGates.add('Cristian');
    }
  }
  if (risk.tier === 'T4') approvalGates.add('Cristian');
  if (profile.approvals.human_before_merge === true && request.requestedActions.includes('merge')) approvalGates.add('Cristian');
  if (profile.approvals.human_before_deploy === true && request.requestedActions.includes('deploy')) approvalGates.add('Cristian');
  if (certificationReleaseBlockers.length > 0 && request.requestedActions.some((action) => action === 'merge' || action === 'deploy')) {
    executionBlockers.push('merge/deploy cannot execute while certification or release blockers remain');
  }

  const provenanceVerified = findings.some((finding) => finding.certification.provenanceVerified);
  const any = findings.length > 0;
  const creationDisposition = shelfDecision
    ? (!request.capabilityCreationRequested ? `reuse-search-recorded:${shelfDecision.disposition}` : shelfDecision.disposition)
    : !request.capabilityCreationRequested ? 'reuse-search-recorded'
      : provenanceVerified ? 'reuse-required-before-creation'
        : any ? 'review-existing-candidates-before-creation'
          : 'creation-candidate-requires-future-shelf-admission';
  if (profile.reuseSearchRequired !== true) throw new Error('reuse search must be required');

  return {
    schemaVersion: '1.0.0', id: request.taskId, projectId: profile.app.id, objective: request.objective,
    outcome: request.outcome, repository: request.repository, profileDigest: digest(profile), risk,
    reuse: { searched: true, findings, creationDisposition, shelfDecision }, selectedRoles, selectedSkillPacks, selectedTools,
    acceptanceCriteria: request.acceptanceCriteria, requiredEvidence: requiredEvidenceFor(risk.tier, profile, request),
    allowedActions, approvalGates: [...approvalGates].sort(),
    executionBlocked: executionBlockers.length > 0, executionBlockers,
    certificationReleaseBlocked: certificationReleaseBlockers.length > 0, certificationReleaseBlockers,
    blocked: executionBlockers.length > 0, blockers: executionBlockers,
  };
}

export function createDecisionReceipt(profile: NormalizedAppProfile, contract: OrchestratorTaskContract, request: OrchestrationRequest): DecisionReceipt {
  const decisions = [
    { stage: 'profile', decision: 'validated', reason: `APP_PROFILE ${profile.schemaVersion} normalized for ${profile.app.id}.`, evidence: ['APP_PROFILE.yaml'] },
    { stage: 'reuse', decision: contract.reuse.creationDisposition, reason: `${contract.reuse.findings.length} matching existing assets classified before creation.`, evidence: contract.reuse.findings.flatMap((finding) => finding.evidence) },
    ...(contract.reuse.shelfDecision ? [{ stage: 'shelf-reuse', decision: contract.reuse.shelfDecision.disposition,
      reason: contract.reuse.shelfDecision.reason,
      evidence: contract.reuse.shelfDecision.selectedAssetIds.length > 0
        ? contract.reuse.shelfDecision.selectedAssetIds
        : contract.reuse.shelfDecision.noMatchEvidence }] : []),
    { stage: 'risk', decision: contract.risk.tier, reason: contract.risk.reasons.join(' '), evidence: ['docs/CORE_V2_ARCHITECTURE.md', 'docs/factory/OPERATING_SYSTEM.md'] },
    { stage: 'routing', decision: contract.selectedRoles.map((role) => `${role.id}:${role.availability}`).join(','), reason: 'Minimum roles, packs and owned tools selected from permanent registries.', evidence: ['factory/registry/core-v2.json', 'factory/registry/invocation-contracts.json', 'factory/registry/authority-matrix.json', 'skills/registry.json'] },
    { stage: 'authority', decision: contract.executionBlocked ? 'execution-blocked' : 'execution-routable', reason: contract.executionBlockers.join('; ') || 'Requested actions have available owners and are allowed or gated.', evidence: ['factory/registry/authority-matrix.json'] },
    { stage: 'certification-release', decision: contract.certificationReleaseBlocked ? 'blocked' : 'eligible-after-evidence', reason: contract.certificationReleaseBlockers.join('; ') || 'No unavailable selected role prevents certification or release.', evidence: ['factory/registry/core-v2.json', 'factory/registry/authority-matrix.json'] },
  ];
  const contractDigest = digest(contract);
  const base = { schemaVersion: '1.0.0' as const, taskId: contract.id, projectId: contract.projectId, repository: contract.repository, profileDigest: contract.profileDigest, contractDigest, decisions, createdAt: request.now };
  return { ...base, receiptId: digest(base) };
}

export async function persistDecisionReceipt(receipt: DecisionReceipt, directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `${receipt.taskId}.json`);
  const content = `${JSON.stringify(receipt, null, 2)}\n`;
  try {
    const existing = await readFile(target, 'utf8');
    if (existing === content) return target;
    throw new Error(`decision receipt already exists with different content: ${target}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return target;
}

function targetPlatforms(profile: NormalizedAppProfile, request: OrchestrationRequest): string[] {
  if (request.targetPlatforms?.length) return request.targetPlatforms;
  const frontend = profile.stack.frontend;
  const values = Array.isArray(frontend) ? frontend : frontend ? [frontend] : [];
  if (values.some((value) => /html|next|browser|web/i.test(value))) return ['browser'];
  return [profile.app.type];
}

export async function orchestrate(
  repoRoot: string,
  profileSource: string,
  request: OrchestrationRequest,
  receiptDirectory?: string,
  shelfAdmissionDependencies: ShelfCatalogVerificationDependencies = { qualityReceiptAdapters: [] },
): Promise<OrchestrationResult> {
  const registries = await loadOrchestratorRegistries(repoRoot);
  const profile = parseAndValidateAppProfile(profileSource, registries.core);
  const shelfCatalog = await loadShelfCatalog(repoRoot, shelfAdmissionDependencies);
  const catalog = await scanReuseCatalog(repoRoot, registries, shelfCatalog);
  const findings = discoverReuse(request.requestedCapabilities, catalog);
  const shelfDecision = decideShelfReuse({ capabilities: request.requestedCapabilities, targetPlatforms: targetPlatforms(profile, request),
    allowNonAdmittedAssetIds: request.allowNonAdmittedAssetIds }, shelfCatalog);
  const contract = buildTaskContract(profile, registries, request, findings, shelfDecision);
  const receipt = createDecisionReceipt(profile, contract, request);
  if (receiptDirectory) await persistDecisionReceipt(receipt, receiptDirectory);
  return { contract, receipt };
}
