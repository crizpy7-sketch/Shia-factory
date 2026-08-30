import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { RiskTier } from './operating-system.js';
import type { QualityGateReceipt } from '../quality/quality-gate.js';

export type ShelfAssetType = 'block' | 'module' | 'blueprint';
export type ShelfLifecycleState = 'candidate' | 'admitted' | 'deprecated' | 'revoked';
export type ShelfReuseDisposition = 'REUSE' | 'EXTEND' | 'CREATE';

export interface ShelfDependency {
  assetId: string;
  type: ShelfAssetType;
  versionRange: string;
}

export interface ShelfInterface {
  id: string;
  direction: 'input' | 'output' | 'bidirectional';
  schema: string;
  description: string;
}

export interface ShelfQualityReference {
  sourceType: 'factory-quality-gate';
  taskId: string;
  receiptId: string;
  candidateSha: string;
}

export interface ShelfBlueprintContract {
  appProfileDefaults: Record<string, unknown>;
  requiredRoles: Array<'shia-core' | 'boris' | 'design-director' | 'gary' | 'quality-gate'>;
  skillPacks: Array<'product' | 'design' | 'engineering' | 'ai' | 'quality' | 'growth' | 'operations'>;
  qualityPolicy: string;
  supportedStack: string[];
  integrations: string[];
  deploymentExpectations: string[];
  extensionPoints: string[];
}

export interface ShelfAssetManifest {
  schemaVersion: '1.0.0';
  assetId: string;
  type: ShelfAssetType;
  lifecycle: ShelfLifecycleState;
  version: string;
  owner: 'shia-core' | 'boris' | 'design-director' | 'gary' | 'quality-gate';
  purpose: string;
  repository: { id: string; path: string };
  capabilities: string[];
  capabilityAliases: Record<string, string[]>;
  dependencies: ShelfDependency[];
  supportedPlatforms: string[];
  interfaces: ShelfInterface[];
  blueprint: ShelfBlueprintContract | null;
  compatibility: { factoryCore: string; runtimes: string[]; notes: string[] };
  provenance: { sourceType: 'repository'; sourcePath: string; evidence: string[] };
  exactSource: { repository: string; candidateSha: string; version: string };
  qualityGate: { receipt: ShelfQualityReference | null; admissionEvidenceState: 'missing' | 'verified' };
  security: { riskTier: RiskTier; dataSensitivity: 'public' | 'internal' | 'private' | 'regulated'; reviewState: string };
  documentation: string[];
  examples: string[];
  tests: string[];
  knownLimitations: string[];
  maintenance: { status: 'active' | 'maintenance' | 'unsupported'; maintainer: string; lastReviewedAt: string | null };
  deprecation: { replacementAssetId: string | null; reason: string | null; effectiveAt: string | null };
}

export interface TrustedQualityReceiptRecord {
  referenceId: string;
  receipt: QualityGateReceipt;
  collector: string;
  observedAt: string;
  integrityDigest: string;
}

export interface ShelfQualityReceiptAdapter {
  id: string;
  sourceTypes: ShelfQualityReference['sourceType'][];
  verify(reference: ShelfQualityReference, manifest: ShelfAssetManifest): QualityGateReceipt | null;
}

export interface ShelfSourceObject {
  path: string;
  objectId: string;
  objectType: 'blob' | 'tree';
}

export interface ShelfSourceVerification {
  verifierId: string;
  repository: string;
  candidateSha: string;
  assetId: string;
  objects: ShelfSourceObject[];
  verifiedAt: string;
  integrityDigest: string;
}

export interface ShelfSourceVerifier {
  id: string;
  verify(manifest: ShelfAssetManifest): ShelfSourceVerification | null;
}

export interface ShelfAdmissionDependencies {
  qualityReceiptAdapters: ShelfQualityReceiptAdapter[];
  sourceVerifier: ShelfSourceVerifier;
  catalog: LoadedShelfAsset[];
}

export interface ShelfCatalogVerificationDependencies {
  qualityReceiptAdapters: ShelfQualityReceiptAdapter[];
  sourceVerifier?: ShelfSourceVerifier;
}

export interface ShelfAdmissionResult {
  state: 'admitted' | 'needs-evidence' | 'rejected';
  manifest: ShelfAssetManifest;
  qualityReceipt: QualityGateReceipt | null;
  sourceVerification: ShelfSourceVerification | null;
  dependencyVerification: ShelfDependencyVerification[];
  findings: string[];
}

export interface ShelfDependencyVerification {
  assetId: string;
  declaredType: ShelfAssetType;
  declaredVersionRange: string;
  resolvedType: ShelfAssetType | null;
  resolvedVersion: string | null;
  admissionState: 'admitted' | 'not-admitted' | 'deprecated' | 'revoked' | 'missing';
  satisfied: boolean;
  findings: string[];
}

export interface AdmittedShelfAsset extends ShelfAssetManifest {
  lifecycle: 'admitted';
  qualityGate: { receipt: ShelfQualityReference; admissionEvidenceState: 'verified' };
}

export interface LoadedShelfAsset {
  manifest: ShelfAssetManifest;
  admitted: AdmittedShelfAsset | null;
  admission: ShelfAdmissionResult | null;
}

export interface ShelfCapabilityNeed {
  capabilities: string[];
  targetPlatforms: string[];
  requiredInterfaces?: string[];
  allowNonAdmittedAssetIds?: string[];
}

export interface ShelfCompatibilityResult {
  assetId: string;
  lifecycle: ShelfLifecycleState;
  provenanceState: 'manifest-validated';
  admissionState: 'admitted' | 'not-admitted' | 'deprecated' | 'revoked';
  compatible: boolean;
  exactCapabilityMatch: boolean;
  matchedCapabilities: string[];
  fuzzyMatchedCapabilities: string[];
  missingCapabilities: string[];
  reasons: string[];
}

export interface ShelfReuseDecision {
  schemaVersion: '1.0.0';
  disposition: ShelfReuseDisposition;
  normalizedNeed: { capabilities: string[]; targetPlatforms: string[]; requiredInterfaces: string[] };
  selectedAssetIds: string[];
  evaluated: ShelfCompatibilityResult[];
  noMatchEvidence: string[];
  nonAdmittedUse: { permitted: boolean; assetIds: string[] };
  reason: string;
}

export interface FactoryTrustManifest {
  schemaVersion: '1.0.0';
  documentType: 'shia-factory-trust-manifest';
  identity: { assetId: string; type: ShelfAssetType | 'application'; version: string };
  trustState: ShelfLifecycleState;
  maintainer: string;
  provenance: { repository: string; sourceCandidate: string; sourceVersion: string; sourceVerificationDigest: string; evidenceReferences: string[] };
  quality: { receiptReferences: string[]; lastVerifiedAt: string | null; state: 'verified-factory-evidence' | 'needs-evidence' };
  security: { riskTier: RiskTier; reviewState: string };
  supported: { platforms: string[]; interfaces: string[]; factoryCore: string };
  maintenance: ShelfAssetManifest['maintenance'];
  knownLimitations: string[];
  deprecation: ShelfAssetManifest['deprecation'];
  claims: { independentCertification: false; aiApproved: false; sourceCodeIncluded: false };
}

const SHA = /^[0-9a-f]{40,64}$/i;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const ASSET_ID = /^(block|module|blueprint):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ROLE_IDS = new Set(['shia-core', 'boris', 'design-director', 'gary', 'quality-gate']);
const PACK_IDS = new Set(['product', 'design', 'engineering', 'ai', 'quality', 'growth', 'operations']);
const TYPE_RANK: Record<ShelfAssetType, number> = { block: 1, module: 2, blueprint: 3 };
const RISK_RANK: Record<RiskTier, number> = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };
const admittedAssets = new WeakSet<object>();
const admittedProofs = new WeakMap<object, { source: ShelfSourceVerification; dependencies: ShelfDependencyVerification[] }>();
const trustedSourceVerifiers = new WeakSet<object>();

function isObject(value: unknown): value is Record<string, unknown> {
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

function canonicalCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function tokens(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1))];
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function canonicalCapability(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-');
}

function repositoryRelativePath(value: string): boolean {
  if (!value || value.includes('\0') || value.includes('\\') || path.posix.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && normalized !== '.' && normalized !== '..' && !normalized.startsWith('../');
}

export function shelfManifestSourcePaths(manifest: ShelfAssetManifest): string[] {
  const values: unknown[] = [manifest.repository?.path, manifest.provenance?.sourcePath,
    ...(Array.isArray(manifest.documentation) ? manifest.documentation : []),
    ...(Array.isArray(manifest.examples) ? manifest.examples : []),
    ...(Array.isArray(manifest.tests) ? manifest.tests : []),
    ...(Array.isArray(manifest.provenance?.evidence) ? manifest.provenance.evidence : [])];
  return unique(values.filter((item): item is string => typeof item === 'string' && item !== '')).sort();
}

interface ParsedSemver { major: number; minor: number; patch: number; prerelease: string | null }

function parseSemver(value: string): ParsedSemver | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ?? null };
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  for (const key of ['major', 'minor', 'patch'] as const) if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  const leftParts = left.prerelease.split('.'); const rightParts = right.prerelease.split('.');
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index]; const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart); const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function comparatorSatisfied(version: ParsedSemver, comparator: string): boolean {
  const match = /^(<=|>=|<|>|=)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(comparator);
  if (!match) return false;
  const target = parseSemver(match[2] ?? '');
  if (!target) return false;
  const compared = compareSemver(version, target);
  switch (match[1] ?? '=') {
    case '<': return compared < 0;
    case '<=': return compared <= 0;
    case '>': return compared > 0;
    case '>=': return compared >= 0;
    default: return compared === 0;
  }
}

function rangeBranchValid(branch: string): boolean {
  if (branch === '*' || /^\d+\.(?:x|\*)$/i.test(branch) || /^\d+\.\d+\.(?:x|\*)$/i.test(branch)) return true;
  if (/^[\^~]\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(branch)) return true;
  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(branch)) return true;
  const hyphen = /^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s+-\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(branch);
  if (hyphen) return Boolean(parseSemver(hyphen[1] ?? '') && parseSemver(hyphen[2] ?? ''));
  const comparators = branch.split(/\s+/).filter(Boolean);
  return comparators.length > 0 && comparators.every((item) => /^(?:<=|>=|<|>|=)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(item));
}

export function validVersionRange(range: string): boolean {
  const branches = range.trim().split(/\s*\|\|\s*/);
  return branches.length > 0 && branches.every((branch) => branch !== '' && rangeBranchValid(branch));
}

function satisfiesRangeBranch(version: ParsedSemver, branch: string): boolean {
  if (branch === '*') return true;
  const majorWildcard = /^(\d+)\.(?:x|\*)$/i.exec(branch);
  if (majorWildcard) return version.major === Number(majorWildcard[1]);
  const minorWildcard = /^(\d+)\.(\d+)\.(?:x|\*)$/i.exec(branch);
  if (minorWildcard) return version.major === Number(minorWildcard[1]) && version.minor === Number(minorWildcard[2]);
  const caret = /^\^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(branch);
  if (caret) {
    const lower = parseSemver(caret[1] ?? '');
    if (!lower || compareSemver(version, lower) < 0) return false;
    const upper: ParsedSemver = lower.major > 0 ? { major: lower.major + 1, minor: 0, patch: 0, prerelease: null }
      : lower.minor > 0 ? { major: 0, minor: lower.minor + 1, patch: 0, prerelease: null }
        : { major: 0, minor: 0, patch: lower.patch + 1, prerelease: null };
    return compareSemver(version, upper) < 0;
  }
  const tilde = /^~(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(branch);
  if (tilde) {
    const lower = parseSemver(tilde[1] ?? '');
    return Boolean(lower && compareSemver(version, lower) >= 0
      && compareSemver(version, { major: lower.major, minor: lower.minor + 1, patch: 0, prerelease: null }) < 0);
  }
  const hyphen = /^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s+-\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(branch);
  if (hyphen) {
    const lower = parseSemver(hyphen[1] ?? ''); const upper = parseSemver(hyphen[2] ?? '');
    return Boolean(lower && upper && compareSemver(version, lower) >= 0 && compareSemver(version, upper) <= 0);
  }
  return branch.split(/\s+/).filter(Boolean).every((item) => comparatorSatisfied(version, item));
}

export function versionSatisfiesRange(version: string, range: string): boolean {
  const parsed = parseSemver(version);
  return Boolean(parsed && validVersionRange(range) && range.trim().split(/\s*\|\|\s*/).some((branch) => satisfiesRangeBranch(parsed, branch)));
}

export function sourceVerificationDigest(verification: Omit<ShelfSourceVerification, 'integrityDigest'>): string {
  return digest(verification);
}

export function createGitTreeSourceVerifier(repoRoot: string, now: () => string = () => new Date().toISOString()): ShelfSourceVerifier {
  const root = path.resolve(repoRoot);
  const git = (args: string[]): string => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH ?? '', LANG: 'C' }, timeout: 10_000,
  }).trim();
  const verifier: ShelfSourceVerifier = {
    id: 'git-tree-exact-source-v1',
    verify(manifest) {
      if (!manifest.exactSource || !manifest.repository) return null;
      if (manifest.repository.id !== manifest.exactSource.repository) return null;
      if (!SHA.test(manifest.exactSource.candidateSha)) return null;
      const requiredPaths = shelfManifestSourcePaths(manifest);
      if (requiredPaths.length === 0 || requiredPaths.some((item) => !repositoryRelativePath(item))) return null;
      try {
        const candidateSha = git(['rev-parse', '--verify', `${manifest.exactSource.candidateSha}^{commit}`]).toLowerCase();
        if (candidateSha !== manifest.exactSource.candidateSha.toLowerCase()) return null;
        const objects = requiredPaths.map((relative): ShelfSourceObject => {
          const objectId = git(['rev-parse', `${candidateSha}:${relative}`]).toLowerCase();
          const objectType = git(['cat-file', '-t', objectId]);
          if (objectType !== 'blob' && objectType !== 'tree') throw new Error(`unsupported source object ${objectType}`);
          return { path: relative, objectId, objectType };
        });
        const base = { verifierId: verifier.id, repository: manifest.exactSource.repository, candidateSha,
          assetId: manifest.assetId, objects, verifiedAt: now() };
        return deepFreeze({ ...base, integrityDigest: sourceVerificationDigest(base) });
      } catch { return null; }
    },
  };
  trustedSourceVerifiers.add(verifier);
  return verifier;
}

function secretLike(value: unknown, location = '$'): string[] {
  const findings: string[] = [];
  if (typeof value === 'string') {
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{12,}|\b(?:api[_-]?key|password|secret|bearer)\s*[:=]\s*[^\s,}]{6,}/i.test(value)) {
      findings.push(`${location} contains credential-shaped content`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...secretLike(item, `${location}[${index}]`)));
  } else if (isObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (/^(?:password|secret|token|api[_-]?key|private[_-]?key)$/i.test(key)) findings.push(`${location}.${key} is a forbidden secret-bearing field`);
      findings.push(...secretLike(nested, `${location}.${key}`));
    }
  }
  return findings;
}

function requiredString(value: unknown, location: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${location} must be a non-empty string`);
}

function requiredStrings(value: unknown, location: string, errors: string[], allowEmpty = false): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '') || (!allowEmpty && value.length === 0)) {
    errors.push(`${location} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings`);
  }
}

export function validateShelfManifest(manifest: ShelfAssetManifest): string[] {
  const errors: string[] = [];
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
  const dependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
  if (manifest.schemaVersion !== '1.0.0') errors.push('schemaVersion must be 1.0.0');
  if (!ASSET_ID.test(manifest.assetId)) errors.push('assetId must be stable and type-prefixed');
  if (!['block', 'module', 'blueprint'].includes(manifest.type)) errors.push('type must be block, module or blueprint');
  if (!manifest.assetId.startsWith(`${manifest.type}:`)) errors.push('assetId prefix must match type');
  if (!['candidate', 'admitted', 'deprecated', 'revoked'].includes(manifest.lifecycle)) errors.push('lifecycle is unsupported');
  if (!SEMVER.test(manifest.version)) errors.push('version must be semantic version');
  if (!ROLE_IDS.has(manifest.owner)) errors.push('owner must be one of the five permanent roles');
  requiredString(manifest.purpose, 'purpose', errors);
  requiredString(manifest.repository?.id, 'repository.id', errors);
  requiredString(manifest.repository?.path, 'repository.path', errors);
  if (!manifest.repository?.path?.startsWith(`${manifest.type}s/`)) errors.push('repository.path must live in its canonical Shelf layer');
  if (manifest.repository?.id !== manifest.exactSource?.repository) errors.push('repository.id must match exactSource.repository');
  requiredStrings(manifest.capabilities, 'capabilities', errors);
  if (capabilities.some((item) => typeof item === 'string' && canonicalCapability(item) !== item)) errors.push('capabilities must use canonical lowercase kebab-case IDs');
  if (!isObject(manifest.capabilityAliases)) errors.push('capabilityAliases must be an object keyed by canonical capability ID');
  else {
    for (const [capability, aliases] of Object.entries(manifest.capabilityAliases)) {
      if (!capabilities.includes(capability)) errors.push(`capabilityAliases key ${capability} must name a declared canonical capability`);
      requiredStrings(aliases, `capabilityAliases.${capability}`, errors, true);
      if (Array.isArray(aliases) && aliases.some((alias) => canonicalCapability(alias) === capability)) {
        errors.push(`capabilityAliases.${capability} must not repeat its canonical capability ID`);
      }
    }
  }
  requiredStrings(manifest.supportedPlatforms, 'supportedPlatforms', errors);
  if (!Array.isArray(manifest.dependencies)) errors.push('dependencies must be an array');
  else for (const dependency of dependencies) {
    if (!ASSET_ID.test(dependency.assetId)) errors.push(`dependency ${dependency.assetId} must use a stable Shelf asset ID`);
    if (!validVersionRange(dependency.versionRange)) errors.push(`dependency ${dependency.assetId} has invalid versionRange ${dependency.versionRange}`);
  }
  if (manifest.type === 'block' && dependencies.length > 0) errors.push('Blocks may not depend on Shelf assets');
  if (!Array.isArray(manifest.interfaces)) errors.push('interfaces must be an array');
  if (manifest.type === 'blueprint') {
    if (!manifest.blueprint) errors.push('Blueprint assets require APP_PROFILE defaults, roles, packs, quality, stack, deployment and extension metadata');
    else {
      if (!isObject(manifest.blueprint.appProfileDefaults)) errors.push('blueprint.appProfileDefaults must be an object');
      if (manifest.blueprint.requiredRoles.some((item) => !ROLE_IDS.has(item))) errors.push('blueprint.requiredRoles contains an unknown permanent role');
      if (manifest.blueprint.skillPacks.some((item) => !PACK_IDS.has(item))) errors.push('blueprint.skillPacks contains an unknown canonical pack');
      requiredString(manifest.blueprint.qualityPolicy, 'blueprint.qualityPolicy', errors);
      requiredStrings(manifest.blueprint.supportedStack, 'blueprint.supportedStack', errors);
      requiredStrings(manifest.blueprint.deploymentExpectations, 'blueprint.deploymentExpectations', errors);
      requiredStrings(manifest.blueprint.extensionPoints, 'blueprint.extensionPoints', errors);
      requiredStrings(manifest.blueprint.integrations, 'blueprint.integrations', errors, true);
    }
  } else if (manifest.blueprint !== null) errors.push('Only Blueprint assets may define blueprint metadata');
  if (!SHA.test(manifest.exactSource?.candidateSha ?? '')) errors.push('exactSource.candidateSha must be an exact Git SHA');
  if (manifest.exactSource?.version !== manifest.version) errors.push('exactSource.version must match version');
  requiredString(manifest.exactSource?.repository, 'exactSource.repository', errors);
  if (manifest.provenance?.sourceType !== 'repository') errors.push('provenance.sourceType must be repository');
  requiredString(manifest.provenance?.sourcePath, 'provenance.sourcePath', errors);
  requiredStrings(manifest.provenance?.evidence, 'provenance.evidence', errors);
  for (const sourcePath of shelfManifestSourcePaths(manifest)) if (!repositoryRelativePath(sourcePath)) {
    errors.push(`source path must remain inside the repository: ${sourcePath}`);
  }
  requiredStrings(manifest.documentation, 'documentation', errors, manifest.lifecycle === 'candidate');
  requiredStrings(manifest.examples, 'examples', errors, manifest.lifecycle === 'candidate');
  requiredStrings(manifest.tests, 'tests', errors, manifest.lifecycle === 'candidate');
  if (!Array.isArray(manifest.knownLimitations)) errors.push('knownLimitations must be an array');
  if (!['T0', 'T1', 'T2', 'T3', 'T4'].includes(manifest.security?.riskTier)) errors.push('security.riskTier is unsupported');
  requiredString(manifest.security?.reviewState, 'security.reviewState', errors);
  requiredString(manifest.maintenance?.maintainer, 'maintenance.maintainer', errors);
  if (manifest.lifecycle === 'admitted' && (!manifest.qualityGate?.receipt || manifest.qualityGate.admissionEvidenceState !== 'verified')) {
    errors.push('admitted assets require a verified Quality Gate receipt reference');
  }
  if (manifest.lifecycle === 'admitted' && manifest.type === 'module' && dependencies.length < 2) {
    errors.push('admitted Modules must combine at least two Blocks');
  }
  if ((manifest.lifecycle === 'deprecated' || manifest.lifecycle === 'revoked') && !manifest.deprecation?.reason) {
    errors.push(`${manifest.lifecycle} assets require a deprecation/revocation reason`);
  }
  errors.push(...secretLike(manifest));
  return unique(errors);
}

export function qualityReceiptDigest(receipt: QualityGateReceipt): string {
  const { receiptId: _receiptId, ...base } = receipt;
  return digest(base);
}

export function shelfAdmissionTaskId(manifest: Pick<ShelfAssetManifest, 'assetId' | 'version'>): string {
  return `SHELF-ADMISSION-${manifest.assetId.replace(':', '-')}-${manifest.version}`;
}

export function trustedShelfReceiptRecordDigest(record: Omit<TrustedQualityReceiptRecord, 'integrityDigest'>): string {
  return digest(record);
}

export function createTrustedQualityReceiptAdapter(
  id: string,
  resolve: (referenceId: string) => TrustedQualityReceiptRecord | null,
): ShelfQualityReceiptAdapter {
  return {
    id,
    sourceTypes: ['factory-quality-gate'],
    verify(reference, manifest) {
      const record = resolve(reference.receiptId);
      if (!record || record.referenceId !== reference.receiptId || record.receipt.receiptId !== reference.receiptId) return null;
      if (!/^[0-9a-f]{64}$/i.test(record.integrityDigest)) return null;
      const { integrityDigest, ...recordInput } = record;
      if (trustedShelfReceiptRecordDigest(recordInput) !== integrityDigest.toLowerCase()) return null;
      const receipt = record.receipt;
      if (qualityReceiptDigest(receipt) !== receipt.receiptId.toLowerCase()) return null;
      if (!record.collector.trim() || Number.isNaN(Date.parse(record.observedAt))) return null;
      if (reference.taskId !== shelfAdmissionTaskId(manifest)) return null;
      if (receipt.finalState !== 'pass' || receipt.taskId !== reference.taskId || receipt.candidateSha !== reference.candidateSha
        || receipt.candidateSha !== manifest.exactSource.candidateSha || receipt.repository !== manifest.exactSource.repository) return null;
      if (RISK_RANK[receipt.riskTier] < RISK_RANK[manifest.security.riskTier]) return null;
      if (receipt.staleEvidence.length > 0 || receipt.unverifiedEvidence.length > 0 || receipt.unverifiedApprovals.length > 0) return null;
      if (receipt.actualEvidence.length === 0 || receipt.actualEvidence.some((item) => item.candidateSha !== receipt.candidateSha
        || item.provenance.verificationState !== 'verified')) return null;
      if (receipt.criterionResults.some((item) => item.state !== 'pass')) return null;
      if (receipt.gateResults.some((item) => item.applicable && item.state !== 'pass')) return null;
      if (receipt.approvalGates.some((item) => item.state !== 'satisfied')) return null;
      if (receipt.controlPlane.authority !== 'shia-core' || receipt.controlPlane.qualityGateMayAcceptTask
        || receipt.controlPlane.gstackMayAcceptTask || receipt.controlPlane.qualityEvidenceGrantsActionAuthority) return null;
      return canonicalCopy(receipt);
    },
  };
}

function verifyExactSource(manifest: ShelfAssetManifest, verifier: ShelfSourceVerifier): { verification: ShelfSourceVerification | null; findings: string[] } {
  if (!trustedSourceVerifiers.has(verifier)) return { verification: null, findings: ['Exact-source verifier is not a trusted Factory repository adapter.'] };
  const verification = verifier.verify(manifest);
  if (!verification) return { verification: null, findings: ['Exact-source Git-tree verification failed for one or more declared asset/provenance/documentation/example/test paths.'] };
  const { integrityDigest, ...base } = verification;
  const expectedPaths = shelfManifestSourcePaths(manifest);
  const actualPaths = verification.objects.map((item) => item.path).sort();
  const findings: string[] = [];
  if (sourceVerificationDigest(base) !== integrityDigest.toLowerCase()) findings.push('Exact-source verification integrity digest is invalid.');
  if (verification.verifierId !== verifier.id || verification.assetId !== manifest.assetId
    || verification.repository !== manifest.exactSource.repository
    || verification.candidateSha !== manifest.exactSource.candidateSha.toLowerCase()) findings.push('Exact-source verification is not bound to this asset/repository/candidate.');
  if (stable(actualPaths) !== stable(expectedPaths)) findings.push('Exact-source verification does not cover every required declared path.');
  if (verification.objects.some((item) => !repositoryRelativePath(item.path) || !SHA.test(item.objectId)
    || !['blob', 'tree'].includes(item.objectType))) findings.push('Exact-source verification contains an invalid repository object.');
  return { verification: findings.length === 0 ? verification : null, findings };
}

function dependencyAdmissionState(item: LoadedShelfAsset | undefined): ShelfDependencyVerification['admissionState'] {
  if (!item) return 'missing';
  if (item.manifest.lifecycle === 'deprecated') return 'deprecated';
  if (item.manifest.lifecycle === 'revoked') return 'revoked';
  return item.admitted && isAdmittedShelfAsset(item.admitted) ? 'admitted' : 'not-admitted';
}

function verifyAdmissionDependencies(manifest: ShelfAssetManifest, catalog: LoadedShelfAsset[]): { results: ShelfDependencyVerification[]; findings: string[] } {
  const byId = new Map(catalog.map((item) => [item.manifest.assetId, item]));
  const graph = [...catalog.filter((item) => item.manifest.assetId !== manifest.assetId).map((item) => item.manifest), manifest];
  const findings = validateShelfDependencyGraph(graph);
  const results = (Array.isArray(manifest.dependencies) ? manifest.dependencies : []).map((dependency): ShelfDependencyVerification => {
    const item = byId.get(dependency.assetId);
    const state = dependencyAdmissionState(item);
    const local: string[] = [];
    if (!item) local.push(`Dependency ${dependency.assetId} is missing from the Shelf catalog.`);
    else {
      if (item.manifest.type !== dependency.type) local.push(`Dependency ${dependency.assetId} type ${item.manifest.type} does not match declared ${dependency.type}.`);
      if (TYPE_RANK[item.manifest.type] >= TYPE_RANK[manifest.type]) local.push(`Dependency ${dependency.assetId} is not from a more primitive layer.`);
      if (!validVersionRange(dependency.versionRange)) local.push(`Dependency ${dependency.assetId} has invalid versionRange ${dependency.versionRange}.`);
      else if (!versionSatisfiesRange(item.manifest.version, dependency.versionRange)) {
        local.push(`Dependency ${dependency.assetId} version ${item.manifest.version} does not satisfy ${dependency.versionRange}.`);
      }
      if (state === 'deprecated' || state === 'revoked') local.push(`Dependency ${dependency.assetId} is ${state}.`);
      else if (state !== 'admitted') local.push(`Dependency ${dependency.assetId} is not admitted through the trusted Shelf boundary.`);
    }
    return { assetId: dependency.assetId, declaredType: dependency.type, declaredVersionRange: dependency.versionRange,
      resolvedType: item?.manifest.type ?? null, resolvedVersion: item?.manifest.version ?? null,
      admissionState: state, satisfied: local.length === 0, findings: local };
  });
  findings.push(...results.flatMap((item) => item.findings));
  return { results, findings: unique(findings) };
}

function verifyAdmission(manifest: ShelfAssetManifest, dependencies: ShelfAdmissionDependencies): ShelfAdmissionResult {
  const findings = validateShelfManifest(manifest).filter((item) => item !== 'admitted assets require a verified Quality Gate receipt reference');
  const source = verifyExactSource(manifest, dependencies.sourceVerifier);
  findings.push(...source.findings);
  const dependencyResult = verifyAdmissionDependencies(manifest, dependencies.catalog);
  findings.push(...dependencyResult.findings);
  const reference = manifest.qualityGate.receipt;
  if (!reference) findings.push('No Quality Gate receipt reference is present.');
  const adapter = reference
    ? dependencies.qualityReceiptAdapters.find((candidate) => candidate.sourceTypes.includes(reference.sourceType))
    : undefined;
  const receipt = reference && adapter ? adapter.verify(reference, manifest) : null;
  if (reference && !adapter) findings.push(`No authorized adapter accepts ${reference.sourceType}.`);
  if (reference && adapter && !receipt) findings.push(`Adapter ${adapter.id} could not verify a passing exact-candidate Quality Gate receipt.`);
  if (receipt && reference && reference.receiptId !== receipt.receiptId) findings.push('Resolved Quality Gate receipt ID does not match the manifest reference.');
  if (findings.length > 0) {
    return { state: findings.some((item) => /secret|credential|forbidden|unsupported|must|match type|canonical Shelf layer|outside|invalid versionRange|circular|more primitive|missing from/.test(item)) ? 'rejected' : 'needs-evidence',
      manifest, qualityReceipt: receipt, sourceVerification: source.verification,
      dependencyVerification: dependencyResult.results, findings: unique(findings) };
  }
  return { state: 'admitted', manifest, qualityReceipt: receipt, sourceVerification: source.verification,
    dependencyVerification: dependencyResult.results, findings: [] };
}

export function admitShelfCandidate(candidate: ShelfAssetManifest, dependencies: ShelfAdmissionDependencies): ShelfAdmissionResult & { admittedAsset?: AdmittedShelfAsset } {
  if (candidate.lifecycle !== 'candidate') {
    return { state: 'rejected', manifest: candidate, qualityReceipt: null, sourceVerification: null,
      dependencyVerification: [], findings: ['Only a candidate asset may enter the admission transition.'] };
  }
  const promoted = canonicalCopy({ ...candidate, lifecycle: 'admitted', qualityGate: { ...candidate.qualityGate, admissionEvidenceState: 'verified' } }) as ShelfAssetManifest;
  const result = verifyAdmission(promoted, dependencies);
  if (result.state !== 'admitted' || !promoted.qualityGate.receipt || !result.sourceVerification) return { ...result, manifest: candidate };
  const admitted = deepFreeze(promoted as AdmittedShelfAsset);
  admittedAssets.add(admitted);
  admittedProofs.set(admitted, { source: result.sourceVerification, dependencies: result.dependencyVerification });
  return { ...result, manifest: admitted, admittedAsset: admitted };
}

export function verifyAdmittedShelfAsset(manifest: ShelfAssetManifest, dependencies: ShelfAdmissionDependencies): ShelfAdmissionResult & { admittedAsset?: AdmittedShelfAsset } {
  if (manifest.lifecycle !== 'admitted') return { state: 'rejected', manifest, qualityReceipt: null, sourceVerification: null,
    dependencyVerification: [], findings: ['Only a stored admitted asset may use the admitted verifier.'] };
  const result = verifyAdmission(manifest, dependencies);
  if (result.state !== 'admitted' || !manifest.qualityGate.receipt || !result.sourceVerification) return result;
  const admitted = deepFreeze(canonicalCopy(manifest) as AdmittedShelfAsset);
  admittedAssets.add(admitted);
  admittedProofs.set(admitted, { source: result.sourceVerification, dependencies: result.dependencyVerification });
  return { ...result, manifest: admitted, admittedAsset: admitted };
}

export function isAdmittedShelfAsset(value: object): value is AdmittedShelfAsset {
  return admittedAssets.has(value) && admittedProofs.has(value);
}

export function validateShelfDependencyGraph(manifests: ShelfAssetManifest[]): string[] {
  const errors: string[] = [];
  const byId = new Map<string, ShelfAssetManifest>();
  for (const manifest of manifests) {
    if (byId.has(manifest.assetId)) errors.push(`duplicate asset ID ${manifest.assetId}`);
    byId.set(manifest.assetId, manifest);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (assetId: string, trail: string[]): void => {
    if (visiting.has(assetId)) {
      const start = trail.indexOf(assetId);
      errors.push(`circular dependency: ${[...trail.slice(Math.max(0, start)), assetId].join(' -> ')}`);
      return;
    }
    if (visited.has(assetId)) return;
    visiting.add(assetId);
    const manifest = byId.get(assetId);
    for (const dependency of manifest?.dependencies ?? []) if (byId.has(dependency.assetId)) visit(dependency.assetId, [...trail, assetId]);
    visiting.delete(assetId);
    visited.add(assetId);
  };
  for (const assetId of byId.keys()) visit(assetId, []);

  for (const manifest of manifests) {
    const dependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
    if (manifest.type === 'block' && dependencies.length > 0) errors.push(`${manifest.assetId} is a Block and may not depend on Shelf assets`);
    for (const dependency of dependencies) {
      const target = byId.get(dependency.assetId);
      if (!target) { errors.push(`${manifest.assetId} depends on missing Shelf asset ${dependency.assetId}`); continue; }
      if (target.type !== dependency.type) errors.push(`${manifest.assetId} dependency ${dependency.assetId} type does not match its manifest`);
      if (TYPE_RANK[target.type] >= TYPE_RANK[manifest.type]) {
        errors.push(`${manifest.assetId} may depend only on a more primitive Shelf layer; ${target.type} is not below ${manifest.type}`);
      }
      if (!validVersionRange(dependency.versionRange)) errors.push(`${manifest.assetId} dependency ${dependency.assetId} has invalid versionRange ${dependency.versionRange}`);
      else if (!versionSatisfiesRange(target.version, dependency.versionRange)) {
        errors.push(`${manifest.assetId} dependency ${dependency.assetId} version ${target.version} does not satisfy ${dependency.versionRange}`);
      }
    }
  }
  return unique(errors);
}

export async function loadShelfCatalog(repoRoot: string, dependencies: ShelfCatalogVerificationDependencies = { qualityReceiptAdapters: [] }): Promise<LoadedShelfAsset[]> {
  const catalogPath = path.join(repoRoot, 'factory/shelf/catalog.json');
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as { manifests: string[] };
  const loaded: LoadedShelfAsset[] = [];
  for (const relative of catalog.manifests) {
    const absolute = path.resolve(repoRoot, relative);
    const root = path.resolve(repoRoot);
    const within = path.relative(root, absolute);
    if (within.startsWith('..') || path.isAbsolute(within)) throw new Error(`Shelf manifest escapes repository: ${relative}`);
    const manifest = JSON.parse(await readFile(absolute, 'utf8')) as ShelfAssetManifest;
    const validation = validateShelfManifest(manifest);
    if (validation.length > 0) throw new Error(`Invalid Shelf manifest ${relative}: ${validation.join('; ')}`);
    loaded.push({ manifest, admitted: null, admission: null });
  }
  const graphErrors = validateShelfDependencyGraph(loaded.map((item) => item.manifest));
  if (graphErrors.length > 0) throw new Error(`Invalid Shelf dependency graph: ${graphErrors.join('; ')}`);
  for (const item of [...loaded].sort((left, right) => TYPE_RANK[left.manifest.type] - TYPE_RANK[right.manifest.type])) {
    if (item.manifest.lifecycle !== 'admitted') continue;
    if (!dependencies.sourceVerifier) {
      item.admission = { state: 'needs-evidence', manifest: item.manifest, qualityReceipt: null, sourceVerification: null,
        dependencyVerification: [], findings: ['Stored admitted assets require a trusted exact-source verifier before they can be reused.'] };
      continue;
    }
    const result = verifyAdmittedShelfAsset(item.manifest, { qualityReceiptAdapters: dependencies.qualityReceiptAdapters,
      sourceVerifier: dependencies.sourceVerifier, catalog: loaded });
    item.admission = result;
    item.admitted = result.admittedAsset ?? null;
  }
  return loaded.sort((left, right) => left.manifest.assetId.localeCompare(right.manifest.assetId));
}

function compatibility(need: ShelfCapabilityNeed, item: LoadedShelfAsset): ShelfCompatibilityResult {
  const manifest = item.manifest;
  const explicitCapabilities = new Map<string, string>();
  for (const capability of manifest.capabilities) {
    explicitCapabilities.set(canonicalCapability(capability), capability);
    for (const alias of manifest.capabilityAliases[capability] ?? []) explicitCapabilities.set(canonicalCapability(alias), capability);
  }
  const matchedCapabilities = need.capabilities.filter((capability) => explicitCapabilities.has(canonicalCapability(capability)));
  const missingCapabilities = need.capabilities.filter((capability) => !matchedCapabilities.includes(capability));
  const capabilityTokens = new Set([...manifest.capabilities, ...Object.values(manifest.capabilityAliases).flat()].flatMap(tokens));
  const fuzzyMatchedCapabilities = missingCapabilities.filter((capability) => tokens(capability).some((token) => capabilityTokens.has(token)));
  const platforms = new Set(manifest.supportedPlatforms.map((item) => item.toLowerCase()));
  const missingPlatforms = need.targetPlatforms.filter((item) => !platforms.has('any') && !platforms.has(item.toLowerCase()));
  const interfaceIds = new Set(manifest.interfaces.map((item) => item.id));
  const missingInterfaces = (need.requiredInterfaces ?? []).filter((item) => !interfaceIds.has(item));
  const reasons: string[] = [];
  if (matchedCapabilities.length === 0 && fuzzyMatchedCapabilities.length === 0) reasons.push('No canonical capability, explicit alias or fuzzy discovery tokens matched.');
  if (fuzzyMatchedCapabilities.length > 0) reasons.push(`Fuzzy discovery similarity only: ${fuzzyMatchedCapabilities.join(', ')}; this cannot establish exact REUSE.`);
  if (missingPlatforms.length > 0) reasons.push(`Unsupported platforms: ${missingPlatforms.join(', ')}.`);
  if (missingInterfaces.length > 0) reasons.push(`Missing interfaces: ${missingInterfaces.join(', ')}.`);
  if (manifest.lifecycle === 'deprecated') reasons.push('Asset is deprecated and cannot satisfy normal reuse.');
  if (manifest.lifecycle === 'revoked') reasons.push('Asset is revoked and cannot satisfy normal reuse.');
  const admissionState = item.admitted && isAdmittedShelfAsset(item.admitted) ? 'admitted'
    : manifest.lifecycle === 'deprecated' ? 'deprecated'
      : manifest.lifecycle === 'revoked' ? 'revoked' : 'not-admitted';
  if (admissionState === 'not-admitted') reasons.push('Asset is not admitted; existence or a manifest alone is not certification.');
  return {
    assetId: manifest.assetId, lifecycle: manifest.lifecycle, provenanceState: 'manifest-validated', admissionState,
    compatible: (matchedCapabilities.length > 0 || fuzzyMatchedCapabilities.length > 0) && missingPlatforms.length === 0 && missingInterfaces.length === 0,
    exactCapabilityMatch: need.capabilities.length > 0 && missingCapabilities.length === 0,
    matchedCapabilities, fuzzyMatchedCapabilities, missingCapabilities, reasons,
  };
}

export function decideShelfReuse(need: ShelfCapabilityNeed, catalog: LoadedShelfAsset[]): ShelfReuseDecision {
  const normalizedNeed = {
    capabilities: unique(need.capabilities.map((item) => item.trim()).filter(Boolean)).sort(),
    targetPlatforms: unique(need.targetPlatforms.map((item) => item.trim().toLowerCase()).filter(Boolean)).sort(),
    requiredInterfaces: unique((need.requiredInterfaces ?? []).map((item) => item.trim()).filter(Boolean)).sort(),
  };
  if (normalizedNeed.capabilities.length === 0) throw new Error('Shelf reuse requires at least one normalized capability need');
  const normalized: ShelfCapabilityNeed = { ...normalizedNeed, allowNonAdmittedAssetIds: unique(need.allowNonAdmittedAssetIds ?? []) };
  const evaluated = catalog.map((item) => compatibility(normalized, item)).sort((left, right) => {
    const admissionRank = (value: ShelfCompatibilityResult): number => value.admissionState === 'admitted' ? 0 : value.admissionState === 'not-admitted' ? 1 : 2;
    return admissionRank(left) - admissionRank(right) || Number(right.exactCapabilityMatch) - Number(left.exactCapabilityMatch)
      || right.matchedCapabilities.length - left.matchedCapabilities.length
      || right.fuzzyMatchedCapabilities.length - left.fuzzyMatchedCapabilities.length || left.assetId.localeCompare(right.assetId);
  });
  const admittedExact = evaluated.find((item) => item.compatible && item.exactCapabilityMatch && item.admissionState === 'admitted');
  if (admittedExact) {
    return { schemaVersion: '1.0.0', disposition: 'REUSE', normalizedNeed, selectedAssetIds: [admittedExact.assetId], evaluated,
      noMatchEvidence: [], nonAdmittedUse: { permitted: false, assetIds: [] }, reason: 'A compatible admitted asset exactly satisfies the normalized capability need.' };
  }
  const admittedPartial = evaluated.find((item) => item.compatible && item.admissionState === 'admitted');
  if (admittedPartial) {
    return { schemaVersion: '1.0.0', disposition: 'EXTEND', normalizedNeed, selectedAssetIds: [admittedPartial.assetId], evaluated,
      noMatchEvidence: [], nonAdmittedUse: { permitted: false, assetIds: [] }, reason: 'A compatible admitted asset covers part of the need and must be extended for the recorded missing capabilities.' };
  }
  const allowed = new Set(normalized.allowNonAdmittedAssetIds ?? []);
  const policyCandidate = evaluated.find((item) => item.compatible && item.admissionState === 'not-admitted' && allowed.has(item.assetId));
  if (policyCandidate) {
    return { schemaVersion: '1.0.0', disposition: 'EXTEND', normalizedNeed, selectedAssetIds: [policyCandidate.assetId], evaluated,
      noMatchEvidence: [], nonAdmittedUse: { permitted: true, assetIds: [policyCandidate.assetId] },
      reason: 'Policy explicitly permits this visible non-admitted asset for bounded extension; it is not treated as certified reuse.' };
  }
  const noMatchEvidence = evaluated.length > 0
    ? evaluated.map((item) => `${item.assetId}: ${item.reasons.join(' ') || `Missing capabilities: ${item.missingCapabilities.join(', ') || 'none'}.`}`)
    : ['Shelf catalog contains no assets.'];
  return { schemaVersion: '1.0.0', disposition: 'CREATE', normalizedNeed, selectedAssetIds: [], evaluated, noMatchEvidence,
    nonAdmittedUse: { permitted: false, assetIds: [] }, reason: 'No compatible admitted asset or explicitly permitted non-admitted extension matched; CREATE is allowed only with this no-match evidence.' };
}

export function deriveFactoryTrustManifest(asset: AdmittedShelfAsset, receipt: QualityGateReceipt): FactoryTrustManifest {
  if (!isAdmittedShelfAsset(asset)) throw new Error('Trust manifests require an asset admitted through the trusted Shelf boundary');
  const admissionProof = admittedProofs.get(asset);
  if (!admissionProof) throw new Error('Trust manifests require exact-source and dependency admission proof');
  if (receipt.finalState !== 'pass' || receipt.receiptId !== asset.qualityGate.receipt.receiptId
    || receipt.candidateSha !== asset.exactSource.candidateSha || qualityReceiptDigest(receipt) !== receipt.receiptId) {
    throw new Error('Trust manifest receipt must be the verified exact-candidate receipt used for Shelf admission');
  }
  const trust: FactoryTrustManifest = {
    schemaVersion: '1.0.0', documentType: 'shia-factory-trust-manifest',
    identity: { assetId: asset.assetId, type: asset.type, version: asset.version }, trustState: 'admitted',
    maintainer: asset.maintenance.maintainer,
    provenance: { repository: asset.exactSource.repository, sourceCandidate: asset.exactSource.candidateSha,
      sourceVersion: asset.exactSource.version, sourceVerificationDigest: admissionProof.source.integrityDigest,
      evidenceReferences: [...asset.provenance.evidence] },
    quality: { receiptReferences: [receipt.receiptId], lastVerifiedAt: receipt.evaluatedAt, state: 'verified-factory-evidence' },
    security: { riskTier: asset.security.riskTier, reviewState: asset.security.reviewState },
    supported: { platforms: [...asset.supportedPlatforms], interfaces: asset.interfaces.map((item) => item.id), factoryCore: asset.compatibility.factoryCore },
    maintenance: canonicalCopy(asset.maintenance), knownLimitations: [...asset.knownLimitations], deprecation: canonicalCopy(asset.deprecation),
    claims: { independentCertification: false, aiApproved: false, sourceCodeIncluded: false },
  };
  const secretFindings = secretLike(trust);
  if (secretFindings.length > 0) throw new Error(`Trust manifest would expose secret-shaped content: ${secretFindings.join('; ')}`);
  return deepFreeze(trust);
}

export async function shelfManifestPathsExist(repoRoot: string, manifest: ShelfAssetManifest): Promise<string[]> {
  const missing: string[] = [];
  for (const relative of shelfManifestSourcePaths(manifest)) {
    if (!repositoryRelativePath(relative)) { missing.push(`${relative} (outside repository)`); continue; }
    const target = path.resolve(repoRoot, relative);
    const within = path.relative(path.resolve(repoRoot), target);
    if (within.startsWith('..') || path.isAbsolute(within)) { missing.push(`${relative} (outside repository)`); continue; }
    try { await stat(target); } catch { missing.push(relative); }
  }
  return missing;
}
