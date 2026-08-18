/* Boris's build pass: what he generates, what he refuses to generate, and whether the code he
   writes actually holds up. The last test in this file writes the export to a temp directory and
   runs the checks Boris generated for it — if his own checks do not pass against his own output,
   the build is not a build. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const require=createRequire(import.meta.url);
const registry=require('../registry.js');
const advisory=require('../advisory.js');
const {build,normalize,fingerprint,TARGETS}=require('../build.js');

const defs={
  forms:{name:'Forms Block #001',version:'1.0.0',stability:'stable',out:{id:'submitted',type:'Record'}},
  records:{name:'Records Block #002',version:'0.2.0',stability:'development',in:{id:'addRecord',type:'Record'}}
};
/* The Factory's starter graph: one capture block wired into one store. */
const project={
  name:'Barber Booking',
  blocks:[
    {id:'booking-form',type:'forms',x:120,y:180,title:'Customer Booking'},
    {id:'appointment-records',type:'records',x:500,y:240,title:'Appointment Records'}
  ],
  connections:[{id:'starter',from:'booking-form',fromPort:'submitted',to:'appointment-records',toPort:'addRecord',type:'Record'}]
};
const at=(out,path)=>out.artifacts.find(a=>a.path===path);

/* A nested `node --test` inherits this runner's reporter channel and reports into it instead of
   its own stdout, which makes the child look silent and always successful. Clearing it gives the
   child a normal TAP run and a real exit code. */
function cleanEnv(){
  const env=Object.assign({},process.env);
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  return env;
}

test('an empty workbench produces nothing rather than an empty export', () => {
  const out=build({name:'x',blocks:[],connections:[]},{defs});
  assert.equal(out.status, 'empty');
  assert.deepEqual(out.artifacts, []);
  assert.match(out.summary, /Nothing to build/);
});

test('the starter graph builds the full export', () => {
  const out=build(project,{defs});
  assert.equal(out.status, 'built');
  assert.equal(out.agent_id, 'BORIS-001');
  assert.deepEqual(out.artifacts.map(a=>a.path).sort(), TARGETS.export.artifacts.slice().sort());
  for(const a of out.artifacts){
    assert.ok(a.contents.length>0, `${a.path} is empty`);
    assert.equal(typeof a.bytes, 'number');
    assert.ok(a.bytes>0);
  }
});

test('the same graph always produces byte-identical artifacts', () => {
  const a=build(project,{defs}), b=build(project,{defs});
  assert.deepEqual(a.artifacts.map(x=>[x.path,x.fingerprint]), b.artifacts.map(x=>[x.path,x.fingerprint]));
  assert.equal(at(a,'glue.js').contents, at(b,'glue.js').contents);
});

test('moving a block on the canvas does not change what gets built', () => {
  const moved=JSON.parse(JSON.stringify(project));
  moved.blocks[0].x=999;moved.blocks[0].y=42;
  assert.equal(build(project,{defs}).graph.fingerprint, build(moved,{defs}).graph.fingerprint,
    'coordinates leaked into the build');
});

test('changing a route does change what gets built', () => {
  const rewired=JSON.parse(JSON.stringify(project));
  rewired.connections=[];
  assert.notEqual(build(project,{defs}).graph.fingerprint, build(rewired,{defs},{}).graph.fingerprint);
});

test('the generated glue routes exactly the connections in the graph', () => {
  const glue=at(build(project,{defs}),'glue.js').contents;
  assert.match(glue, /"from": "booking-form"/);
  assert.match(glue, /"to": "appointment-records"/);
  assert.match(glue, /"fromPort": "submitted"/);
  assert.match(glue, /"toPort": "addRecord"/);
  /* The contract the real block runtimes speak. */
  assert.match(glue, /shia-block-runtime/);
  assert.match(glue, /'port-output'/);
  assert.match(glue, /'port-input'/);
  assert.match(glue, /'configure'/);
  assert.match(glue, /'ack'/);
});

test('the generated glue configures each runtime once, so the ready handshake cannot loop', () => {
  const glue=at(build(project,{defs}),'glue.js').contents;
  assert.match(glue, /configured\.has\(msg\.instanceId\)/, 'configure is not guarded against repeat readies');
  assert.match(glue, /configured\.add\(msg\.instanceId\)/);
});

test('a connection to a block that is not on the workbench is not routed', () => {
  const dangling=JSON.parse(JSON.stringify(project));
  dangling.connections.push({id:'ghost',from:'booking-form',fromPort:'submitted',to:'deleted-block',toPort:'addRecord',type:'Record'});
  /* The dangling edge is a high-severity advisory finding, so force past the block to inspect
     what actually got generated. */
  const out=build(dangling,{defs,advisory,force:true});
  assert.equal(out.status, 'built');
  assert.ok(!at(out,'glue.js').contents.includes('deleted-block'), 'a route to a missing block was generated');
});

test('Boris refuses to build over a high-severity defect he can see', () => {
  const broken={name:'Broken',blocks:[{id:'f',type:'forms',title:'Customer Booking'}],connections:[]};
  const out=build(broken,{defs,advisory});
  assert.equal(out.status, 'blocked');
  assert.deepEqual(out.artifacts, []);
  assert.ok(out.blockers.length>0);
  assert.ok(out.blockers.every(b=>b.severity==='high'));
  assert.match(out.summary, /Build blocked/);
});

test('Force builds anyway, and says the export encodes the defect', () => {
  const broken={name:'Broken',blocks:[{id:'f',type:'forms',title:'Customer Booking'}],connections:[]};
  const out=build(broken,{defs,advisory,force:true});
  assert.equal(out.status, 'built');
  assert.equal(out.forced, true);
  assert.ok(out.artifacts.length>0);
  assert.match(out.summary, /Built over 1 high-severity defect/);
});

test('a pre-build review that throws abandons the build rather than building blind', () => {
  const out=build(project,{defs,advisory:{review(){throw new Error('walker exploded')}}});
  assert.equal(out.status, 'error');
  assert.deepEqual(out.artifacts, []);
  assert.match(out.error, /walker exploded/);
  assert.match(out.summary, /never verified/);
});

test('narrower targets emit only their own artifacts', () => {
  assert.deepEqual(build(project,{defs,target:'glue'}).artifacts.map(a=>a.path), ['glue.js','checks.mjs']);
  assert.deepEqual(build(project,{defs,target:'checks'}).artifacts.map(a=>a.path), ['checks.mjs']);
});

test('the manifest records what was built and what stayed withheld', () => {
  const manifest=JSON.parse(at(build(project,{defs}),'build-manifest.json').contents);
  assert.equal(manifest.generated_by, 'BORIS-001');
  assert.equal(manifest.grant, 'BORIS-BUILD-001');
  assert.deepEqual(manifest.withheld, ['may_merge','may_deploy','may_access_secrets']);
  assert.equal(manifest.final_authority, 'Cristian');
  /* Every emitted artifact is accounted for, and the manifest does not list files it never wrote. */
  const emitted=build(project,{defs}).artifacts.filter(a=>a.path!=='build-manifest.json').map(a=>a.path).sort();
  assert.deepEqual(manifest.artifacts.map(a=>a.path).sort(), emitted);
});

test('the README states the boundaries rather than implying the export is deployed', () => {
  const readme=at(build(project,{defs}),'README.md').contents;
  assert.match(readme, /What Boris did not do/);
  assert.match(readme, /not landed anywhere/);
  assert.match(readme, /nothing was published, uploaded or released/i);
  assert.match(readme, /Final authority: \*\*Cristian\*\*/);
});

test('nothing that looks like a credential reaches the generated code', () => {
  for(const a of build(project,{defs}).artifacts){
    assert.doesNotMatch(a.contents, /\b(?:api[-_ ]?key|secret|password|bearer|authorization:)\b/i,
      `${a.path} contains something credential-shaped`);
  }
});

test('normalize drops everything that is not part of the build', () => {
  const g=normalize(project,{forms:'forms-001',records:'records-002'});
  assert.deepEqual(Object.keys(g.blocks[0]).sort(), ['id','runtime','title','type']);
  assert.equal(g.blocks[0].x, undefined);
});

test('the fingerprint is stable and distinguishes different graphs', () => {
  assert.equal(fingerprint('abc'), fingerprint('abc'));
  assert.notEqual(fingerprint('abc'), fingerprint('abd'));
  assert.match(fingerprint('abc'), /^[0-9a-f]{8}$/);
});

test('the build is offered only under the grant that authorises it', () => {
  const eff=registry.capabilities(registry.byId('BORIS-001'));
  assert.equal(eff.may_author_code, true);
  assert.equal(eff.may_build, true);
  assert.equal(registry.capabilities(registry.byId('GARY-001')).may_build, undefined);
});

/* The end-to-end one: Boris's generated checks, run against Boris's generated glue. */
test('the checks Boris generated pass against the code Boris generated', () => {
  const out=build(project,{defs});
  const dir=mkdtempSync(join(tmpdir(),'shia-build-'));
  try{
    for(const a of out.artifacts)writeFileSync(join(dir,a.path),a.contents);
    const stdout=execFileSync(process.execPath,['--test','checks.mjs'],{cwd:dir,encoding:'utf8',env:cleanEnv()});
    assert.match(stdout, /# fail 0/, `generated checks failed:\n${stdout}`);
    assert.doesNotMatch(stdout, /# pass 0/, 'the generated checks ran nothing');
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});

test('the generated checks fail when the glue stops matching its graph', () => {
  const out=build(project,{defs});
  const dir=mkdtempSync(join(tmpdir(),'shia-build-bad-'));
  try{
    for(const a of out.artifacts){
      /* Hand-edit the glue the way the README warns against: drop the route. */
      const contents=a.path==='glue.js'?a.contents.replace(/const ROUTES=\[[\s\S]*?\];/,'const ROUTES=[];'):a.contents;
      writeFileSync(join(dir,a.path),contents);
    }
    let failed=false;
    try{execFileSync(process.execPath,['--test','checks.mjs'],{cwd:dir,encoding:'utf8',env:cleanEnv(),stdio:'pipe'})}
    catch(e){failed=true}
    assert.ok(failed, 'the generated checks passed against glue that no longer matches the graph');
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});
