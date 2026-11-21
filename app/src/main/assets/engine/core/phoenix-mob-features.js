/* Phoenix Engine 2.0 — reusable settings/targeting/respawn helpers.
 * Pure JavaScript, Android/WebView compatible. Never executes user scripts.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixMobFeatures=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
 function number(value,low,high,name){
  if(typeof value!=='number'||!Number.isFinite(value)||value<low||value>high)
   throw new TypeError('Invalid '+name);
  return value;
 }
 function respawn(raw){
  const source=raw||{};
  if(typeof source!=='object'||Array.isArray(source))throw new TypeError('Invalid mob respawn');
  const enabled=source.enabled===true;
  const delay=number(source.delay??30,2,3600,'mob respawn delay');
  return {enabled,delay};
 }
 function profile(prefab,combat,skills={},nickname=''){
  const stats=prefab?.stats||{};
  const name=typeof nickname==='string'&&nickname.trim()?nickname.trim():prefab?.name||combat?.name||'Моб';
  const hp=combat?.hp??stats.hp??100,maxHp=combat?.maxHp??stats.hp??100;
  return {name:String(name).slice(0,120),
   type:prefab?.type||'mob',faction:prefab?.faction||'enemy',
   level:number(stats.level??1,1,1000,'mob level'),
   hp,maxHp,
   damage:number(stats.damage??10,0,1000000,'mob damage'),
   defense:number(stats.defense??0,0,1000000,'mob defense'),
   speed:number(stats.speed??2,0,100,'mob speed'),
   skills:Object.entries(skills||{}).map(([slot,skill])=>({
    slot,name:skill.name,level:skill.level,type:skill.type,
    cooldown:skill.cooldown,range:skill.range
   })),
   dead:!!combat?.dead};
 }
 function angularDelta(from,to){
  return Math.atan2(Math.sin(to-from),Math.cos(to-from));
 }
 function turn(from,to,dt,speed=7){
  if(!Number.isFinite(to)||!Number.isFinite(from))return from;
  const max=Math.max(0,Math.min(.1,dt))*speed;
  const delta=angularDelta(from,to);
  return from+clamp(delta,-max,max);
 }
 function face(origin,target){
  const dx=target.x-origin.x,dz=target.z-origin.z;
  if(!Number.isFinite(dx)||!Number.isFinite(dz)||Math.hypot(dx,dz)<.001)return null;
  return Math.atan2(dx,dz);
 }
 class Respawner{
  constructor(){this.dead=new Map();}
  mark(id,config){
   const setting=respawn(config);
   if(setting.enabled)this.dead.set(id,setting.delay);
   else this.dead.delete(id);
   return setting.enabled;
  }
  tick(dt){
   number(dt,0,.5,'respawn dt');
   const spawned=[];
   for(const [id,remaining] of this.dead){
    const next=remaining-dt;
    if(next<=0){this.dead.delete(id);spawned.push(id)}
    else this.dead.set(id,next);
   }
   return spawned;
  }
  remaining(id){return this.dead.get(id)??null;}
  clear(){this.dead.clear()}
 }
 return Object.freeze({respawn,profile,angularDelta,turn,face,Respawner});
});
