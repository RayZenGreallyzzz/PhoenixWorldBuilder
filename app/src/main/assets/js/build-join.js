/* Offline wall joints: corner columns and walls stacked onto real GLB wall tops. */
const BuildJoin=(()=>{
 const abs=Math.abs, clamp=THREE.MathUtils.clamp;
 const wallCategory=cat=>cat==='wall'||cat==='door'||cat==='corner'||cat==='railing';
 const catOf=(w,e)=>e.data?.category||w.categoryForKind?.(e.kind)||e.kind;
 const byLocal=(root,x,y,z)=>new THREE.Vector3(x,y,z).applyMatrix4(root.matrixWorld);
 const distXZ=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const nearest=(a,b,p)=>{
  const dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
  const t=len2>1e-8?clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/len2,0,1):.5;
  return {point:new THREE.Vector3(a.x+dx*t,a.y+(b.y-a.y)*t,a.z+dz*t),t};
 };
 const angle=(a,b)=>Math.atan2(-(b.z-a.z),b.x-a.x);
 const rotate=(v,yaw)=>new THREE.Vector3(v.x*Math.cos(yaw)+v.z*Math.sin(yaw),0,-v.x*Math.sin(yaw)+v.z*Math.cos(yaw));
 function wallInfo(w,entry){
  const root=entry.mesh;root.updateWorldMatrix(true,true);
  const b=BuildSnap.attrBounds(root);if(b.isEmpty())return null;
  const cx=(b.min.x+b.max.x)/2,cz=(b.min.z+b.max.z)/2;
  const acrossX=(b.max.x-b.min.x)>=(b.max.z-b.min.z);
  const a=acrossX?byLocal(root,b.min.x,b.min.y,cz):byLocal(root,cx,b.min.y,b.min.z);
  const c=acrossX?byLocal(root,b.max.x,b.min.y,cz):byLocal(root,cx,b.min.y,b.max.z);
  const top=byLocal(root,cx,b.max.y,cz).y,bottom=byLocal(root,cx,b.min.y,cz).y;
  if(!Number.isFinite(top)||!Number.isFinite(bottom)||top<=bottom+.1)return null;
  return {entry,root,b,a,c,top,bottom,mid:byLocal(root,cx,b.min.y,cz),
   alongX:acrossX,dir:c.clone().sub(a).setY(0).normalize(),length:distXZ(a,c)};
 }
 function nearby(w,p){
  const possible=[];
  for(const entry of w.objects||[]){
   if(!wallCategory(catOf(w,entry)))continue;
   const root=entry.mesh;
   // Fast world-space rejection based on geometry bounding sphere after pivot shift.
   const info=wallInfo(w,entry);if(!info)continue;
   const projected=nearest(info.a,info.c,p);
   const d=distXZ(p,projected.point);
   if(d>5.5)continue;
   possible.push({...info,projected,d});
  }
  possible.sort((a,b)=>a.d-b.d);
  return possible.slice(0,14);
 }
 function solvePivot(w,box,at,yaw,yHeight){
  const scale=w.placementScale||1;
  const anchor=(w.joinMode==='corner'||w.placementCategory==='corner')&&w.ghost?.userData?.joinAnchor;
   const offset=Array.isArray(anchor)&&anchor.length>=3?
    new THREE.Vector3(Number(anchor[0])||0,0,Number(anchor[2])||0):
    new THREE.Vector3((box.min.x+box.max.x)*.5,0,(box.min.z+box.max.z)*.5);
  const v=rotate(offset,yaw).multiplyScalar(scale);
  return new THREE.Vector3(at.x-v.x,yHeight-box.min.y*scale+(w.placementLift||0),at.z-v.z);
 }
 function modelBounds(w){
  const model=w.ghost||w.makeBuiltin?.(w.placement)||w.assetCache?.get(w.placement);
  const b=model?BuildSnap.attrBounds(model):new THREE.Box3().makeEmpty();
  return b.isEmpty()?new THREE.Box3(new THREE.Vector3(-.5,0,-.5),new THREE.Vector3(.5,1,.5)):b;
 }
 function corner(w,p,candidates,box){
  let best=null;
  const targetY=w.floorLevel>0?w.heightAt(p.x,p.z)+w.floorLevel*(w.storeyHeight||2.6):p.y;
  const maxReach=4.5;
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
   const a=candidates[i],b=candidates[j];
   if(abs(a.bottom-b.bottom)>1.25)continue;
   if(abs(a.dir.x*b.dir.z-a.dir.z*b.dir.x)<.27)continue;
   for(const ap of [a.a,a.c])for(const bp of [b.a,b.c]){
    if(distXZ(ap,bp)>2.1)continue;
    let where=ap.clone().add(bp).multiplyScalar(.5);
    const d=distXZ(where,p);
    if(d>maxReach)continue;
    const levelCost=w.floorLevel>0?abs(a.bottom-targetY)*.25:0;
    const grade=d+distXZ(ap,bp)*.4+levelCost;
    if(!best||grade<best.grade){
      const farA=ap===a.a?a.c:a.a,farB=bp===b.a?b.c:b.a;
      best={where,y:Math.max(a.bottom,b.bottom),yaw:angle(a.a,a.c),
       arms:[farA.clone().sub(ap).setY(0).normalize(),farB.clone().sub(bp).setY(0).normalize()],
       reference:a.entry.data.id,grade};
     }
   }
  }
  // A solitary wall end may also be a corner where the next wall isn't built yet.
  if(!best&&candidates.length){
   for(const entry of candidates.slice(0,5))for(const ep of [entry.a,entry.c]){
    const distance=distXZ(ep,p);if(distance>2.5)continue;
    const grade=distance+.5;
    if(!best||grade<best.grade)best={where:ep,y:entry.bottom,yaw:angle(entry.a,entry.c),reference:entry.entry.data.id,grade};
   }
  }
  // A custom GLB platform can have unoccupied corner points.
  if(!best){
   for(const entry of w.objects||[]){
    if(!['foundation','ceiling'].includes(catOf(w,entry)))continue;
    entry.mesh.updateWorldMatrix(true,true);
    const b=BuildSnap.attrBounds(entry.mesh);if(b.isEmpty())continue;
    for(const x of [b.min.x,b.max.x])for(const z of [b.min.z,b.max.z]){
     const candidate=byLocal(entry.mesh,x,b.max.y,z),d=distXZ(candidate,p);
     if(d>2.5)continue;
     if(!best||d<best.grade){
      const ax=byLocal(entry.mesh,b.max.x,b.max.y,(b.min.z+b.max.z)*.5);
      const az=byLocal(entry.mesh,b.min.x,b.max.y,(b.min.z+b.max.z)*.5);
      best={where:candidate,y:candidate.y,yaw:angle(az,ax),reference:entry.data.id,grade:d};
     }
    }
   }
  }
  if(!best)return null;
  let baseYaw=best.yaw;
  if(w.ghost?.userData?.joinAnchor&&best.arms?.length===2){
   // Builtin L-piece arms leave the local pivot along -X and -Z.
   let bestMatch=-Infinity;
   for(let k=0;k<4;k++){
    const candidate=best.yaw+k*Math.PI/2;
    const x=rotate(new THREE.Vector3(-1,0,0),candidate);
    const z=rotate(new THREE.Vector3(0,0,-1),candidate);
    const [a,b]=best.arms;
    const match=Math.max(x.dot(a)+z.dot(b),x.dot(b)+z.dot(a));
    if(match>bestMatch){bestMatch=match;baseYaw=candidate;}
   }
  }
  const yaw=baseYaw+(w.placementRotation||0)*Math.PI/180;
  const placed=solvePivot(w,box,best.where,yaw,best.y);
  placed.x+=w.cornerOffsetX||0;placed.z+=w.cornerOffsetZ||0;
  return {position:placed,
   rotation:((yaw*180/Math.PI)%360+360)%360,snapped:true,corner:true,edge:false,
   reference:best.reference,category:w.placementCategory||'corner',joinedTo:'corner'};
 }
 function stack(w,p,candidates,box){
  let best=null;
  const expectedStorey=w.floorLevel-1;
  for(const wall of candidates){
   if(wall.d>3.25)continue;
   const story=wall.entry.data?.storey;
   // Explicit upper storey selection prefers walls immediately below it.
   const priority=w.floorLevel>0&&story===expectedStorey?-4:0;
   const penalty=w.floorLevel>0&&story!==null&&story!==expectedStorey?2:0;
   const vertical=abs(wall.top-p.y)*.03;
   const grade=wall.d+priority+penalty+vertical;
   if(!best||grade<best.grade)best={wall,grade};
  }
  if(!best)return null;
  const old=best.wall,hit=old.projected.point;
  const delta=(w.edgeShift||0),t=clamp(old.projected.t+delta/Math.max(old.length,.001),0,1);
  const anchor=new THREE.Vector3(old.a.x+(old.c.x-old.a.x)*t,old.top,old.a.z+(old.c.z-old.a.z)*t);
  const majorX=(box.max.x-box.min.x)>=(box.max.z-box.min.z);
  let yaw=angle(old.a,old.c)+(majorX?0:Math.PI/2)+(w.placementRotation||0)*Math.PI/180;
  return {position:solvePivot(w,box,anchor,yaw,old.top),
   rotation:((yaw*180/Math.PI)%360+360)%360,snapped:true,stacked:true,edge:false,
   reference:old.entry.data.id,category:w.placementCategory||'wall',joinedTo:'stack'};
 }
 function hasCurrentDeck(w,p){
  // A wall on an actual next-storey floor belongs on that floor. Only stack
  // directly on the lower wall when no usable current-floor slab exists.
  const nominal=w.heightAt(p.x,p.z)+w.floorLevel*(w.storeyHeight||2.6);
  for(const entry of w.objects||[]){
   if(catOf(w,entry)!=='foundation')continue;
   const story=entry.data?.storey;
   const root=entry.mesh;root.updateMatrixWorld(true,true);
   const box=BuildSnap.attrBounds(root);if(box.isEmpty())continue;
   const y=byLocal(root,0,box.max.y,0).y;
   if(story!==w.floorLevel&&(Number.isInteger(story)||abs(y-nominal)>1.25))continue;
   const local=p.clone().applyMatrix4(root.matrixWorld.clone().invert());
   if(local.x>=box.min.x-.35&&local.x<=box.max.x+.35&&
      local.z>=box.min.z-.35&&local.z<=box.max.z+.35)return true;
  }
  return false;
 }
 function resolve(w,p){
  const cat=w.placementCategory||w.categoryForKind?.(w.placement)||'prop';
  const mode=w.joinMode||'auto';
  const isCorner=mode==='corner'||(mode==='auto'&&cat==='corner');
  const isStack=mode==='stack'||(mode==='auto'&&cat==='wall'&&w.floorLevel>0);
  if(!isCorner&&!isStack)return null;
  if(mode==='auto'&&isStack&&hasCurrentDeck(w,p))return null;
  const walls=nearby(w,p),box=modelBounds(w);
  const result=isCorner?corner(w,p,walls,box):stack(w,p,walls,box);
  if(result)return result;
  if(mode!=='auto')return {position:new THREE.Vector3(p.x,w.placementHeight(p.x,p.z),p.z),
   rotation:w.placementRotation||0,snapped:false,valid:false,category:cat,
   missingTarget:mode==='stack'?'Подойди к стене, на которую ставишь следующую':'Подойди к стыку стен или к углу пола'};
  return null;
 }
 return {resolve,wallInfo,nearby,corner,stack};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildJoin;
