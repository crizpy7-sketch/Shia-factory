/* Shia App Factory — GARY-001 growth review pass.
   Gary is advisory: this produces findings and rework requests over a Factory project graph, read
   through positioning, funnel and measurement rather than reliability. It never mutates the
   project, never drafts anything it cannot ground in the graph, and never claims traction.

   Same shape as agents/advisory.js on purpose — `review(project, options)` in, findings out — so
   the Inspector panel drives either agent without knowing which one it is holding.

   Gary and Boris will sometimes flag the same edge. That is the councils working, not a bug: an
   output with no destination is a dropped record to Boris and lost follow-up to Gary, and the two
   rework actions are different. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ShiaAgentGrowth=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

const SEVERITY_ORDER={high:0,medium:1,low:2};

const SCOPES={
  'factory':{label:'Entire Factory',action:'Review Entire Factory',keep:()=>true},
  'highest-impact':{label:'Highest-Impact Gap',action:'Find Highest-Impact Gap',keep:()=>true,limit:1},
  'positioning':{label:'Positioning',action:'Review Positioning',keep:f=>f.tags.includes('positioning')},
  'funnel':{label:'Funnel',action:'Review Funnel',keep:f=>f.tags.includes('funnel')},
  'measurement':{label:'Measurement',action:'Review Measurement',keep:f=>f.tags.includes('measurement')}
};

/* Names the Factory hands out before anyone has decided what the thing is. A default name is not
   a positioning decision, and Gary says so rather than treating it as one. */
const PLACEHOLDER_NAMES=[/^untitled/i,/^new (shia )?app$/i,/^my app$/i,/^test$/i,/^demo$/i];

function isPlaceholder(name){
  const n=String(name||'').trim();
  if(!n)return true;
  return PLACEHOLDER_NAMES.some(re=>re.test(n));
}

function review(project,options){
  const opts=options||{};
  const defs=opts.defs||{};
  const scopeId=SCOPES[opts.scope]?opts.scope:'factory';
  const scope=SCOPES[scopeId];
  const blocks=(project&&project.blocks)||[];
  const connections=(project&&project.connections)||[];
  const name=(project&&project.name)||'';
  const findings=[];
  const label=b=>b.title||b.id;
  const def=b=>defs[b.type]||{};

  /* Capture is where demand enters; retention is where it is kept. Read from the block
     definitions rather than hardcoded types, so a new block type participates automatically. */
  const capture=blocks.filter(b=>def(b).out&&!def(b).in);
  const retain=blocks.filter(b=>def(b).in);

  if(!blocks.length){
    findings.push({code:'empty-graph',severity:'low',target:'Factory graph',tags:['funnel'],
      message:'Nothing on the workbench — there is no funnel to read yet.',
      evidence:'project.blocks is empty',
      rework:'Put the capture step on the workbench first, then bring this back.'});
  }

  /* --- positioning ------------------------------------------------------ */

  if(isPlaceholder(name)){
    findings.push({code:'unpositioned-app',severity:'medium',target:name||'(unnamed)',tags:['positioning'],
      message:`"${name||'(unnamed)'}" is still the default name — nothing here says who this is for or what it replaces.`,
      evidence:`project.name = ${JSON.stringify(name)}`,
      rework:'Name it for the customer and the job it does. The name is the first positioning decision, and every asset inherits it.'});
  }

  blocks.forEach(b=>{
    const title=String(b.title||'').trim();
    const d=def(b);
    if(!title||title===b.id||(d.name&&title===d.name)){
      findings.push({code:'unnamed-step',severity:'low',target:label(b),blockId:b.id,tags:['positioning'],
        message:`"${label(b)}" still carries its shipped name — the customer sees a component, not a step in your offer.`,
        evidence:`block ${b.id} title = ${JSON.stringify(b.title||'')}`,
        rework:'Title it in the customer\'s words. It shows up in the UI and in every report about this step.'});
    }
  });

  /* --- funnel ----------------------------------------------------------- */

  if(blocks.length&&!capture.length){
    findings.push({code:'no-capture',severity:'high',target:'Factory graph',tags:['funnel'],
      message:'No capture step — nothing on this graph turns an interested visitor into a contact you own.',
      evidence:`${blocks.length} block(s), none with an output port and no input`,
      rework:'Add the step that collects the customer. Distribution into an app that captures nothing spends attention for free.'});
  }

  capture.forEach(b=>{
    const d=def(b);
    const routed=connections.some(c=>c.from===b.id&&c.fromPort===d.out.id);
    if(!routed){
      findings.push({code:'capture-without-followup',severity:'high',target:label(b),blockId:b.id,tags:['funnel','measurement'],
        message:`"${label(b)}" captures customers and sends them nowhere — every submission is a lead you paid attention for and cannot follow up.`,
        evidence:`no connection from ${b.id}.${d.out.id}`,
        rework:`Route ${d.out.id} into the step that keeps the customer. Until then, treat this app as pre-launch: do not drive traffic to it.`});
    }
  });

  if(blocks.length===1){
    findings.push({code:'single-step',severity:'medium',target:label(blocks[0]),blockId:blocks[0].id,tags:['funnel','measurement'],
      message:'One step is not a funnel — there is no transition here to measure or improve.',
      evidence:'1 block, 0 usable transitions',
      rework:'Add the next step the customer takes. Two steps give you a conversion rate; one gives you a count.'});
  }

  /* --- measurement ------------------------------------------------------ */

  if(capture.length&&!retain.length){
    findings.push({code:'no-retention',severity:'high',target:'Factory graph',tags:['measurement'],
      message:'Customers are captured but nothing retains them — you will be able to report volume and nothing else.',
      evidence:`${capture.length} capture block(s), 0 retaining blocks`,
      rework:'Add the step that stores what came in. Repeat purchase, cohort behaviour and retention are unreadable without it.'});
  }

  /* Two capture points sharing a title cannot be told apart in any report about them. */
  const byTitle=new Map();
  capture.forEach(b=>{
    const key=String(b.title||'').trim().toLowerCase();
    if(!key)return;
    byTitle.set(key,(byTitle.get(key)||[]).concat(b.id));
  });
  byTitle.forEach((ids,key)=>{
    if(ids.length<2)return;
    findings.push({code:'unattributable-capture',severity:'medium',target:key,tags:['measurement','positioning'],
      message:`${ids.length} capture steps share the title "${key}" — nothing downstream can tell you which one converted.`,
      evidence:ids.join(', '),
      rework:'Give each entry point a distinct name before you run traffic to both, or you will be comparing two things you cannot separate.'});
  });

  /* Several capture points into one store is an experiment only if the variants are distinguishable. */
  if(capture.length>1&&retain.length===1){
    const distinct=new Set(capture.map(b=>String(b.title||b.id).trim().toLowerCase())).size;
    if(distinct===capture.length){
      findings.push({code:'experiment-ready',severity:'low',target:'Factory graph',tags:['measurement'],
        message:`${capture.length} distinct capture steps feed one store — this graph can support a real comparison between them.`,
        evidence:`${capture.length} capture blocks → ${retain.length} retaining block`,
        rework:'Pick one primary KPI before running it, and change one thing between the variants. Two changes at once tell you nothing.'});
    }
  }

  findings.sort((a,b)=>SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity]);

  const inScope=findings.filter(f=>scope.keep(f,{blockId:opts.selectedBlockId}));
  const shown=scope.limit?inScope.slice(0,scope.limit):inScope;
  const counts=shown.reduce((acc,f)=>(acc[f.severity]=(acc[f.severity]||0)+1,acc),{});

  return {
    agent_id:'GARY-001',
    scope:scopeId,
    scope_label:scope.label,
    scope_of:{blocks:blocks.length,connections:connections.length},
    findings:shown,
    total:inScope.length,
    withheld:Math.max(0,inScope.length-shown.length),
    counts,
    summary:shown.length
      ? `${shown.length} gap${shown.length===1?'':'s'} in scope "${scope.label}" across ${blocks.length} block${blocks.length===1?'':'s'}.`
      : `No growth gaps found in scope "${scope.label}" across ${blocks.length} block${blocks.length===1?'':'s'} and ${connections.length} connection${connections.length===1?'':'s'}.`,
    notes:[
      'Read from the graph only. No traction, reach or conversion figure here is measured — Gary does not invent numbers he has not been shown.',
      'Advisory only: Gary may challenge and request rework. He cannot publish, spend money, or make commitments. Final authority: Cristian.',
      'GARY-001 is a Shia-owned identity informed by public marketing principles. It is not a real person and implies no endorsement or affiliation.',
      'Runtime recertification is PENDING and source research is still open — this host is not certified as Gary.'
    ]
  };
}

return {review,SCOPES,isPlaceholder};
});
