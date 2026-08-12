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
  assert.equal(r.scope.blocks, 0);
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

test('every review restates the authority and recertification boundaries', () => {
  const r=review({blocks:[],connections:[]},{defs});
  assert.equal(r.agent_id, 'BORIS-001');
  assert.ok(r.notes.some(n=>/cannot merge, deploy or access secrets/i.test(n)));
  assert.ok(r.notes.some(n=>/Cristian/.test(n)));
  assert.ok(r.notes.some(n=>/recertification is PENDING/i.test(n)));
});
