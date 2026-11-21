/* Phoenix Engine — bounded freehand patrol paths and authored animation stops.
 * One shared canvas; this module has no DOM, renderer or project persistence.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixPatrolPath=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX_POINTS=256,MAX_STOPS=64,MAX_RAW=4096;
 const MODES=Object.freeze(['points','drawn']);
 const STATES=Object.freeze(['idle','walk','run','cast']);
 const point=p=>Array.isArray(p)&&p.length===3&&p.every(v=>
  typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000);
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 function validatePoints(raw){
  if(!Array.isArray(raw)||raw.length>MAX_POINTS)throw TypeError('Invalid AI waypoints');
  return raw.map((p,i)=>{
   if(!point(p))throw TypeError('Invalid AI waypoint '+i);
   return p.slice();
  });
 }
 function nearest(points,p){
  if(!point(p)||!points.length)return -1;
  let best=-1,dist=Infinity;
  for(let i=0;i<points.length;i++){
   const d=distance(points[i],p);
   if(d<dist){best=i;dist=d}
  }
  return best;
 }
 function animation(value){
  if(STATES.includes(value))return value;
  if(typeof value==='string'&&value.startsWith('clip:')&&
     value.length>5&&value.length<=125&&
     !/[\x00-\x1f]/.test(value))return value;
  throw TypeError('Invalid route animation');
 }
 function normalizeStops(points,raw=[]){
  if(!Array.isArray(raw)||raw.length>MAX_STOPS)throw TypeError('Invalid route stops');
  const seen=new Set();
  return raw.map((item,i)=>{
   if(!item||typeof item!=='object'||Array.isArray(item)||
      !Number.isInteger(item.index)||item.index<0||item.index>=points.length||
      seen.has(item.index))throw TypeError('Invalid route stop '+i);
   seen.add(item.index);
   const seconds=Number(item.seconds);
   if(!Number.isFinite(seconds)||seconds<.2||seconds>120)
    throw TypeError('Invalid route stop seconds');
   return {index:item.index,seconds,animation:animation(item.animation||'idle')};
  }).sort((a,b)=>a.index-b.index);
 }
 function distanceToSegment(p,a,b){
  const dx=b[0]-a[0],dz=b[2]-a[2];
  const den=dx*dx+dz*dz;
  const t=den>1e-9?Math.min(1,Math.max(0,
   ((p[0]-a[0])*dx+(p[2]-a[2])*dz)/den)):0;
  return Math.hypot(p[0]-a[0]-dx*t,p[2]-a[2]-dz*t);
 }
 function simplify(points,tolerance){
  if(points.length<3)return points.slice();
  const keep=new Set([0,points.length-1]);
  const spans=[[0,points.length-1]];
  while(spans.length){
   const [start,end]=spans.pop();
   let max=-1,index=-1;
   for(let i=start+1;i<end;i++){
    const d=distanceToSegment(points[i],points[start],points[end]);
    if(d>max){max=d;index=i}
   }
   if(max>tolerance&&index>start&&index<end){
    keep.add(index);spans.push([start,index],[index,end]);
   }
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
 }
 function fromStroke(raw,{tolerance=.18,minSpacing=.22}={}){
  if(!Array.isArray(raw)||raw.length>MAX_RAW)throw TypeError('Invalid finger route');
  if(!Number.isFinite(tolerance)||tolerance<0||tolerance>8||
     !Number.isFinite(minSpacing)||minSpacing<.05||minSpacing>5)
   throw TypeError('Invalid route sampling');
  const points=[];
  for(const p of raw){
   if(!point(p))throw TypeError('Invalid finger route point');
   if(!points.length||distance(points[points.length-1],p)>=minSpacing)
    points.push(p.slice());
   else if(p===raw[raw.length-1]&&points.length>1)points.push(p.slice());
  }
  if(points.length<2)return points;
  // Preserve closed circles: the last point should not duplicate first.
  const closed=distance(points[0],points[points.length-1])<Math.max(.65,minSpacing*2)&&
   points.length>=5;
  let working=closed?points.slice(0,-1):points;
  let result=simplify(working,tolerance);
  // Increase tolerance rather than taking every Nth point and destroying turns.
  let t=tolerance;
  for(let i=0;result.length>MAX_POINTS&&i<16;i++){
   t=Math.max(.04,t*1.65);result=simplify(working,t);
  }
  if(result.length>MAX_POINTS){
   const stride=(result.length-1)/(MAX_POINTS-1);
   result=Array.from({length:MAX_POINTS},(_,i)=>
    result[Math.min(result.length-1,Math.round(i*stride))]);
  }
  return validatePoints(result);
 }
 function stopsFromMarkers(points,markers){
  if(!Array.isArray(markers)||markers.length>MAX_STOPS)
   throw TypeError('Invalid route stop markers');
  const byIndex=new Map();
  for(const stop of markers){
   const index=nearest(points,stop.position);
   if(index<0)continue;
   byIndex.set(index,{index,seconds:stop.seconds,animation:stop.animation});
  }
  return normalizeStops(points,[...byIndex.values()]);
 }
 return Object.freeze({MAX_POINTS,MAX_STOPS,MAX_RAW,MODES,STATES,point,
  distance,nearest,validatePoints,normalizeStops,fromStroke,stopsFromMarkers});
});
