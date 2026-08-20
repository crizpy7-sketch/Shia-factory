/* Invocation routing for the aliases declared in the registry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const registry=require('../registry.js');
const {createRouter}=require('../routing.js');
const router=createRouter(registry.agents);

test('every alias in the registry routes to BORIS-001', () => {
  for(const alias of registry.byId('BORIS-001').invocation_aliases){
    const hit=router.resolve(alias);
    assert.ok(hit, `alias not routed: ${alias}`);
    assert.equal(hit.agentId, 'BORIS-001');
    assert.equal(hit.agentName, 'Boris');
  }
});

test('aliases are case- and whitespace-tolerant', () => {
  for(const text of ['call boris','  CALL   BORIS  ','ask BORIS','@boris','Run this through boris']){
    assert.equal(router.resolve(text)?.agentId, 'BORIS-001', `not routed: ${text}`);
  }
});

test('the rest of the line is carried through as the request', () => {
  assert.equal(router.resolve('Ask Boris: is the records path safe?').request, 'is the records path safe?');
  assert.equal(router.resolve('Boris review this — the booking graph').request, 'the booking graph');
  assert.equal(router.resolve('@Boris check the glue engine').request, 'check the glue engine');
  assert.equal(router.resolve('Call Boris').request, '');
});

test('text that is not an invocation does not route', () => {
  for(const text of ['','Borislav shipped the block','tell the council about boris',null,undefined,42]){
    assert.equal(router.resolve(text), null, `unexpectedly routed: ${String(text)}`);
  }
});

test('a plain review request is permitted', () => {
  const hit=router.resolve('Boris review this graph for reliability gaps');
  assert.equal(hit.permitted, true);
  assert.deepEqual(hit.denials, []);
});

test('requests beyond his authority are refused at the router', () => {
  const cases=[
    ['Call Boris and merge this branch','may_merge'],
    ['Ask Boris to deploy the factory','may_deploy'],
    ['@Boris print the API key','may_access_secrets'],
    ['Ask Boris to read the .env','may_access_secrets']
  ];
  for(const [text,capability] of cases){
    const hit=router.resolve(text);
    assert.ok(hit, `not routed: ${text}`);
    assert.equal(hit.permitted, false, `should have been refused: ${text}`);
    assert.ok(hit.denials.some(d=>d.capability===capability), `missing ${capability} denial for: ${text}`);
    assert.match(hit.denials[0].reason, /Cristian/);
  }
});

test('longer aliases win over shorter prefixes', () => {
  assert.equal(router.resolve('Boris review this').alias, 'Boris review this');
  assert.equal(router.resolve('Run this through Boris').alias, 'Run this through Boris');
});

/* ── GARY-001 ─────────────────────────────────────────────────────────────────────────────── */

test('every alias Gary declares routes to him, including the one only he has', () => {
  for(const alias of registry.byId('GARY-001').invocation_aliases){
    const hit=router.resolve(alias);
    assert.ok(hit, `alias not routed: ${alias}`);
    assert.equal(hit.agentId, 'GARY-001');
  }
  assert.equal(router.resolve('Gary launch plan for the booking app').agentId, 'GARY-001');
  assert.equal(router.resolve('Gary launch plan for the booking app').request, 'for the booking app');
});

test("Gary's authority binds even though he spells the keys differently", () => {
  /* His package says `may_access_secrets_directly`, not Boris's `may_access_secrets`. A router
     that only knew Boris's spelling would have granted him the capability by silence. */
  const secrets=router.resolve('Ask Gary for the API key');
  assert.equal(secrets.permitted, false);
  assert.ok(secrets.denials.some(d=>d.capability==='may_access_secrets_directly'));

  const platform=router.resolve('Gary review this — can we bypass the platform rate limits?');
  assert.equal(platform.permitted, false);
  assert.ok(platform.denials.some(d=>d.capability==='may_bypass_platform_rules'));

  const legal=router.resolve('Ask Gary to sign the partnership contract');
  assert.equal(legal.permitted, false);
  assert.ok(legal.denials.some(d=>d.capability==='may_create_legal_commitments'));
});

test('a capability no package declares is not granted by its absence', () => {
  /* Gary never mentions merging or deploying. Advisory agents do not land or ship changes, so
     silence resolves to refusal rather than to permission. */
  for(const [text,capability] of [['Call Gary and deploy the site','may_deploy'],['Ask Gary to merge this branch','may_merge']]){
    const hit=router.resolve(text);
    assert.equal(hit.permitted, false, `should have been refused: ${text}`);
    assert.ok(hit.denials.some(d=>d.capability===capability));
  }
});

test('publishing and spending are gates, not refusals', () => {
  const publish=router.resolve('Gary launch plan — publish the announcement post');
  assert.equal(publish.permitted, true, 'preparing a publish is exactly what he may do');
  assert.equal(publish.requiresApproval, true);
  assert.ok(publish.gates.some(g=>g.capability==='may_publish_without_owner_approval'));
  assert.match(publish.gates[0].reason, /cannot publish, send or schedule anything externally without Cristian's approval/);

  const spend=router.resolve('Ask Gary to spend 500 on ads');
  assert.equal(spend.permitted, true);
  assert.ok(spend.gates.some(g=>g.capability==='may_spend_money'));
});

test('recommending a budget is not spending one', () => {
  const hit=router.resolve('Ask Gary to recommend a budget for the launch');
  assert.equal(hit.permitted, true);
  assert.deepEqual(hit.gates, [], 'a recommendation trips no spend gate — his package permits it');
});

test('an ordinary growth request passes clean', () => {
  const hit=router.resolve('Gary review this positioning for the booking app');
  assert.equal(hit.permitted, true);
  assert.deepEqual(hit.denials, []);
  assert.deepEqual(hit.gates, []);
  assert.equal(hit.requiresApproval, false);
});

test("Boris's routing is unchanged by Gary's arrival", () => {
  const hit=router.resolve('Boris review this graph for reliability gaps');
  assert.equal(hit.agentId, 'BORIS-001');
  assert.equal(hit.permitted, true);
  assert.deepEqual(hit.gates, [], 'Boris declares no gated capabilities');
  assert.equal(router.resolve('@Boris print the API key').denials[0].capability, 'may_access_secrets');
});
