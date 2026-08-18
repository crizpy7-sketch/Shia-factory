/* The registry as a multi-agent surface: GARY-001's registration, the grant layer that lets Boris
   build, and the boundaries that stay closed for both of them.

   agents/tests/registry.test.mjs covers BORIS-001 against his package in detail; this file covers
   Gary against his, and everything that only appears once there is more than one agent. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const require=createRequire(import.meta.url);
const root=join(dirname(fileURLToPath(import.meta.url)),'..','..');
const registry=require('../registry.js');
const {createRouter}=require('../routing.js');
const advisory=require('../advisory.js');
const growth=require('../growth.js');
const builder=require('../build.js');
const panel=require('../panel.js');
const readJson=p=>JSON.parse(readFileSync(join(root,p),'utf8'));

const boris=registry.byId('BORIS-001');
const gary=registry.byId('GARY-001');
const router=createRouter(registry.agents);
const identity=readJson('agents/GARY-001/identity/identity.json');
const passport=readJson('agents/GARY-001/identity/agent_passport.json');
const card=readJson('agents/GARY-001/integration/shia-app-factory/agent-card.json');
const membership=readJson('agents/GARY-001/integration/shia-app-factory/council-membership.json');

/* ---------------------------------------------------------------- GARY-001 */

test('GARY-001 is registered in the Factory agent registry', () => {
  assert.ok(gary, 'GARY-001 missing from registry');
  assert.equal(gary.agent_id, identity.agent_id);
  assert.equal(gary.display_name, identity.display_name);
  assert.equal(gary.class, 'portable_named_agent');
  assert.equal(gary.package_version, identity.version);
});

test("Gary's identity is preserved, not rewritten to fit the host", () => {
  assert.deepEqual(gary.roles, identity.roles);
  assert.deepEqual(gary.invocation_aliases, identity.invocation_aliases);
  assert.equal(gary.status, identity.status);
  assert.equal(gary.simulation_notice, identity.simulation_notice);
});

test("Gary's authority boundaries match his package exactly", () => {
  assert.deepEqual(gary.authority, identity.authority);
  assert.equal(gary.authority.may_publish_without_owner_approval, false);
  assert.equal(gary.authority.may_spend_money, false);
  assert.equal(gary.authority.may_access_secrets_directly, false);
  assert.equal(gary.authority.may_bypass_platform_rules, false);
  assert.equal(gary.authority.may_create_legal_commitments, false);
  assert.equal(gary.authority.final_authority, 'Cristian');
});

test('Gary holds a Growth Council seat matching his package membership', () => {
  const council=registry.council('Growth Council');
  assert.ok(council, 'Growth Council missing from registry');
  assert.deepEqual(council.members.map(m=>m.agent_id), ['GARY-001']);
  assert.equal(gary.council.council, membership.council);
  assert.equal(gary.council.role, membership.role);
  assert.equal(gary.council.authority, membership.authority);
  assert.deepEqual(gary.council.activation, membership.activation);
});

test("Gary's card matches the package card", () => {
  assert.equal(gary.card.subtitle, card.subtitle);
  assert.equal(gary.card.badge, card.badge);
  assert.equal(gary.card.action_label, card.action_label);
});

test("Gary's avatars are declared as placeholders, because his package shipped none", () => {
  /* The package card nominates no avatar — inventing identity art and presenting it as his
     would be the drift this whole layer exists to prevent. */
  assert.equal(card.avatar, undefined, 'the GARY-001 card now nominates art; wire it instead of the placeholder');
  assert.equal(gary.avatar_provenance, 'placeholder');
  assert.notEqual(boris.avatar_provenance, 'placeholder');
  for(const [slot,path] of Object.entries(gary.avatars)){
    assert.ok(existsSync(join(root,path)), `missing ${slot} asset at ${path}`);
    assert.ok(statSync(join(root,path)).size>0, `empty ${slot} asset at ${path}`);
    /* The art says so itself, so a screenshot of it cannot be mistaken for the real thing. */
    assert.match(readFileSync(join(root,path),'utf8'), /placeholder/i, `${slot} art is not labelled a placeholder`);
  }
});

test('Gary is not certified as a runtime by being registered', () => {
  assert.equal(gary.runtime.host_is_identity, false);
  assert.equal(gary.runtime.certified, false);
  assert.equal(gary.runtime.certification_status, passport.certification_status);
  assert.deepEqual(passport.certifications, []);
});

test("Gary's package still matches its integrity baseline", () => {
  const manifest=readJson('agents/GARY-001/SHA256_MANIFEST.json');
  const entries=Object.entries(manifest);
  assert.ok(entries.length>0);
  for(const [rel,expected] of entries){
    const file=join(root,'agents/GARY-001',rel);
    assert.ok(existsSync(file), `package file missing: ${rel}`);
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), expected, `package file modified: ${rel}`);
  }
  /* Boris's manifest attests a transfer; Gary's was recorded here. Saying so keeps the two
     from being read as the same kind of claim. */
  assert.equal(gary.package_integrity, 'integration_baseline');
  assert.equal(boris.package_integrity, 'transfer_manifest');
});

/* ---------------------------------------------------------------- the grant layer */

test('the Factory grant gives Boris build and code capability', () => {
  const eff=registry.capabilities(boris);
  assert.equal(eff.may_author_code, true);
  assert.equal(eff.may_build, true);
  assert.equal(eff.may_run_tests, true);
  assert.equal(eff.may_scaffold_blocks, true);
  assert.deepEqual(registry.grantedCapabilities(boris).sort(),
    ['may_author_code','may_build','may_run_tests','may_scaffold_blocks']);
});

test('the grant does not loosen merge, deploy or secrets', () => {
  const eff=registry.capabilities(boris);
  assert.equal(eff.may_merge, false);
  assert.equal(eff.may_deploy, false);
  assert.equal(eff.may_access_secrets, false);
  assert.equal(eff.final_authority, 'Cristian');
  /* And the package itself is untouched by the grant. */
  assert.equal(boris.authority.may_author_code, undefined);
});

test('a grant cannot flip a boundary the package withholds', () => {
  const rogue={
    display_name:'Rogue',
    authority:{may_merge:false,may_deploy:false,final_authority:'Cristian'},
    grants:[{capabilities:{may_merge:true,may_deploy:true,may_author_code:true},withheld:['may_deploy']}]
  };
  const eff=registry.capabilities(rogue);
  assert.equal(eff.may_merge, false, 'a grant overrode a package boundary');
  assert.equal(eff.may_deploy, false, 'a grant overrode its own withheld list');
  assert.equal(eff.may_author_code, true, 'a grant failed to add a capability it does hold');
});

test('Gary holds no grant, so his effective capabilities are exactly his package', () => {
  assert.deepEqual(gary.grants, []);
  assert.deepEqual(registry.capabilities(gary), gary.authority);
  assert.deepEqual(registry.grantedCapabilities(gary), []);
});

test('the build module is offered only to an agent whose grant allows it', () => {
  assert.deepEqual(registry.modulesFor(boris).map(m=>m.id), ['advisory','build']);
  assert.deepEqual(registry.modulesFor(gary).map(m=>m.id), ['growth']);
});

test('grant aliases route, and belong to the grant rather than the package', () => {
  assert.ok(!boris.invocation_aliases.includes('Boris build this'), 'a grant alias leaked into the package identity');
  assert.ok(registry.aliasesFor(boris).includes('Boris build this'));
  assert.equal(router.resolve('Boris build this graph').agentId, 'BORIS-001');
  /* Gary has no grant, so no grant aliases. */
  assert.deepEqual(registry.aliasesFor(gary), gary.invocation_aliases);
});

/* ---------------------------------------------------------------- routing both agents */

test('every registered agent routes from its own aliases', () => {
  for(const agent of registry.agents){
    for(const alias of registry.aliasesFor(agent)){
      const hit=router.resolve(alias);
      assert.ok(hit, `alias not routed: ${alias}`);
      assert.equal(hit.agentId, agent.agent_id, `alias "${alias}" routed to the wrong agent`);
    }
  }
});

test('Boris may build; Gary is refused before anything dispatches', () => {
  const allowed=router.resolve('Boris build this graph into a runnable export');
  assert.equal(allowed.permitted, true, 'the build grant did not permit a build request');

  /* A bare first name is not an alias, so every request here is a real invocation. */
  const refused=router.resolve('Ask Gary to write the code for this app');
  assert.equal(refused.agentId, 'GARY-001');
  assert.equal(refused.permitted, false, 'Gary was allowed to author code without a grant');
  assert.ok(refused.denials.some(d=>d.capability==='may_author_code'));
  assert.match(refused.denials[0].reason, /Cristian/);
});

test("Gary's own boundaries are enforced at the router", () => {
  const cases=[
    ['Ask Gary to publish this campaign','may_publish_without_owner_approval'],
    ['Ask Gary to spend the budget on ads','may_spend_money'],
    ['@Gary sign the contract with them','may_create_legal_commitments'],
    ['Ask Gary to buy followers for the launch','may_bypass_platform_rules'],
    ['Call Gary and read the .env','may_access_secrets_directly'],
    ['Call Gary and merge this branch','may_merge']
  ];
  for(const [text,capability] of cases){
    const hit=router.resolve(text);
    assert.ok(hit, `not routed: ${text}`);
    assert.equal(hit.permitted, false, `should have been refused: ${text}`);
    assert.ok(hit.denials.some(d=>d.capability===capability), `missing ${capability} denial for: ${text}`);
  }
});

test('what Gary may do is not refused', () => {
  for(const text of [
    'Ask Gary to recommend a budget for the launch',
    'Gary launch plan for the booking app',
    'Ask Gary how much should we plan to spend next quarter',
    'Gary review this positioning'
  ]){
    const hit=router.resolve(text);
    assert.ok(hit, `not routed: ${text}`);
    assert.equal(hit.permitted, true, `wrongly refused: ${text} → ${JSON.stringify(hit.denials)}`);
  }
});

test('nobody publishes or deploys without holding it — including Boris', () => {
  for(const text of ['Ask Boris to publish the findings','Ask Boris to deploy this','Ask Boris to merge it','Ask Gary to deploy the site']){
    const hit=router.resolve(text);
    assert.ok(hit, `not routed: ${text}`);
    assert.equal(hit.permitted, false, `should have been refused: ${text}`);
  }
});

/* ---------------------------------------------------------------- the panel, per agent */

const defs={
  forms:{name:'Forms Block #001',version:'1.0.0',stability:'stable',out:{id:'submitted',type:'Record'}},
  records:{name:'Records Block #002',version:'0.2.0',stability:'development',in:{id:'addRecord',type:'Record'}}
};
const project={
  name:'Untitled Shia App',
  blocks:[{id:'booking-form',type:'forms',title:'Customer Booking'},{id:'appointment-records',type:'records',title:'Appointment Records'}],
  connections:[{id:'starter',from:'booking-form',fromPort:'submitted',to:'appointment-records',toPort:'addRecord',type:'Record'}]
};
const garySession=()=>panel.createSession({agent:gary,router,review:growth,capabilities:registry.capabilities});
const borisSession=()=>panel.createSession({agent:boris,router,review:advisory,build:builder,capabilities:registry.capabilities});

test('the same panel holds Gary, with his scopes and his identity', () => {
  const html=garySession().render({projectName:'Untitled Shia App'});
  assert.match(html, /GARY-001/);
  assert.match(html, /What should Gary review\?/);
  assert.match(html, /RUN GARY/);
  for(const label of ['Review Entire Factory','Find Highest-Impact Gap','Review Positioning','Review Funnel','Review Measurement']){
    assert.ok(html.includes(label), `quick action missing: ${label}`);
  }
  /* Boris's scopes must not leak into Gary's panel. */
  assert.ok(!html.includes('Find Highest-Risk Defect'), "Boris's scopes leaked into Gary's panel");
  assert.match(html, /not Gary Vaynerchuk/, 'the simulation notice is not shown');
  assert.match(html, /generated placeholder/, 'the placeholder avatar is not disclosed');
});

test('the Build section appears for Boris and not for Gary', () => {
  assert.equal(borisSession().canBuild, true);
  assert.equal(garySession().canBuild, false);
  assert.match(borisSession().render({projectName:'x'}), /BUILD THIS GRAPH/);
  assert.ok(!garySession().render({projectName:'x'}).includes('BUILD THIS GRAPH'));
});

test('asking Gary to build is refused by the panel, not attempted', () => {
  const s=panel.createSession({agent:gary,router,review:growth,build:builder,capabilities:registry.capabilities});
  const out=s.runBuild({project,defs});
  assert.equal(out.build.status, 'refused');
  assert.equal(out.build.artifacts.length, 0);
  assert.match(out.build.denials[0].reason, /no build grant/i);
  assert.ok(out.logs.some(l=>l.cls==='err'&&/refused/.test(l.text)));
});

test('Gary produces findings through the panel, logged to the console like any agent', () => {
  const out=garySession().run({project,defs,scope:'factory'});
  assert.equal(out.run.status, 'ok');
  assert.ok(out.run.findings.length>0);
  const text=out.logs.map(l=>l.text).join('\n');
  assert.match(text, /Gary ▸ invoked/);
  assert.match(text, /Cristian/);
  assert.match(text, /does not invent numbers/);
});
