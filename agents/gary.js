/* Shia App Factory — GARY-001 Inspector panel.

   Gary's identity package is imported (agents/GARY-001), but his execution host — the Gary Vee
   Growth Agent application — is not part of this repository. So this panel deliberately does not
   pretend to be Gary thinking. It is the part of Gary that is code rather than cognition:

     - his invocation aliases and authority boundaries, enforced at the router;
     - his owner-approval gates, applied to the request before anything else happens;
     - his operating rules turned into an intake that names the evidence a growth answer needs;
     - an explicit statement, on every run, that no certified Gary runtime answered.

   A brief produced here is a routed, gated request — never a strategy, never a campaign, never a
   claim about a market. That distinction is the whole point of the file.

   Same contract as panel.js (createSession → run/render) so the Inspector hosts both agents. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ShiaGaryPanel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

const DEFAULT_REQUEST='Draft a growth brief for the current project: one audience, one offer, one primary KPI.';

const QUICK_ACTIONS=[
  {kind:'brief',label:'Draft a Growth Brief'},
  {kind:'positioning',label:'Positioning Review'},
  {kind:'distribution',label:'Distribution Plan'},
  {kind:'experiment',label:'Design an Experiment'},
  {kind:'rules',label:'Operating Rules'}
];

const KIND_LABEL={brief:'Growth brief',positioning:'Positioning review',distribution:'Distribution plan',
  experiment:'Experiment design',rules:'Operating rules'};

/* Channels the Growth Operator skill has playbooks for, plus the platforms it names. Detection is
   keyword matching, nothing cleverer — it exists so the intake can say which playbooks a certified
   runtime would need, not to choose a channel on anyone's behalf. */
const CHANNELS=[
  {id:'social',test:/\b(social|instagram|tiktok|linkedin|youtube|pinterest|snapchat|bluesky|threads|reels?|shorts)\b/i},
  {id:'email',test:/\b(email|newsletter|subscribers?|mailing list)\b/i},
  {id:'blog',test:/\b(blog|wordpress|ghost|article|seo|long[- ]form)\b/i},
  {id:'webhook',test:/\b(webhook|zapier|downstream|integration)\b/i},
  {id:'paid',test:/\b(ads?|paid|ad spend|campaign budget|cpc|cpm)\b/i}
];

/* His operating rules and the Growth Operator loop, as the things a request must carry before any
   runtime could answer it honestly. Absence is reported as an evidence gap, never guessed.

   A value runs until the next label or the end of the request — a greedy capture would swallow
   "Offer:" into the audience and report three facts as one. */
const LABELS='audience|offer|(?:primary\\s+)?kpi|evidence';
/* Whatever punctuation separates two labels — ". ", " — ", "; " — belongs to neither value. */
const SEPARATOR='[.;,·—–\\-\\s]*';
const NEXT_LABEL=`(?=${SEPARATOR}\\b(?:${LABELS})\\b\\s*[:—-]|\\s*$)`;
const field=(id,label,pattern,gap)=>
  ({id,label,test:new RegExp(`\\b(?:${pattern})\\s*[:—-]\\s*(.+?)${NEXT_LABEL}`,'i'),gap});

const INTAKE_FIELDS=[
  field('audience','Audience','audience',
    'No audience stated. Rule: "Start with the actual product, customer, offer and evidence."'),
  field('offer','Offer','offer',
    'No offer stated. A growth answer without an offer is marketing theater.'),
  field('primaryKpi','Primary KPI','(?:primary\\s+)?kpi',
    'No primary KPI stated. Rule: "Preserve one primary KPI for each experiment."'),
  field('evidence','Evidence','evidence',
    'No current evidence supplied. Claims would have nothing to rest on.')
];

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Free-typed requests pick their own kind; quick actions always win over inference. */
function inferKind(text){
  const t=String(text||'').toLowerCase();
  if(/\b(experiment|test|a\/b|hypothesis|measure|incrementality)\b/.test(t))return 'experiment';
  if(/\b(position|positioning|messaging|brand|tagline|differentiat\w+)\b/.test(t))return 'positioning';
  if(/\b(distribut\w+|channel|channels|reach|audience growth|posting)\b/.test(t))return 'distribution';
  if(/\b(rules?|authority|boundaries|who are you|identity)\b/.test(t))return 'rules';
  return 'brief';
}

/** Pulls the labelled fields out of a request. Anything unlabelled stays a gap. */
function intake(request){
  const fields=[];
  const gaps=[];
  for(const f of INTAKE_FIELDS){
    const m=f.test.exec(request);
    const value=m&&m[1]?m[1].trim().replace(/[.;,·—–\-\s]+$/,''):'';
    if(value)fields.push({id:f.id,label:f.label,value});
    else gaps.push({id:f.id,label:f.label,gap:f.gap});
  }
  const channels=CHANNELS.filter(c=>c.test.test(request)).map(c=>c.id);
  return {fields,gaps,channels};
}

function createSession(options){
  const opts=options||{};
  const agent=opts.agent;
  const router=opts.router;
  const state={request:'',run:null,runCount:0};

  function setRequest(text){state.request=String(text==null?'':text);return state.request}

  function route(request){
    if(!router||typeof router.resolve!=='function')return null;
    return router.resolve(`Call ${agent.display_name} ${request}`.trim());
  }

  /* Every run returns a run object and its log lines, and every run ends with one of them saying
     something: refused, failed, or an intake plus the reason no runtime answered it. */
  function run(ctx){
    const c=ctx||{};
    const passed=c.requestText===undefined||c.requestText===null?'':String(c.requestText);
    const typed=passed.trim()?passed:state.request;
    const request=typed.trim()||DEFAULT_REQUEST;
    const usedDefault=!typed.trim();
    const kind=c.kind||inferKind(request);
    const logs=[];
    const id='gary-run-'+(++state.runCount);
    const finish=run=>{state.run=run;return{run,logs}};
    const tag=`${agent.display_name} ▸`;

    logs.push({text:`${tag} invoked — ${request}${usedDefault?' (default request)':''}`,cls:'ok'});

    const invocation=c.invocation||route(request);
    if(!invocation){
      logs.push({text:`${tag} routing unavailable — the invocation could not be resolved`,cls:'err'});
      return finish({id,request,usedDefault,kind,kind_label:KIND_LABEL[kind]||kind,status:'error',
        error:'Invocation could not be routed. The agent router did not resolve this request.',
        fields:[],gaps:[],channels:[],gates:[],runtime:runtimeState()});
    }
    if(invocation.permitted===false){
      (invocation.denials||[]).forEach(d=>logs.push({text:`${tag} refused: ${d.reason}`,cls:'err'}));
      return finish({id,request,usedDefault,kind,kind_label:KIND_LABEL[kind]||kind,status:'refused',
        denials:invocation.denials||[],fields:[],gaps:[],channels:[],gates:[],runtime:runtimeState()});
    }

    let taken;
    try{
      taken=intake(request);
    }catch(e){
      logs.push({text:`${tag} intake failed: ${e&&e.message?e.message:'unknown error'}`,cls:'err'});
      return finish({id,request,usedDefault,kind,kind_label:KIND_LABEL[kind]||kind,status:'error',
        error:`The intake did not complete: ${e&&e.message?e.message:'unknown error'}`,
        fields:[],gaps:[],channels:[],gates:[],runtime:runtimeState()});
    }

    const gates=invocation.gates||[];
    gates.forEach(g=>logs.push({text:`${tag} approval gate: ${g.reason}`,cls:'warn'}));
    taken.gaps.forEach(g=>logs.push({text:`${tag} evidence gap — ${g.label}: ${g.gap}`,cls:''}));

    const rt=runtimeState();
    logs.push({text:`${tag} ${rt.reason}`,cls:'err'});

    return finish({id,request,usedDefault,kind,kind_label:KIND_LABEL[kind]||kind,status:'intake',
      project:c.projectName||null,fields:taken.fields,gaps:taken.gaps,channels:taken.channels,
      gates,runtime:rt});
  }

  /* The one thing this panel must never soften. */
  function runtimeState(){
    const rt=agent.runtime||{};
    if(rt.certified===true&&rt.host){
      return {connected:true,reason:`Answered by ${rt.host}.`};
    }
    return {
      connected:false,
      reason:'No certified Gary runtime answered. This is a routed, gated intake — not a strategy, '
        +'not a campaign, and not a claim about any market.',
      detail:rt.host_note||'Gary\'s execution host is not part of this repository.',
      certification:rt.certification_status||'unknown'
    };
  }

  function renderRun(run){
    if(!run)return '<p class="help">No brief yet. Describe what Gary should work on, or use a quick action.</p>';
    const head=`<p class="help run-request"><b>Request</b> · ${esc(run.request)}<br><b>Kind</b> · ${esc(run.kind_label||run.kind)}</p>`;
    if(run.status==='refused'){
      return head+`<article class="finding-card refused"><div class="finding-top"><span class="sev-pill sev-high">REFUSED</span><span class="fl">AUTHORITY</span></div>`
        +(run.denials||[]).map(d=>`<p class="finding-body">${esc(d.reason)}</p>`).join('')
        +`<div class="fl">RECOMMENDED ACTION</div><p class="finding-body">Take the action yourself, or ask Gary to prepare it for your approval.</p></article>`;
    }
    if(run.status==='error'){
      return head+`<article class="finding-card errored"><div class="finding-top"><span class="sev-pill sev-high">NOT COMPLETED</span><span class="fl">STATUS</span></div>`
        +`<p class="finding-body">${esc(run.error)}</p></article>`;
    }
    const rt=run.runtime||{};
    const runtimeCard=`<article class="finding-card ${rt.connected?'clear':'errored'}">`
      +`<div class="finding-top"><span class="sev-pill ${rt.connected?'sev-clear':'sev-high'}">${rt.connected?'RUNTIME':'NO RUNTIME'}</span><span class="fl">STATUS</span></div>`
      +`<p class="finding-body">${esc(rt.reason)}</p>`
      +(rt.detail?`<div class="fl">DETAIL</div><p class="finding-body">${esc(rt.detail)}</p>`:'')
      +(rt.certification?`<div class="fl">CERTIFICATION</div><code class="finding-evidence">${esc(rt.certification)}</code>`:'')
      +`</article>`;
    const supplied=run.fields.length
      ? `<article class="finding-card clear"><div class="finding-top"><span class="sev-pill sev-clear">SUPPLIED</span><span class="fl">INTAKE</span></div>`
        +run.fields.map(f=>`<div class="fl">${esc(f.label.toUpperCase())}</div><p class="finding-body">${esc(f.value)}</p>`).join('')
        +(run.channels.length?`<div class="fl">CHANNELS NAMED</div><code class="finding-evidence">${esc(run.channels.join(', '))}</code>`:'')
        +`</article>`
      : '';
    const gaps=run.gaps.length
      ? `<article class="finding-card sev-medium"><div class="finding-top"><span class="sev-pill sev-medium">EVIDENCE GAPS</span><span class="fl">${esc(String(run.gaps.length))} MISSING</span></div>`
        +run.gaps.map(g=>`<div class="fl">${esc(g.label.toUpperCase())}</div><p class="finding-body">${esc(g.gap)}</p>`).join('')
        +`</article>`
      : '';
    const gates=run.gates.length
      ? `<article class="finding-card sev-high"><div class="finding-top"><span class="sev-pill sev-high">OWNER APPROVAL</span><span class="fl">GATE</span></div>`
        +run.gates.map(g=>`<p class="finding-body">${esc(g.reason)}</p>`).join('')
        +`</article>`
      : '';
    return head+runtimeCard+gates+supplied+gaps;
  }

  function render(ctx){
    const c=ctx||{};
    const au=agent.authority||{};
    const mark=(v,label)=>`<li><b class="${v?'yes':'no'}">${v?'✓':'✗'}</b><span>${esc(label)}</span></li>`;
    const rt=agent.runtime||{};
    return `<div class="agent-head"><img class="agent-profile-avatar" src="${esc(agent.avatars.circle)}" alt="${esc(agent.display_name)}">`
      +`<div><b>${esc(agent.agent_id)}</b><div class="agent-role">${esc(agent.display_name)} · ${esc(agent.card.subtitle)}</div></div></div>`
      +`<div class="agent-pills"><span class="agent-pill ok">● ${esc(agent.card.status)}</span><span class="agent-pill warn">NO RUNTIME CONNECTED</span></div>`
      +(agent.avatar_art_supplied===false?`<p class="help">Avatar is a generated placeholder — no brand art shipped with his package.</p>`:'')
      +`<p class="help simulation-notice">${esc(agent.simulation_notice||'')}</p>`
      +`<p class="help">Project · <b>${esc(c.projectName||'Untitled Shia App')}</b></p>`
      +`<label for="garyRequest">What should Gary work on?</label>`
      +`<textarea id="garyRequest" class="boris-request" placeholder="${esc(DEFAULT_REQUEST)}">${esc(state.request)}</textarea>`
      +`<p class="help">Label what you know and it is carried into the brief: <code>Audience:</code> <code>Offer:</code> <code>KPI:</code> <code>Evidence:</code></p>`
      +`<div class="section-title">Quick actions</div>`
      +`<div class="boris-quick">${QUICK_ACTIONS.map(a=>`<button class="btn gary-action" data-kind="${esc(a.kind)}">${esc(a.label)}</button>`).join('')}</div>`
      +`<button class="btn primary boris-run" id="runGary">RUN GARY</button>`
      +`<div class="section-title">Brief</div>`
      +renderRun(state.run)
      +`<div class="section-title">Authority</div>`
      +`<ul class="agent-authority">${mark(au.challenge_rights,'Challenge decisions')}${mark(au.may_generate_campaigns,'Draft campaigns')}${mark(au.may_recommend_budget,'Recommend a budget')}`
      +`${mark(au.may_publish_without_owner_approval,'Publish without approval')}${mark(au.may_spend_money,'Spend money')}${mark(au.may_access_secrets_directly,'Access secrets')}${mark(au.may_create_legal_commitments,'Commit legally')}`
      +`<li><b>·</b><span>Final authority: ${esc(au.final_authority)}</span></li></ul>`
      +`<details class="agent-identity"><summary>Identity &amp; runtime</summary>`
      +`<p class="help">${esc(agent.council.role)} — ${esc(agent.council.council)}.</p>`
      +`<p class="help">${agent.roles.map(esc).join(' · ')}</p>`
      +`<p class="help">Host: none in this repository.<br>${esc(rt.host_note||'')}<br>Certification: <b>${esc(rt.certification_status||'unknown')}</b>.</p>`
      +`<p class="help">Package · <code>${esc(agent.package||'none')}</code> (${esc(agent.package_version||'unknown')})</p>`
      +`<p class="help">Invocation · ${agent.invocation_aliases.map(esc).join(' · ')}</p></details>`;
  }

  return {state,setRequest,run,render,renderRun,inferKind,intake,DEFAULT_REQUEST,QUICK_ACTIONS};
}

return {createSession,inferKind,intake,DEFAULT_REQUEST,QUICK_ACTIONS,INTAKE_FIELDS,CHANNELS};
});
