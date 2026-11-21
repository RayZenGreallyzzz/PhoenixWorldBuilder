/* Phoenix Engine — declarative quest definitions and per-player progress 0.1.
 * Pure logic; all online events must originate from trusted server actions.
 * Reward grants must be committed atomically with quest claims in server DB.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixQuests=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1, IDENT=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
 const EVENT_TYPES=Object.freeze(['mob.killed','item.collected','item.crafted','npc.talked','area.entered']);
 const REWARD_TYPES=Object.freeze(['xp','currency','item']);
 function ident(value,label){
  if(typeof value!=='string'||!IDENT.test(value))throw new TypeError('Invalid '+label);
  return value;
 }
 function int(value,min,max,label){
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new TypeError('Invalid '+label);
  return value;
 }
 function safeCopy(value){return JSON.parse(JSON.stringify(value))}
 function define(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Invalid quest');
  const id=ident(raw.id,'quest id');
  if(typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>160)
   throw new TypeError('Invalid quest title');
  const goals=raw.goals;
  if(!Array.isArray(goals)||!goals.length||goals.length>20)throw new TypeError('Invalid quest goals');
  const names=new Set();
  const normalized=goals.map(g=>{
   if(!g||typeof g!=='object'||Array.isArray(g))throw new TypeError('Invalid quest goal');
   const goalId=ident(g.id,'goal id');
   if(names.has(goalId))throw new TypeError('Duplicate quest goal');
   names.add(goalId);
   if(!EVENT_TYPES.includes(g.event))throw new TypeError('Unsupported quest goal event');
   return {id:goalId,event:g.event,target:ident(g.target,'goal target'),
    count:int(g.count,1,100000,'quest goal count')};
  });
  const prerequisites=raw.prerequisites??[];
  if(!Array.isArray(prerequisites)||prerequisites.length>20)throw new TypeError('Invalid prerequisites');
  const deps=prerequisites.map(x=>ident(x,'quest prerequisite'));
  if(new Set(deps).size!==deps.length||deps.includes(id))throw new TypeError('Duplicate/self prerequisite');
  const requirements=raw.requirements??{};
  if(!requirements||typeof requirements!=='object'||Array.isArray(requirements))
   throw new TypeError('Invalid quest requirements');
  const flags=requirements.flags??[];
  if(!Array.isArray(flags)||flags.length>30)throw new TypeError('Invalid required flags');
  const requiredFlags=flags.map(x=>ident(x,'required flag'));
  if(new Set(requiredFlags).size!==requiredFlags.length)throw new TypeError('Duplicate required flag');
  const rewards=raw.rewards??[];
  if(!Array.isArray(rewards)||rewards.length>20)throw new TypeError('Invalid rewards');
  const items=rewards.map(r=>{
   if(!r||typeof r!=='object'||Array.isArray(r)||!REWARD_TYPES.includes(r.type))
    throw new TypeError('Invalid quest reward');
   return {type:r.type,id:ident(r.id,'reward id'),amount:int(r.amount,1,1000000000,'reward amount')};
  });
  return {id,title:raw.title.trim(),goals:normalized,prerequisites:deps,
   requirements:{minLevel:int(requirements.minLevel??1,1,1000,'minimum level'),flags:requiredFlags},
   rewards:items};
 }
 class Catalog{
  constructor(){this.quests=new Map()}
  set(raw){const d=define(raw);if(this.quests.size>=1000&&!this.quests.has(d.id))
   throw new RangeError('Quest catalog limit');this.quests.set(d.id,d);return safeCopy(d)}
  get(id){const q=this.quests.get(id);return q?safeCopy(q):null}
  list(){return [...this.quests.values()].map(safeCopy)}
  remove(id){return this.quests.delete(id)}
  serialize(){return {format:'phoenix-quest-catalog',version:VERSION,quests:this.list()}}
  load(snapshot){
   if(!snapshot||snapshot.format!=='phoenix-quest-catalog'||
    snapshot.version!==VERSION||!Array.isArray(snapshot.quests)||snapshot.quests.length>1000)
    throw new TypeError('Invalid quest catalog snapshot');
   const next=new Map();
   for(const raw of snapshot.quests){
    const d=define(raw);if(next.has(d.id))throw new TypeError('Duplicate quest id');
    next.set(d.id,d);
   }
   this.quests=next;
  }
 }
 class Session{
  constructor(catalog,actorId){
   if(!(catalog instanceof Catalog))throw new TypeError('Quest catalog required');
   this.catalog=catalog;this.actorId=ident(actorId,'actor id');
   this.rows=new Map();this.seen=new Set();
  }
  accept(id,context={}){
   const q=this.catalog.get(id);
   if(!q||this.rows.has(id))return false;
   const level=int(context.level??1,1,1000,'player level');
   const flags=context.flags??[];
   if(!Array.isArray(flags))throw new TypeError('Invalid player flags');
   if(level<q.requirements.minLevel||!q.requirements.flags.every(f=>flags.includes(f)))return false;
   if(!q.prerequisites.every(dep=>this.rows.get(dep)?.status==='claimed'))return false;
   this.rows.set(id,{status:'active',progress:Object.fromEntries(q.goals.map(g=>[g.id,0]))});
   return true;
  }
  get(id){const r=this.rows.get(id);return r?safeCopy({questId:id,...r}):null}
  list(){return [...this.rows].map(([questId,r])=>safeCopy({questId,...r}))}
  process(raw){
   const e=(typeof globalThis!=='undefined'&&globalThis.PhoenixEvents)||
    (typeof require==='function'?require('./phoenix-events.js'):null);
   if(!e)throw new Error('PhoenixEvents dependency unavailable');
   const value=e.event(raw);
   if(value.actorId!==this.actorId||this.seen.has(value.id))return [];
   this.seen.add(value.id);
   // Bounded local memory. Server must persist event idempotency in DB.
   if(this.seen.size>10000)this.seen.delete(this.seen.values().next().value);
   const updates=[];
   for(const [id,row] of this.rows){
    if(row.status!=='active')continue;
    const q=this.catalog.get(id);if(!q)continue;
    let touched=false;
    for(const goal of q.goals){
     if(value.type===goal.event&&value.data.target===goal.target&&
        row.progress[goal.id]<goal.count){
      row.progress[goal.id]++;touched=true;
     }
    }
    if(!touched)continue;
    if(q.goals.every(g=>row.progress[g.id]>=g.count))row.status='ready';
    updates.push(this.get(id));
   }
   return updates;
  }
  // Claim instruction, NOT currency or item minting.
  // Server must commit quest state + inventory/ledger grant atomically.
  claim(id){
   const row=this.rows.get(id),q=this.catalog.get(id);
   if(!q||!row||row.status!=='ready')return null;
   row.status='claimed';
   return {claimId:this.actorId+':'+id,actorId:this.actorId,questId:id,
    rewards:safeCopy(q.rewards)};
  }
  serialize(){return {format:'phoenix-quest-session',version:VERSION,
   actorId:this.actorId,rows:this.list(),seenEventIds:[...this.seen]}}
  load(snapshot){
   if(!snapshot||snapshot.format!=='phoenix-quest-session'||
    snapshot.version!==VERSION||snapshot.actorId!==this.actorId||
    !Array.isArray(snapshot.rows)||snapshot.rows.length>1000||
    !Array.isArray(snapshot.seenEventIds)||snapshot.seenEventIds.length>10000)
    throw new TypeError('Invalid quest session snapshot');
   const next=new Map(),seen=new Set();
   for(const raw of snapshot.rows){
    const q=this.catalog.get(raw?.questId);
    if(!q||next.has(raw.questId)||!['active','ready','claimed'].includes(raw.status)||
       !raw.progress||typeof raw.progress!=='object'||Array.isArray(raw.progress))
     throw new TypeError('Invalid quest session row');
    const progress={};
    if(Object.keys(raw.progress).length!==q.goals.length)
     throw new TypeError('Quest goal shape mismatch');
    for(const goal of q.goals)
     progress[goal.id]=int(raw.progress[goal.id],0,goal.count,'quest progress');
    const satisfied=q.goals.every(g=>progress[g.id]===g.count);
    if((raw.status==='active'&&satisfied)||(raw.status!=='active'&&!satisfied))
     throw new TypeError('Inconsistent quest state');
    next.set(q.id,{status:raw.status,progress});
   }
   for(const id of snapshot.seenEventIds){
    ident(id,'event id');if(seen.has(id))throw new TypeError('Duplicate event');seen.add(id);
   }
   this.rows=next;this.seen=seen;
  }
 }
 return Object.freeze({VERSION,EVENT_TYPES,REWARD_TYPES,define,Catalog,Session});
});
