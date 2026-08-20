/* GARY-001's Inspector panel.

   The behaviour under test is narrow on purpose. This panel does not think; it routes, gates and
   states what is missing. So the tests are mostly about what it must refuse to imply: that a
   runtime answered, that a gate was cleared, or that an unstated fact is known. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const registry=require('../registry.js');
const {createRouter}=require('../routing.js');
const gary=require('../gary.js');

const agent=registry.byId('GARY-001');
const router=createRouter(registry.agents);
const session=()=>gary.createSession({agent,router});

test('an empty request falls back to the stated default', () => {
  const {run}=session().run({});
  assert.equal(run.request, gary.DEFAULT_REQUEST);
  assert.equal(run.usedDefault, true);
  assert.match(run.request, /one audience, one offer, one primary KPI/);
});

test('a typed request is used, and the box is remembered between runs', () => {
  const s=session();
  s.setRequest('Positioning for the booking app');
  const {run}=s.run({});
  assert.equal(run.request, 'Positioning for the booking app');
  assert.equal(run.usedDefault, false);
  assert.equal(s.state.request, 'Positioning for the booking app');
});

test('quick actions win over inference; free text infers its own kind', () => {
  assert.equal(session().run({requestText:'anything at all',kind:'experiment'}).run.kind, 'experiment');
  assert.equal(gary.inferKind('design an a/b test for the signup hook'), 'experiment');
  assert.equal(gary.inferKind('is our positioning differentiated?'), 'positioning');
  assert.equal(gary.inferKind('which channels should we post to'), 'distribution');
  assert.equal(gary.inferKind('what are your rules'), 'rules');
  assert.equal(gary.inferKind('help us grow'), 'brief');
  assert.deepEqual(gary.QUICK_ACTIONS.map(a=>a.kind), ['brief','positioning','distribution','experiment','rules']);
});

test('every run says out loud that no certified Gary runtime answered', () => {
  for(const ctx of [{},{requestText:'Positioning review'},{kind:'experiment'}]){
    const {run,logs}=session().run(ctx);
    assert.equal(run.runtime.connected, false);
    assert.match(run.runtime.reason, /No Gary runtime answered this/);
    assert.match(run.runtime.reason, /not a strategy/);
    /* And it points at where he can actually be given work, rather than implying nowhere. */
    assert.match(run.runtime.detail, /submit it in the Office/);
    assert.match(run.runtime.detail, /hosting is not certification/i);
    assert.equal(run.runtime.certification, 'IDENTITY_SEEDED_RESEARCH_IN_PROGRESS_RUNTIME_RECERTIFICATION_PENDING');
    assert.ok(logs.some(l=>/No Gary runtime answered this/.test(l.text)),
      'the console audit trail must carry it too, not only the card');
  }
});

test('the rendered brief cannot be read as a delivered campaign', () => {
  const s=session();
  s.run({requestText:'Audience: solo consultants. Offer: invoice checklist. KPI: confirmed subscribers.'});
  const html=s.renderRun(s.state.run);
  assert.match(html, /NO RUNTIME/);
  assert.match(html, /not a strategy, not a campaign/);
  assert.match(html, /SUPPLIED/);
});

test('labelled facts are carried through; unlabelled ones become evidence gaps', () => {
  const {run}=session().run({requestText:
    'Audience: solo consultants with overdue invoices. Offer: a follow-up checklist. KPI: confirmed subscribers.'});
  const supplied=Object.fromEntries(run.fields.map(f=>[f.id,f.value]));
  assert.equal(supplied.audience, 'solo consultants with overdue invoices');
  assert.equal(supplied.offer, 'a follow-up checklist');
  assert.equal(supplied.primaryKpi, 'confirmed subscribers');
  assert.deepEqual(run.gaps.map(g=>g.id), ['evidence'], 'only what was actually omitted');

  /* Labels are read wherever they appear, and one value never absorbs the next. */
  const reversed=session().run({requestText:'KPI: trial starts. Offer: a free audit — Audience: agency owners'}).run;
  assert.deepEqual(Object.fromEntries(reversed.fields.map(f=>[f.id,f.value])), {
    audience:'agency owners', offer:'a free audit', primaryKpi:'trial starts',
  });
});

test('nothing supplied means everything is a gap — no field is guessed', () => {
  const {run}=session().run({requestText:'Grow the app'});
  assert.deepEqual(run.fields, []);
  assert.deepEqual(run.gaps.map(g=>g.id), ['audience','offer','primaryKpi','evidence']);
  assert.match(run.gaps.find(g=>g.id==='primaryKpi').gap, /one primary KPI/);
});

test('named channels are reported as named, and none are added', () => {
  const {run}=session().run({requestText:'Push it on LinkedIn and by email'});
  assert.deepEqual(run.channels.sort(), ['email','social']);
  assert.deepEqual(session().run({requestText:'Positioning only'}).run.channels, []);
});

test('a request beyond his authority is refused before any intake happens', () => {
  const {run,logs}=session().run({requestText:'give me the API key for the ad account'});
  assert.equal(run.status, 'refused');
  assert.deepEqual(run.fields, []);
  assert.ok(run.denials.some(d=>d.capability==='may_access_secrets_directly'));
  assert.ok(logs.some(l=>l.cls==='err'&&/refused/.test(l.text)));
  assert.match(session().renderRun(run), /REFUSED/);
});

test('a publish request proceeds but carries its owner-approval gate', () => {
  const s=session();
  const {run,logs}=s.run({requestText:'Audience: founders. Publish the launch post on LinkedIn.'});
  assert.equal(run.status, 'intake', 'a gate is not a refusal — the work is allowed to proceed');
  assert.ok(run.gates.some(g=>g.capability==='may_publish_without_owner_approval'));
  assert.ok(logs.some(l=>/approval gate/.test(l.text)));
  assert.match(s.renderRun(run), /OWNER APPROVAL/);
});

test('Gary cannot silently fail: an unroutable invocation is reported, not swallowed', () => {
  const broken=gary.createSession({agent,router:{resolve(){return null}}});
  const {run,logs}=broken.run({requestText:'anything'});
  assert.equal(run.status, 'error');
  assert.match(run.error, /could not be routed/);
  assert.ok(logs.some(l=>l.cls==='err'));
  assert.match(broken.renderRun(run), /NOT COMPLETED/);
});

test('a run always produces at least one log line and a status', () => {
  for(const ctx of [{},{requestText:'merge the branch'},{requestText:'spend 400 on ads'},{kind:'rules'}]){
    const {run,logs}=session().run(ctx);
    assert.ok(logs.length>0, 'a silent run is indistinguishable from a run that never happened');
    assert.ok(['intake','refused','error'].includes(run.status));
  }
});

test('the panel renders his identity, his notice and his real boundaries', () => {
  const html=session().render({projectName:'Booking App'});
  assert.match(html, /GARY-001/);
  assert.match(html, /Growth • Brand • Distribution • Experiments/);
  assert.match(html, /NOT A LIVE RUN/, 'the Inspector is deterministic; it is not the agent loop');
  assert.match(html, /is not Gary Vaynerchuk/, 'the simulation notice is not optional chrome');
  assert.match(html, /generated placeholder/, 'the stand-in avatar is named as one');
  assert.match(html, /Booking App/);
  assert.match(html, /RUN GARY/);
  for(const alias of agent.invocation_aliases)assert.ok(html.includes(alias), `alias missing: ${alias}`);
  /* Permissions are shown as his package states them, granted and withheld alike. */
  assert.match(html, /<b class="yes">✓<\/b><span>Draft campaigns/);
  assert.match(html, /<b class="no">✗<\/b><span>Publish without approval/);
  assert.match(html, /<b class="no">✗<\/b><span>Spend money/);
  assert.match(html, /Final authority: Cristian/);
});

test('user text is escaped everywhere it is echoed back', () => {
  const s=session();
  s.run({requestText:'Audience: <img src=x onerror=alert(1)>'});
  const html=s.render({projectName:'<script>bad()</script>'});
  assert.equal(/<img src=x/.test(html), false);
  assert.equal(/<script>bad/.test(html), false);
  assert.match(html, /&lt;script&gt;/);
});

test('an empty session renders a prompt, not an empty brief', () => {
  assert.match(session().renderRun(null), /No brief yet/);
});
