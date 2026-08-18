/* Shia App Factory — agent registry.
   Single source of truth for named agents and council membership inside the Factory.
   Portable agent payloads (identity, cognitive model, runtime contract, evals) live under
   agents/<AGENT-ID>/ and are never rewritten to fit a host model.
   Loaded by index.html with a plain <script> tag so it works over file:// and http://.

   Two layers of authority, deliberately kept apart:

     `authority` — restated verbatim from the agent's package identity. Never edited here.
                   agents/tests/registry.test.mjs fails if it drifts from identity.json.
     `grants`    — capabilities Cristian granted this agent *inside the Factory*, recorded
                   with who granted them, when, and what stayed withheld.

   Widening what an agent may do is therefore a Factory decision that is visible as a Factory
   decision, rather than a quiet rewrite of a transferred identity. `capabilities()` merges the
   two into the effective set the router enforces; a grant can only add, never override a
   withheld boundary. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SHIA_AGENTS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

const BORIS={
  agent_id:'BORIS-001',
  display_name:'Boris',
  class:'portable_named_agent',
  origin:'Influencers Council',
  package:'agents/BORIS-001',
  package_version:'1.0.0-transfer',
  package_integrity:'transfer_manifest',
  status:'active_pending_runtime_recertification',
  roles:['systems engineering','deep research','reliability','failure analysis','red-team review','continuous improvement'],
  /* Authority boundaries as transferred. Boris advises and challenges; he never lands changes. */
  authority:{
    advisory:true,
    challenge_rights:true,
    may_request_rework:true,
    may_merge:false,
    may_deploy:false,
    may_access_secrets:false,
    final_authority:'Cristian'
  },
  /* Owner grant. Boris builds and codes inside the Factory: he authors source, scaffolds blocks,
     and writes the checks for what he built. Landing that work is still Cristian's — the three
     boundaries the package withholds are restated here so the grant cannot be read as loosening
     them. */
  grants:[{
    grant_id:'BORIS-BUILD-001',
    granted_by:'Cristian',
    granted_on:'2026-08-18',
    scope:'Shia App Factory',
    reason:'Boris is the engineering agent: he should produce working code, not only review it.',
    capabilities:{
      may_author_code:true,
      may_build:true,
      may_scaffold_blocks:true,
      may_run_tests:true
    },
    withheld:['may_merge','may_deploy','may_access_secrets'],
    /* Aliases the grant adds. They live here rather than in `invocation_aliases` because that
       list is the package's, restated verbatim — "Boris build this" is a Factory affordance, and
       it disappears with the grant. */
    aliases:['Boris build this','Boris build'],
    note:'Boris writes the artifact and the checks for it. Reviewing, merging and deploying it stay with Cristian.'
  }],
  /* Capability modules this agent can actually run, in the order the Inspector shows them.
     `requires` is checked against effective capabilities, so a module cannot appear without
     the grant that authorises it. */
  modules:[
    {id:'advisory',label:'Review',global:'ShiaAgentAdvisory',requires:[]},
    {id:'build',label:'Build',global:'ShiaAgentBuild',requires:['may_author_code','may_build']}
  ],
  invocation_aliases:['Call Boris','Ask Boris','Run this through Boris','Boris review this','@Boris'],
  /* Claude Code hosts Boris here. Hosting is not identity, and integration is not certification. */
  runtime:{
    host:'Claude Code',
    host_is_identity:false,
    certification_status:'PENDING_CLAUDE_CODE_RECERTIFICATION',
    certified:false,
    contract:'agents/BORIS-001/runtime/runtime_contract.md',
    recertification:'agents/BORIS-001/evals/RECERTIFICATION.md',
    migration_manifest:'agents/BORIS-001/runtime/migration_manifest.json'
  },
  council:{
    council:'Influencers Council',
    role:'Systems, reliability, research and red-team challenger',
    authority:'advisory',
    activation:['architecture','reliability','failure-analysis','high-risk-system-design','council-debate']
  },
  card:{
    subtitle:'Systems • Research • Reliability • Red Team',
    status:'AVAILABLE',
    badge:'Influencers Council',
    action_label:'CALL BORIS'
  },
  /* avatar-square for the Factory shelf card, avatar-circle for profile/chat,
     avatar-brand-sheet for full identity art, avatar-app-icon where a compact icon is needed. */
  avatars:{
    square:'assets/agents/boris-001/avatar-square.png',
    circle:'assets/agents/boris-001/avatar-circle.png',
    brand_sheet:'assets/agents/boris-001/avatar-brand-sheet.png',
    app_icon:'assets/agents/boris-001/avatar-app-icon.png'
  },
  avatar_provenance:'package'
};

const GARY={
  agent_id:'GARY-001',
  display_name:'Gary',
  class:'portable_named_agent',
  origin:'Growth Council',
  package:'agents/GARY-001',
  package_version:'0.4.0-multi-model-research-in-progress',
  /* Gary arrived without a transfer manifest, so agents/GARY-001/SHA256_MANIFEST.json is a
     baseline recorded at integration — it detects drift from here on, it does not attest a
     transfer the way Boris's manifest does. */
  package_integrity:'integration_baseline',
  status:'active_identity_seed_multi_model_research_in_progress',
  roles:['growth strategy','brand positioning','content and distribution strategy','audience development','campaign architecture','organic acquisition','marketing experimentation','launch planning','conversion and retention analysis'],
  /* A distinct Shia-owned identity informed by public marketing principles — not a real person. */
  simulation_notice:'Shia-owned growth agent with a distinct fictionalized operating identity. It may be informed by verified public marketing principles associated with Gary Vaynerchuk, but it is not Gary Vaynerchuk, does not impersonate him, and must not imply endorsement, affiliation, or personal access.',
  authority:{
    advisory:true,
    challenge_rights:true,
    may_request_rework:true,
    may_generate_campaigns:true,
    may_generate_content_drafts:true,
    may_recommend_budget:true,
    may_run_read_only_analysis_when_authorized:true,
    may_publish_without_owner_approval:false,
    may_spend_money:false,
    may_access_secrets_directly:false,
    may_bypass_platform_rules:false,
    final_authority:'Cristian',
    may_create_legal_commitments:false
  },
  /* No Factory grant. Gary drafts; publishing and spending stay with Cristian. */
  grants:[],
  modules:[
    {id:'growth',label:'Review',global:'ShiaAgentGrowth',requires:[]}
  ],
  invocation_aliases:['Call Gary','Ask Gary','Gary review this','Run this through Gary','Gary launch plan','@Gary'],
  runtime:{
    host:'Claude Code',
    host_is_identity:false,
    certification_status:'IDENTITY_SEEDED_RESEARCH_IN_PROGRESS_RUNTIME_RECERTIFICATION_PENDING',
    certified:false,
    contract:'agents/GARY-001/runtime/runtime_contract.md',
    recertification:null,
    migration_manifest:'agents/GARY-001/runtime/migration_manifest.json'
  },
  council:{
    council:'Growth Council',
    role:'Growth, brand positioning, distribution and experiment challenger',
    authority:'advisory',
    activation:['positioning','distribution','launch-planning','conversion-and-retention','marketing-experimentation','council-debate']
  },
  card:{
    subtitle:'Growth • Brand • Distribution • Experiments',
    status:'AVAILABLE',
    badge:'Growth Council',
    action_label:'CALL GARY'
  },
  /* The GARY-001 package shipped no avatar art. These are generated monograms, labelled
     PLACEHOLDER in the artwork itself so nobody mistakes them for Gary's identity art. */
  avatars:{
    square:'assets/agents/gary-001/avatar-square.svg',
    circle:'assets/agents/gary-001/avatar-circle.svg'
  },
  avatar_provenance:'placeholder'
};

const agents=[BORIS,GARY];
const councils=[
  {name:'Influencers Council',remit:'Systems, reliability and red-team challenge',members:['BORIS-001']},
  {name:'Growth Council',remit:'Growth, brand, distribution and experiments',members:['GARY-001']}
];

/* Rooms in the Factory. Registry-driven, so a new agent shows up in all of them
   without the shell being touched. */
const rooms=[
  {id:'workbench',label:'Workbench',blurb:'The block graph. Drag blocks, wire ports, run the real block runtimes.'},
  {id:'lab',label:'Lab',blurb:'Where the building happens. Agents holding a build grant author code here.'},
  {id:'office',label:'Office',blurb:'One desk per agent — identity, roles, authority, invocation, package provenance.'},
  {id:'hq',label:'Headquarters',blurb:'Councils, seats and the standing authority matrix across every agent.'}
];

/* Effective capabilities = package authority + Factory grants. A grant may add a capability;
   it may never flip one that the package or the grant itself withholds. */
function capabilities(agent){
  if(!agent)return {};
  const out=Object.assign({},agent.authority||{});
  const locked=new Set();
  (agent.grants||[]).forEach(g=>(g.withheld||[]).forEach(k=>locked.add(k)));
  (agent.grants||[]).forEach(g=>{
    Object.entries(g.capabilities||{}).forEach(([k,v])=>{
      if(locked.has(k))return;
      if(out[k]===false)return;
      out[k]=v;
    });
  });
  locked.forEach(k=>{if(k in out)out[k]=false});
  return out;
}

/* The capabilities an agent holds only because of a grant — what the Office and HQ views
   show separately from the package's own boundaries. */
function grantedCapabilities(agent){
  const base=(agent&&agent.authority)||{};
  const eff=capabilities(agent);
  return Object.keys(eff).filter(k=>eff[k]===true&&base[k]!==true);
}

/* Every alias that reaches this agent: the package's own, plus any a live grant contributes.
   The router builds its routes from this, so a revoked grant takes its aliases with it. */
function aliasesFor(agent){
  const out=((agent&&agent.invocation_aliases)||[]).slice();
  ((agent&&agent.grants)||[]).forEach(g=>(g.aliases||[]).forEach(a=>{if(!out.includes(a))out.push(a)}));
  return out;
}

/* The modules an agent may actually run, given its effective capabilities. */
function modulesFor(agent){
  const eff=capabilities(agent);
  return ((agent&&agent.modules)||[]).filter(m=>(m.requires||[]).every(c=>eff[c]===true));
}

return {
  version:'1.1.0',
  agents,
  councils,
  rooms,
  capabilities,
  grantedCapabilities,
  modulesFor,
  aliasesFor,
  byId(id){return agents.find(a=>a.agent_id===id)||null},
  council(name){
    const c=councils.find(x=>x.name===name);
    if(!c)return null;
    return {name:c.name,remit:c.remit,members:c.members.map(id=>this.byId(id)).filter(Boolean)};
  },
  /* Every council, already resolved — what the Headquarters view renders. */
  roster(){return councils.map(c=>this.council(c.name))}
};
});
