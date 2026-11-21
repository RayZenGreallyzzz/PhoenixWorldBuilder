/* Phoenix Engine: validated, platform-neutral mob/NPC prefab definitions.
 * Game entities are stored separately in PhoenixCore.PhoenixWorld.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixPrefabs=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1, MAX_PREFABS=300;
 const TYPES=['mob','npc'], FACTIONS=['enemy','neutral','ally'];
 function safeText(s,max=120){
  if(typeof s!=='string'||!s.trim()||s.length>max)throw new TypeError('Invalid name');
  return s.trim();
 }
 function number(n,min,max,name){
  if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)
   throw new TypeError('Invalid '+name);
  return n;
 }
 function normalize(value){
  if(!value||typeof value!=='object'||Array.isArray(value))
   throw new TypeError('Invalid prefab');
  const type=value.type||'mob';
  if(!TYPES.includes(type))throw new TypeError('Invalid prefab type');
  const faction=value.faction||'enemy';
  if(!FACTIONS.includes(faction))throw new TypeError('Invalid faction');
  const nameColor=value.nameColor??'#ffffff';
  if(typeof nameColor!=='string'||!/^#[0-9a-fA-F]{6}$/.test(nameColor))
   throw new TypeError('Invalid nickname color');
  const assetId=value.assetId||'';
  if(typeof assetId!=='string'||assetId.length>160||
     (assetId&&!assetId.startsWith('glb:')))throw new TypeError('Invalid GLB asset ID');
  const stats=value.stats||{};
  const clips=value.animations||{};
  const animations={};
  for(const name of ['idle','walk','run','attack','hit','death','cast']){
   const clip=clips[name]||'';
   if(typeof clip!=='string'||clip.length>120)
    throw new TypeError('Invalid animation '+name);
   animations[name]=clip;
  }
  const ai=value.ai||{};
  if(typeof ai!=='object'||Array.isArray(ai))throw new TypeError('Invalid AI settings');
  const mode=ai.mode||'idle';
  if(!['idle','patrol','chase','patrol-aggro','guard'].includes(mode))
   throw new TypeError('Invalid AI mode');
  const engagement=ai.engagement??'auto';
  if(!['auto','passive','defensive','aggressive'].includes(engagement))
   throw new TypeError('Invalid AI engagement');
  const points=ai.waypoints??[];
  if(!Array.isArray(points)||points.length>32||
     points.some(p=>!Array.isArray(p)||p.length!==3||
      p.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000)))
   throw new TypeError('Invalid AI waypoints');
  const behavior={
   mode,engagement,
   patrolRadius:number(ai.patrolRadius??3,0,30,'patrolRadius'),
   aggroRadius:number(ai.aggroRadius??7,0,50,'aggroRadius'),
   attackRange:number(ai.attackRange??1.25,.3,8,'attackRange'),
   attackCooldown:number(ai.attackCooldown??1.8,.35,30,'attackCooldown'),
   attackDuration:number(ai.attackDuration??.5,.15,8,'attackDuration'),
   waypoints:points.map(p=>p.slice())
  };
  return {
   name:safeText(value.name),type,faction,nameColor,assetId,ai:behavior,
   respawn:(typeof globalThis!=='undefined'&&globalThis.PhoenixMobFeatures?
    globalThis.PhoenixMobFeatures.respawn(value.respawn):
    require('./phoenix-mob-features.js').respawn(value.respawn)),
   attackEffect:typeof value.attackEffect==='string'&&
    ['none','impact','ring','spark','magic','heal'].includes(value.attackEffect)?
    value.attackEffect:'impact',
   stats:{
    hp:number(stats.hp??100,1,1000000,'hp'),
    level:number(stats.level??1,1,1000,'level'),
    defense:number(stats.defense??0,0,1000000,'defense'),
    damage:number(stats.damage??10,0,1000000,'damage'),
    speed:number(stats.speed??2,0,100,'speed')
   },
   animations
  };
 }
 function copy(data){return JSON.parse(JSON.stringify(data));}
 class PhoenixPrefabCatalog{
  constructor(){this._nextId=0;this._items=new Map();}
  create(data){
   if(this._items.size>=MAX_PREFABS)throw new Error('Prefab limit reached');
   const id='prefab-'+(++this._nextId);
   this._items.set(id,{id,...normalize(data)});
   return id;
  }
  update(id,data){
   if(!this._items.has(id))throw new Error('Unknown prefab '+id);
   this._items.set(id,{id,...normalize(data)});
  }
  get(id){return this._items.has(id)?copy(this._items.get(id)):null;}
  list(){return [...this._items.values()].map(copy);}
  remove(id){return this._items.delete(id);}
  serialize(){return {version:VERSION,nextId:this._nextId,prefabs:this.list()};}
  load(doc){
   if(!doc||doc.version!==VERSION||!Number.isSafeInteger(doc.nextId)||
      doc.nextId<0||!Array.isArray(doc.prefabs)||doc.prefabs.length>MAX_PREFABS)
    throw new TypeError('Invalid prefab catalog');
   const items=new Map();
   for(const item of doc.prefabs){
    if(!item||typeof item.id!=='string'||!/^prefab-[1-9][0-9]*$/.test(item.id)||
       Number(item.id.slice(7))>doc.nextId||items.has(item.id))
     throw new TypeError('Invalid or duplicate prefab ID');
    items.set(item.id,{id:item.id,...normalize(item)});
   }
   this._items=items;this._nextId=doc.nextId;
  }
 }
 return Object.freeze({VERSION,MAX_PREFABS,normalize,PhoenixPrefabCatalog});
});
