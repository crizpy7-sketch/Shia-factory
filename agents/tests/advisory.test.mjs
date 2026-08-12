/* Boris's advisory pass over a Factory project graph. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {review}=require('../advisory.js');

/* Mirrors the block definitions the Factory registers in index.html. */
const defs={
  forms:{name:'Forms Block #001',version:'1.0.0',stability:'stable',out:{id:'submitted',type:'Record'}},
  records:{name:'Records Block #002',version:'0.2.0',stability:'development',in:{id:'addRecord',type:'Record'}}
};
const codes=r=>r.findings.map(f=>f.code);

test('an empty graph is reported as nothing to review', () => {
  const r=review({blocks:[],connections:[]},{defs});
  assert.deepEqual(codes(r), ['empty-graph']);
  assert.equal(r.scope_of.blocks, 0);
});

test('the default starter graph only flags the development-stage block', () => {
  const r=review({
    blocks:[{id:'f',type:'forms',title:'Customer Booking'},{id:'r',type:'records',title:'Appointment Records'}],
    connections:[{id:'c',from:'f',fromPort:'submitted',to:'r',toPort:'addRecord',type:'Record'}]
  },{defs});
  assert.deepEqual(codes(r), ['unstable-dependency']);
});

test('an unrouted output is a high finding with rework attached', () => {
  const r=review({blocks:[{id:'f',type:'forms',title:'Customer Booking'}],connections:[]},{defs});
  const finding=r.findings.find(f=>f.code==='unrouted-output');
  assert.equal(finding.severity, 'high');
  assert.match(finding.message, /Customer Booking/);
  assert.match(finding.message, /dropped at run time/);
  assert.ok(finding.rework);
  assert.equal(r.counts.high, 1);
});

test('an input nothing feeds is flagged', () => {
  const r=review({blocks:[{id:'r',type:'records',title:'Appointment Records'}],connections:[]},{defs});
  assert.ok(codes(r).includes('unfed-input'));
});

test('duplicate instance titles are flagged as ambiguous', () => {
  const r=review({
    blocks:[{id:'r1',type:'records',title:'Appointment Records'},{id:'r2',type:'records',title:'appointment records'}],
    connections:[]
  },{defs});
  assert.equal(r.findings.filter(f=>f.code==='ambiguous-titles').length, 1);
});

test('connections pointing at absent blocks are flagged', () => {
  const r=review({
    blocks:[{id:'f',type:'forms',title:'Customer Booking'}],
    connections:[{id:'c',from:'f',fromPort:'submitted',to:'ghost',toPort:'addRecord',type:'Record'}]
  },{defs});
  assert.ok(codes(r).includes('dangling-connection'));
});

test('findings are ordered by severity', () => {
  const r=review({
    blocks:[{id:'f',type:'forms',title:'A'},{id:'r',type:'records',title:'B'}],
    connections:[]
  },{defs});
  const rank={high:0,medium:1,low:2};
  const seen=r.findings.map(f=>rank[f.severity]);
  assert.deepEqual(seen, [...seen].sort((a,b)=>a-b));
});

test('the review never mutates the project it was handed', () => {
  const project={blocks:[{id:'f',type:'forms',title:'Customer Booking'}],connections:[]};
  const before=JSON.stringify(project);
  review(project,{defs});
  assert.equal(JSON.stringify(project), before);
});

test('every finding carries a target for the Inspector card', () => {
  const r=review({
    blocks:[{id:'f',type:'forms',title:'Customer Booking'},{id:'r',type:'records',title:'Appointment Records'}],
    connections:[]
  },{defs});
  assert.ok(r.findings.length>0);
  for(const f of r.findings){
    assert.ok(f.target, `finding without a target: ${f.code}`);
    assert.ok(Array.isArray(f.tags)&&f.tags.length, `finding without tags: ${f.code}`);
  }
});

test('block scope returns only findings for the selected block', () => {
  const r=review({
    blocks:[{id:'f',type:'forms',title:'Customer Booking'},{id:'r',type:'records',title:'Appointment Records'}],
    connections:[]
  },{defs,scope:'block',selectedBlockId:'r'});
  assert.equal(r.scope, 'block');
  assert.ok(r.findings.length>0);
  assert.ok(r.findings.every(f=>f.blockId==='r'));
});

test('connections scope returns only wiring findings', () => {
  const r=review({
    blocks:[{id:'f',type:'forms',title:'Customer Booking'},{id:'r',type:'records',title:'Appointment Records'}],
    connections:[]
  },{defs,scope:'connections'});
  assert.ok(r.findings.length>0);
  assert.ok(r.findings.every(f=>f.tags.includes('connections')));
  assert.equal(r.findings.some(f=>f.code==='unstable-dependency'), false);
});

test('highest-risk scope returns a single finding and reports what it withheld', () => {
  const r=review({
    blocks:[{id:'f',type:'forms',title:'Customer Booking'},{id:'r',type:'records',title:'Appointment Records'}],
    connections:[]
  },{defs,scope:'highest-risk'});
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].severity, 'high');
  assert.ok(r.withheld>0);
  assert.equal(r.total, r.findings.length+r.withheld);
});

test('runtime scope reports observed telemetry, not assumptions', () => {
  const graph={blocks:[{id:'r',type:'records',title:'Appointment Records'}],connections:[]};
  const none=review(graph,{defs,scope:'runtime'});
  assert.ok(none.findings.some(f=>f.code==='runtime-no-evidence'), 'expected an explicit "no evidence yet" finding');

  const observed=review(graph,{defs,scope:'runtime',telemetry:{readyCounts:{r:57},pendingDeliveries:2,mounted:true}});
  const storm=observed.findings.find(f=>f.code==='runtime-ready-storm');
  assert.equal(storm.severity, 'high');
  assert.match(storm.message, /57 times/);
  assert.equal(storm.target, 'Appointment Records');
  assert.ok(observed.findings.some(f=>f.code==='runtime-unacked-delivery'));
  assert.equal(observed.findings.some(f=>f.code==='runtime-no-evidence'), false);
});

test('a single ready per instance is not reported as a storm', () => {
  const r=review({blocks:[{id:'r',type:'records',title:'Appointment Records'}],connections:[]},
    {defs,scope:'runtime',telemetry:{readyCounts:{r:1},pendingDeliveries:0,mounted:true}});
  assert.equal(r.findings.some(f=>f.code==='runtime-ready-storm'), false);
});

test('telemetry does not leak into the default factory scope unless something is wrong', () => {
  const r=review({blocks:[{id:'f',type:'forms',title:'Customer Booking'},{id:'r',type:'records',title:'Appointment Records'}],
    connections:[{id:'c',from:'f',fromPort:'submitted',to:'r',toPort:'addRecord',type:'Record'}]},
    {defs,telemetry:{readyCounts:{f:1,r:1},pendingDeliveries:0,mounted:true}});
  assert.deepEqual(codes(r), ['unstable-dependency']);
});

test('every review restates the authority and recertification boundaries', () => {
  const r=review({blocks:[],connections:[]},{defs});
  assert.equal(r.agent_id, 'BORIS-001');
  assert.ok(r.notes.some(n=>/cannot merge, deploy or access secrets/i.test(n)));
  assert.ok(r.notes.some(n=>/Cristian/.test(n)));
  assert.ok(r.notes.some(n=>/recertification is PENDING/i.test(n)));
});
