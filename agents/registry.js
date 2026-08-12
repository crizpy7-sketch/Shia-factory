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
  avatars:{
    square:'assets/agents/boris-001/avatar-square.png',
    circle:'assets/agents/boris-001/avatar-circle.png',
    brand_sheet:'assets/agents/boris-001/avatar-brand-sheet.png',
    app_icon:'assets/agents/boris-001/avatar-app-icon.png'
  }
};

const agents=[BORIS];
const councils=[{name:'Influencers Council',members:['BORIS-001']}];

return {
  version:'1.0.0',
  agents,
  councils,
  byId(id){return agents.find(a=>a.agent_id===id)||null},
  council(name){
    const c=councils.find(x=>x.name===name);
    if(!c)return null;
    return {name:c.name,members:c.members.map(id=>this.byId(id)).filter(Boolean)};
  }
};
});
