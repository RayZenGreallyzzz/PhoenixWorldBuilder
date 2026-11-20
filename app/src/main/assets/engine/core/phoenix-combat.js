/* Phoenix Engine Combat 0.4 — platform-neutral, PLAY-only HP and attacks.
 * No renderer, DOM, Three.js or persistence writes.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixCombat=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const validPoint=p=>Array.isArray(p)&&p.length===3&&
  p.every(n=>typeof n==='number'&&Number.isFinite(n));
 const bounded=(n,low,high,label)=>{
  if(typeof n!=='number'||!Number.isFinite(n)||n<low||n>high)
   throw new TypeError('Invalid '+label);
  return n;
 };
 class Session{
  constructor({damage=25,range=2.7,cooldown=.65}={}){
   this.damage=bounded(damage,0,1000000,'damage');
   this.range=bounded(range,.1,100,'range');
   this.cooldown=bounded(cooldown,.05,30,'cooldown');
   this.mobs=new Map();
   this.readyAt=0;
  }
  reset(entities=[]){
   if(!Array.isArray(entities)||entities.length>300)
    throw new TypeError('Invalid combat entities');
   const next=new Map();
   for(const entry of entities){
    if(!entry||typeof entry.id!=='string'||!entry.id||next.has(entry.id))
     throw new TypeError('Invalid combat entity ID');
    const maxHp=bounded(entry.maxHp,1,1000000,'HP');
    next.set(entry.id,{id:entry.id,hp:maxHp,maxHp,
     faction:entry.faction||'enemy',name:String(entry.name||entry.id).slice(0,120)});
   }
   this.mobs=next;this.readyAt=0;
  }
  get(id){
   const hp=this.mobs.get(id);
   return hp?{...hp,dead:hp.hp<=0}:null;
  }
  isDead(id){const v=this.mobs.get(id);return !!v&&v.hp<=0;}
  attack(origin,targets,time,canHit=()=>true){
   if(!validPoint(origin)||!Array.isArray(targets)||
      typeof canHit!=='function')throw new TypeError('Invalid combat target list');
   bounded(time,0,Number.MAX_SAFE_INTEGER,'time');
   if(time<this.readyAt)return {ok:false,reason:'cooldown',
    remaining:Math.max(0,this.readyAt-time)};
   // Consuming the attack even on a miss prevents repeat-tap scan spam.
   this.readyAt=time+this.cooldown;
   let target=null,nearest=Infinity,blocked=false;
   for(const entry of targets){
    const mob=this.mobs.get(entry?.id);
    if(!mob||mob.hp<=0||mob.faction!=='enemy'||!validPoint(entry.position))
     continue;
    if(Math.abs(origin[1]-entry.position[1])>1.8)continue;
    const distance=Math.hypot(origin[0]-entry.position[0],
     origin[2]-entry.position[2]);
    if(distance>this.range||distance>=nearest)continue;
    if(!canHit(entry,distance)){blocked=true;continue;}
    nearest=distance;target=mob;
   }
   if(!target)return {ok:false,reason:blocked?'blocked':'miss',remaining:this.cooldown};
   target.hp=Math.max(0,target.hp-this.damage);
   return {ok:true,id:target.id,name:target.name,damage:this.damage,
    hp:target.hp,maxHp:target.maxHp,killed:target.hp<=0,
    distance:nearest,remaining:this.cooldown};
  }
 }
 return Object.freeze({Session});
});
