/* Gary's growth pass over a Factory project graph. Every finding here has to be readable off the
   graph — the tests exist as much to stop him inventing numbers as to check he spots gaps. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {review,SCOPES,isPlaceholder}=require('../growth.js');

/* Mirrors the block definitions the Factory registers in index.html. */
const defs={
  forms:{name:'Forms Block #001',version:'1.0.0',stability:'stable',out:{id:'submitted',type:'Record'}},
  records:{name:'Records Block #002',version:'0.2.0',stability:'development',in:{id:'addRecord',type:'Record'}}
};
const codes=r=>r.findings.map(f=>f.code);
const wired={
  name:'Barber Booking',
  blocks:[{id:'f',type:'forms',title:'Book a cut'},{id:'r',type:'records',title:'Appointments'}],
  connections:[{id:'c',from:'f',fromPort:'submitted',to:'r',toPort:'addRecord',type:'Record'}]
};

test('an empty graph is reported as having no funnel yet', () => {
  const r=review({name:'Barber Booking',blocks:[],connections:[]},{defs});
  assert.deepEqual(codes(r), ['empty-graph']);
  assert.equal(r.scope_of.blocks, 0);
});

test('a named, wired two-step graph is clean', () => {
  assert.deepEqual(codes(review(wired,{defs})), []);
  assert.match(review(wired,{defs}).summary, /No growth gaps found/);
});

test('the default project name is flagged as an unmade positioning decision', () => {
  const r=review(Object.assign({},wired,{name:'Untitled Shia App'}),{defs});
  assert.ok(codes(r).includes('unpositioned-app'));
  const f=r.findings.find(x=>x.code==='unpositioned-app');
  assert.equal(f.severity, 'medium');
  assert.match(f.evidence, /project\.name/);
  assert.ok(f.rework.length>0);
});

test('a capture step with nowhere to send customers is the highest-severity gap', () => {
  const r=review({name:'Barber Booking',blocks:[{id:'f',type:'forms',title:'Book a cut'}],connections:[]},{defs});
  const f=r.findings.find(x=>x.code==='capture-without-followup');
  assert.ok(f, 'an unrouted capture step was not flagged');
  assert.equal(f.severity, 'high');
  assert.equal(f.blockId, 'f');
  assert.match(f.message, /cannot follow up/);
  assert.match(f.rework, /do not drive traffic/i);
  /* Gary reads the same edge Boris does, and asks for something different about it. */
  assert.match(f.evidence, /no connection from f\.submitted/);
});

test('a graph that captures nobody is flagged before anything else', () => {
  const r=review({name:'Barber Booking',blocks:[{id:'r',type:'records',title:'Appointments'}],connections:[]},{defs});
  assert.ok(codes(r).includes('no-capture'));
  assert.equal(r.findings.find(x=>x.code==='no-capture').severity, 'high');
});

test('capture with nothing retaining it cannot be measured beyond volume', () => {
  const r=review({name:'Barber Booking',blocks:[{id:'f',type:'forms',title:'Book a cut'}],connections:[]},{defs});
  const f=r.findings.find(x=>x.code==='no-retention');
  assert.ok(f);
  assert.match(f.message, /report volume and nothing else/);
});

test('one block is reported as no funnel at all', () => {
  const r=review({name:'Barber Booking',blocks:[{id:'f',type:'forms',title:'Book a cut'}],connections:[]},{defs});
  assert.ok(codes(r).includes('single-step'));
});

test('a step still carrying its shipped name is a positioning gap, not a defect', () => {
  const r=review({
    name:'Barber Booking',
    blocks:[{id:'f',type:'forms',title:'Forms Block #001'},{id:'r',type:'records',title:'Appointments'}],
    connections:[{id:'c',from:'f',fromPort:'submitted',to:'r',toPort:'addRecord',type:'Record'}]
  },{defs});
  const f=r.findings.find(x=>x.code==='unnamed-step');
  assert.ok(f);
  assert.equal(f.severity, 'low');
  assert.match(f.message, /sees a component, not a step/);
});

test('two capture steps sharing a name cannot be attributed', () => {
  const r=review({
    name:'Barber Booking',
    blocks:[
      {id:'a',type:'forms',title:'Book a cut'},
      {id:'b',type:'forms',title:'Book a cut'},
      {id:'r',type:'records',title:'Appointments'}
    ],
    connections:[
      {id:'c1',from:'a',fromPort:'submitted',to:'r',toPort:'addRecord',type:'Record'},
      {id:'c2',from:'b',fromPort:'submitted',to:'r',toPort:'addRecord',type:'Record'}
    ]
  },{defs});
  const f=r.findings.find(x=>x.code==='unattributable-capture');
  assert.ok(f);
  assert.match(f.message, /which one converted/);
  assert.equal(f.evidence, 'a, b');
  /* Ambiguous variants are not an experiment, so he must not also call this experiment-ready. */
  assert.ok(!codes(r).includes('experiment-ready'));
});

test('distinct capture steps into one store are called out as testable', () => {
  const r=review({
    name:'Barber Booking',
    blocks:[
      {id:'a',type:'forms',title:'Book a cut'},
      {id:'b',type:'forms',title:'Book a beard trim'},
      {id:'r',type:'records',title:'Appointments'}
    ],
    connections:[
      {id:'c1',from:'a',fromPort:'submitted',to:'r',toPort:'addRecord',type:'Record'},
      {id:'c2',from:'b',fromPort:'submitted',to:'r',toPort:'addRecord',type:'Record'}
    ]
  },{defs});
  const f=r.findings.find(x=>x.code==='experiment-ready');
  assert.ok(f);
  assert.equal(f.severity, 'low');
  assert.match(f.rework, /one primary KPI/);
});

test('scopes narrow the findings without changing them', () => {
  const broken={name:'Untitled Shia App',blocks:[{id:'f',type:'forms',title:'Book a cut'}],connections:[]};
  const all=review(broken,{defs,scope:'factory'});
  for(const scope of ['positioning','funnel','measurement']){
    const r=review(broken,{defs,scope});
    assert.equal(r.scope, scope);
    assert.ok(r.findings.length<=all.findings.length);
    for(const f of r.findings)assert.ok(all.findings.some(x=>x.code===f.code), `${f.code} appears only under ${scope}`);
  }
});

test('the highest-impact scope returns one finding and says how many it withheld', () => {
  const broken={name:'Untitled Shia App',blocks:[{id:'f',type:'forms',title:'Book a cut'}],connections:[]};
  const r=review(broken,{defs,scope:'highest-impact'});
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].severity, 'high', 'the single finding shown is not the most severe one');
  assert.ok(r.withheld>0);
  assert.equal(r.total, r.findings.length+r.withheld);
});

test('findings are ordered most severe first', () => {
  const broken={name:'Untitled Shia App',blocks:[{id:'f',type:'forms',title:'Forms Block #001'}],connections:[]};
  const order={high:0,medium:1,low:2};
  const sev=review(broken,{defs}).findings.map(f=>order[f.severity]);
  assert.deepEqual(sev, sev.slice().sort((a,b)=>a-b));
});

test('every finding carries evidence and a rework action', () => {
  const broken={name:'Untitled Shia App',blocks:[{id:'f',type:'forms',title:'Forms Block #001'}],connections:[]};
  for(const f of review(broken,{defs}).findings){
    assert.ok(f.evidence&&f.evidence.length>0, `${f.code} has no evidence`);
    assert.ok(f.rework&&f.rework.length>0, `${f.code} has no rework action`);
    assert.ok(Array.isArray(f.tags)&&f.tags.length>0, `${f.code} has no tags`);
  }
});

test('the notes state the limits Gary operates under, every run', () => {
  const notes=review(wired,{defs}).notes.join(' ');
  assert.match(notes, /does not invent numbers/);
  assert.match(notes, /cannot publish, spend money, or make commitments/);
  assert.match(notes, /Final authority: Cristian/);
  assert.match(notes, /not a real person/);
  assert.match(notes, /recertification is PENDING/i);
});

test('no finding claims a number that was never measured', () => {
  const broken={name:'Untitled Shia App',blocks:[{id:'f',type:'forms',title:'Forms Block #001'}],connections:[]};
  for(const f of review(broken,{defs}).findings){
    /* Percentages, multipliers and currency are all claims about the world the graph cannot support. */
    assert.doesNotMatch(f.message, /\d+\s*%|\d+x\b|\$\d/, `${f.code} states a figure Gary has not been shown`);
  }
});

test('an unknown scope falls back to the whole factory rather than returning nothing', () => {
  const r=review(wired,{defs,scope:'not-a-scope'});
  assert.equal(r.scope, 'factory');
});

test('placeholder names are recognised, real ones are not', () => {
  for(const n of ['Untitled Shia App','untitled','New App','my app','Test','',null])assert.equal(isPlaceholder(n), true, `not treated as placeholder: ${n}`);
  for(const n of ['Barber Booking','Shia Baby','REMIXR'])assert.equal(isPlaceholder(n), false, `wrongly treated as placeholder: ${n}`);
});

test('every declared scope has a button label and a filter', () => {
  for(const [id,def] of Object.entries(SCOPES)){
    assert.ok(def.action, `scope ${id} has no action label`);
    assert.equal(typeof def.keep, 'function', `scope ${id} has no filter`);
  }
});
