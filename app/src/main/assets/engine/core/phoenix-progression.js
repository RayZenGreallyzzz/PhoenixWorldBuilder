/* Phoenix Engine RPG/MMO balance laboratory v1.
 * Deterministic and platform-neutral. Archetypes are starting templates only:
 * any fantasy, cyberpunk or shooter skills/GLBs may be freely combined.
 * Old projects with no progression profile keep their original fixed stats.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixProgression=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1,MAX_LEVEL=150;
 const STATS=Object.freeze({
  hp:{min:1,max:1000000},mp:{min:0,max:1000000},
  damage:{min:0,max:1000000},magicPower:{min:0,max:1000000},
  defense:{min:0,max:1000000},magicDefense:{min:0,max:1000000},
  speed:{min:0,max:100},attackSpeed:{min:.1,max:10},
  critChance:{min:0,max:.95},critMultiplier:{min:1,max:5},
  accuracy:{min:0,max:100},dodge:{min:0,max:95},
  armorPen:{min:0,max:1000000},magicPen:{min:0,max:1000000}
 });
 const KEYS=Object.freeze(Object.keys(STATS));
 const BASE=Object.freeze({hp:100,mp:50,damage:20,magicPower:0,
  defense:10,magicDefense:10,speed:3,attackSpeed:1,
  critChance:.05,critMultiplier:1.5,accuracy:95,dodge:5,
  armorPen:0,magicPen:0});
 const ZERO=Object.freeze(Object.fromEntries(KEYS.map(k=>[k,0])));
 const GROWTH=Object.freeze({hp:10,mp:4,damage:2.5,magicPower:0,
  defense:1,magicDefense:1,speed:.005,attackSpeed:.002,
  critChance:.0005,critMultiplier:0,accuracy:.01,dodge:.02,
  armorPen:.05,magicPen:0});
 const TAGS=Object.freeze(['fantasy','cyberpunk','shooter','mmorpg','hybrid']);
 const ARCHETYPES=Object.freeze({
  warrior:{title:'⚔ Воин',base:{hp:150,mp:35,damage:26,defense:18,speed:2.8},
   growth:{hp:18,mp:3,damage:3,defense:2.2}},
  archer:{title:'🏹 Лучник',base:{hp:105,mp:60,damage:25,defense:8,
   speed:3.5,attackSpeed:1.2,critChance:.10},
   growth:{hp:10,damage:3.1,critChance:.001}},
  assassin:{title:'🗡 Ассасин',base:{hp:90,mp:80,damage:29,defense:6,
   speed:4.2,attackSpeed:1.5,critChance:.18,critMultiplier:1.8,dodge:12},
   growth:{hp:8,damage:3.3,critChance:.0015,attackSpeed:.005}},
  mage:{title:'🔮 Маг',base:{hp:80,mp:190,damage:8,magicPower:35,
   defense:5,magicDefense:18},
   growth:{hp:8,mp:19,damage:.7,magicPower:5.5,magicDefense:1.9}},
  gunslinger:{title:'🔫 Стрелок',base:{hp:110,mp:40,damage:24,
   defense:11,attackSpeed:1.8,accuracy:98},
   growth:{hp:11,damage:3.4,armorPen:.6,attackSpeed:.005}},
  hybrid:{title:'⚡ Гибрид',base:{hp:120,mp:110,damage:19,magicPower:18,
   defense:12,magicDefense:12},
   growth:{hp:12,mp:10,damage:2.5,magicPower:2.7,
    defense:1.2,magicDefense:1.2}}
 });
 const finite=(v,min,max,key)=>{
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)
   throw new TypeError('Invalid progression '+key);
  return v;
 };
 const clone=v=>JSON.parse(JSON.stringify(v));
 function preset(archetype='warrior'){
  if(!Object.prototype.hasOwnProperty.call(ARCHETYPES,archetype))
   throw new TypeError('Invalid progression archetype');
  const p=ARCHETYPES[archetype];
  return {version:VERSION,archetype,tags:archetype==='gunslinger'?
   ['shooter']:['fantasy'],maxLevel:MAX_LEVEL,level:1,xpMultiplier:1,
   base:{...BASE,...p.base},growth:{...GROWTH,...p.growth},
   quadratic:{...ZERO}};
 }
 function normalize(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
   throw new TypeError('Invalid progression profile');
  const archetype=raw.archetype??'warrior';
  if(!Object.prototype.hasOwnProperty.call(ARCHETYPES,archetype))
   throw new TypeError('Invalid progression archetype');
  const def=preset(archetype);
  const level=finite(raw.level??1,1,MAX_LEVEL,'level');
  const maxLevel=finite(raw.maxLevel??MAX_LEVEL,1,MAX_LEVEL,'maxLevel');
  if(!Number.isInteger(level)||!Number.isInteger(maxLevel)||level>maxLevel)
   throw new TypeError('Invalid progression level');
  if(raw.version!==undefined&&raw.version!==VERSION)
   throw new TypeError('Invalid progression version');
  const tags=raw.tags??def.tags;
  if(!Array.isArray(tags)||tags.length>TAGS.length||
     tags.some(v=>!TAGS.includes(v))||new Set(tags).size!==tags.length)
   throw new TypeError('Invalid progression genre tags');
  const xpMultiplier=finite(raw.xpMultiplier??1,.1,100,'xpMultiplier');
  function fields(name,defaults,limit){
   const value=raw[name]??{};
   if(!value||typeof value!=='object'||Array.isArray(value))
    throw new TypeError('Invalid progression '+name);
   const result={};
   for(const key of KEYS){
    const bound=STATS[key];
    const low=name==='base'?bound.min:0;
    const high=name==='base'?bound.max:limit;
    result[key]=finite(value[key]??defaults[key],low,high,name+'.'+key);
   }
   return result;
  }
  return {version:VERSION,archetype,tags:tags.slice(),level,maxLevel,
   xpMultiplier,base:fields('base',def.base,10000),
   growth:fields('growth',def.growth,10000),
   quadratic:fields('quadratic',def.quadratic,100)};
 }
 function atLevel(input,level){
  const p=normalize(input);
  finite(level,1,p.maxLevel,'requestedLevel');
  if(!Number.isInteger(level))throw new TypeError('Invalid progression requestedLevel');
  const n=level-1,out={level};
  for(const key of KEYS){
   const s=STATS[key];
   const value=p.base[key]+p.growth[key]*n+p.quadratic[key]*n*n;
   out[key]=Math.round(Math.max(s.min,Math.min(s.max,value))*10000)/10000;
  }
  return out;
 }
 function xpToNext(input,level){
  const p=normalize(input);
  finite(level,1,p.maxLevel,'xp level');
  if(!Number.isInteger(level))throw new TypeError('Invalid progression xp level');
  return level===p.maxLevel?0:
   Math.round(100*Math.pow(level,1.55)*p.xpMultiplier);
 }
 function damage(attacker,defender,{type='physical',skillMultiplier=1,
  flatPower=0,critical=false,expected=true}={}){
  if(!['physical','magical','true'].includes(type))
   throw new TypeError('Invalid progression damage type');
  finite(skillMultiplier,0,1000,'skillMultiplier');
  finite(flatPower,0,1000000,'flatPower');
  const a=attacker,d=defender;
  if(!a||!d||typeof a!=='object'||typeof d!=='object')
   throw new TypeError('Invalid progression combatants');
  for(const [who,obj] of [['attacker',a],['defender',d]])
   for(const key of KEYS)finite(obj[key],STATS[key].min,STATS[key].max,who+'.'+key);
  const attack=type==='magical'?a.magicPower:a.damage;
  const armor=type==='magical'?d.magicDefense:d.defense;
  const pen=type==='magical'?a.magicPen:a.armorPen;
  const mitigation=type==='true'?1:100/(100+Math.max(0,armor-pen));
  const normal=Math.max(0,Math.round((attack*skillMultiplier+flatPower)*mitigation));
  const crit=Math.round(normal*a.critMultiplier);
  // Testable probability model; no hidden RNG in preview or balance.
  const hitChance=Math.max(.05,Math.min(1,(a.accuracy-d.dodge)/100));
  const mean=normal*(1-a.critChance)+crit*a.critChance;
  const one=critical?crit:normal;
  return {normal,critical:crit,mitigation:Math.round(mitigation*10000)/10000,
   hitChance:Math.round(hitChance*10000)/10000,
   expected:Math.round(hitChance*mean*100)/100,
   damage:one,dps:Math.round(hitChance*mean*a.attackSpeed*100)/100,
   type,skillMultiplier,flatPower};
 }
 function compare(input,levels=[1,25,50,100,150]){
  const p=normalize(input),ordered=[...new Set(levels.map(l=>Math.min(l,p.maxLevel)))];
  return ordered.map(level=>({...atLevel(p,level),xpToNext:xpToNext(p,level)}));
 }
 return Object.freeze({VERSION,MAX_LEVEL,KEYS,STATS,TAGS,ARCHETYPES,
  preset,normalize,atLevel,xpToNext,damage,compare,clone});
});
