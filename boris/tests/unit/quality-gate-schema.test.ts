import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { OrchestratorTaskContract } from '../../src/factory/orchestrator-core.js';
import { evaluateQualityGate, type QualityEvidence, type QualityGateInput } from '../../src/quality/quality-gate.js';
import { admitTrustedFixture } from '../helpers/quality-admission.js';

const CANDIDATE = 'c'.repeat(40);
const NOW = '2026-09-01T18:00:00Z';
interface SchemaValidator { (data: unknown): boolean; errors?: unknown }
interface AjvInstance { compile(schema: object): SchemaValidator }
type AjvConstructor = new (options?: Record<string, unknown>) => AjvInstance;
const require = createRequire(import.meta.url);
const Ajv2020 = (require('ajv/dist/2020.js') as { default: AjvConstructor }).default;
const addFormats = (require('ajv-formats') as { default: (ajv: AjvInstance) => void }).default;

function contract(): OrchestratorTaskContract {
  return {
    schemaVersion: '1.0.0', id: 'QUALITY-SCOPE-SCHEMA', projectId: 'shia-factory',
    objective: 'Verify canonical scoped Quality receipts.', outcome: 'Factory-minted receipts validate against schema 1.2.0.',
    repository: { commit: CANDIDATE, branch: 'migration/core-v2-phase7-quality-scopes' }, profileDigest: 'd'.repeat(64),
    risk: { tier: 'T2', reasons: ['bounded deterministic contract verification'] },
    reuse: { searched: true, findings: [], creationDisposition: 'reuse-search-recorded' },
    selectedRoles: [], selectedSkillPacks: [], selectedTools: [],
    acceptanceCriteria: [
      { id: 'AC-SCHEMA', statement: 'The generated receipt matches the canonical schema.', evidence: ['test'] },
      { id: 'AC-PRODUCTION', statement: 'The release is observed in production.', evidence: ['production-observation'] },
    ],
    requiredEvidence: ['test', 'production-observation'], allowedActions: [], approvalGates: [],
    executionBlocked: false, executionBlockers: [], certificationReleaseBlocked: true,
    certificationReleaseBlockers: ['Production observation is required after deployment.'], blocked: false, blockers: [],
  };
}

function evidence(kind: QualityEvidence['kind']): QualityEvidence {
  return {
    id: `SCHEMA-${kind}`, kind, candidateSha: CANDIDATE, status: 'pass', source: `trusted:${kind}`,
    summary: `${kind} passed`, criterionIds: kind === 'unit' ? ['AC-SCHEMA']
      : kind === 'production-observation' ? ['AC-PRODUCTION'] : [], observedAt: NOW,
    method: kind === 'production-observation' ? 'manual-observation' : 'automated-tool',
    testedSurfaces: kind === 'production-observation' ? ['production:/api/ready'] : ['factory-quality'],
  };
}

function input(scope: QualityGateInput['evaluationScope'], includeProduction: boolean): QualityGateInput {
  const taskContract = contract();
  return {
    taskId: taskContract.id, projectId: taskContract.projectId, repository: 'crizpy7-sketch/shia-factory',
    candidateSha: CANDIDATE, branch: taskContract.repository.branch, riskTier: taskContract.risk.tier,
    taskContract, acceptanceCriteria: taskContract.acceptanceCriteria, requiredEvidence: taskContract.requiredEvidence,
    actualEvidence: [...(['typecheck', 'lint', 'unit', 'integration'] as const).map(evidence),
      ...(includeProduction ? [evidence('production-observation')] : [])],
    changedPaths: ['boris/src/quality/quality-gate.ts'],
    changeSignals: { userFacing: false, securitySurfaces: [], performanceSurfaces: [], performanceFailureMaterial: false, subjectRoles: [] },
    dangerousActions: [], reviewer: null, repair: { attempt: 0, maxAttempts: 2 }, evaluatedAt: NOW,
    evaluationScope: scope, productionObservationRequirement: 'required',
  };
}

test('Factory-minted pre-deployment and full-lifecycle receipts validate against canonical schema 1.2.0', async () => {
  const schema = JSON.parse(await readFile('../factory/quality/quality-gate-receipt.schema.json', 'utf8')) as object;
  const legacy = JSON.parse(await readFile('../factory/quality/quality-gate-receipt-v1.1.schema.json', 'utf8')) as {
    properties: { schemaVersion: { const: string } };
  };
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const preDeployment = evaluateQualityGate(admitTrustedFixture(input('pre-deployment-release-readiness', false)));
  const fullLifecycle = evaluateQualityGate(admitTrustedFixture(input('full-lifecycle', true)));

  assert.equal(preDeployment.finalState, 'pass');
  assert.equal(fullLifecycle.finalState, 'pass');
  assert.equal(validate(preDeployment), true, JSON.stringify(validate.errors));
  assert.equal(validate(fullLifecycle), true, JSON.stringify(validate.errors));
  assert.equal(legacy.properties.schemaVersion.const, '1.1.0');

  const callerExtended = { ...preDeployment, callerClaimedAuthority: true };
  assert.equal(validate(callerExtended), false, 'additional caller fields bypassed the closed schema');
});
