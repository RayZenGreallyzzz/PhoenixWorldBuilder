/* Phoenix Engine 1.1: per-character skills with bounded PNG/WebP icons + MP runtime.
 * No dynamic code execution, Three.js, UI or timers. Snapshots survive JSON export.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixSkills=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1;
 const SLOTS=Object.freeze(['slot3','slot4','slot5','slot6','slot7','ultimate']);
 const CHARACTER=/^(?:player|prefab-[1-9][0-9]*)$/;
 function number(n,low,high,name){
  if(typeof n!=='number'||!Number.isFinite(n)||n<low||n>high)
   throw new TypeError('Invalid '+name);
  return n;
 }
 function text(v,max,name){
  if(typeof v!=='string'||!v.trim()||[...v].length>max)
   throw new TypeError('Invalid '+name);
  return v.trim();
 }
 function skill(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
   throw new TypeError('Invalid skill');
  const name=text(raw.name,80,'skill name');
  const description=typeof raw.description==='string'?
   raw.description.trim():'';
  if([...description].length>400)throw new TypeError('Invalid description');
  const icon=text(raw.icon||'✨',8,'icon');
  const imageHelper=(typeof globalThis!=='undefined'&&globalThis.PhoenixSkillImages)||
   (typeof require==='function'?require('./phoenix-skill-images.js'):null);
  if(!imageHelper)throw new Error('Phoenix Skill Images module required');
  const iconImage=imageHelper.validate(raw.iconImage);
  const type=raw.type||'damage';
  if(!['damage','heal'].includes(type))throw new TypeError('Invalid effect type');
  const maxLevel=number(raw.maxLevel??5,1,20,'maxLevel');
  const level=number(raw.level??1,1,maxLevel,'skill level');
  if(!Number.isInteger(maxLevel)||!Number.isInteger(level))
   throw new TypeError('Skill levels must be integers');
  const animation=raw.animation||'cast';
  if(typeof animation!=='string'||[...animation].length>80)
   throw new TypeError('Invalid animation');
  return {name,description,icon,iconImage,type,level,maxLevel,
   basePower:number(raw.basePower??30,0,1000000,'basePower'),
   growth:number(raw.growth??10,0,1000000,'growth'),
   manaCost:number(raw.manaCost??15,0,10000,'manaCost'),
   cooldown:number(raw.cooldown??5,.1,120,'cooldown'),
   range:number(raw.range??8,.5,60,'range'),animation};
 }
 function power(def){const valid=skill(def);return valid.basePower+(valid.level-1)*valid.growth;}
 function json(v){return JSON.parse(JSON.stringify(v));}
 function totalImageSize(entries){
  let total=0;
  for(const row of entries.values())
   for(const ability of Object.values(row))total+=(ability.iconImage||'').length;
  return total;
 }
 class Catalog{
  constructor(){this._entries=new Map();}
  get(character,slot){
   const raw=this._entries.get(character)?.[slot];
   return raw?json(raw):null;
  }
  entries(character){return json(this._entries.get(character)||{});}
  set(character,slot,definition){
   if(!CHARACTER.test(character)||!SLOTS.includes(slot))
    throw new TypeError('Invalid character or skill slot');
   const validated=skill(definition);
   const row={...(this._entries.get(character)||{}),[slot]:validated};
   const next=new Map(this._entries);next.set(character,row);
   if(totalImageSize(next)>4000000)throw new RangeError('Too many embedded skill images');
   this._entries=next;return validated;
  }
  remove(character,slot){
   const row=this._entries.get(character);if(!row||!SLOTS.includes(slot))return false;
   delete row[slot];if(!Object.keys(row).length)this._entries.delete(character);
   return true;
  }
  removeCharacter(character){this._entries.delete(character);}
  characters(){return [...this._entries.keys()];}
  serialize(){return {version:VERSION,characters:[...this._entries].map(([id,slots])=>({id,slots:json(slots)}))};}
  load(raw){
   if(!raw||raw.version!==VERSION||!Array.isArray(raw.characters)||
      raw.characters.length>301)throw new TypeError('Invalid skills snapshot');
   const next=new Map();
   for(const entry of raw.characters){
    if(!entry||typeof entry.id!=='string'||!CHARACTER.test(entry.id)||
       next.has(entry.id)||!entry.slots||typeof entry.slots!=='object'||
       Array.isArray(entry.slots))throw new TypeError('Invalid character skill entry');
    const row={};
    for(const slot of Object.keys(entry.slots)){
     if(!SLOTS.includes(slot))throw new TypeError('Invalid skill slot');
     row[slot]=skill(entry.slots[slot]);
    }
    next.set(entry.id,row);
   }
   if(totalImageSize(next)>4000000)throw new RangeError('Too many embedded skill images');
   this._entries=next;
  }
 }
 class Runtime{
  constructor(catalog,character='player',maxMp=100){
   if(!(catalog instanceof Catalog)||!CHARACTER.test(character))
    throw new TypeError('Invalid skills runtime');
   this.skills=catalog.entries(character);
   this.maxMp=number(maxMp,1,1000000,'max MP');
   this.mp=this.maxMp;this.ready=new Map();
  }
  status(now=0){
   number(now,0,Number.MAX_SAFE_INTEGER,'time');
   return {mp:this.mp,maxMp:this.maxMp,
    cooldowns:Object.fromEntries([...this.ready].map(([id,end])=>[id,Math.max(0,end-now)]))};
  }
  cast(slot,now,canApply=()=>true){
   number(now,0,Number.MAX_SAFE_INTEGER,'time');
   if(!SLOTS.includes(slot))return {ok:false,reason:'unknown-slot'};
   const def=this.skills[slot];if(!def)return {ok:false,reason:'unassigned'};
   if(this.ready.get(slot)>now)return {ok:false,reason:'cooldown',
    remaining:this.ready.get(slot)-now};
   if(this.mp<def.manaCost)return {ok:false,reason:'mana'};
   if(!canApply(def))return {ok:false,reason:'no-target'};
   this.mp-=def.manaCost;this.ready.set(slot,now+def.cooldown);
   return {ok:true,slot,skill:json(def),power:power(def),
    mp:this.mp,maxMp:this.maxMp,readyAt:now+def.cooldown};
  }
 }
 return Object.freeze({VERSION,SLOTS,skill,power,Catalog,Runtime});
});
