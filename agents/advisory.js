/* Shia App Factory — BORIS-001 advisory review pass.
   Boris is advisory: this produces findings and rework requests over a Factory project graph.
   It never mutates the project, and it reports what it can prove from the graph and from observed
   runtime telemetry, nothing more. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ShiaAgentAdvisory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

const SEVERITY_ORDER={high:0,medium:1,low:2};

/* Review scopes drive the Inspector's quick actions. Every scope reads the same evidence;
   they differ only in which findings they surface. */
const SCOPES={
  'factory':{label:'Entire Factory',keep:()=>true},
  'connections':{label:'Connections',keep:f=>f.tags.includes('connections')},
  'runtime':{label:'Runtime',keep:f=>f.tags.includes('runtime')},
  'block':{label:'Selected Block',keep:(f,ctx)=>f.blockId===ctx.blockId},
  'highest-risk':{label:'Highest-Risk Defect',keep:()=>true,limit:1}
};

function review(project,options){
  const opts=options||{};
  const defs=opts.defs||{};
  const scopeId=SCOPES[opts.scope]?opts.scope:'factory';
  const scope=SCOPES[scopeId];
  const blocks=(project&&project.blocks)||[];
  const connections=(project&&project.connections)||[];
  const telemetry=opts.telemetry||null;
  const findings=[];
  const label=b=>b.title||b.id;
  const def=b=>defs[b.type]||{};

  if(!blocks.length){
    findings.push({code:'empty-graph',severity:'low',target:'Factory graph',tags:['graph'],
      message:'No blocks on the workbench — nothing to review yet.',
      evidence:'project.blocks is empty',
      rework:'Drag a block onto the workbench, then run the review again.'});
  }

  blocks.forEach(b=>{
    const d=def(b);
    if(d.out&&!connections.some(c=>c.from===b.id&&c.fromPort===d.out.id)){
      findings.push({code:'unrouted-output',severity:'high',target:label(b),blockId:b.id,tags:['graph','connections'],
        message:`"${label(b)}" emits ${d.out.id} with no destination — records are dropped at run time.`,
        evidence:`no connection from ${b.id}.${d.out.id}`,
        rework:`Connect ${d.out.id} to a ${d.out.type} consumer, or remove the block.`});
    }
    if(d.in&&!connections.some(c=>c.to===b.id&&c.toPort===d.in.id)){
      findings.push({code:'unfed-input',severity:'medium',target:label(b),blockId:b.id,tags:['graph','connections'],
        message:`"${label(b)}" never receives ${d.in.id} — the block cannot be exercised.`,
        evidence:`no connection into ${b.id}.${d.in.id}`,
        rework:`Wire a ${d.in.type} producer into ${d.in.id} before relying on this path.`});
    }
    if(d.stability&&d.stability!=='stable'){
      findings.push({code:'unstable-dependency',severity:'medium',target:label(b),blockId:b.id,tags:['graph','runtime'],
        message:`"${label(b)}" runs ${d.name} v${d.version} (${d.stability}) — pin and regression-test before this ships.`,
        evidence:`${b.type} stability=${d.stability}`,
        rework:'Treat behaviour changes in this block as expected until it reaches stable.'});
    }
  });

  const seen=new Map();
  blocks.forEach(b=>{
    const key=(b.title||'').trim().toLowerCase();
    if(!key)return;
    seen.set(key,(seen.get(key)||[]).concat(b.id));
  });
  seen.forEach((ids,key)=>{
    if(ids.length<2)return;
    findings.push({code:'ambiguous-titles',severity:'medium',target:key,tags:['graph'],
      message:`${ids.length} blocks share the title "${key}" — console and audit lines become ambiguous.`,
      evidence:ids.join(', '),
      rework:'Give each instance a distinct title so delivery logs identify one block.'});
  });

  const dangling=connections.filter(c=>!blocks.some(b=>b.id===c.from)||!blocks.some(b=>b.id===c.to));
  dangling.forEach(c=>{
    findings.push({code:'dangling-connection',severity:'high',target:`${c.from} → ${c.to}`,tags:['graph','connections'],
      message:'A connection references a block that is not on the workbench.',
      evidence:`${c.from} → ${c.to}`,
      rework:'Remove the connection or restore the missing block before saving this graph.'});
  });

  /* Runtime findings come from what the Factory actually observed, never from assumption. */
  if(telemetry){
    const readyCounts=telemetry.readyCounts||{};
    Object.keys(readyCounts).forEach(id=>{
      const count=readyCounts[id];
      if(count<=1)return;
      const b=blocks.find(x=>x.id===id);
      findings.push({code:'runtime-ready-storm',severity:'high',target:b?label(b):id,blockId:id,tags:['runtime'],
        message:`"${b?label(b):id}" re-announced ready ${count} times — the configure/ready handshake is looping.`,
        evidence:`${count} ready messages from ${id}`,
        rework:'Have the runtime announce ready once, or stop re-configuring on every ready.'});
    });
    if(telemetry.pendingDeliveries>0){
      findings.push({code:'runtime-unacked-delivery',severity:'high',target:'Glue engine',tags:['runtime'],
        message:`${telemetry.pendingDeliveries} record deliver${telemetry.pendingDeliveries===1?'y was':'ies were'} never acknowledged.`,
        evidence:`${telemetry.pendingDeliveries} pending deliveries`,
        rework:'Treat an unacknowledged delivery as a failed one and surface it, rather than assuming success.'});
    }
  }
  if(scopeId==='runtime'&&!(telemetry&&telemetry.mounted)){
    findings.push({code:'runtime-no-evidence',severity:'low',target:'Block runtimes',tags:['runtime'],
      message:'No runtime evidence yet — the blocks have not been mounted in this session.',
      evidence:'no runtime telemetry recorded',
      rework:'Press Run Factory ▶ to mount the real blocks, then review the runtime again.'});
  }

  findings.sort((a,b)=>SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity]);

  const inScope=findings.filter(f=>scope.keep(f,{blockId:opts.selectedBlockId}));
  const shown=scope.limit?inScope.slice(0,scope.limit):inScope;
  const counts=shown.reduce((acc,f)=>(acc[f.severity]=(acc[f.severity]||0)+1,acc),{});

  return {
    agent_id:'BORIS-001',
    scope:scopeId,
    scope_label:scope.label,
    scope_of:{blocks:blocks.length,connections:connections.length},
    findings:shown,
    total:inScope.length,
    withheld:Math.max(0,inScope.length-shown.length),
    counts,
    summary:shown.length
      ? `${shown.length} finding${shown.length===1?'':'s'} in scope "${scope.label}" across ${blocks.length} block${blocks.length===1?'':'s'}.`
      : `No defects found in scope "${scope.label}" across ${blocks.length} block${blocks.length===1?'':'s'} and ${connections.length} connection${connections.length===1?'':'s'}.`,
    notes:[
      'Advisory only: Boris may challenge and request rework. He cannot merge, deploy or access secrets. Final authority: Cristian.',
      'Runtime recertification is PENDING — this host is not certified as Boris.'
    ]
  };
}

return {review,SCOPES};
});
