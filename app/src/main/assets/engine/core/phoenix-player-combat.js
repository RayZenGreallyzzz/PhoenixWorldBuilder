/* Phoenix Engine — no-code player combat profile (melee / ranged).
 * Platform-neutral settings; gameplay HP, ammo and cooldowns stay PLAY-only.
 * Legacy saved projects without this component retain the original melee hero.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixPlayerCombat=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PRESETS=Object.freeze({
  melee:Object.freeze({mode:'melee',hp:100,damage:25,range:2.7,cooldown:.65,
   magazineSize:12,reserveCapacity:48,reloadDuration:1.4}),
  ranged:Object.freeze({mode:'ranged',hp:100,damage:20,range:32,cooldown:.22,
   magazineSize:12,reserveCapacity:48,reloadDuration:1.4})
 });
 function number(value,min,max,name){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)
   throw new TypeError('Invalid player '+name);
  return value;
 }
 function normalize(raw){
  raw=raw??{};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
   throw new TypeError('Invalid player combat profile');
  const mode=raw.mode??'melee';
  if(!Object.prototype.hasOwnProperty.call(PRESETS,mode))
   throw new TypeError('Invalid player combat mode');
  const base=PRESETS[mode];
  const integer=(key,lo,hi)=> {
   const n=number(raw[key]??base[key],lo,hi,key);
   if(!Number.isInteger(n))throw new TypeError('Invalid player '+key);
   return n;
  };
  return {mode,hp:integer('hp',1,1000000),
   damage:number(raw.damage??base.damage,0,1000000,'damage'),
   range:number(raw.range??base.range,.3,100,'range'),
   cooldown:number(raw.cooldown??base.cooldown,.06,10,'cooldown'),
   magazineSize:integer('magazineSize',1,200),
   reserveCapacity:integer('reserveCapacity',0,2000),
   reloadDuration:number(raw.reloadDuration??base.reloadDuration,.1,20,'reloadDuration')};
 }
 function preset(mode){
  if(!Object.prototype.hasOwnProperty.call(PRESETS,mode))
   throw new TypeError('Invalid player combat mode');
  return {...PRESETS[mode]};
 }
 return Object.freeze({PRESETS,normalize,preset});
});
