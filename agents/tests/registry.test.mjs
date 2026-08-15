/* Registry ↔ BORIS-001 package agreement.
   The Factory registry restates Boris's identity for the UI; these tests fail if the two drift,
   so the portable package stays the source of truth for who Boris is. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,statSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const require=createRequire(import.meta.url);
const root=join(dirname(fileURLToPath(import.meta.url)),'..','..');
const registry=require('../registry.js');
const readJson=p=>JSON.parse(readFileSync(join(root,p),'utf8'));

const boris=registry.byId('BORIS-001');
const identity=readJson('agents/BORIS-001/identity/identity.json');
const passport=readJson('agents/BORIS-001/identity/agent_passport.json');
const card=readJson('agents/BORIS-001/integration/shia-app-factory/agent-card.json');
const membership=readJson('agents/BORIS-001/integration/shia-app-factory/council-membership.json');

test('BORIS-001 is registered in the Factory agent registry', () => {
  assert.ok(boris, 'BORIS-001 missing from registry');
  assert.equal(boris.agent_id, identity.agent_id);
  assert.equal(boris.display_name, identity.display_name);
  assert.equal(boris.class, 'portable_named_agent');
  assert.equal(boris.package_version, identity.version);
});

test('identity is preserved, not rewritten to fit the host', () => {
  assert.deepEqual(boris.roles, identity.roles);
  assert.deepEqual(boris.invocation_aliases, identity.invocation_aliases);
  assert.equal(boris.status, identity.status);
  assert.equal(boris.origin, identity.origin);
});

test('authority boundaries match the package', () => {
  assert.deepEqual(boris.authority, identity.authority);
  assert.equal(boris.authority.advisory, true);
  assert.equal(boris.authority.challenge_rights, true);
  assert.equal(boris.authority.may_request_rework, true);
  assert.equal(boris.authority.may_merge, false);
  assert.equal(boris.authority.may_deploy, false);
  assert.equal(boris.authority.may_access_secrets, false);
  assert.equal(boris.authority.final_authority, 'Cristian');
});

test('Boris is registered in the Influencers Council', () => {
  const council=registry.council('Influencers Council');
  assert.ok(council, 'Influencers Council missing from registry');
  assert.ok(council.members.some(m=>m.agent_id==='BORIS-001'), 'Boris should hold a council seat');
  assert.equal(boris.council.council, membership.council);
  assert.equal(boris.council.role, membership.role);
  assert.equal(boris.council.authority, membership.authority);
  assert.deepEqual(boris.council.activation, membership.activation);
});

test('the agent card resolves local Boris PNG assets', () => {
  assert.equal(boris.card.subtitle, card.subtitle);
  assert.equal(boris.card.badge, card.badge);
  assert.equal(boris.card.action_label, card.action_label);
  /* The shelf card uses the square avatar the package nominates. */
  assert.ok(boris.avatars.square.endsWith(card.avatar), `card avatar ${card.avatar} not wired to the square asset`);
  for(const [slot,path] of Object.entries(boris.avatars)){
    assert.ok(existsSync(join(root,path)), `missing ${slot} asset at ${path}`);
    assert.ok(statSync(join(root,path)).size>0, `empty ${slot} asset at ${path}`);
  }
  /* The brand sheet is full profile art, never the compact icon. */
  assert.notEqual(boris.avatars.brand_sheet, boris.avatars.app_icon);
});

test('the host runtime is not certified as Boris by integration alone', () => {
  assert.equal(boris.runtime.host, 'Claude Code');
  assert.equal(boris.runtime.host_is_identity, false);
  assert.equal(boris.runtime.certified, false);
  assert.equal(boris.runtime.certification_status, passport.certification_status);
  assert.deepEqual(passport.certifications, []);
  const recert=readFileSync(join(root,boris.runtime.recertification),'utf8');
  assert.match(recert, /^Status: PENDING$/m, 'recertification is no longer PENDING');
  assert.equal(/- \[x\]/i.test(recert), false, 'a recertification gate was ticked without running the gauntlet');
});

/* ── GARY-001 ─────────────────────────────────────────────────────────────────────────────── */

const gary=registry.byId('GARY-001');
const garyIdentity=readJson('agents/GARY-001/identity/identity.json');
const garyPassport=readJson('agents/GARY-001/identity/agent_passport.json');
const garyCard=readJson('agents/GARY-001/integration/shia-app-factory/agent-card.json');
const garyManifest=readJson('agents/GARY-001/runtime/migration_manifest.json');

test('GARY-001 is registered from his transferred package, not from a description of it', () => {
  assert.ok(gary, 'GARY-001 missing from registry');
  assert.equal(gary.agent_id, garyIdentity.agent_id);
  assert.equal(gary.display_name, garyIdentity.display_name);
  assert.equal(gary.class, garyIdentity.class);
  assert.equal(gary.package, 'agents/GARY-001');
  assert.equal(gary.package_version, garyIdentity.version);
  assert.equal(gary.package_version, garyPassport.package_version);
  assert.equal(gary.package_version, garyManifest.package_version);
  assert.notEqual(gary.provisional, true, 'the package arrived; the provisional flag must be gone');
  assert.ok(registry.established().some(a=>a.agent_id==='GARY-001'));
  assert.deepEqual(registry.provisional(), []);
});

test("Gary's identity is preserved, not flattened to Boris's shape", () => {
  assert.deepEqual(gary.roles, garyIdentity.roles);
  assert.deepEqual(gary.invocation_aliases, garyIdentity.invocation_aliases);
  assert.equal(gary.invocation_aliases.length, 6, 'Gary declares six aliases, one more than Boris');
  assert.equal(gary.status, garyIdentity.status);
  assert.deepEqual(gary.authority, garyIdentity.authority,
    'every declared boundary is carried, including the ones Boris does not have');
});

test("the simulation notice travels with Gary wherever he is rendered", () => {
  assert.equal(gary.simulation_notice, garyIdentity.simulation_notice);
  assert.match(gary.simulation_notice, /is not Gary Vaynerchuk/);
  assert.match(gary.simulation_notice, /must not imply endorsement/);
});

test("Gary's approval gates are recorded as gates, not as permissions", () => {
  assert.equal(gary.authority.may_publish_without_owner_approval, false);
  assert.equal(gary.authority.may_spend_money, false);
  assert.equal(gary.authority.may_access_secrets_directly, false);
  assert.equal(gary.authority.may_bypass_platform_rules, false);
  assert.equal(gary.authority.may_create_legal_commitments, false);
  assert.equal(gary.authority.final_authority, 'Cristian');
  /* And the things he may do are not quietly withheld either. */
  assert.equal(gary.authority.may_generate_campaigns, true);
  assert.equal(gary.authority.may_recommend_budget, true);
});

test('Gary sits in the council his own package names', () => {
  assert.equal(gary.council.council, 'Growth Council');
  assert.equal(gary.card.badge, garyCard.badge);
  assert.equal(gary.card.subtitle, garyCard.subtitle);
  assert.equal(gary.card.status, garyCard.status);
  assert.equal(gary.card.action_label, garyCard.action_label);
  const council=registry.council('Growth Council');
  assert.ok(council&&council.members.some(m=>m.agent_id==='GARY-001'));
  /* Boris's seat was not moved to make the roster tidier. */
  assert.ok(registry.council('Influencers Council').members.some(m=>m.agent_id==='BORIS-001'));
});

test('no runtime in this repository is claimed as Gary', () => {
  assert.equal(gary.runtime.host, null, 'naming a host that is not running would be a fabrication');
  assert.equal(gary.runtime.certified, false);
  assert.equal(gary.runtime.certification_status, garyPassport.certification_status);
  assert.deepEqual(garyPassport.certifications, [], 'no certification may be recorded here');
  assert.equal(garyPassport.required_recognition_tests.length, 10);
  assert.equal(garyManifest.migration_gate, 'RECERTIFICATION_REQUIRED');
  assert.match(gary.runtime.host_note, /not part of this repository/i);
  /* Boris ships a gate document; Gary does not. One is not authored on his behalf. */
  assert.equal(gary.runtime.recertification, null);
  assert.equal(existsSync(join(root,'agents/GARY-001/evals')), false);
});

test('Gary shipped no art, so none is invented for him', () => {
  assert.equal(gary.avatar_art_supplied, false);
  assert.equal(gary.avatars.brand_sheet, null, 'no brand sheet may be claimed');
  assert.match(gary.avatars.square, /placeholder/, 'the stand-in must be named as a placeholder');
  assert.ok(existsSync(join(root, gary.avatars.square)), 'the placeholder asset should exist');
});

test("Gary's knowledge arrived non-empty and was not rewritten", () => {
  const lines=p=>readFileSync(join(root,'agents/GARY-001',p),'utf8').trim().split('\n').filter(Boolean);
  const ledger=lines('knowledge/research_ledger.jsonl').map(l=>JSON.parse(l));
  assert.equal(ledger.length, 6, 'one seed placeholder plus five ingested packets');
  assert.deepEqual(ledger.slice(1).map(r=>r.packet_id),
    ['GARY-GEMINI-001','GARY-GROK-002','GARY-QWEN-003','GARY-PERPLEXITY-004','GARY-UNATTRIBUTED-005']);
  assert.equal(lines('knowledge/changed_beliefs.jsonl').length, 5);
  /* Every attributed packet has its verification report, and the unattributed one is still marked. */
  for(const id of ['GARY-GEMINI-001','GARY-GROK-002','GARY-QWEN-003','GARY-PERPLEXITY-004','GARY-UNATTRIBUTED-005']){
    assert.ok(existsSync(join(root,`agents/GARY-001/knowledge/research_packets/${id}.md`)), `packet missing: ${id}`);
    assert.ok(existsSync(join(root,`agents/GARY-001/knowledge/verification/${id}_VERIFICATION.md`)), `verification missing: ${id}`);
  }
  const unattributed=ledger.find(r=>r.packet_id==='GARY-UNATTRIBUTED-005');
  assert.equal(unattributed.status, 'discovery_only_provenance_missing');
  assert.deepEqual(unattributed.accepted_high_value, [], 'a packet without provenance promotes nothing');
});

test("Gary's failure library holds its single seed and is not backfilled", () => {
  const entries=readFileSync(join(root,'agents/GARY-001/knowledge/failure_library.jsonl'),'utf8')
    .trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
  assert.equal(entries.length, 1, 'invented failures are indistinguishable from remembered ones');
  assert.equal(entries[0].status, 'placeholder');
});

test("Gary's imported package still matches the manifest taken at import", () => {
  const manifest=readJson('agents/GARY-001/SHA256_MANIFEST.json');
  const entries=Object.entries(manifest);
  assert.equal(entries.length, 28);
  for(const [rel,expected] of entries){
    const file=join(root,'agents/GARY-001',rel);
    assert.ok(existsSync(file), `package file missing: ${rel}`);
    const actual=createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(actual, expected, `package file modified: ${rel}`);
  }
  /* The import record must keep saying that this manifest is weaker evidence than Boris's. */
  const record=readFileSync(join(root,'agents/GARY-001/IMPORT.md'),'utf8');
  assert.match(record, /generated\s+\*?at import time\*?/i);
  assert.match(record, /cannot prove the files were unaltered/i);
});

test('the transferred package still matches its SHA256 manifest', () => {
  const manifest=readJson('agents/BORIS-001/SHA256_MANIFEST.json');
  const entries=Object.entries(manifest);
  assert.ok(entries.length>0);
  for(const [rel,expected] of entries){
    const file=join(root,'agents/BORIS-001',rel);
    assert.ok(existsSync(file), `package file missing: ${rel}`);
    const actual=createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(actual, expected, `package file modified: ${rel}`);
  }
});

test('the empty knowledge ledgers stayed empty rather than being invented', () => {
  for(const ledger of ['knowledge/research_ledger.jsonl','knowledge/failure_library.jsonl','evals/exam_history.jsonl']){
    assert.equal(statSync(join(root,'agents/BORIS-001',ledger)).size, 0, `${ledger} was populated with unprovenanced records`);
  }
});

test('the avatar assets served by the Factory are byte-identical to the package', () => {
  const packaged=join(root,'agents/BORIS-001/assets/avatar');
  for(const file of readdirSync(packaged)){
    const a=createHash('sha256').update(readFileSync(join(packaged,file))).digest('hex');
    const served=join(root,'assets/agents/boris-001',file);
    assert.ok(existsSync(served), `asset not published to the Factory: ${file}`);
    const b=createHash('sha256').update(readFileSync(served)).digest('hex');
    assert.equal(b, a, `published asset differs from the package: ${file}`);
  }
});
