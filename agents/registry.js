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

/* GARY-001 is registered so the headquarters has a real second seat, but his identity package has
   not arrived yet. Everything below is registration metadata supplied by Cristian — not transferred
   state, not a reconstructed identity, and deliberately not a cognitive model. `provisional: true`
   is what the UI reads to say so out loud. When Gary's files arrive they are imported verbatim,
   exactly as BORIS-001's were, and this record is replaced by what they contain. */
const GARY={
  agent_id:'GARY-001',
  display_name:'Gary',
  class:'portable_named_agent',
  origin:'Influencers Council',
  package:null,
  package_version:null,
  provisional:true,
  provisional_note:'Awaiting Gary\'s identity package. Discipline supplied by Cristian; cognitive model, authority detail, ledgers and avatar assets are not yet transferred and have not been invented.',
  status:'registered_pending_identity_package',
  roles:['marketing strategy','positioning and messaging','campaign design','audience research','copy and creative direction','growth analysis'],
  /* Held at the strictest setting until his own package states otherwise. */
  authority:{
    advisory:true,
    challenge_rights:true,
    may_request_rework:true,
    may_merge:false,
    may_deploy:false,
    may_access_secrets:false,
    final_authority:'Cristian'
  },
  invocation_aliases:['Call Gary','Ask Gary','Run this through Gary','Gary review this','@Gary'],
  runtime:{
    host:null,
    host_is_identity:false,
    certification_status:'NO_PACKAGE_RECEIVED',
    certified:false,
    contract:null,
    recertification:null,
    migration_manifest:null
  },
  council:{
    council:'Influencers Council',
    role:'Marketing, positioning and growth',
    authority:'advisory',
    activation:['positioning','messaging','campaign','audience','pricing-narrative','launch','council-debate']
  },
  card:{
    subtitle:'Marketing • Positioning • Campaigns • Growth',
    status:'AWAITING IDENTITY PACKAGE',
    badge:'Influencers Council',
    action_label:'CALL GARY'
  },
  /* A monogram placeholder, clearly generated. Gary's real brand art replaces it on arrival. */
  avatars:{
    square:'assets/agents/gary-001/placeholder-monogram.svg',
    circle:'assets/agents/gary-001/placeholder-monogram.svg',
    brand_sheet:null,
    app_icon:'assets/agents/gary-001/placeholder-monogram.svg'
  }
};

const agents=[BORIS,GARY];
const councils=[{name:'Influencers Council',members:['BORIS-001','GARY-001']}];

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
