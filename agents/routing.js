/* Shia App Factory — agent invocation routing.
   Resolves the invocation aliases declared by each registry entry ("Call Boris", "@Boris", …)
   and enforces the agent's authority boundaries before anything is dispatched. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ShiaAgentRouting=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

/* A request that needs one of these capabilities is refused at the router,
   not left to the agent's good behaviour.

   `capabilities` lists the authority keys that govern the restriction — agents spell them
   differently (Boris declares `may_access_secrets`, Gary declares `may_access_secrets_directly`)
   and both must bind. `advisoryDefault` means an absent key counts as false for an agent that
   declares itself advisory: not declaring "may deploy" is not a grant of it. */
const RESTRICTED=[
  {capabilities:['may_merge'],advisoryDefault:true,test:/\b(merge|merging|land)\b/i,reason:'merge changes'},
  {capabilities:['may_deploy'],advisoryDefault:true,test:/\b(deploy|deploying|deployment|ship it|release to prod\w*|push to prod\w*|go live)\b/i,reason:'deploy or release'},
  /* ".env" carries no leading word boundary, so it is matched as its own alternative. */
  {capabilities:['may_access_secrets','may_access_secrets_directly'],advisoryDefault:true,test:/\b(?:secrets?|api[- ]?keys?|credentials?|passwords?|access tokens?)\b|\.env\b/i,reason:'access secrets'},
  {capabilities:['may_bypass_platform_rules'],test:/\b(bypass|circumvent|evade|get around|work around)\b[\s\S]{0,40}\b(platform|tos|terms|polic\w+|rules?|rate[- ]limits?|ban|review)\b/i,reason:'bypass platform rules'},
  {capabilities:['may_create_legal_commitments'],test:/\b(sign|signing|execute)\b[\s\S]{0,25}\b(contract|agreement|nda|terms|deal)\b|\b(legally|contractually)\s+(commit|bind)\w*\b|\bbinding (?:agreement|commitment|offer)\b/i,reason:'create legal commitments'}
];

/* Not refusals. These are the actions Gary's package says he may prepare but never take on his
   own: the work proceeds, and the owner-approval gate is reported with it. Refusing outright would
   misstate `may_publish_without_owner_approval:false`, which withholds the *unapproved* action. */
const GATED=[
  {capability:'may_publish_without_owner_approval',
   test:/\b(publish|publishing|post (?:this|it|these)|send (?:the |this |out )?(?:email|newsletter|campaign|blast)|email (?:the |our |my )?(?:list|subscribers|customers)|schedule (?:the |this )?(?:post|send|campaign|email)|message (?:the |our )?customers|dm (?:the|our|them))\b/i,
   action:'publish, send or schedule anything externally'},
  {capability:'may_spend_money',
   test:/\b(spend|spending|pay|paying|purchase|buy|buying|charge|fund|top[- ]up)\b|\bad spend\b/i,
   action:'spend money'}
];

function escapeRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function aliasPattern(alias){
  return new RegExp('^\\s*'+escapeRe(alias.trim()).replace(/\s+/g,'\\s+')+'\\b[\\s,.:;!?—–-]*([\\s\\S]*)$','i');
}

function createRouter(agents){
  const routes=[];
  (agents||[]).forEach(agent=>{
    (agent.invocation_aliases||[]).forEach(alias=>routes.push({agent,alias,re:aliasPattern(alias)}));
  });
  /* Longest alias first so "Boris review this" is not swallowed by a shorter prefix. */
  routes.sort((a,b)=>b.alias.length-a.alias.length);

  return {
    agents:agents||[],
    aliases:routes.map(r=>r.alias),
    /* Returns null when the text is not an agent invocation. */
    resolve(text){
      if(typeof text!=='string')return null;
      for(const route of routes){
        const m=route.re.exec(text);
        if(!m)continue;
        const request=(m[1]||'').trim();
        const authority=route.agent.authority||{};
        const owner=authority.final_authority||'the owner';
        /* Which authority key actually governs this restriction for this agent, or null when the
           package declares none of them and no advisory default applies. */
        const boundKey=r=>{
          for(const cap of r.capabilities){if(authority[cap]===false)return cap;}
          if(r.advisoryDefault&&authority.advisory===true&&r.capabilities.every(c=>authority[c]===undefined))return r.capabilities[0];
          return null;
        };
        const denials=[];
        for(const r of RESTRICTED){
          const cap=boundKey(r);
          if(cap&&r.test.test(request)){
            denials.push({capability:cap,reason:`${route.agent.display_name} is advisory and cannot ${r.reason}. Final authority: ${owner}.`});
          }
        }
        const gates=GATED
          .filter(g=>authority[g.capability]===false&&g.test.test(request))
          .map(g=>({capability:g.capability,reason:`${route.agent.display_name} may prepare this, but cannot ${g.action} without ${owner}'s approval.`}));
        return {
          agentId:route.agent.agent_id,
          agentName:route.agent.display_name,
          alias:route.alias,
          request,
          permitted:denials.length===0,
          denials,
          /* Gates do not block the work — they travel with it so no surface can present the
             output as something already actioned. */
          gates,
          requiresApproval:gates.length>0,
          authority
        };
      }
      return null;
    }
  };
}

return {createRouter,aliasPattern,RESTRICTED,GATED};
});
