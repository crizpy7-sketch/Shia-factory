import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repoRoot = new URL('../', import.meta.url);

async function loadJson(path) {
  return JSON.parse(await readFile(new URL(path, repoRoot), 'utf8'));
}

test('agentic commerce blueprint is explicitly candidate-only', async () => {
  const manifest = await loadJson('blueprints/commerce-agentic/manifest.json');

  assert.equal(manifest.schema_version, '1.0.0');
  assert.equal(manifest.id, 'commerce-agentic');
  assert.equal(manifest.layer, 'blueprint');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.lifecycle, 'candidate');
  assert.equal(manifest.admitted, false);
  assert.equal(manifest.normal_production_reuse, false);
});

test('agentic commerce blueprint reuses the permanent workforce and seven skill packs', async () => {
  const manifest = await loadJson('blueprints/commerce-agentic/manifest.json');

  assert.deepEqual(manifest.required_permanent_roles, [
    'shia-core',
    'boris',
    'design-director',
    'gary',
    'quality-gate',
  ]);

  assert.deepEqual(manifest.required_skill_packs, [
    'product',
    'design',
    'engineering',
    'ai',
    'quality',
    'growth',
    'operations',
  ]);
});

test('agentic commerce source study is pinned and does not claim imported upstream code', async () => {
  const manifest = await loadJson('blueprints/commerce-agentic/manifest.json');

  assert.equal(manifest.source_study.repository, 'anthropics/commerce-agents');
  assert.equal(
    manifest.source_study.commit,
    'fd4d59224ab96b43c6dc6888207c67b3bd5a24cf',
  );
  assert.equal(manifest.source_study.license, 'Apache-2.0');
  assert.equal(manifest.source_study.code_imported, false);
});

test('customer commerce keeps payment and order placement outside model authority', async () => {
  const manifest = await loadJson('blueprints/commerce-agentic/manifest.json');
  const policy = await loadJson('blueprints/commerce-agentic/commerce-policy.json');

  assert.equal(policy.authority_model.checkout, 'host-handoff-only');
  assert.equal(policy.authority_model.payment, 'forbidden-to-model');
  assert.equal(manifest.integration_contract.payments, 'never-model-owned');
  assert.ok(manifest.security_invariants.includes('no-model-payment-credential-access'));
  assert.ok(manifest.security_invariants.includes('no-model-order-placement-authority'));
  assert.ok(manifest.security_invariants.includes('checkout-is-host-handoff'));
});

test('merchant mutations stay staged, provenance-gated and host-approved', async () => {
  const manifest = await loadJson('blueprints/commerce-agentic/manifest.json');
  const policy = await loadJson('blueprints/commerce-agentic/commerce-policy.json');

  assert.equal(policy.authority_model.merchant_writes, 'stage-only');
  assert.equal(policy.authority_model.merchant_apply, 'host-approval-required');
  assert.equal(policy.authority_model.production_deploy, 'outside-blueprint-authority');
  assert.equal(policy.provenance.merchant_write_targets, 'must-have-session-read-provenance');
  assert.equal(policy.provenance.merchant_apply_targets, 'must-have-staged-change-provenance');
  assert.ok(manifest.security_invariants.includes('merchant-writes-are-staged-before-apply'));
  assert.ok(manifest.security_invariants.includes('host-approval-required-for-merchant-apply'));
});

test('tool and memory defaults fail closed for an unconfigured commerce deployment', async () => {
  const policy = await loadJson('blueprints/commerce-agentic/commerce-policy.json');

  assert.equal(policy.tooling.registry, 'config-derived-allowlist');
  assert.equal(policy.tooling.unknown_tool_behavior, 'deny');
  assert.equal(policy.memory.enabled_by_default, false);
  assert.equal(policy.memory.write_validation_required, true);
  assert.equal(policy.memory.retention_policy_required_before_production, true);
  assert.equal(policy.memory.user_delete_path_required_before_production, true);
  assert.equal(policy.memory.account_delete_integration_required_before_production, true);
  assert.equal(policy.memory.tool_results_may_be_saved_as_memory, false);
});

test('merchant apply lifecycle requires review, approval and revalidation before apply', async () => {
  const policy = await loadJson('blueprints/commerce-agentic/commerce-policy.json');

  assert.deepEqual(policy.merchant_change_lifecycle, [
    'read-current-state',
    'prepare-proposal',
    'validate-business-guardrails',
    'stage-change',
    'render-reviewable-diff',
    'host-approval',
    'revalidate-at-apply-time',
    'apply-through-host-backend',
    'record-receipt',
  ]);
});
