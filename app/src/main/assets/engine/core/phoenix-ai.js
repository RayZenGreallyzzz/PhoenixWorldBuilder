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
  const patrolRadius=number(value.patrolRadius??3,0,30,'patrolRadius');
  const aggroRadius=number(value.aggroRadius??7,0,50,'aggroRadius');
  const attackRange=number(value.attackRange??1.25,.3,8,'attackRange');
  const attackCooldown=number(value.attackCooldown??1.8,.35,30,'attackCooldown');
  const attackDuration=number(value.attackDuration??.5,.15,8,'attackDuration');
  const points=value.waypoints??[];
  if(!Array.isArray(points)||points.length>32)throw new TypeError('Invalid AI waypoints');
  const waypoints=points.map((point,i)=>{
   if(!finite3(point)||point.some(n=>Math.abs(n)>100000))
    throw new TypeError('Invalid AI waypoint '+i);
   return point.slice();
  });
  return {mode,patrolRadius,aggroRadius,attackRange,attackCooldown,
   attackDuration,waypoints};
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
  return {home:[...position],point:0,mode:'idle',cooldown:0,attackHold:0};
 }
 function tick(npc,position,player,settings,stats,dt,faction='enemy'){
  if(!finite3(position)||!finite3(player))throw new TypeError('Invalid position');
  dt=number(dt,0,.5,'dt'); const profile=normalize(settings);
  const speed=number(stats?.speed??2,0,100,'speed');
  const previous=npc&&finite3(npc.home)?npc:initial(position);
  const next={home:[...previous.home],point:previous.point|0,
   mode:previous.mode||'idle',
   cooldown:Math.max(0,(previous.cooldown||0)-dt),
   attackHold:Math.max(0,(previous.attackHold||0)-dt)};
  let mode='idle',move={dx:0,dz:0},attack=false,rotate=null;
  const enemy=faction==='enemy',playerDist=Math.hypot(player[0]-position[0],player[2]-position[2]);
  if(next.attackHold>0)mode='attack';
  else if(['chase','patrol-aggro','guard'].includes(profile.mode)&&
   enemy&&playerDist<=profile.aggroRadius){
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
    const goal=profile.mode==='chase'?h:points[((next.point%points.length)+points.length)%points.length];
    move=toward(position,goal,speed,dt,.25);
    if(move.dist<.28&&profile.mode!=='chase'){
     next.point=(next.point+1)%points.length;
     move=toward(position,points[next.point],speed,dt,.25);
    }
    if(Math.hypot(move.dx,move.dz)>1e-6)mode='walk';
   }
  }
  if(Math.hypot(move.dx,move.dz)>1e-6)
   rotate=Math.atan2(move.dx,move.dz);
  next.mode=mode;
  return {state:next,animation:mode,move:[move.dx,0,move.dz],yaw:rotate,attack};
 }
 return Object.freeze({BEHAVIORS,normalize,initial,tick});
});
