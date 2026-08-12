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
