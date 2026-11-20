/* Phoenix Engine GLB Animation Controller (Three.js injected, no retargeter).
 * States idle/walk/run/attack/hit/death/cast. Controllers activate in PLAY.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixAnimations=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const STATES=Object.freeze(['idle','walk','run','attack','hit','death','cast']);
 const PATTERNS={
  idle:/idle|stand|rest|breath|покой|сто[ий]/i,
  walk:/walk|move|ходьб|шаг/i,
  run:/run|sprint|бег/i,
  attack:/attack|strike|melee|удар|атак/i,
  hit:/hurt|damage|react|получен|боль/i,
  death:/death|die|dead|смерт|гибел/i,
  cast:/cast|spell|magic|заклин/i
 };
 class Controller{
  constructor(model,clips,bindings={},THREERef){
   const T=THREERef||(typeof THREE!=='undefined'?THREE:null);
   if(!T||!T.AnimationMixer)throw new Error('THREE.AnimationMixer required');
   this.model=model;this.clips=clips||[];this.bindings=bindings||{};
   this.mixer=this.clips.length?new T.AnimationMixer(model):null;
   this.actions=new Map();this.state='';this.action=null;
   this.T=T;
  }
  resolve(state){
   if(!STATES.includes(state))throw new TypeError('Invalid animation '+state);
   const assigned=this.bindings[state];
   if(assigned){
    const selected=this.clips.find(x=>x.name===assigned);
    if(selected)return selected;
   }
   const pattern=PATTERNS[state];
   const automatic=this.clips.find(clip=>pattern.test(clip.name));
   // Walk/run may use a fallback locomotion clip; a missing attack must
   // never accidentally use arbitrary combat footage.
   if(automatic)return automatic;
   if(state==='run')return this.clips.find(c=>PATTERNS.walk.test(c.name))||null;
   if(state==='walk')return this.clips.find(c=>PATTERNS.run.test(c.name))||null;
   if(state==='idle')return this.clips[0]||null;
   return null;
  }
  setState(state,fade=.18){
   if(this.state===state)return false;
   const clip=this.resolve(state);
   const previous=this.action;
   this.state=state;
   if(!this.mixer||!clip){
    previous?.fadeOut?.(fade);this.action=null;return false;
   }
   let action=this.actions.get(clip.name);
   if(!action){action=this.mixer.clipAction(clip);this.actions.set(clip.name,action)}
   if(previous&&previous!==action)previous.fadeOut(fade);
   const oneShot=['attack','hit','death','cast'].includes(state);
   action.reset();
   action.enabled=true;
   action.clampWhenFinished=oneShot;
   action.setLoop(oneShot?this.T.LoopOnce:this.T.LoopRepeat,oneShot?1:Infinity);
   if(previous&&previous!==action)action.fadeIn(fade);
   action.play();
   this.action=action;return true;
  }
  update(dt){if(this.mixer&&dt>0)this.mixer.update(Math.min(dt,.15))}
  stop(){
   if(this.mixer){
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
   }
   this.actions.clear();this.action=null;this.state='';
  }
 }
 return Object.freeze({STATES,Controller});
});
