/* Shia App Factory — agent invocation routing.
   Resolves the invocation aliases declared by each registry entry ("Call Boris", "@Boris", …)
   and enforces the agent's authority boundaries before anything is dispatched. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ShiaAgentRouting=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

/* A request that needs one of these capabilities is refused at the router,
   not left to the agent's good behaviour. */
const RESTRICTED=[
  {capability:'may_merge',test:/\b(merge|merging|land)\b/i,reason:'merge changes'},
  {capability:'may_deploy',test:/\b(deploy|deploying|deployment|ship it|release to prod\w*|push to prod\w*|go live)\b/i,reason:'deploy or release'},
  /* ".env" carries no leading word boundary, so it is matched as its own alternative. */
  {capability:'may_access_secrets',test:/\b(?:secrets?|api[- ]?keys?|credentials?|passwords?|access tokens?)\b|\.env\b/i,reason:'access secrets'}
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
        const denials=RESTRICTED
          .filter(r=>authority[r.capability]===false&&r.test.test(request))
          .map(r=>({capability:r.capability,reason:`${route.agent.display_name} is advisory and cannot ${r.reason}. Final authority: ${authority.final_authority||'the owner'}.`}));
        return {
          agentId:route.agent.agent_id,
          agentName:route.agent.display_name,
          alias:route.alias,
          request,
          permitted:denials.length===0,
          denials,
          authority
        };
      }
      return null;
    }
  };
}

return {createRouter,aliasPattern,RESTRICTED};
});
