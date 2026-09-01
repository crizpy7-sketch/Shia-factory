import { admitQualityGateInput, createTrustedExecutionEvidenceAdapter, trustedRecordDigest,
  type AdmittedQualityGateInput, type EvidenceAdmissionDependencies, type TrustedExecutionRecord } from '../../src/quality/evidence-admission.js';
import type { QualityEvidence, QualityEvidenceKind, QualityGateInput } from '../../src/quality/quality-gate.js';

function sourceTypeFor(kind: QualityEvidenceKind): TrustedExecutionRecord['sourceType'] | null {
  const sources: Partial<Record<QualityEvidenceKind, TrustedExecutionRecord['sourceType']>> = {
    typecheck: 'boris-test-run', lint: 'boris-test-run', unit: 'boris-test-run', integration: 'boris-test-run', e2e: 'boris-test-run',
    browser: 'browser-runner', accessibility: 'accessibility-runner', security: 'security-runner', adversarial: 'security-runner',
    performance: 'performance-runner', 'production-observation': 'production-observer', 'independent-review': 'independent-reviewer',
  };
  return sources[kind] ?? null;
}
function recordFor(raw: QualityEvidence, sourceType: TrustedExecutionRecord['sourceType']): TrustedExecutionRecord {
  const base: Omit<TrustedExecutionRecord, 'integrityDigest'> = {
    kind: raw.kind, candidateSha: raw.candidateSha, status: raw.status, source: raw.source, summary: raw.summary,
    criterionIds: [...raw.criterionIds], observedAt: raw.observedAt, method: raw.method, testedSurfaces: raw.testedSurfaces,
    untestedSurfaces: raw.untestedSurfaces, browser: raw.browser, artifact: raw.artifact, findings: raw.findings,
    thresholds: raw.thresholds, measurements: raw.measurements, sourceType, sourceId: `trusted:${raw.id}`,
    runId: `run:${raw.id}`, collector: 'quality-test-fixture-adapter',
  };
  return { ...base, integrityDigest: trustedRecordDigest(base) };
}
export function trustedFixtureDependencies(input: QualityGateInput, additional: Partial<EvidenceAdmissionDependencies> = {}, excludedKinds: QualityEvidenceKind[] = []) {
  const records = new Map<string, TrustedExecutionRecord>();
  const raw = input.actualEvidence.map((item) => {
    const sourceType = excludedKinds.includes(item.kind) ? null : sourceTypeFor(item.kind);
    if (!sourceType) return { ...item };
    const claimed = { ...item, provenance: { sourceType, sourceId: `trusted:${item.id}`, runId: `run:${item.id}` } };
    records.set(`trusted:${item.id}`, recordFor(claimed, sourceType));
    return claimed;
  });
  const types = [...new Set([...records.values()].map((record) => record.sourceType))];
  const adapter = createTrustedExecutionEvidenceAdapter('quality-test-fixture-adapter', types, (sourceId) => records.get(sourceId) ?? null);
  return { input: { ...input, actualEvidence: raw }, dependencies: { evidenceAdapters: [adapter, ...(additional.evidenceAdapters ?? [])], governanceApprovalResolver: additional.governanceApprovalResolver } };
}
export function admitTrustedFixture(input: QualityGateInput, additional: Partial<EvidenceAdmissionDependencies> = {}, excludedKinds: QualityEvidenceKind[] = []): AdmittedQualityGateInput {
  const fixture = trustedFixtureDependencies(input, additional, excludedKinds);
  return admitQualityGateInput(fixture.input, fixture.dependencies);
}
