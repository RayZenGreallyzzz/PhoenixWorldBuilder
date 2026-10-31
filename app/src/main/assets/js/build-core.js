/* Phoenix Build Core
 * Pure construction math/state rules. No renderer, DOM, WebGL or Three.js.
 * Renderer adapters provide measurements; this module decides placement data.
 */
const BuildCore=(()=>{
 'use strict';
 const DEFAULT_STOREY=2.6;
 const finite=n=>Number.isFinite(Number(n));
 const num=(n,fallback=0)=>finite(n)?Number(n):fallback;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const round=(v,p=1e6)=>Math.round(v*p)/p;
 const safeStoreyHeight=value=>clamp(num(value,DEFAULT_STOREY),1.8,6);
 const safeFloorLevel=value=>{
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=0?n:0;
 };
 function nominalFloorY(terrainY,floorLevel,storeyHeight=DEFAULT_STOREY){
  return num(terrainY,0)+safeFloorLevel(floorLevel)*safeStoreyHeight(storeyHeight);
 }
 function supportPriority(type,story,level,isSlab=false){
  if(!Number.isInteger(story))return null;
  if(!isSlab&&story===level&&type==='foundation')return 0;
  if(level>0&&story===level-1&&type==='ceiling')return 1;
  if(level>0&&story===level-1&&['wall','corner','door','railing'].includes(type))return 2;
  return null;
 }
 function chooseFloorDatum({terrainY=0,floorLevel=0,storeyHeight=DEFAULT_STOREY,
  category='prop',smartSnap=true,candidates=[]}={}){
  const level=safeFloorLevel(floorLevel),height=safeStoreyHeight(storeyHeight);
  const nominal=nominalFloorY(terrainY,level,height);
  const fallback={height:nominal,source:'configured',nominal};
  if(!smartSnap||!Array.isArray(candidates)||!candidates.length)return fallback;
  const isSlab=category==='foundation';
  let best=null;
  for(const item of candidates){
   if(!item)continue;
   const priority=supportPriority(item.type,item.story,level,isSlab);
   if(priority===null)continue;
   const distance=num(item.distance,Infinity),top=Number(item.top);
   if(!Number.isFinite(distance)||distance>1.35||!Number.isFinite(top))continue;
   if(Math.abs(top-nominal)>Math.max(2.5,height*.8))continue;
   const score=priority*10+distance;
   if(!best||score<best.score){
    best={height:top,source:priority===0?'floor':priority===1?'ceiling':'wall',score,nominal};
   }
  }
  return best||fallback;
 }
 const vec3=(value,fallback=[0,0,0])=>{
  const a=Array.isArray(value)?value:fallback;
  return [num(a[0],fallback[0]),num(a[1],fallback[1]),num(a[2],fallback[2])];
 };
 const lengthXZ=v=>Math.hypot(v[0],v[2]);
 const normalizeXZ=value=>{
  const v=vec3(value),len=lengthXZ(v);
  return len>1e-9?[v[0]/len,0,v[2]/len]:[0,0,0];
 };
 function rotateXZ(value,yawRad){
  const v=vec3(value),c=Math.cos(yawRad),s=Math.sin(yawRad);
  return [v[0]*c+v[2]*s,v[1],-v[0]*s+v[2]*c];
 }
 function angleXZ(value){
  const v=normalizeXZ(value);
  return Math.atan2(-v[2],v[0]);
 }
 function normalizeSocket(socket,index=0){
  if(!socket)return null;
  const point=vec3(socket.point),out=normalizeXZ(socket.out||socket.outward);
  if(lengthXZ(out)<.5)return null;
  return {id:String(socket.id??socket.name??index),point,out,
   role:String(socket.role||'wall-end'),thickness:finite(socket.thickness)?Number(socket.thickness):null};
 }
 function transformSocket(socket,{position=[0,0,0],yawDeg=0,scale=[1,1,1]}={}){
  const s=normalizeSocket(socket);if(!s)return null;
  const pos=vec3(position),sc=Array.isArray(scale)?vec3(scale,[1,1,1]):[num(scale,1),num(scale,1),num(scale,1)];
  const local=[s.point[0]*sc[0],s.point[1]*sc[1],s.point[2]*sc[2]];
  const p=rotateXZ(local,num(yawDeg,0)*Math.PI/180);
  const out=normalizeXZ(rotateXZ(s.out,num(yawDeg,0)*Math.PI/180));
  return {...s,point:[p[0]+pos[0],p[1]+pos[1],p[2]+pos[2]],out};
 }
 function alignSockets(sourceSocket,targetSocket,{scale=[1,1,1],extraYawDeg=0}={}){
  const source=normalizeSocket(sourceSocket),target=normalizeSocket(targetSocket);
  if(!source||!target)return null;
  const sc=Array.isArray(scale)?vec3(scale,[1,1,1]):[num(scale,1),num(scale,1),num(scale,1)];
  const desired=[-target.out[0],0,-target.out[2]];
  const yaw=angleXZ(desired)-angleXZ(source.out)+num(extraYawDeg,0)*Math.PI/180;
  const local=[source.point[0]*sc[0],source.point[1]*sc[1],source.point[2]*sc[2]];
  const shifted=rotateXZ(local,yaw);
  const position=[target.point[0]-shifted[0],target.point[1]-shifted[1],target.point[2]-shifted[2]];
  const world=transformSocket(source,{position,yawDeg:yaw*180/Math.PI,scale:sc});
  const error=world?Math.hypot(world.point[0]-target.point[0],world.point[1]-target.point[1],world.point[2]-target.point[2]):Infinity;
  return {position:position.map(v=>round(v)),rotation:round(((yaw*180/Math.PI)%360+360)%360),error};
 }
 function socketOccupied(worldSockets,targetPoint,incomingOut,{positionTolerance=.055,
  yTolerance=.10,directionDot=.94,excludeOwner=null}={}){
  const point=vec3(targetPoint),incoming=normalizeXZ(incomingOut);
  if(lengthXZ(incoming)<.5)return false;
  for(const item of worldSockets||[]){
   if(!item||item.owner===excludeOwner)continue;
   const socket=normalizeSocket(item.socket||item);
   if(!socket)continue;
   const p=vec3(item.point||socket.point),out=normalizeXZ(item.out||socket.out);
   if(Math.abs(p[1]-point[1])>yTolerance)continue;
   if(Math.hypot(p[0]-point[0],p[2]-point[2])>positionTolerance)continue;
   if(out[0]*incoming[0]+out[2]*incoming[2]>directionDot)return true;
  }
  return false;
 }
 return {DEFAULT_STOREY,safeStoreyHeight,safeFloorLevel,nominalFloorY,supportPriority,
  chooseFloorDatum,normalizeSocket,transformSocket,alignSockets,socketOccupied,rotateXZ,normalizeXZ};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildCore;
