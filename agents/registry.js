/* Shia App Factory — agent registry.
   Single source of truth for named agents and council membership inside the Factory.
   Portable agent payloads (identity, cognitive model, runtime contract, evals) live under
   agents/<AGENT-ID>/ and are never rewritten to fit a host model.
   Loaded by index.html with a plain <script> tag so it works over file:// and http://. */
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
  status:'active_pending_runtime_recertification',
  roles:['systems engineering','deep research','reliability','failure analysis','red-team review','continuous improvement'],
  /* Authority boundaries. Boris advises and challenges; he never lands changes. */
  authority:{
    advisory:true,
    challenge_rights:true,
    may_request_rework:true,
    may_merge:false,
    may_deploy:false,
    may_access_secrets:false,
    final_authority:'Cristian'
  },
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
  /* The shipped avatar-square.png and avatar-circle.png are miscropped fragments of the brand
     sheet (they include the sneakers above the portrait). The sheet itself is clean, so every
     surface crops the portrait from it using these verified fractions. No packaged byte is
     modified; when corrected square/circle exports arrive, drop `portrait` and the surfaces fall
     back to the files. */
  portrait:{source:'brand_sheet',x:0.022,y:0.828,size:0.128},
  avatars:{
    square:'assets/agents/boris-001/avatar-square.png',
    circle:'assets/agents/boris-001/avatar-circle.png',
    brand_sheet:'assets/agents/boris-001/avatar-brand-sheet.png',
    app_icon:'assets/agents/boris-001/avatar-app-icon.png'
  }
};

/* GARY-001's identity package arrived on 2026-08-15 and was imported verbatim to agents/GARY-001.
   Everything below restates that package for the UI; agents/tests/registry.test.mjs fails if the
   two drift. What his package does not contain is not filled in here: he shipped no avatar art and
   no recertification gate document, and neither has been invented. See agents/GARY-001/IMPORT.md
   for the full import record, including why his provenance is weaker than Boris's. */
const GARY={
  agent_id:'GARY-001',
  display_name:'Gary',
  class:'portable_named_agent',
  origin:'Shia App Factory',
  package:'agents/GARY-001',
  package_version:'0.4.0-multi-model-research-in-progress',
  status:'active_identity_seed_multi_model_research_in_progress',
  /* Carried from identity.json so every surface that renders Gary can render this with him. */
  simulation_notice:'Shia-owned growth agent with a distinct fictionalized operating identity. It may be informed by verified public marketing principles associated with Gary Vaynerchuk, but it is not Gary Vaynerchuk, does not impersonate him, and must not imply endorsement, affiliation, or personal access.',
  roles:['growth strategy','brand positioning','content and distribution strategy','audience development','campaign architecture','organic acquisition','marketing experimentation','launch planning','conversion and retention analysis'],
  /* Verbatim from identity.json. Gary declares more capabilities than Boris and more refusals with
     them; the extra keys are the point, so they are not flattened to Boris's shape. */
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
  invocation_aliases:['Call Gary','Ask Gary','Gary review this','Run this through Gary','Gary launch plan','@Gary'],
  /* Gary's execution host is the separate Next.js growth application shipped alongside his package.
     It is not vendored into this zero-build repository, so no runtime here executes Gary. `host`
     stays null rather than naming a host that is not running. */
  runtime:{
    host:null,
    host_is_identity:false,
    host_note:'Gary\'s execution host is the Gary Vee Growth Agent application (release 1.1.0), which is not part of this repository. This repository holds his identity and policy layer only.',
    certification_status:'IDENTITY_SEEDED_RESEARCH_IN_PROGRESS_RUNTIME_RECERTIFICATION_PENDING',
    certified:false,
    contract:'agents/GARY-001/runtime/runtime_contract.md',
    /* No recertification gate document shipped. Boris has one; Gary's passport carries the test
       list instead. A document is not authored on his behalf. */
    recertification:null,
    passport:'agents/GARY-001/identity/agent_passport.json',
    migration_manifest:'agents/GARY-001/runtime/migration_manifest.json'
  },
  council:{
    council:'Growth Council',
    role:'Growth, brand, distribution and experimentation',
    authority:'advisory',
    activation:['positioning','messaging','campaign','audience','distribution','launch','experiment','retention','council-debate']
  },
  card:{
    subtitle:'Growth • Brand • Distribution • Experiments',
    status:'AVAILABLE',
    badge:'Growth Council',
    action_label:'CALL GARY'
  },
  /* No avatar art of any kind shipped in Gary's archive. The monogram is a generated stand-in and
     says so; `avatar_art_supplied` is what the UI reads to avoid presenting it as his brand art. */
  avatar_art_supplied:false,
  avatars:{
    square:'assets/agents/gary-001/placeholder-monogram.svg',
    circle:'assets/agents/gary-001/placeholder-monogram.svg',
    brand_sheet:null,
    app_icon:'assets/agents/gary-001/placeholder-monogram.svg'
  }
};

const agents=[BORIS,GARY];
/* Each agent's council seat is the one his own package declares. Boris's council-membership.json
   says Influencers Council; Gary's agent-card.json says Growth Council. Neither was moved to make
   a tidier roster. */
const councils=[
  {name:'Influencers Council',members:['BORIS-001']},
  {name:'Growth Council',members:['GARY-001']}
];

return {
  version:'1.0.0',
  agents,
  councils,
  byId(id){return agents.find(a=>a.agent_id===id)||null},
  /* Agents whose identity package has actually been transferred and verified. */
  established(){return agents.filter(a=>!a.provisional)},
  provisional(){return agents.filter(a=>a.provisional===true)},
  council(name){
    const c=councils.find(x=>x.name===name);
    if(!c)return null;
    return {name:c.name,members:c.members.map(id=>this.byId(id)).filter(Boolean)};
  }
};
});
