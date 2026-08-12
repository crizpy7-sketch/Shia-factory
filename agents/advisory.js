/* Shia App Factory — BORIS-001 advisory review pass.
   Boris is advisory: this produces findings and rework requests over a Factory project graph.
   It never mutates the project, and it reports what it can prove from the graph, nothing more. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ShiaAgentAdvisory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

const SEVERITY_ORDER={high:0,medium:1,low:2};

function review(project,options){
  const defs=(options&&options.defs)||{};
  const blocks=(project&&project.blocks)||[];
  const connections=(project&&project.connections)||[];
  const findings=[];
  const label=b=>b.title||b.id;
  const def=b=>defs[b.type]||{};

  if(!blocks.length){
    findings.push({code:'empty-graph',severity:'low',
      message:'No blocks on the workbench — nothing to review yet.',
      evidence:'project.blocks is empty'});
  }

  blocks.forEach(b=>{
    const d=def(b);
    if(d.out&&!connections.some(c=>c.from===b.id&&c.fromPort===d.out.id)){
      findings.push({code:'unrouted-output',severity:'high',
        message:`"${label(b)}" emits ${d.out.id} with no destination — records are dropped at run time.`,
        evidence:`no connection from ${b.id}.${d.out.id}`,
        rework:`Connect ${d.out.id} to a ${d.out.type} consumer, or remove the block.`});
    }
    if(d.in&&!connections.some(c=>c.to===b.id&&c.toPort===d.in.id)){
      findings.push({code:'unfed-input',severity:'medium',
        message:`"${label(b)}" never receives ${d.in.id} — the block cannot be exercised.`,
        evidence:`no connection into ${b.id}.${d.in.id}`,
        rework:`Wire a ${d.in.type} producer into ${d.in.id} before relying on this path.`});
    }
    if(d.stability&&d.stability!=='stable'){
      findings.push({code:'unstable-dependency',severity:'medium',
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
    findings.push({code:'ambiguous-titles',severity:'medium',
      message:`${ids.length} blocks share the title "${key}" — console and audit lines become ambiguous.`,
      evidence:ids.join(', '),
      rework:'Give each instance a distinct title so delivery logs identify one block.'});
  });

  const dangling=connections.filter(c=>!blocks.some(b=>b.id===c.from)||!blocks.some(b=>b.id===c.to));
  dangling.forEach(c=>{
    findings.push({code:'dangling-connection',severity:'high',
      message:'A connection references a block that is not on the workbench.',
      evidence:`${c.from} → ${c.to}`,
      rework:'Remove the connection or restore the missing block before saving this graph.'});
  });

  findings.sort((a,b)=>SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity]);

  const counts=findings.reduce((acc,f)=>(acc[f.severity]=(acc[f.severity]||0)+1,acc),{});
  return {
    agent_id:'BORIS-001',
    scope:{blocks:blocks.length,connections:connections.length},
    findings,
    counts,
    summary:findings.length
      ? `${findings.length} finding${findings.length===1?'':'s'} across ${blocks.length} block${blocks.length===1?'':'s'}.`
      : `No defects found in ${blocks.length} block${blocks.length===1?'':'s'} and ${connections.length} connection${connections.length===1?'':'s'}.`,
    notes:[
      'Advisory only: Boris may challenge and request rework. He cannot merge, deploy or access secrets. Final authority: Cristian.',
      'Runtime recertification is PENDING — this host is not certified as Boris.'
    ]
  };
}

return {review};
});
