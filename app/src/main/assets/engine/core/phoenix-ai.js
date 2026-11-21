/* Phoenix Engine 0.3 — deterministic, platform-independent NPC AI.
 * Returns an intent, not a physics/scene mutation; Editor applies motion with UV44.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixAI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const BEHAVIORS=Object.freeze(['idle','patrol','chase','patrol-aggro','guard']);
 const ENGAGEMENTS=Object.freeze(['auto','passive','defensive','aggressive']);
 const Path=(typeof globalThis!=='undefined'&&globalThis.PhoenixPatrolPath)||
  (typeof require==='function'?require('./phoenix-patrol-path.js'):null);
 function number(v,min,max,name){
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)
   throw new TypeError('Invalid '+name);
  return v;
 }
 function normalize(value){
  value=value||{};
  if(typeof value!=='object'||Array.isArray(value))throw new TypeError('Invalid AI profile');
  const mode=value.mode||'idle';
  if(!BEHAVIORS.includes(mode))throw new TypeError('Invalid AI mode');
  const engagement=value.engagement??'auto';
  if(!ENGAGEMENTS.includes(engagement))throw new TypeError('Invalid AI engagement');
  const patrolRadius=number(value.patrolRadius??3,0,30,'patrolRadius');
  const aggroRadius=number(value.aggroRadius??7,0,50,'aggroRadius');
  const attackRange=number(value.attackRange??1.25,.3,8,'attackRange');
  const attackCooldown=number(value.attackCooldown??1.8,.35,30,'attackCooldown');
  const attackDuration=number(value.attackDuration??.5,.15,8,'attackDuration');
  const waypoints=Path.validatePoints(value.waypoints??[]);
  const routeMode=value.routeMode??'points';
  if(!Path.MODES.includes(routeMode))throw new TypeError('Invalid AI route mode');
  const stops=Path.normalizeStops(waypoints,value.stops??[]);
  return {mode,engagement,patrolRadius,aggroRadius,attackRange,attackCooldown,
   attackDuration,waypoints,routeMode,stops};
 }
 function finite3(p){
  return Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n));
 }
 function toward(origin,dest,speed,dt,stopAt=.15){
  const dx=dest[0]-origin[0],dz=dest[2]-origin[2];
  const dist=Math.hypot(dx,dz);
  if(dist<=stopAt||speed<=0)return {dx:0,dz:0,dist};
  const step=Math.min(speed*dt,Math.max(0,dist-stopAt));
  return {dx:dx/dist*step,dz:dz/dist*step,dist};
 }
 function initial(position){
  if(!finite3(position))throw new TypeError('Invalid NPC position');
  return {home:[...position],point:0,mode:'idle',cooldown:0,attackHold:0,provoked:0,
   stopLeft:0,stopAnimation:'idle'};
 }
 function provoke(state,seconds=12){
  const duration=number(seconds,0,120,'provoke duration');
  if(!state||!finite3(state.home))throw new TypeError('Invalid NPC state');
  return {...state,provoked:Math.max(state.provoked||0,duration)};
 }
 function tick(npc,position,player,settings,stats,dt,faction='enemy'){
  if(!finite3(position)||!finite3(player))throw new TypeError('Invalid position');
  dt=number(dt,0,.5,'dt'); const profile=normalize(settings);
  const speed=number(stats?.speed??2,0,100,'speed');
  const previous=npc&&finite3(npc.home)?npc:initial(position);
  const next={home:[...previous.home],point:previous.point|0,
   mode:previous.mode||'idle',
   cooldown:Math.max(0,(previous.cooldown||0)-dt),
   attackHold:Math.max(0,(previous.attackHold||0)-dt),
   provoked:Math.max(0,(previous.provoked||0)-dt),
   stopLeft:Math.max(0,previous.stopLeft||0),
   stopAnimation:previous.stopAnimation||'idle'};
  let mode='idle',move={dx:0,dz:0},attack=false,rotate=null,routeClip='';
  const enemy=faction==='enemy',playerDist=Math.hypot(player[0]-position[0],player[2]-position[2]);
  const engaged=enemy&&(profile.engagement==='aggressive'||
   (profile.engagement==='defensive'&&next.provoked>0)||
   (profile.engagement==='auto'&&['chase','patrol-aggro','guard'].includes(profile.mode)));
  // Nickname colors never control AI. Explicit engagement overrides legacy mode.
  if(next.attackHold>0)mode='attack';
  else if(engaged&&playerDist<=profile.aggroRadius){ 
   // Combat interrupts scripted pauses; patrol resumes when the threat leaves.
   next.stopLeft=0;
   if(playerDist<=profile.attackRange){
    mode='idle';
    rotate=Math.atan2(player[0]-position[0],player[2]-position[2]);
    if(next.cooldown<=0&&dt>0){
     mode='attack';attack=true;
     next.cooldown=profile.attackCooldown;
     next.attackHold=profile.attackDuration;
    }
   }else{
    mode='walk';
    move=toward(position,player,speed,dt,profile.attackRange*.85);
   }
  }else if(['patrol','chase','patrol-aggro'].includes(profile.mode)){
   if(profile.mode==='chase'&&Math.hypot(position[0]-next.home[0],position[2]-next.home[2])<.4)
    mode='idle';
   else if(profile.patrolRadius<.25&&!profile.waypoints.length)mode='idle';
   else {
    const r=profile.patrolRadius,h=next.home;
    const points=profile.waypoints.length?profile.waypoints:
     [[h[0]+r,h[1],h[2]],[h[0]+r,h[1],h[2]+r],
      [h[0]-r,h[1],h[2]+r],[h[0]-r,h[1],h[2]-r]];
    if(profile.mode!=='chase'&&next.stopLeft>0){
     // An explicit stop owns the current waypoint until its timer expires.
     // Do not advance to the next point while Idle / custom GLB clip plays.
     next.stopLeft=Math.max(0,next.stopLeft-dt);
     if(next.stopLeft>0){
      mode=next.stopAnimation.startsWith('clip:')?'idle':next.stopAnimation;
      if(next.stopAnimation.startsWith('clip:'))
       routeClip=next.stopAnimation.slice(5);
     }else{
      next.point=(next.point+1)%points.length;
      next.stopAnimation='idle';
     }
    }else{
     const goal=profile.mode==='chase'?h:
      points[((next.point%points.length)+points.length)%points.length];
     move=toward(position,goal,speed,dt,.25);
     if(move.dist<.28&&profile.mode!=='chase'){
      const pause=profile.stops.find(s=>s.index===next.point);
      if(pause){
       next.stopLeft=pause.seconds;
       next.stopAnimation=pause.animation;
       move={dx:0,dz:0};
       mode=pause.animation.startsWith('clip:')?'idle':pause.animation;
       if(pause.animation.startsWith('clip:'))routeClip=pause.animation.slice(5);
      }else{
       next.point=(next.point+1)%points.length;
       move=toward(position,points[next.point],speed,dt,.25);
      }
     }
     if(Math.hypot(move.dx,move.dz)>1e-6)mode='walk';
    }
   }
  }
  if(Math.hypot(move.dx,move.dz)>1e-6)
   rotate=Math.atan2(move.dx,move.dz);
  next.mode=mode;
  return {state:next,animation:mode,routeClip,move:[move.dx,0,move.dz],yaw:rotate,attack,
   engaged:engaged&&playerDist<=profile.aggroRadius};
 }
 return Object.freeze({BEHAVIORS,ENGAGEMENTS,normalize,initial,provoke,tick});
});
