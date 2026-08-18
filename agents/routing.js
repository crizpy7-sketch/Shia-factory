/* Shia App Factory — agent invocation routing.
   Resolves the invocation aliases declared by each registry entry ("Call Boris", "@Gary", …)
   and enforces the agent's authority boundaries before anything is dispatched.

   Enforcement is deny-unless-held: a restricted request goes through only when the agent's
   *effective* capability for it is exactly `true`. A capability the agent never declares counts
   as withheld, not as unspecified — so a newly registered agent starts out unable to merge,
   deploy, publish, spend or write code, and gains any of that only from a grant recorded in
   registry.js. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ShiaAgentRouting=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

/* A request that needs one of these capabilities is refused at the router, not left to the
   agent's good behaviour.

   `capabilities` lists the keys different packages use for the same boundary — BORIS-001 calls it
   `may_access_secrets`, GARY-001 calls it `may_access_secrets_directly`. The denial reports
   whichever key the agent itself declares, so a refusal cites the agent's own contract.

   `unless` exempts framings that ask for advice about an action rather than the action itself:
   Gary may recommend a budget, so "recommend our ad spend" must not be refused as spending. */
const RESTRICTED=[
  {capabilities:['may_merge'],test:/\b(merge|merging|land)\b/i,reason:'merge changes'},
  {capabilities:['may_deploy'],test:/\b(deploy|deploying|deployment|ship it|release to prod\w*|push to prod\w*|go live)\b/i,reason:'deploy or release'},
  /* ".env" carries no leading word boundary, so it is matched as its own alternative. */
  {capabilities:['may_access_secrets','may_access_secrets_directly'],test:/\b(?:secrets?|api[- ]?keys?|credentials?|passwords?|access tokens?)\b|\.env\b/i,reason:'access secrets'},
  /* Authoring code is a granted capability, not a default one. Boris holds it through
     BORIS-BUILD-001; no other agent does until Cristian grants it. */
  {capabilities:['may_author_code','may_build'],
    test:/\b(?:write|author|generate|scaffold|implement|code|build|refactor|patch|rewrite)\b[\s\S]{0,40}\b(?:code|module|block|component|script|file|function|app|artifact|glue|runtime|export)\b|\bcode this\b|\bbuild (?:me|this|the|it)\b/i,
    reason:'author or build code'},
  {capabilities:['may_publish_without_owner_approval'],test:/\b(publish|publishing|post (?:this|it|that)|schedule the post|send the (?:email|campaign|blast|newsletter)|blast the list|go live with)\b/i,reason:'publish without owner approval'},
  {capabilities:['may_spend_money'],test:/\b(spend|spending|buy ads?|run (?:paid )?ads?|pay for|charge (?:the |my )?card|top up the ad account)\b/i,
    unless:/\b(recommend|recommendation|suggest|propose|plan|estimate|draft|model|forecast|how much should)\b/i,reason:'spend money'},
  {capabilities:['may_create_legal_commitments'],test:/\b(sign (?:the |a |this )?(?:contract|agreement|deal|nda)|commit us to|enter into (?:a |an )?(?:contract|agreement))\b/i,reason:'create legal commitments'},
  {capabilities:['may_bypass_platform_rules'],test:/\b(bypass|circumvent|evade|get around the (?:rules?|polic\w+)|fake (?:reviews?|engagement|followers)|buy followers)\b/i,reason:'bypass platform rules'}
];

function escapeRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function aliasPattern(alias){
  return new RegExp('^\\s*'+escapeRe(alias.trim()).replace(/\s+/g,'\\s+')+'\\b[\\s,.:;!?—–-]*([\\s\\S]*)$','i');
}

/* registry.js publishes itself on the global as well as through module.exports, so these two find
   it over file://, over http:// and under `node --test` alike. Without it the router falls back to
   the package alone — grants only ever add, so that fallback is stricter than the truth, never
   looser. */

/* The package's own aliases plus any a live grant contributes. Revoking a grant takes its aliases
   with it, so "Boris build this" stops resolving the moment the grant goes. */
function aliasesFor(agent){
  const g=typeof globalThis!=='undefined'?globalThis:null;
  const reg=g&&g.SHIA_AGENTS;
  if(reg&&typeof reg.aliasesFor==='function')return reg.aliasesFor(agent);
  const out=((agent&&agent.invocation_aliases)||[]).slice();
  ((agent&&agent.grants)||[]).forEach(gr=>(gr.aliases||[]).forEach(a=>{if(!out.includes(a))out.push(a)}));
  return out;
}

function registryCapabilities(agent){
  const g=typeof globalThis!=='undefined'?globalThis:null;
  const reg=g&&g.SHIA_AGENTS;
  if(reg&&typeof reg.capabilities==='function')return reg.capabilities(agent);
  return Object.assign({},(agent&&agent.authority)||{});
}

function createRouter(agents,options){
  const opts=options||{};
  const capabilitiesOf=typeof opts.capabilities==='function'?opts.capabilities:registryCapabilities;
  const routes=[];
  (agents||[]).forEach(agent=>{
    aliasesFor(agent).forEach(alias=>routes.push({agent,alias,re:aliasPattern(alias)}));
  });
  /* Longest alias first so "Boris review this" is not swallowed by a shorter prefix. */
  routes.sort((a,b)=>b.alias.length-a.alias.length);

  /* Which key of this rule the agent actually declares — so the denial cites the agent's own
     contract rather than a synonym it has never heard of. */
  function declaredKey(rule,capabilities){
    return rule.capabilities.find(k=>k in capabilities)||rule.capabilities[0];
  }

  function evaluate(agent,request){
    const capabilities=capabilitiesOf(agent);
    const finalAuthority=capabilities.final_authority||(agent.authority&&agent.authority.final_authority)||'the owner';
    return RESTRICTED
      .filter(rule=>{
        if(!rule.test.test(request))return false;
        if(rule.unless&&rule.unless.test(request))return false;
        /* Deny unless the capability is affirmatively held. */
        return !rule.capabilities.some(k=>capabilities[k]===true);
      })
      .map(rule=>({
        capability:declaredKey(rule,capabilities),
        reason:`${agent.display_name} cannot ${rule.reason} in the Factory. Final authority: ${finalAuthority}.`
      }));
  }

  return {
    agents:agents||[],
    aliases:routes.map(r=>r.alias),
    capabilitiesOf,
    /* Returns null when the text is not an agent invocation. */
    resolve(text){
      if(typeof text!=='string')return null;
      for(const route of routes){
        const m=route.re.exec(text);
        if(!m)continue;
        const request=(m[1]||'').trim();
        const denials=evaluate(route.agent,request);
        return {
          agentId:route.agent.agent_id,
          agentName:route.agent.display_name,
          alias:route.alias,
          request,
          permitted:denials.length===0,
          denials,
          authority:route.agent.authority||{},
          capabilities:capabilitiesOf(route.agent)
        };
      }
      return null;
    }
  };
}

return {createRouter,aliasPattern,RESTRICTED};
});
