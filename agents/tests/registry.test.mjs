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

test('Gary holds a council seat and is marked provisional until his package arrives', () => {
  const gary=registry.byId('GARY-001');
  assert.ok(gary, 'GARY-001 should be registered');
  assert.equal(gary.provisional, true, 'a registration without a transferred package must say so');
  assert.equal(gary.package, null, 'no package path may be claimed before one exists');
  assert.equal(gary.runtime.certification_status, 'NO_PACKAGE_RECEIVED');
  assert.ok(registry.council('Influencers Council').members.some(m=>m.agent_id==='GARY-001'));
  assert.ok(registry.provisional().some(a=>a.agent_id==='GARY-001'));
  assert.ok(registry.established().every(a=>a.agent_id!=='GARY-001'));
});

test('Gary is held at the strictest authority until his own package states otherwise', () => {
  const gary=registry.byId('GARY-001');
  assert.equal(gary.authority.may_merge, false);
  assert.equal(gary.authority.may_deploy, false);
  assert.equal(gary.authority.may_access_secrets, false);
  assert.equal(gary.authority.final_authority, 'Cristian');
});

test('nothing about Gary is fabricated: no cognitive model, no ledgers, no invented art', () => {
  const gary=registry.byId('GARY-001');
  assert.equal(gary.avatars.brand_sheet, null, 'no brand sheet may be claimed');
  assert.match(gary.avatars.square, /placeholder/, 'the stand-in must be named as a placeholder');
  assert.ok(existsSync(join(root, gary.avatars.square)), 'the placeholder asset should exist');
  assert.match(gary.provisional_note, /have not been invented/i);
  assert.equal(existsSync(join(root, 'agents', 'GARY-001')), false,
    'no identity package directory may be conjured for Gary before his files arrive');
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
