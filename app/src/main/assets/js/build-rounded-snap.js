/* Phoenix Builder — quarter-circle wall auto-fit to a true exterior tile corner.
 * Fits the ACTUAL mesh outline (not its rotated AABB) to both exterior edges.
 * An exact two-wall socket fit wins when both ends are ready; otherwise a
 * quarter-circle module can be placed correctly before either wall exists.
 */
const BuildRoundedSnap=(()=>{
 const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
 const theta=v=>Math.atan2(-v.z,v.x);
 const rotate=(v,a)=>V(v.x*Math.cos(a)+v.z*Math.sin(a),v.y,-v.x*Math.sin(a)+v.z*Math.cos(a));
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const dot=(p,n)=>p.x*n.x+p.z*n.z;
 const cache=new WeakMap();
 const cat=(w,e)=>e.data?.category||w.categoryForKind?.(e.kind)||e.kind;
 const normal=(root,x,z)=>V(x,0,z).transformDirection(root.matrixWorld).setY(0).normalize();
 const worldPoint=(root,x,y,z)=>V(x,y,z).applyMatrix4(root.matrixWorld);
 const axes=w=>{const a=w.placementAxes||{};return {x:Number(a.x)||1,y:Number(a.y)||1,z:Number(a.z)||1}};
 // Cache the 2D convex hull: scanning a large imported GLB every frame is
 // too expensive on Android. The geometry revision detects mesh edits.
 function hull(root){
  root.updateWorldMatrix(true,true);
  const signature=BuildSnap.geometrySignature?.(root)||'';
  const old=cache.get(root);
  if(old?.signature===signature)return old.points;
  const inv=root.matrixWorld.clone().invert();
  const pts=[],point=V(),transform=new THREE.Matrix4();
  root.traverse(obj=>{
   const att=obj.geometry?.attributes?.position;
   if(!obj.isMesh||!att)return;
   transform.multiplyMatrices(inv,obj.matrixWorld);
   for(let i=0;i<att.count;i++){
    point.set(att.getX(i),att.getY(i),att.getZ(i)).applyMatrix4(transform);
    if(Number.isFinite(point.x)&&Number.isFinite(point.z))pts.push([point.x,point.z]);
   }
  });
  pts.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const unique=[];
  for(const p of pts)if(!unique.length||Math.abs(p[0]-unique[unique.length-1][0])>1e-7||
   Math.abs(p[1]-unique[unique.length-1][1])>1e-7)unique.push(p);
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lower=[],upper=[];
  for(const p of unique){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p)}
  for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p)}
  const points=lower.slice(0,-1).concat(upper.slice(0,-1)).map(p=>V(p[0],0,p[1]));
  cache.set(root,{signature,points});
  return points;
 }
 function incoming(w,root,box){
  const slots=BuildCurves.incomingSockets(w,box);
  if(!slots||slots.length!==2)return null;
  const a=axes(w);
  const scale=w.placementScale||1;
  return slots.map(s=>({
   name:s.name,
   point:V(s.point.x*a.x*scale,s.point.y*a.y*scale,s.point.z*a.z*scale),
   // Cap plane normals transform by inverse-transpose under anisotropic scale.
   out:V(s.out.x/a.x,0,s.out.z/a.z).normalize()
  }));
 }
 // Two adjacent *different* walls can already delimit an exact arc.
 // Only accept when both physical caps coincide, not a near/visual fit.
 function bothEnds(w,p,slots,box){
  const targets=[],level=w.floorLevel||0;
  for(const entry of w.objects||[]){
   if(entry===w.moveTarget||entry.data?.storey!==undefined&&entry.data.storey!==level)continue;
   if(!['wall','corner','door','railing'].includes(cat(w,entry))&&
    !BuildCurves.isArc(entry.kind,entry.mesh))continue;
   const info=BuildJoin.wallInfo(w,entry);
   if(!info)continue;
   for(const socket of BuildCurves.sourceSockets(info)){
    if(dist(socket.point,p)>11)continue;
    targets.push({...socket,entry});
   }
  }
  if(targets.length<2)return null;
  const root=w.ghost;
  const centre=BuildSnap.attrBounds(root).getCenter(V());
  const ax=axes(w),scale=w.placementScale||1;
  const centerLocal=V(centre.x*ax.x*scale,0,centre.z*ax.z*scale);
  let best=null;
  for(const a of targets)for(const b of targets){
   if(a.entry===b.entry)continue;
   for(const order of [[0,1],[1,0]]){
    const first=slots[order[0]],last=slots[order[1]];
    const start=last.point.clone().sub(first.point).setY(0);
    const end=b.point.clone().sub(a.point).setY(0);
    const mismatch=Math.abs(start.length()-end.length());
    if(mismatch>.03||start.length()<.2)continue;
    const yaw=theta(end)-theta(start);
    const n0=rotate(first.out,yaw),n1=rotate(last.out,yaw);
    if(n0.dot(a.out)>-.995||n1.dot(b.out)>-.995)continue;
    const shifted=rotate(first.point,yaw);
    const position=V(a.point.x-shifted.x,a.point.y-first.point.y+(w.placementLift||0),
      a.point.z-shifted.z);
    const other=rotate(last.point,yaw).add(position);
    const error=dist(other,b.point);
    if(error>.025||Math.abs(other.y-b.point.y)>.04)continue;
    const candidateCenter=position.clone().add(rotate(centerLocal,yaw));
    const reach=Math.max(3.5,Math.min(12,start.length()*1.25+2));
    const pointerDistance=dist(p,candidateCenter);
    if(pointerDistance>reach)continue;
    const score=pointerDistance+error*10;
    if(!best||score<best.score)best={score,position,yaw,reference:a.entry.data.id,
      otherReference:b.entry.data.id,sourceSocket:first.name,targetSocket:a.name};
   }
  }
  if(!best)return null;
  return {position:best.position,rotation:(best.yaw*180/Math.PI+3600)%360,
   snapped:true,curveJoin:true,roundedCorner:true,dualSocket:true,edge:true,
   joinedTo:'rounded-two-sockets',reference:best.reference,
   otherReference:best.otherReference,sourceSocket:best.sourceSocket,
   targetSocket:best.targetSocket,category:w.placementCategory||'wall'};
 }
 // The corner is where two EXPOSED floor edges meet. Align the outward
 // convex mesh support in the two edge-normal directions, not the centreline
 // or a diagonal bounding-box corner.
 function tileCorner(w,p,root,slots,footprint,box){
  const a=axes(w),scale=w.placementScale||1;
  const modelCentre=box.getCenter(V());
  const floors=[];
  const level=w.floorLevel||0,nominal=w.heightAt(p.x,p.z)+level*(w.storeyHeight||2.6);
  for(const entry of w.objects||[]){
   if(entry===w.moveTarget||cat(w,entry)!=='foundation')continue;
   const storey=entry.data?.storey;
   if(Number.isInteger(storey)&&storey!==level)continue;
   const floor=entry.mesh;floor.updateWorldMatrix(true,true);
   const bounds=BuildSnap.attrBounds(floor);if(bounds.isEmpty())continue;
   const top=worldPoint(floor,0,bounds.max.y,0).y;
   if(!Number.isInteger(storey)&&Math.abs(top-nominal)>2.5)continue;
   floors.push({entry,root:floor,bounds,top,inv:floor.matrixWorld.clone().invert()});
  }
  if(!floors.length||!footprint.length)return null;
  const insideOther=(here,point,out)=>{
   const sample=point.clone().addScaledVector(out,.12);
   return floors.some(other=>{
    if(other===here||Math.abs(other.top-here.top)>.12)return false;
    const q=sample.clone().applyMatrix4(other.inv),b=other.bounds;
    return q.x>b.min.x+.005&&q.x<b.max.x-.005&&q.z>b.min.z+.005&&q.z<b.max.z-.005;
   });
  };
  let best=null;
  for(const floor of floors){
   const b=floor.bounds;
   for(const sideX of [-1,1])for(const sideZ of [-1,1]){
    const corner=worldPoint(floor.root,sideX<0?b.min.x:b.max.x,b.max.y,
     sideZ<0?b.min.z:b.max.z);
    const outX=normal(floor.root,sideX,0),outZ=normal(floor.root,0,sideZ);
    if(insideOther(floor,corner,outX)||insideOther(floor,corner,outZ))continue;
    const awayX=outX.clone().negate(),awayZ=outZ.clone().negate();
    for(const desired of [[awayX,awayZ],[awayZ,awayX]]){
     const yaw=theta(desired[0])-theta(slots[0].out);
     if(rotate(slots[0].out,yaw).dot(desired[0])<.995||
        rotate(slots[1].out,yaw).dot(desired[1])<.995)continue;
     let maxX=-Infinity,maxZ=-Infinity;
     for(const vertex of footprint){
      const m=rotate(V(vertex.x*a.x*scale,0,vertex.z*a.z*scale),yaw);
      maxX=Math.max(maxX,dot(m,outX));maxZ=Math.max(maxZ,dot(m,outZ));
     }
     if(!Number.isFinite(maxX)||!Number.isFinite(maxZ))continue;
     // Orthogonal normals provide the local floor frame, even on a rotated floor.
     const position=outX.clone().multiplyScalar(dot(corner,outX)-maxX)
       .addScaledVector(outZ,dot(corner,outZ)-maxZ);
     position.y=floor.top-box.min.y*a.y*scale+(w.placementLift||0);
     const centre=position.clone().add(rotate(V(modelCentre.x*a.x*scale,0,
       modelCentre.z*a.z*scale),yaw));
     const pointerDistance=dist(centre,p);
     const reach=Math.max(3.5,Math.min(12,Math.max(box.max.x-box.min.x,
       box.max.z-box.min.z)*scale*1.5+1));
     if(pointerDistance>reach||dist(corner,p)>reach+1)continue;
     const score=pointerDistance+dist(corner,p)*.05;
     if(!best||score<best.score)best={score,position,yaw,reference:floor.entry.data.id};
    }
   }
  }
  if(!best)return null;
  return {position:best.position,rotation:(best.yaw*180/Math.PI+3600)%360,
   snapped:true,roundedCorner:true,roundedOnFloor:true,edge:true,
   joinedTo:'rounded-exterior-floor-corner',reference:best.reference,
   category:w.placementCategory||'wall'};
 }
 function resolve(w,p){
  if(w.smartSnap===false||w.joinMode==='free'||w.joinMode==='stack')return null;
  const root=w.ghost;
  if(!root||typeof BuildCurves==='undefined'||!BuildCurves.isArc(w.placement,root))return null;
  const box=BuildSnap.attrBounds(root);if(box.isEmpty())return null;
  const slots=incoming(w,root,box);if(!slots)return null;
  // The quarter circle has perpendicular cap tangents. Don't force an
  // R3/180-degree segment or a 45-degree turn into a 90-degree corner.
  if(Math.abs(slots[0].out.dot(slots[1].out))>.075)return null;
  const paired=bothEnds(w,p,slots,box);
  if(paired)return paired;
  if(w.joinMode==='corner'||w.joinMode==='auto')
   return tileCorner(w,p,root,slots,hull(root),box);
  return null;
 }
 return {resolve,hull};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildRoundedSnap;
