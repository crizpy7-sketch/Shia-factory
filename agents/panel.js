/* Shia App Factory — BORIS-001 Inspector panel.
   Turns an advisory run into something readable inside the existing Inspector: a request box,
   quick actions, and structured finding cards. The bottom console keeps its audit trail — this
   module returns the log lines for the Factory to write there, it does not replace them.

   State and rendering live here (not in index.html) so both are testable without a DOM. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ShiaAgentPanel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

const DEFAULT_REQUEST='Review the current Factory graph and identify the single highest-impact defect.';

const QUICK_ACTIONS=[
  {scope:'factory',label:'Review Entire Factory'},
  {scope:'block',label:'Review Selected Block'},
  {scope:'highest-risk',label:'Find Highest-Risk Defect'},
  {scope:'runtime',label:'Review Runtime'},
  {scope:'connections',label:'Review Connections'}
];

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Free-typed requests pick their own scope; quick actions always win over inference. */
function inferScope(text){
  const t=String(text||'').toLowerCase();
  if(/\b(highest|higest|worst|single|most (severe|important|impactful)|top)\b/.test(t))return 'highest-risk';
  if(/\b(connection|connections|wiring|wired|route|routing|edge|edges)\b/.test(t))return 'connections';
  if(/\b(runtime|runtimes|handshake|mount|mounted|iframe|ready|delivery|deliveries)\b/.test(t))return 'runtime';
  if(/\b(selected|this block|the block)\b/.test(t))return 'block';
  return 'factory';
}

function createSession(options){
  const opts=options||{};
  const agent=opts.agent;
  const router=opts.router;
  const advisory=opts.advisory;
  const state={request:'',run:null,runCount:0};

  function setRequest(text){state.request=String(text==null?'':text);return state.request}

  function route(request){
    if(!router||typeof router.resolve!=='function')return null;
    return router.resolve(`Call ${agent.display_name} ${request}`.trim());
  }

  /* Every run returns a run object and its log lines. A run never ends without one of them
     saying something: refused, blocked, failed, clear, or a list of findings. */
  function run(ctx){
    const c=ctx||{};
    /* An empty invocation payload falls back to whatever is typed in the box, then to the default. */
    const passed=c.requestText===undefined||c.requestText===null?'':String(c.requestText);
    const typed=passed.trim()?passed:state.request;
    const request=typed.trim()||DEFAULT_REQUEST;
    const usedDefault=!typed.trim();
    const scope=c.scope||inferScope(request);
    const logs=[];
    const id='run-'+(++state.runCount);
    const finish=run=>{state.run=run;return{run,logs}};
    const tag=`${agent.display_name} ▸`;

    logs.push({text:`${tag} invoked — ${request}${usedDefault?' (default request)':''}`,cls:'ok'});

    const invocation=c.invocation||route(request);
    if(!invocation){
      logs.push({text:`${tag} routing unavailable — the invocation could not be resolved`,cls:'err'});
      return finish({id,request,usedDefault,scope,scope_label:scope,status:'error',findings:[],
        error:'Invocation could not be routed. The agent router did not resolve this request.',notes:[]});
    }
    if(invocation.permitted===false){
      (invocation.denials||[]).forEach(d=>logs.push({text:`${tag} refused: ${d.reason}`,cls:'err'}));
      return finish({id,request,usedDefault,scope,scope_label:scope,status:'refused',findings:[],
        denials:invocation.denials||[],notes:[]});
    }
    if(scope==='block'&&!c.selectedBlockId){
      logs.push({text:`${tag} no block selected — select a block on the workbench first`,cls:'err'});
      return finish({id,request,usedDefault,scope,scope_label:'Selected Block',status:'blocked',findings:[],
        error:'No block is selected. Click a block on the workbench, then run the review again.',notes:[]});
    }

    let result;
    try{
      result=advisory.review(c.project,{defs:c.defs,scope,selectedBlockId:c.selectedBlockId,telemetry:c.telemetry});
    }catch(e){
      logs.push({text:`${tag} review failed: ${e&&e.message?e.message:'unknown error'}`,cls:'err'});
      return finish({id,request,usedDefault,scope,scope_label:scope,status:'error',findings:[],
        error:`The review did not complete: ${e&&e.message?e.message:'unknown error'}`,notes:[]});
    }
    if(!result||!Array.isArray(result.findings)){
      logs.push({text:`${tag} review returned no result`,cls:'err'});
      return finish({id,request,usedDefault,scope,scope_label:scope,status:'error',findings:[],
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

    return finish({id,request,usedDefault,scope,scope_label:result.scope_label,status:'ok',
      findings,total:result.total,withheld:result.withheld,summary:result.summary,notes:result.notes||[]});
  }

  function renderFinding(f){
    return `<article class="finding-card sev-${esc(f.severity)}">`
      +`<div class="finding-top"><span class="sev-pill sev-${esc(f.severity)}">${esc(String(f.severity).toUpperCase())}</span><span class="fl">SEVERITY</span></div>`
      +`<div class="fl">TARGET</div><div class="finding-target">${esc(f.target)}</div>`
      +`<div class="fl">FINDING</div><p class="finding-body">${esc(f.finding)}</p>`
      +`<div class="fl">EVIDENCE</div><code class="finding-evidence">${esc(f.evidence)}</code>`
      +`<div class="fl">RECOMMENDED ACTION</div><p class="finding-body">${esc(f.action)}</p>`
      +`</article>`;
  }

  function renderRun(run){
    if(!run)return '<p class="help">No review run yet. Describe what Boris should review, or use a quick action.</p>';
    const head=`<p class="help run-request"><b>Request</b> · ${esc(run.request)}<br><b>Scope</b> · ${esc(run.scope_label||run.scope)}</p>`;
    if(run.status==='refused'){
      return head+`<article class="finding-card refused"><div class="finding-top"><span class="sev-pill sev-high">REFUSED</span><span class="fl">AUTHORITY</span></div>`
        +(run.denials||[]).map(d=>`<p class="finding-body">${esc(d.reason)}</p>`).join('')
        +`<div class="fl">RECOMMENDED ACTION</div><p class="finding-body">Ask Boris to review it instead, and take the action yourself.</p></article>`;
    }
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

  function render(ctx){
    const c=ctx||{};
    const au=agent.authority||{};
    const mark=(v,label)=>`<li><b class="${v?'yes':'no'}">${v?'✓':'✗'}</b><span>${esc(label)}</span></li>`;
    return `<div class="agent-head"><img class="agent-profile-avatar" src="${esc(agent.avatars.circle)}" alt="${esc(agent.display_name)}">`
      +`<div><b>${esc(agent.agent_id)}</b><div class="agent-role">${esc(agent.display_name)} · ${esc(agent.card.subtitle)}</div></div></div>`
      +`<div class="agent-pills"><span class="agent-pill ok">● ${esc(agent.card.status)}</span><span class="agent-pill warn">PENDING RECERTIFICATION</span></div>`
      +`<p class="help">Project · <b>${esc(c.projectName||'Untitled Shia App')}</b></p>`
      +`<label for="borisRequest">What should Boris review?</label>`
      +`<textarea id="borisRequest" class="boris-request" placeholder="${esc(DEFAULT_REQUEST)}">${esc(state.request)}</textarea>`
      +`<div class="section-title">Quick actions</div>`
      +`<div class="boris-quick">${QUICK_ACTIONS.map(a=>`<button class="btn boris-action" data-scope="${esc(a.scope)}">${esc(a.label)}</button>`).join('')}</div>`
      +`<button class="btn primary boris-run" id="runBoris">RUN BORIS</button>`
      +`<div class="section-title">Findings</div>`
      +renderRun(state.run)
      +`<div class="section-title">Authority</div>`
      +`<ul class="agent-authority">${mark(au.challenge_rights,'Challenge decisions')}${mark(au.may_request_rework,'Request rework')}${mark(au.may_merge,'Merge')}${mark(au.may_deploy,'Deploy')}${mark(au.may_access_secrets,'Access secrets')}`
      +`<li><b>·</b><span>Final authority: ${esc(au.final_authority)}</span></li></ul>`
      +`<details class="agent-identity"><summary>Identity &amp; runtime</summary>`
      +`<img class="agent-profile-art" src="${esc(agent.avatars.brand_sheet)}" alt="${esc(agent.display_name)} identity sheet" loading="lazy">`
      +`<p class="help">${esc(agent.council.role)} — ${esc(agent.council.council)}.</p>`
      +`<p class="help">${agent.roles.map(esc).join(' · ')}</p>`
      +`<p class="help">Host: ${esc(agent.runtime.host)} — a host, not Boris's identity.<br>Recertification: <b>PENDING</b> (${esc(agent.runtime.certification_status)}).</p>`
      +`<p class="help">Invocation · ${agent.invocation_aliases.map(esc).join(' · ')}</p></details>`;
  }

  return {state,setRequest,run,render,renderRun,inferScope,DEFAULT_REQUEST,QUICK_ACTIONS};
}

return {createSession,inferScope,DEFAULT_REQUEST,QUICK_ACTIONS};
});
