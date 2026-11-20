/* Phoenix Engine 1.0: deterministic magazine, reload and ADS state.
 * No Three.js, DOM, renderer or project persistence.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixWeapon=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function bounded(n,min,max,name){
  if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)
   throw new TypeError('Invalid '+name);
  return n;
 }
 class Session{
  constructor(config={}){
   this.magazineSize=bounded(config.magazineSize??12,1,200,'magazineSize');
   this.reserveCapacity=bounded(config.reserveCapacity??48,0,2000,'reserveCapacity');
   this.damage=bounded(config.damage??20,0,1000000,'damage');
   this.range=bounded(config.range??32,1,200,'range');
   this.fireInterval=bounded(config.fireInterval??.22,.06,10,'fireInterval');
   this.reloadDuration=bounded(config.reloadDuration??1.4,.1,20,'reloadDuration');
   this.reset();
  }
  reset(){
   this.ammo=this.magazineSize;this.reserve=this.reserveCapacity;
   this.nextShot=0;this.reloadEnd=0;this.aiming=false;
  }
  status(now=0){
   this.tick(now);
   return {ammo:this.ammo,reserve:this.reserve,magazineSize:this.magazineSize,
    reloading:this.reloadEnd>0,remaining:this.reloadEnd?Math.max(0,this.reloadEnd-now):0,
    aiming:this.aiming,damage:this.damage,range:this.range};
  }
  tick(now){
   bounded(now,0,Number.MAX_SAFE_INTEGER,'time');
   if(this.reloadEnd&&now>=this.reloadEnd){
    const needed=this.magazineSize-this.ammo;
    const amount=Math.min(needed,this.reserve);
    this.ammo+=amount;this.reserve-=amount;this.reloadEnd=0;
   }
  }
  reload(now){
   this.tick(now);
   if(this.reloadEnd)return {ok:false,reason:'reloading'};
   if(this.ammo>=this.magazineSize)return {ok:false,reason:'full'};
   if(this.reserve<=0)return {ok:false,reason:'no-ammo'};
   this.reloadEnd=now+this.reloadDuration;
   return {ok:true,finishAt:this.reloadEnd};
  }
  fire(now){
   this.tick(now);
   if(this.reloadEnd)return {ok:false,reason:'reloading'};
   if(now<this.nextShot)return {ok:false,reason:'cooldown',remaining:this.nextShot-now};
   if(this.ammo<=0)return {ok:false,reason:'empty'};
   this.ammo--;this.nextShot=now+this.fireInterval;
   return {ok:true,damage:this.damage,range:this.range,ammo:this.ammo};
  }
  setAim(value){this.aiming=!!value;return this.aiming;}
 }
 return Object.freeze({Session});
});
