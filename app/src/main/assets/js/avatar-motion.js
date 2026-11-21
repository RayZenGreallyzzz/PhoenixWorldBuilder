/* Phoenix Builder/Engine — resilient mobile avatar locomotion.
 * The joystick state can stay WALK while Three.js AnimationAction has stopped
 * (LoopOnce after combat), or has faded to weight 0 after fast state changes.
 * Re-enable the loop without asking the user to release the joystick.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixAvatarMotion=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const WALK=/walk|move|run|ход|бег/i;
 const IDLE=/idle|stand|rest|breath|покой/i;
 function choose(clips,moving){
  if(!Array.isArray(clips)||!clips.length)return null;
  // Prefer a proper looping locomotion clip. Never use a one-shot Attack
  // as a locomotion fallback when an Idle/Walk alternative exists.
  return (moving?clips.find(c=>WALK.test(c.name)):
   clips.find(c=>IDLE.test(c.name)))||
   (moving?clips.find(c=>IDLE.test(c.name)):
    clips.find(c=>WALK.test(c.name)))||
   clips.find(c=>!/(attack|hit|death|die|cast)/i.test(c.name))||
   clips[0];
 }
 function reconcile(clips,actions,currentState,moving,T,fade=.18){
  const state=moving?'walk':'idle';
  const clip=choose(clips,moving);
  const action=clip&&actions?.[clip.name];
  if(!action||!T)return {state:currentState,updated:false,recovered:false};
  const running=!!action.isRunning?.();
  const weight=action.getEffectiveWeight?.()??1;
  const lost=!running||action.enabled===false||action.paused===true||
   !Number.isFinite(weight)||weight<=.0001;
  const nonLoop=action.loop!==T.LoopRepeat||action.clampWhenFinished===true;
  const changed=state!==currentState;
  if(!lost&&!nonLoop&&!changed)
   return {state,updated:false,recovered:false,clip:clip.name};
  let hasOther=false;
  if(changed){
   for(const [name,other] of Object.entries(actions)){
    if(name!==clip.name&&other?.isRunning?.()){
     other.fadeOut(Math.max(0,fade));hasOther=true;
    }
   }
  }
  // Cancel any fade-out inherited from an earlier Idle<->Walk transition,
  // even if the action isRunning() but contributes zero to the pose.
  action.stopFading?.();
  if(lost)action.reset();
  action.enabled=true;action.paused=false;
  action.setLoop(T.LoopRepeat,Infinity);
  action.clampWhenFinished=false;
  action.setEffectiveWeight?.(1);
  if(changed&&hasOther&&fade>0)
   action.fadeIn(fade);
  action.play();
  return {state,updated:true,recovered:!changed&&lost,clip:clip.name};
 }
 return Object.freeze({choose,reconcile});
});
