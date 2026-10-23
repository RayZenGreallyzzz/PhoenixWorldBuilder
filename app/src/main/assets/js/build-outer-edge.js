/* Phoenix Builder: outward faces of modular walls follow the TRUE exterior
 * perimeter of floor tiles. All calculations are in world space; never
 * accumulate 90-degree rotations or use a wall's centre as an outside face.
 * Kept separate from BuildJoin so arbitrary wall-to-wall snapping still works
 * when there is no supporting floor edge.
 */
const BuildOuterEdge=(()=>{
 const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const rotate=(v,yaw)=>V(v.x*Math.cos(yaw)+v.z*Math.sin(yaw),v.y,-v.x*Math.sin(yaw)+v.z*Math.cos(yaw));
 const theta=v=>Math.atan2(-v.z,v.x);
 const deltaAngle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 const point=(root,x,y,z)=>V(x,y,z).applyMatrix4(root.matrixWorld);
 const normal=(root,x,z)=>V(x,0,z).transformDirection(root.matrixWorld).setY(0).normalize();
 const category=(w,e)=>e.data?.category||w.categoryForKind?.(e.kind)||e.kind;
 function decks(w,p){
  const level=w.floorLevel||0,nominal=w.heightAt(p.x,p.z)+level*(w.storeyHeight||2.6);
  return (w.objects||[]).filter(e=>e!==w.moveTarget&&category(w,e)==='foundation'&&
   (!Number.isInteger(e.data?.storey)||e.data.storey===level)).map(e=>{
    const root=e.mesh;
    root.updateWorldMatrix(true,true);
    const box=BuildSnap.attrBounds(root);
    if(box.isEmpty())return null;
    const y=point(root,0,box.max.y,0).y;
    if(!Number.isInteger(e.data?.storey)&&Math.abs(y-nominal)>2.5)return null;
    return {entry:e,root,box,top:y,inv:root.matrixWorld.clone().invert()};
   }).filter(Boolean);
 }
 function coveredByOther(floors,me,at,out){
  const probe=at.clone().addScaledVector(out,.12);
  return floors.some(f=>{
   if(f===me||Math.abs(f.top-me.top)>.12)return false;
   const p=probe.clone().applyMatrix4(f.inv),b=f.box;
   return p.x>b.min.x+.005&&p.x<b.max.x-.005&&
    p.z>b.min.z+.005&&p.z<b.max.z-.005;
  });
 }
 function edges(f){
  const b=f.box,y=b.max.y;
  return [
   {a:point(f.root,b.min.x,y,b.min.z),c:point(f.root,b.min.x,y,b.max.z),n:normal(f.root,-1,0)},
   {a:point(f.root,b.max.x,y,b.min.z),c:point(f.root,b.max.x,y,b.max.z),n:normal(f.root,1,0)},
   {a:point(f.root,b.min.x,y,b.min.z),c:point(f.root,b.max.x,y,b.min.z),n:normal(f.root,0,-1)},
   {a:point(f.root,b.min.x,y,b.max.z),c:point(f.root,b.max.x,y,b.max.z),n:normal(f.root,0,1)}
  ];
 }
 function wall(w,p,cat,model,box,floors){
  const scale=w.placementScale||1;
  const x=(box.max.x-box.min.x)*scale,z=(box.max.z-box.min.z)*scale;
  const localCentre=V((box.min.x+box.max.x)/2,0,(box.min.z+box.max.z)/2);
  const desired=(w.placementRotation||0)*Math.PI/180;
  const axis=x>=z?V(1,0,0):V(0,0,1);
  let best=null;
  for(const floor of floors)for(const edge of edges(floor)){
   const tangent=edge.c.clone().sub(edge.a).setY(0).normalize();
   const span=edge.a.distanceTo(edge.c);
   const from=p.clone().sub(edge.a).dot(tangent);
   const closest=edge.a.clone().addScaledVector(tangent,clamp(from,0,span));
   const proximity=Math.hypot(p.x-closest.x,p.z-closest.z);
   if(proximity>2.25||coveredByOther(floors,floor,closest,edge.n))continue;
   const aligned=theta(tangent)-theta(axis);
   const yaw=[aligned,aligned+Math.PI].sort((a,b)=>
    Math.abs(deltaAngle(a,desired))-Math.abs(deltaAngle(b,desired)))[0];
   const u=rotate(V(1,0,0),yaw),v=rotate(V(0,0,1),yaw);
   const width=Math.abs(u.dot(tangent))*x+Math.abs(v.dot(tangent))*z;
   const halfThickness=(Math.abs(u.dot(edge.n))*x+Math.abs(v.dot(edge.n))*z)/2;
   const count=Math.max(1,Math.floor(span/Math.max(.001,width)+.0001));
   const first=span/2-(count-1)*width/2;
   const index=clamp(Math.round((from-first)/Math.max(.001,width)),0,count-1);
   const exterior=edge.a.clone().addScaledVector(tangent,first+index*width+(w.edgeShift||0));
   const physicalCentre=exterior.clone().addScaledVector(edge.n,-halfThickness);
   const centreShift=rotate(localCentre,yaw).multiplyScalar(scale);
   const position=V(physicalCentre.x-centreShift.x,
    floor.top-box.min.y*scale+(w.placementLift||0),
    physicalCentre.z-centreShift.z);
   const score=proximity+.08*Math.hypot(physicalCentre.x-p.x,physicalCentre.z-p.z);
   if(!best||score<best.score)best={score,position,yaw,reference:floor.entry.data.id};
  }
  return best&&{position:best.position,yaw:best.yaw,reference:best.reference,
   floorOuterEdge:true};
 }
 function corner(w,p,cat,model,box,floors){
  const arms=typeof BuildJoin!=='undefined'?BuildJoin.cornerArms(model,w.placement,cat):null;
  if(!arms||arms.length!==2)return null;
  const xArm=arms.find(a=>Math.abs(a.tip.x-a.pivot.x)>=Math.abs(a.tip.z-a.pivot.z));
  const zArm=arms.find(a=>a!==xArm);
  if(!xArm||!zArm)return null;
  const sx=Math.sign(xArm.tip.x-xArm.pivot.x),sz=Math.sign(zArm.tip.z-zArm.pivot.z);
  if(!sx||!sz)return null;
  const outerLocal=V(sx<0?box.max.x:box.min.x,0,sz<0?box.max.z:box.min.z);
  const centroid=V((box.min.x+box.max.x)/2,0,(box.min.z+box.max.z)/2);
  const preferred=(w.placementRotation||0)*Math.PI/180,scale=w.placementScale||1;
  let best=null;
  for(const floor of floors){
   const b=floor.box,baseYaw=theta(normal(floor.root,1,0));
   for(const xEnd of ['min','max'])for(const zEnd of ['min','max']){
    const x=b[xEnd].x,z=b[zEnd].z,at=point(floor.root,x,b.max.y,z);
    const outwardX=normal(floor.root,xEnd==='min'?-1:1,0);
    const outwardZ=normal(floor.root,0,zEnd==='min'?-1:1);
    if(coveredByOther(floors,floor,at,outwardX)||coveredByOther(floors,floor,at,outwardZ))continue;
    const inwardX=outwardX.clone().negate(),inwardZ=outwardZ.clone().negate();
    for(let q=0;q<4;q++){
     const yaw=baseYaw+q*Math.PI/2;
     const dx=rotate(V(sx,0,0),yaw),dz=rotate(V(0,0,sz),yaw);
     const match=Math.max(dx.dot(inwardX)+dz.dot(inwardZ),dx.dot(inwardZ)+dz.dot(inwardX));
     if(match<1.99)continue;
     const shift=rotate(outerLocal,yaw).multiplyScalar(scale);
     const position=V(at.x-shift.x,floor.top-box.min.y*scale+(w.placementLift||0),at.z-shift.z);
     const centre=position.clone().add(rotate(centroid,yaw).multiplyScalar(scale));
     const distance=Math.hypot(centre.x-p.x,centre.z-p.z);
     if(distance>3.8)continue;
     const score=distance+Math.abs(deltaAngle(yaw,preferred))*.001;
     if(!best||score<best.score)best={score,position,yaw,reference:floor.entry.data.id};
    }
   }
  }
  return best&&{position:best.position,yaw:best.yaw,reference:best.reference,
   floorOuterCorner:true};
 }
 function resolve(w,p){
  if(w.smartSnap===false||w.joinMode&&w.joinMode!=='auto')return null;
  const cat=w.placementCategory||w.categoryForKind?.(w.placement)||w.placement;
  if(!['wall','door','railing','corner'].includes(cat))return null;
  const model=w.ghost||w.makeBuiltin?.(w.placement)||w.assetCache?.get(w.placement);
  if(!model||typeof BuildSnap==='undefined')return null;
  // Curved sections must still use their true endpoint/tangent joints.
  if(typeof BuildCurves!=='undefined'&&BuildCurves.isArc(w.placement,model))return null;
  const box=BuildSnap.dimensionBounds(BuildSnap.attrBounds(model),w);
  if(box.isEmpty())return null;
  const floors=decks(w,p);
  if(!floors.length)return null;
  const found=cat==='corner'?corner(w,p,cat,model,box,floors):wall(w,p,cat,model,box,floors);
  if(!found)return null;
  return {position:found.position,rotation:((found.yaw*180/Math.PI)%360+360)%360,
   snapped:true,edge:true,reference:found.reference,category:cat,
   floorOuterEdge:!!found.floorOuterEdge,floorOuterCorner:!!found.floorOuterCorner,
   joinedTo:found.floorOuterCorner?'floor-outer-corner':'floor-outer-edge'};
 }
 return {resolve};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildOuterEdge;
