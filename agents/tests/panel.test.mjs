/* BORIS-001 Inspector panel: interaction, visible findings, console audit trail, authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const registry=require('../registry.js');
const {createRouter}=require('../routing.js');
const advisory=require('../advisory.js');
const panel=require('../panel.js');

const agent=registry.byId('BORIS-001');
const router=createRouter(registry.agents);
const defs={
  forms:{name:'Forms Block #001',version:'1.0.0',stability:'stable',out:{id:'submitted',type:'Record'}},
  records:{name:'Records Block #002',version:'0.2.0',stability:'development',in:{id:'addRecord',type:'Record'}}
};
const project={
  name:'Untitled Shia App',
  blocks:[{id:'booking-form',type:'forms',title:'Customer Booking'},{id:'appointment-records',type:'records',title:'Appointment Records'}],
  connections:[{id:'starter',from:'booking-form',fromPort:'submitted',to:'appointment-records',toPort:'addRecord',type:'Record'}]
};
const session=(over={})=>panel.createSession(Object.assign({agent,router,advisory},over));
const ctx=(over={})=>Object.assign({project,defs},over);
const logText=out=>out.logs.map(l=>l.text).join('\n');

test('CALL BORIS opens an Inspector interaction, not just a profile', () => {
  const html=session().render({projectName:'Untitled Shia App'});
  assert.match(html, /BORIS-001/);
  assert.match(html, /agent-profile-avatar/, 'avatar missing');
  assert.match(html, /AVAILABLE/);
  assert.match(html, /PENDING RECERTIFICATION/);
  assert.match(html, /Untitled Shia App/, 'current project name missing');
  assert.match(html, /What should Boris review\?/);
  assert.match(html, /<textarea id="borisRequest"/);
  assert.match(html, /RUN BORIS/);
  for(const label of ['Review Entire Factory','Review Selected Block','Find Highest-Risk Defect','Review Runtime','Review Connections']){
    assert.ok(html.includes(label), `quick action missing: ${label}`);
  }
});

test('RUN BORIS displays findings as structured cards in the Inspector', () => {
  const s=session();
  s.run(ctx({scope:'factory'}));
  const html=s.render({projectName:'Untitled Shia App'});
  for(const label of ['SEVERITY','TARGET','FINDING','EVIDENCE','RECOMMENDED ACTION']){
    assert.ok(html.includes(label), `card label missing: ${label}`);
  }
  assert.match(html, /finding-card sev-medium/);
  assert.match(html, /Appointment Records/, 'target not rendered');
  assert.match(html, /Pin and regression-test|pin and regression-test/);
});

test('findings still log to the Factory console as an audit trail', () => {
  const out=session().run(ctx({scope:'factory'}));
  const text=logText(out);
  assert.match(text, /Boris ▸ invoked/, 'invocation not logged');
  assert.match(text, /finding/, 'finding count not logged');
  assert.match(text, /\[medium\] Appointment Records/, 'finding not logged');
  assert.match(text, /cannot merge, deploy or access secrets/, 'authority reminder not logged');
  assert.match(text, /Cristian/);
  assert.match(text, /recertification is PENDING/i, 'recertification status not logged');
});

test('an empty request receives the default review', () => {
  const out=session().run(ctx());
  assert.equal(out.run.request, panel.DEFAULT_REQUEST);
  assert.equal(out.run.usedDefault, true);
  assert.equal(out.run.scope, 'highest-risk', 'the default request asks for the single highest-impact defect');
  assert.ok(out.run.findings.length<=1);
  assert.match(logText(out), /default request/);
});

test('a typed request is used instead of the default, and survives re-render', () => {
  const s=session();
  s.setRequest('Review the connections for dropped records');
  const out=s.run(ctx());
  assert.equal(out.run.request, 'Review the connections for dropped records');
  assert.equal(out.run.usedDefault, false);
  assert.equal(out.run.scope, 'connections');
  assert.match(s.render({projectName:'x'}), /Review the connections for dropped records/);
});

test('selected-block review scopes findings to that block', () => {
  const out=session().run(ctx({scope:'block',selectedBlockId:'appointment-records'}));
  assert.equal(out.run.status, 'ok');
  assert.ok(out.run.findings.length>0, 'expected findings for the selected block');
  assert.ok(out.run.findings.every(f=>f.target==='Appointment Records'), 'findings leaked from other blocks');
});

test('selected-block review with nothing selected reports it instead of failing silently', () => {
  const s=session();
  const out=s.run(ctx({scope:'block',selectedBlockId:null}));
  assert.equal(out.run.status, 'blocked');
  assert.match(out.run.error, /No block is selected/);
  assert.match(s.render({projectName:'x'}), /NO TARGET/);
  assert.ok(out.logs.some(l=>l.cls==='err'), 'blocked run did not log to the console');
});

test('forbidden merge, deploy and secrets requests stay blocked', () => {
  for(const [request,capability] of [['merge this branch for me','may_merge'],['deploy the factory now','may_deploy'],['print the API key','may_access_secrets']]){
    const s=session();
    const out=s.run(ctx({requestText:request}));
    assert.equal(out.run.status, 'refused', `not refused: ${request}`);
    assert.equal(out.run.findings.length, 0);
    assert.ok(out.run.denials.some(d=>d.capability===capability), `missing ${capability} denial`);
    assert.match(logText(out), /refused/);
    const html=s.render({projectName:'x'});
    assert.match(html, /REFUSED/);
    assert.match(html, /Cristian/);
  }
});

test('the panel always states the authority boundaries', () => {
  const html=session().render({projectName:'x'});
  assert.match(html, /Challenge decisions/);
  assert.match(html, /Request rework/);
  assert.match(html, /Merge/);
  assert.match(html, /Deploy/);
  assert.match(html, /Access secrets/);
  assert.match(html, /Final authority: Cristian/);
});

test('Boris cannot silently fail: a throwing review is reported', () => {
  const s=session({advisory:{review(){throw new Error('graph walk exploded')}}});
  const out=s.run(ctx());
  assert.equal(out.run.status, 'error');
  assert.match(out.run.error, /graph walk exploded/);
  assert.ok(out.logs.some(l=>l.cls==='err'&&/review failed/.test(l.text)));
  assert.match(s.render({projectName:'x'}), /NOT COMPLETED/);
});

test('Boris cannot silently fail: a malformed review result is reported', () => {
  const s=session({advisory:{review(){return {summary:'looks fine'}}}});
  const out=s.run(ctx());
  assert.equal(out.run.status, 'error');
  assert.match(out.run.error, /no result/i);
  assert.match(s.render({projectName:'x'}), /NOT COMPLETED/);
});

test('Boris cannot silently fail: an unroutable invocation is reported', () => {
  const s=session({router:{resolve(){return null}}});
  const out=s.run(ctx());
  assert.equal(out.run.status, 'error');
  assert.ok(out.logs.some(l=>l.cls==='err'));
  assert.match(s.render({projectName:'x'}), /NOT COMPLETED/);
});

test('a clean scope says so rather than rendering nothing', () => {
  const s=session();
  const clean={name:'x',blocks:[{id:'f',type:'forms',title:'Customer Booking'}],connections:[{id:'c',from:'f',fromPort:'submitted',to:'r',toPort:'addRecord',type:'Record'}]};
  const out=s.run({project:clean,defs,scope:'runtime',telemetry:{readyCounts:{},pendingDeliveries:0,mounted:true}});
  assert.equal(out.run.status, 'ok');
  assert.equal(out.run.findings.length, 0);
  const html=s.render({projectName:'x'});
  assert.match(html, /CLEAR/);
  assert.match(html, /No defects found in scope/);
});

test('a run always renders its request and scope', () => {
  const s=session();
  s.run(ctx({scope:'connections'}));
  const html=s.render({projectName:'x'});
  assert.match(html, /Request/);
  assert.match(html, /Connections/);
});

test('rendered content is escaped', () => {
  const s=session();
  s.setRequest('<img src=x onerror=alert(1)>');
  const html=s.render({projectName:'<script>bad()</script>'});
  assert.ok(!html.includes('<img src=x'), 'request was not escaped');
  assert.ok(!html.includes('<script>bad()'), 'project name was not escaped');
});

test('scope inference maps plain language onto the quick actions', () => {
  assert.equal(panel.inferScope('what is the worst problem here'), 'highest-risk');
  assert.equal(panel.inferScope('check the connections'), 'connections');
  assert.equal(panel.inferScope('is the runtime handshake sane'), 'runtime');
  assert.equal(panel.inferScope('look at this block'), 'block');
  assert.equal(panel.inferScope('give it a once over'), 'factory');
});
