/* Shia App Factory — Headquarters data layer.

   The HQ page is a shell; this file decides what it is allowed to say. Everything here is a pure
   function of the registry plus whatever the live runtime actually reported, so the building can
   never show a status it did not receive. When the runtime is offline the answer is "offline" and
   the command to start it — not a placeholder number.

   Loaded with a plain <script> tag (file:// and http://) and exported for `node --test`. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SHIA_HQ=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

/** The rooms of the headquarters. Each one is a real surface, not a tab with a picture in it. */
const ROOMS=[
  {
    id:'office',
    name:'Office',
    tagline:'Who is on staff, what they are working on, what needs your decision.',
    icon:'◧',
  },
  {
    id:'workshop',
    name:'Workshop',
    tagline:'The block workbench: compose, wire and run real blocks.',
    icon:'⚙',
  },
  {
    id:'lab',
    name:'Lab',
    tagline:'Evals, exams and certification evidence. Where claims are tested.',
    icon:'⚗',
  },
  {
    id:'records',
    name:'Records',
    tagline:'Identity, memory, skills, ledgers and provenance.',
    icon:'▤',
  },
];

/** Heartbeat → the tile cut from Boris's brand sheet. Agents without a sheet fall back to none. */
const SPRITE_FOR_STATE={
  idle:'sleep', sleep:'sleep', thinking:'thinking', planning:'thinking', researching:'researching',
  analyzing:'analyzing', working:'fixing', testing:'analyzing', bug_found:'bug_found', fixing:'fixing',
  blocked:'warning', awaiting_approval:'warning', deploying:'deploying', learning:'learning',
  done:'done', error:'warning',
};

/**
 * Normalises an agent into what the office can display. Provisional agents carry their caveat
 * with them so no view can quietly present a registration as a transferred identity.
 */
function agentCard(agent){
  const provisional=agent.provisional===true;
  return {
    id:agent.agent_id,
    name:agent.display_name,
    subtitle:agent.card&&agent.card.subtitle?agent.card.subtitle:'',
    badge:agent.card&&agent.card.badge?agent.card.badge:'',
    actionLabel:agent.card&&agent.card.action_label?agent.card.action_label:`CALL ${agent.display_name.toUpperCase()}`,
    roles:agent.roles||[],
    authority:agent.authority||{},
    aliases:agent.invocation_aliases||[],
    avatar:agent.avatars?agent.avatars.square:null,
    portrait:portraitStyle(agent),
    profileAvatar:agent.avatars?agent.avatars.circle:null,
    brandSheet:agent.avatars?agent.avatars.brand_sheet:null,
    provisional,
    provisionalNote:provisional?agent.provisional_note||'Identity package not yet received.':null,
    packagePath:agent.package||null,
    /* An agent with no package has no certification to report — that is a fact, not a gap to fill. */
    certification:agent.runtime&&agent.runtime.certification_status?agent.runtime.certification_status:'unknown',
    certified:Boolean(agent.runtime&&agent.runtime.certified),
    council:agent.council||null,
    status:agent.card&&agent.card.status?agent.card.status:'unknown',
  };
}

/**
 * CSS for rendering an agent's portrait as a crop of a larger sheet. Returns null when the agent
 * has no verified region, in which case the surface uses the plain avatar file.
 */
function portraitStyle(agent){
  const portrait=agent&&agent.portrait;
  const sheet=agent&&agent.avatars?agent.avatars[portrait?portrait.source:'brand_sheet']:null;
  if(!portrait||!sheet)return null;
  const size=portrait.size;
  return {
    backgroundImage:`url(${sheet})`,
    backgroundSize:`${(100/size).toFixed(2)}% auto`,
    backgroundPositionX:`${((portrait.x/(1-size))*100).toFixed(3)}%`,
    backgroundPositionY:`${((portrait.y/(1-size))*100).toFixed(3)}%`,
    backgroundRepeat:'no-repeat',
  };
}

function roster(registry){
  return (registry&&registry.agents?registry.agents:[]).map(agentCard);
}

/**
 * Describes the runtime for display. `status` is whatever /api/status returned, or null when the
 * runtime could not be reached. There is no third possibility and no invented middle ground.
 */
function describeRuntime(status,options){
  const endpoint=(options&&options.endpoint)||'http://127.0.0.1:8787';
  if(!status){
    return {
      online:false,
      headline:'Runtime offline',
      detail:`No agent runtime answered at ${endpoint}. The office can show who is on staff, but not what they are doing.`,
      startCommand:'cd boris && npm run build && node dist/src/cli.js run',
      heartbeat:'sleep',
      sprite:'sleep',
      fields:[],
    };
  }
  const heartbeat=status.heartbeat||'idle';
  return {
    online:true,
    headline:status.isTestDouble?'Runtime online — test double provider':'Runtime online',
    detail:status.isTestDouble
      ? 'A deterministic test double is answering. Nothing here is a live-model result.'
      : `${status.provider} · ${status.model}${status.providerAvailable?'':' (no credentials — no task can run)'}`,
    startCommand:null,
    heartbeat,
    sprite:SPRITE_FOR_STATE[heartbeat]||'thinking',
    fields:[
      {label:'Agent',value:`${status.displayName||'unknown'} · ${status.agentId||'unknown'}`},
      {label:'Provider',value:status.provider||'unknown'},
      {label:'Model',value:status.model||'unknown'},
      {label:'Uptime',value:typeof status.uptimeSeconds==='number'?`${status.uptimeSeconds}s`:'unknown'},
      {label:'Queue',value:typeof status.queueDepth==='number'?String(status.queueDepth):'unknown'},
      {label:'Current task',value:status.currentTaskId||'none'},
      {label:'Current tool',value:status.currentTool||'none'},
      {label:'Recertification',value:status.recertification||'unknown'},
    ],
  };
}

/**
 * The lab's view of certification. Reads the recertification document as text; if it could not be
 * loaded the lab says so rather than assuming the gate is open or closed.
 */
function certificationState(recertificationText){
  if(typeof recertificationText!=='string'||recertificationText.trim()===''){
    return {available:false,status:'unknown',ticked:0,total:0,items:[],
      note:'The recertification document could not be read from here.'};
  }
  const statusMatch=/Status:\s*(\w+)/i.exec(recertificationText);
  const items=[];
  const lines=recertificationText.split('\n');
  for(const line of lines){
    const match=/^\s*-\s*\[( |x|X)\]\s*(.+?)\s*$/.exec(line);
    if(match)items.push({done:match[1].toLowerCase()==='x',label:match[2]});
  }
  return {
    available:true,
    status:statusMatch?statusMatch[1].toUpperCase():'unknown',
    ticked:items.filter(i=>i.done).length,
    total:items.length,
    items,
    note:items.some(i=>i.done)
      ? 'A gate is ticked. Ticks are only valid with executed evidence and Cristian\'s approval.'
      : 'No gate has been ticked. Integration and hosting are not certification.',
  };
}

/** Queue counts for the office board, derived only from tasks the runtime actually returned. */
function queueSummary(tasks){
  const list=Array.isArray(tasks)?tasks:[];
  const buckets={queued:0,planning:0,working:0,verifying:0,blocked:0,awaiting_approval:0,completed:0,failed:0,cancelled:0};
  for(const task of list){
    if(Object.prototype.hasOwnProperty.call(buckets,task.status))buckets[task.status]+=1;
  }
  return {
    total:list.length,
    buckets,
    active:buckets.planning+buckets.working+buckets.verifying,
    needsYou:buckets.awaiting_approval+buckets.blocked,
  };
}

/**
 * What the headquarters is missing. Shown in the office so the gaps are visible in the building
 * itself rather than only in a report someone has to remember to read.
 */
function outstandingWork(registry,runtime){
  const items=[];
  for(const agent of roster(registry)){
    if(agent.provisional){
      items.push({
        subject:agent.name,
        what:'identity package not received',
        detail:agent.provisionalNote,
        blocking:`${agent.name} cannot be given work until his package is imported.`,
      });
    }else if(!agent.certified){
      items.push({
        subject:agent.name,
        what:`runtime recertification ${agent.certification}`,
        detail:'Hosting an agent is not the same as certifying the host as that agent.',
        blocking:'Run the recertification gauntlet and record the evidence.',
      });
    }
  }
  if(!runtime||!runtime.online){
    items.push({
      subject:'Runtime',
      what:'offline',
      detail:'No agent runtime is answering, so no work can be executed from here.',
      blocking:'Start it with: cd boris && node dist/src/cli.js run',
    });
  }else if(runtime.headline&&/test double/i.test(runtime.headline)){
    items.push({
      subject:'Runtime',
      what:'running on a test double',
      detail:'A deterministic stand-in is answering instead of a model.',
      blocking:'Set a provider credential and re-run preflight for live work.',
    });
  }
  return items;
}

return {ROOMS,SPRITE_FOR_STATE,portraitStyle,agentCard,roster,describeRuntime,certificationState,queueSummary,outstandingWork};
});
