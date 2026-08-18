/* Shia App Factory — agent Inspector panel.
   Turns an agent run into something readable inside the existing Inspector: a request box, quick
   actions, and structured cards. The bottom console keeps its audit trail — this module returns
   the log lines for the Factory to write there, it does not replace them.

   The panel is agent-agnostic. It is handed an agent, a router, a review module and — for an agent
   whose grant allows it — a build module, and everything it renders comes from those. It has no
   knowledge of which agent it is holding, so registering a third agent needs no change here.

   Quick actions come from the review module's own SCOPES, so an agent's scopes and its buttons
   cannot drift apart.

   State and rendering live here (not in index.html) so both are testable without a DOM. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ShiaAgentPanel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

const DEFAULT_REQUEST='Review the current Factory graph and identify the single highest-impact defect.';

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Free-typed requests pick their own scope; quick actions always win over inference. Scope words
   are matched against each scope's own id and label, so a new scope becomes inferable by existing. */
const SCOPE_HINTS={
  'highest-risk':/\b(highest|higest|worst|single|most (severe|important|impactful)|top)\b/,
  'highest-impact':/\b(highest|higest|biggest|single|most (important|impactful))\b/,
  'connections':/\b(connection|connections|wiring|wired|route|routing|edge|edges)\b/,
  'runtime':/\b(runtime|runtimes|handshake|mount|mounted|iframe|ready|delivery|deliveries)\b/,
  'block':/\b(selected|this block|the block)\b/,
  'positioning':/\b(position|positioning|name|naming|brand|message|messaging|offer)\b/,
  'funnel':/\b(funnel|capture|lead|leads|signup|sign-up|conversion|drop-off)\b/,
  'measurement':/\b(measure|measurement|metric|metrics|kpi|attribution|retention|cohort|experiment|a\/b)\b/
};

/* With no scope set given — the module-level export — every hint is considered, in declaration
   order. A session passes its agent's own scopes so inference can only land somewhere real. */
function inferScope(text,scopes){
  const t=String(text||'').toLowerCase();
  const available=scopes&&Object.keys(scopes).length?scopes:SCOPE_HINTS;
  for(const id of Object.keys(available)){
    if(id==='factory')continue;
    const hint=SCOPE_HINTS[id];
    if(hint&&hint.test(t))return id;
  }
  return 'factory';
}

function quickActions(scopes){
  return Object.entries(scopes||{}).map(([scope,def])=>({scope,label:def.action||`Review ${def.label}`}));
}

function createSession(options){
  const opts=options||{};
  const agent=opts.agent;
  const router=opts.router;
  /* `review` is the agent's review module; `advisory` is accepted as the older name for it. */
  const review=opts.review||opts.advisory;
  const builder=opts.build||null;
  const capabilitiesOf=typeof opts.capabilities==='function'?opts.capabilities:(a=>Object.assign({},(a&&a.authority)||{}));
  const scopes=(review&&review.SCOPES)||{};
  const actions=quickActions(scopes);
  const state={request:'',run:null,build:null,runCount:0,buildCount:0};

  const capabilities=capabilitiesOf(agent);
  const canBuild=Boolean(builder&&capabilities.may_author_code===true&&capabilities.may_build===true);
  const buildTargets=canBuild&&builder.TARGETS?Object.entries(builder.TARGETS).map(([id,t])=>({id,label:t.label})):[];

  function setRequest(text){state.request=String(text==null?'':text);return state.request}

  function route(request){
    if(!router||typeof router.resolve!=='function')return null;
    return router.resolve(`Call ${agent.display_name} ${request}`.trim());
  }

  /* Every run returns a run object and its log lines. A run never ends without one of them saying
     something: refused, blocked, failed, clear, or a list of findings. */
  function run(ctx){
    const c=ctx||{};
    /* An empty invocation payload falls back to whatever is typed in the box, then to the default. */
    const passed=c.requestText===undefined||c.requestText===null?'':String(c.requestText);
    const typed=passed.trim()?passed:state.request;
    const request=typed.trim()||DEFAULT_REQUEST;
    const usedDefault=!typed.trim();
    const scope=scopes[c.scope]?c.scope:inferScope(request,scopes);
    const scopeDef=scopes[scope]||{};
    const logs=[];
    const id='run-'+(++state.runCount);
    const finish=run=>{state.run=run;return{run,logs}};
    const tag=`${agent.display_name} ▸`;

    logs.push({text:`${tag} invoked — ${request}${usedDefault?' (default request)':''}`,cls:'ok'});

    if(!review||typeof review.review!=='function'){
      logs.push({text:`${tag} review module unavailable`,cls:'err'});
      return finish({id,kind:'review',request,usedDefault,scope,scope_label:scope,status:'error',findings:[],
        error:`${agent.display_name} has no review module loaded. Nothing was verified.`,notes:[]});
    }

    const invocation=c.invocation||route(request);
    if(!invocation){
      logs.push({text:`${tag} routing unavailable — the invocation could not be resolved`,cls:'err'});
      return finish({id,kind:'review',request,usedDefault,scope,scope_label:scope,status:'error',findings:[],
        error:'Invocation could not be routed. The agent router did not resolve this request.',notes:[]});
    }
    if(invocation.permitted===false){
      (invocation.denials||[]).forEach(d=>logs.push({text:`${tag} refused: ${d.reason}`,cls:'err'}));
      return finish({id,kind:'review',request,usedDefault,scope,scope_label:scope,status:'refused',findings:[],
        denials:invocation.denials||[],notes:[]});
    }
    if(scopeDef.requires_block&&!c.selectedBlockId){
      logs.push({text:`${tag} no block selected — select a block on the workbench first`,cls:'err'});
      return finish({id,kind:'review',request,usedDefault,scope,scope_label:scopeDef.label||scope,status:'blocked',findings:[],
        error:'No block is selected. Click a block on the workbench, then run the review again.',notes:[]});
    }

    let result;
    try{
      result=review.review(c.project,{defs:c.defs,scope,selectedBlockId:c.selectedBlockId,telemetry:c.telemetry});
    }catch(e){
      logs.push({text:`${tag} review failed: ${e&&e.message?e.message:'unknown error'}`,cls:'err'});
      return finish({id,kind:'review',request,usedDefault,scope,scope_label:scope,status:'error',findings:[],
        error:`The review did not complete: ${e&&e.message?e.message:'unknown error'}`,notes:[]});
    }
    if(!result||!Array.isArray(result.findings)){
      logs.push({text:`${tag} review returned no result`,cls:'err'});
      return finish({id,kind:'review',request,usedDefault,scope,scope_label:scope,status:'error',findings:[],
        error:'The review returned no result. Nothing was verified.',notes:[]});
    }

    const findings=result.findings.map(f=>({
      severity:f.severity,
      target:f.target||'Factory graph',
      finding:f.message,
      evidence:f.evidence,
      action:f.rework||'No rework required.',
      code:f.code
    }));
    logs.push({text:`${tag} ${result.summary}`,cls:result.counts&&result.counts.high?'err':'ok'});
    findings.forEach(f=>logs.push({text:`${tag} [${f.severity}] ${f.target} — ${f.finding} → ${f.action}`,cls:f.severity==='high'?'err':''}));
    if(result.withheld>0)logs.push({text:`${tag} ${result.withheld} further finding${result.withheld===1?'':'s'} outside this scope`,cls:''});
    (result.notes||[]).forEach(n=>logs.push({text:`${tag} ${n}`,cls:''}));

    return finish({id,kind:'review',request,usedDefault,scope,scope_label:result.scope_label,status:'ok',
      findings,total:result.total,withheld:result.withheld,summary:result.summary,notes:result.notes||[]});
  }

  /* A build run. Same contract as a review run: it always ends saying something, and it goes
     through the router first, so an agent without the grant is refused before the builder is
     ever reached. */
  function runBuild(ctx){
    const c=ctx||{};
    const logs=[];
    const id='build-'+(++state.buildCount);
    const finish=b=>{state.build=b;return{build:b,logs}};
    const tag=`${agent.display_name} ▸`;
    const target=c.target||'export';
    const request=(c.requestText||'').trim()||`Build the current Factory graph (${target}).`;

    logs.push({text:`${tag} build requested — ${request}`,cls:'ok'});

    if(!canBuild){
      const why=builder
        ? `${agent.display_name} holds no build grant. Building requires may_author_code and may_build.`
        : `${agent.display_name} has no build module loaded.`;
      logs.push({text:`${tag} refused: ${why}`,cls:'err'});
      return finish({id,kind:'build',request,target,status:'refused',artifacts:[],checks:[],blockers:[],
        denials:[{capability:'may_author_code',reason:why}],notes:[]});
    }

    const invocation=c.invocation||route(request);
    if(invocation&&invocation.permitted===false){
      (invocation.denials||[]).forEach(d=>logs.push({text:`${tag} refused: ${d.reason}`,cls:'err'}));
      return finish({id,kind:'build',request,target,status:'refused',artifacts:[],checks:[],blockers:[],
        denials:invocation.denials||[],notes:[]});
    }

    let result;
    try{
      result=builder.build(c.project,{defs:c.defs,advisory:review,telemetry:c.telemetry,target,force:Boolean(c.force)});
    }catch(e){
      logs.push({text:`${tag} build failed: ${e&&e.message?e.message:'unknown error'}`,cls:'err'});
      return finish({id,kind:'build',request,target,status:'error',artifacts:[],checks:[],blockers:[],
        error:`The build did not complete: ${e&&e.message?e.message:'unknown error'}`,notes:[]});
    }
    if(!result){
      logs.push({text:`${tag} build returned no result`,cls:'err'});
      return finish({id,kind:'build',request,target,status:'error',artifacts:[],checks:[],blockers:[],
        error:'The build returned no result. Nothing was generated.',notes:[]});
    }

    logs.push({text:`${tag} ${result.summary}`,cls:result.status==='built'?'ok':'err'});
    (result.blockers||[]).forEach(b=>logs.push({text:`${tag} [blocker] ${b.target} — ${b.message}`,cls:'err'}));
    (result.artifacts||[]).forEach(a=>logs.push({text:`${tag} wrote ${a.path} · ${a.bytes} bytes · ${a.fingerprint}`,cls:'ok'}));
    (result.checks||[]).forEach(k=>logs.push({text:`${tag} check ${k.id} — ${k.name}`,cls:''}));
    (result.notes||[]).forEach(n=>logs.push({text:`${tag} ${n}`,cls:''}));

    return finish(Object.assign({id,kind:'build',request},result));
  }

  /* ---------------------------------------------------------------- rendering */

  function renderFinding(f){
    return `<article class="finding-card sev-${esc(f.severity)}">`
      +`<div class="finding-top"><span class="sev-pill sev-${esc(f.severity)}">${esc(String(f.severity).toUpperCase())}</span><span class="fl">SEVERITY</span></div>`
      +`<div class="fl">TARGET</div><div class="finding-target">${esc(f.target)}</div>`
      +`<div class="fl">FINDING</div><p class="finding-body">${esc(f.finding)}</p>`
      +`<div class="fl">EVIDENCE</div><code class="finding-evidence">${esc(f.evidence)}</code>`
      +`<div class="fl">RECOMMENDED ACTION</div><p class="finding-body">${esc(f.action)}</p>`
      +`</article>`;
  }

  function refusedCard(run){
    return `<article class="finding-card refused"><div class="finding-top"><span class="sev-pill sev-high">REFUSED</span><span class="fl">AUTHORITY</span></div>`
      +(run.denials||[]).map(d=>`<p class="finding-body">${esc(d.reason)}</p>`).join('')
      +`<div class="fl">RECOMMENDED ACTION</div><p class="finding-body">Ask ${esc(agent.display_name)} to advise on it instead, and take the action yourself.</p></article>`;
  }

  function renderRun(run){
    if(!run)return `<p class="help">No review run yet. Describe what ${esc(agent.display_name)} should review, or use a quick action.</p>`;
    const head=`<p class="help run-request"><b>Request</b> · ${esc(run.request)}<br><b>Scope</b> · ${esc(run.scope_label||run.scope)}</p>`;
    if(run.status==='refused')return head+refusedCard(run);
    if(run.status==='blocked'||run.status==='error'){
      return head+`<article class="finding-card ${run.status==='error'?'errored':'blocked'}"><div class="finding-top"><span class="sev-pill sev-${run.status==='error'?'high':'medium'}">${run.status==='error'?'NOT COMPLETED':'NO TARGET'}</span><span class="fl">STATUS</span></div>`
        +`<p class="finding-body">${esc(run.error)}</p></article>`;
    }
    if(!run.findings.length){
      return head+`<article class="finding-card clear"><div class="finding-top"><span class="sev-pill sev-clear">CLEAR</span><span class="fl">RESULT</span></div>`
        +`<p class="finding-body">${esc(run.summary)}</p></article>`;
    }
    return head+run.findings.map(renderFinding).join('')
      +(run.withheld>0?`<p class="help">${esc(run.withheld)} further finding${run.withheld===1?'':'s'} outside this scope — run <b>Review Entire Factory</b> to see them.</p>`:'');
  }

  function renderBuild(build){
    if(!build)return `<p class="help">No build yet. ${esc(agent.display_name)} compiles the current graph into a runnable export — glue, shell page and checks.</p>`;
    const head=`<p class="help run-request"><b>Target</b> · ${esc(build.target_label||build.target)}`
      +(build.graph?`<br><b>Graph</b> · ${esc(build.graph.blocks)} block${build.graph.blocks===1?'':'s'}, ${esc(build.graph.routes)} route${build.graph.routes===1?'':'s'} · <code>${esc(build.graph.fingerprint)}</code>`:'')
      +`</p>`;
    if(build.status==='refused')return head+refusedCard(build);
    if(build.status==='error'){
      return head+`<article class="finding-card errored"><div class="finding-top"><span class="sev-pill sev-high">NOT COMPLETED</span><span class="fl">STATUS</span></div>`
        +`<p class="finding-body">${esc(build.error)}</p></article>`;
    }
    if(build.status==='empty'){
      return head+`<article class="finding-card blocked"><div class="finding-top"><span class="sev-pill sev-medium">NOTHING TO BUILD</span><span class="fl">STATUS</span></div>`
        +`<p class="finding-body">${esc(build.summary)}</p></article>`;
    }
    if(build.status==='blocked'){
      return head+`<article class="finding-card blocked"><div class="finding-top"><span class="sev-pill sev-high">BLOCKED</span><span class="fl">STATUS</span></div>`
        +`<p class="finding-body">${esc(build.summary)}</p>`
        +(build.blockers||[]).map(b=>`<div class="fl">BLOCKER</div><p class="finding-body">${esc(b.target)} — ${esc(b.message)}</p><code class="finding-evidence">${esc(b.evidence)}</code>`).join('')
        +`<div class="fl">RECOMMENDED ACTION</div><p class="finding-body">Fix the defect${(build.blockers||[]).length===1?'':'s'} above, or press <b>Force build</b> to generate an export that encodes them anyway.</p></article>`;
    }
    const forced=build.forced?`<p class="help"><b>Forced.</b> This export encodes ${build.blockers.length} defect${build.blockers.length===1?'':'s'} ${esc(agent.display_name)} flagged.</p>`:'';
    const files=(build.artifacts||[]).map(a=>`<article class="artifact-card"><div class="finding-top"><span class="sev-pill sev-clear">${esc(a.language.toUpperCase())}</span><span class="fl">${esc(a.bytes)} BYTES · ${esc(a.fingerprint)}</span></div>`
      +`<div class="finding-target"><code>${esc(a.path)}</code></div>`
      +`<button class="btn artifact-download" data-path="${esc(a.path)}">Download ${esc(a.path)}</button>`
      +`<details class="artifact-source"><summary>Source</summary><pre>${esc(a.contents)}</pre></details></article>`).join('');
    const checks=(build.checks||[]).map(k=>`<li><b>·</b><span>${esc(k.name)} — <i>${esc(k.expect)}</i></span></li>`).join('');
    return head+forced
      +`<article class="finding-card clear"><div class="finding-top"><span class="sev-pill sev-clear">BUILT</span><span class="fl">RESULT</span></div>`
      +`<p class="finding-body">${esc(build.summary)}</p></article>`
      +files
      +(checks?`<div class="section-title">Checks written</div><ul class="agent-authority">${checks}</ul><p class="help">Run them with <code>node --test checks.mjs</code> beside the export.</p>`:'')
      +`<p class="help">Generated, not landed. ${esc(agent.display_name)} cannot merge or deploy this — that stays with ${esc((agent.authority||{}).final_authority||'the owner')}.</p>`;
  }

  function render(ctx){
    const c=ctx||{};
    const eff=capabilities;
    const base=agent.authority||{};
    const granted=Object.keys(eff).filter(k=>eff[k]===true&&base[k]!==true);
    const mark=(v,label,isGrant)=>`<li><b class="${v?'yes':'no'}">${v?'✓':'✗'}</b><span>${esc(label)}${isGrant?' <i class="grant-tag">granted</i>':''}</span></li>`;
    /* Every boolean the agent declares, plus anything a grant added — so the panel shows the real
       boundaries of whichever agent it is holding, not a fixed list. */
    const rows=Object.keys(eff)
      .filter(k=>typeof eff[k]==='boolean'&&k!=='advisory')
      .map(k=>mark(eff[k],k.replace(/^may_/,'').replace(/_/g,' '),granted.includes(k)))
      .join('');
    const avatar=agent.avatars&&(agent.avatars.circle||agent.avatars.square);
    const placeholderArt=agent.avatar_provenance==='placeholder';
    return `<div class="agent-head">${avatar?`<img class="agent-profile-avatar" src="${esc(avatar)}" alt="${esc(agent.display_name)}">`:''}`
      +`<div><b>${esc(agent.agent_id)}</b><div class="agent-role">${esc(agent.display_name)} · ${esc(agent.card.subtitle)}</div></div></div>`
      +`<div class="agent-pills"><span class="agent-pill ok">● ${esc(agent.card.status)}</span>`
      +(agent.runtime&&agent.runtime.certified?'':`<span class="agent-pill warn">PENDING RECERTIFICATION</span>`)
      +(canBuild?`<span class="agent-pill grant">BUILD GRANT</span>`:'')
      +`</div>`
      +`<p class="help">Project · <b>${esc(c.projectName||'Untitled Shia App')}</b></p>`
      +`<label for="agentRequest">What should ${esc(agent.display_name)} review?</label>`
      +`<textarea id="agentRequest" class="agent-request" placeholder="${esc(DEFAULT_REQUEST)}">${esc(state.request)}</textarea>`
      +`<div class="section-title">Quick actions</div>`
      +`<div class="agent-quick">${actions.map(a=>`<button class="btn agent-action" data-scope="${esc(a.scope)}">${esc(a.label)}</button>`).join('')}</div>`
      +`<button class="btn primary agent-run" id="runAgent">RUN ${esc(agent.display_name.toUpperCase())}</button>`
      +`<div class="section-title">Findings</div>`
      +renderRun(state.run)
      +(canBuild
        ? `<div class="section-title">Build</div>`
          +`<div class="agent-quick">${buildTargets.map(t=>`<button class="btn agent-build" data-target="${esc(t.id)}">${esc(t.label)}</button>`).join('')}</div>`
          +`<button class="btn primary agent-run" id="runBuild">BUILD THIS GRAPH</button>`
          +(state.build&&state.build.status==='blocked'?`<button class="btn agent-force" id="forceBuild">Force build anyway</button>`:'')
          +renderBuild(state.build)
        : '')
      +`<div class="section-title">Authority</div>`
      +`<ul class="agent-authority">${rows}`
      +`<li><b>·</b><span>Final authority: ${esc(base.final_authority||'the owner')}</span></li></ul>`
      +(granted.length?`<p class="help">Granted in the Factory by ${esc((agent.grants&&agent.grants[0]&&agent.grants[0].granted_by)||'the owner')}: ${granted.map(g=>esc(g.replace(/^may_/,'').replace(/_/g,' '))).join(', ')}. The package's own boundaries are unchanged.</p>`:'')
      +`<details class="agent-identity"><summary>Identity &amp; runtime</summary>`
      +(agent.avatars&&agent.avatars.brand_sheet?`<img class="agent-profile-art" src="${esc(agent.avatars.brand_sheet)}" alt="${esc(agent.display_name)} identity sheet" loading="lazy">`:'')
      +(placeholderArt?`<p class="help">No identity art shipped with this package — the avatar is a generated placeholder.</p>`:'')
      +`<p class="help">${esc(agent.council.role)} — ${esc(agent.council.council)}.</p>`
      +`<p class="help">${agent.roles.map(esc).join(' · ')}</p>`
      +(agent.simulation_notice?`<p class="help">${esc(agent.simulation_notice)}</p>`:'')
      +`<p class="help">Host: ${esc(agent.runtime.host)} — a host, not ${esc(agent.display_name)}'s identity.<br>Recertification: <b>${agent.runtime.certified?'CERTIFIED':'PENDING'}</b> (${esc(agent.runtime.certification_status)}).</p>`
      +`<p class="help">Invocation · ${agent.invocation_aliases.map(esc).join(' · ')}</p></details>`;
  }

  return {state,setRequest,run,runBuild,render,renderRun,renderBuild,inferScope:t=>inferScope(t,scopes),
    canBuild,actions,DEFAULT_REQUEST,agent};
}

return {createSession,inferScope,quickActions,DEFAULT_REQUEST,SCOPE_HINTS};
});
