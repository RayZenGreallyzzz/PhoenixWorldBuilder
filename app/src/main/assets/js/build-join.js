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
 const cornerCache=new WeakMap();
 // Some GLBs merge both L arms into ONE geometry. Infer only unmistakable
 // thin exposed end caps from the mesh silhouette, not the outer AABB.
 function mergedCornerArms(root){
  const local=BuildSnap.attrBounds(root);
  if(local.isEmpty())return null;
  const sx=local.max.x-local.min.x,sz=local.max.z-local.min.z;
  if(sx<.8||sz<.8)return null;
  const eps=Math.max(.018,Math.min(.085,Math.min(sx,sz)*.025));
  const inverse=root.matrixWorld.clone().invert(),transform=new THREE.Matrix4();
  const point=new THREE.Vector3(),corners=[];
  root.traverse(mesh=>{
   const attr=mesh.isMesh&&mesh.geometry?.attributes?.position;
   if(!attr||attr.count>120000)return;
   transform.multiplyMatrices(inverse,mesh.matrixWorld);
   for(let i=0;i<attr.count;i++){
    point.set(attr.getX(i),attr.getY(i),attr.getZ(i)).applyMatrix4(transform);
    corners.push([point.x,point.z]);
   }
  });
  if(!corners.length)return null;
  const xChoices=[local.min.x,local.max.x].map(value=>{
   let min=Infinity,max=-Infinity,count=0;
   for(const pt of corners)if(abs(pt[0]-value)<=eps){
    min=Math.min(min,pt[1]);max=Math.max(max,pt[1]);count++;
   }
   return {value,span:max-min,center:(max+min)/2,count};
  }).filter(a=>a.count>=2&&Number.isFinite(a.span));
  const zChoices=[local.min.z,local.max.z].map(value=>{
   let min=Infinity,max=-Infinity,count=0;
   for(const pt of corners)if(abs(pt[1]-value)<=eps){
    min=Math.min(min,pt[0]);max=Math.max(max,pt[0]);count++;
   }
   return {value,span:max-min,center:(max+min)/2,count};
  }).filter(a=>a.count>=2&&Number.isFinite(a.span));
  xChoices.sort((a,b)=>a.span-b.span);zChoices.sort((a,b)=>a.span-b.span);
  const xt=xChoices[0],zt=zChoices[0];
  const maxThin=Math.min(.55,Math.min(sx,sz)*.27);
  if(!xt||!zt||xt.span>maxThin||zt.span>maxThin)return null;
  const ix=zt.center,iz=xt.center;
  if(abs(xt.value-ix)<.5||abs(zt.value-iz)<.5)return null;
  if(!corners.some(pt=>Math.hypot(pt[0]-ix,pt[1]-iz)<=Math.max(.34,maxThin*1.5)))return null;
  const y=local.min.y;
  return [
   {name:'corner-x',tip:new THREE.Vector3(xt.value,y,iz),pivot:new THREE.Vector3(ix,y,iz)},
   {name:'corner-z',tip:new THREE.Vector3(ix,y,zt.value),pivot:new THREE.Vector3(ix,y,iz)}
  ];
 }

 // A corner is an L made of two perpendicular panels, not a straight wall.
 // Identify its ACTUAL exposed cap centre-lines from the child meshes.
 // This works for built-in corners and GLBs that contain separate arm meshes.
 // A merged/arbitrary GLB with no identifiable arms is deliberately excluded
 // from corner-end snapping instead of inventing a socket on the AABB diagonal.
 function cornerArms(root,kind,category){
  if(category!=='corner'&&kind!=='corner')return null;
  if(root?.userData?.pwbModuleShape==='corner'&&root.userData.pwbModuleSockets?.length===2){
   return root.userData.pwbModuleSockets.map((s,i)=>({
    name:i===0?'corner-x':'corner-z',
    tip:new THREE.Vector3(...s.point),pivot:new THREE.Vector3(0,0,0)
   }));
  }
  const signature=BuildSnap.geometrySignature(root);
  const cached=cornerCache.get(root);
  if(cached&&cached.signature===signature)return cached.arms;
  root.updateWorldMatrix(true,true);
  const inv=root.matrixWorld.clone().invert(),transform=new THREE.Matrix4();
  const arms=[],box=new THREE.Box3();
  root.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry?.attributes?.position)return;
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   if(!mesh.geometry.boundingBox)return;
   transform.multiplyMatrices(inv,mesh.matrixWorld);
   box.copy(mesh.geometry.boundingBox).applyMatrix4(transform);
   const sx=box.max.x-box.min.x,sz=box.max.z-box.min.z;
   const big=Math.max(sx,sz),small=Math.max(.00001,Math.min(sx,sz));
   if(big<.65||big/small<3.5) return;
   if(box.max.y-box.min.y<.35)return;
   arms.push({box:box.clone(),axis:sx>sz?'x':'z',length:big,
    centerX:(box.min.x+box.max.x)/2,centerZ:(box.min.z+box.max.z)/2});
  });
  let best=null;
  for(const x of arms.filter(a=>a.axis==='x'))for(const z of arms.filter(a=>a.axis==='z')){
   const overlapY=Math.min(x.box.max.y,z.box.max.y)-Math.max(x.box.min.y,z.box.min.y);
   if(overlapY<.35)continue;
   const ix=z.centerX,iz=x.centerZ;
   const nearX=Math.max(0,x.box.min.x-ix,ix-x.box.max.x);
   const nearZ=Math.max(0,z.box.min.z-iz,iz-z.box.max.z);
   if(nearX>.16||nearZ>.16)continue;
   const score=x.length+z.length-nearX-nearZ;
   if(!best||score>best.score)best={x,z,ix,iz,score};
  }
  if(!best){
   const joined=mergedCornerArms(root);
   cornerCache.set(root,{signature,arms:joined||null});
   return joined;
  }
  const {x,z,ix,iz}=best;
  const minY=Math.min(x.box.min.y,z.box.min.y);
  const xEnd=Math.abs(x.box.min.x-ix)>Math.abs(x.box.max.x-ix)?x.box.min.x:x.box.max.x;
  const zEnd=Math.abs(z.box.min.z-iz)>Math.abs(z.box.max.z-iz)?z.box.min.z:z.box.max.z;
  const local=[
   {name:'corner-x',tip:new THREE.Vector3(xEnd,minY,iz),pivot:new THREE.Vector3(ix,minY,iz)},
   {name:'corner-z',tip:new THREE.Vector3(ix,minY,zEnd),pivot:new THREE.Vector3(ix,minY,iz)}
  ];
  if(local.some(a=>distXZ(a.tip,a.pivot)<.35)){
   cornerCache.set(root,{signature,arms:null});return null;
  }
  cornerCache.set(root,{signature,arms:local});
  return local;
 }
 function cornerSegments(root,kind,category){
  const arms=cornerArms(root,kind,category);
  return arms?.map(arm=>{
   const a=byLocal(root,arm.tip.x,arm.tip.y,arm.tip.z);
   const c=byLocal(root,arm.pivot.x,arm.pivot.y,arm.pivot.z);
   return {name:arm.name,a,c,dir:c.clone().sub(a).setY(0).normalize(),
    length:distXZ(a,c),tipOnly:true};
  })||null;
 }
 function wallInfo(w,entry){
  const root=entry.mesh;root.updateWorldMatrix(true,true);
  const b=BuildSnap.attrBounds(root);if(b.isEmpty())return null;
  const cx=(b.min.x+b.max.x)/2,cz=(b.min.z+b.max.z)/2;
  const acrossX=(b.max.x-b.min.x)>=(b.max.z-b.min.z);
  const a=acrossX?byLocal(root,b.min.x,b.min.y,cz):byLocal(root,cx,b.min.y,b.min.z);
  const c=acrossX?byLocal(root,b.max.x,b.min.y,cz):byLocal(root,cx,b.min.y,b.max.z);
  const top=byLocal(root,cx,b.max.y,cz).y,bottom=byLocal(root,cx,b.min.y,cz).y;
  if(!Number.isFinite(top)||!Number.isFinite(bottom)||top<=bottom+.1)return null;
  const type=catOf(w,entry),segments=cornerSegments(root,entry.kind,type);
  // Never use a corner's rectangular diagonal as a wall end if the
  // geometry does not expose reliable corner sockets.
  return {entry,root,b,a,c,top,bottom,mid:byLocal(root,cx,b.min.y,cz),
   alongX:acrossX,dir:c.clone().sub(a).setY(0).normalize(),length:distXZ(a,c),
   segments,unresolvedCorner:type==='corner'&&!segments,
   sockets:segments?.map(line=>({name:line.name,point:line.a.clone(),
    out:line.a.clone().sub(line.c).setY(0).normalize(),curved:false}))};
 }
 function nearby(w,p){
  // The center of an R5 / 180° arc can be >6m from its connecting end.
  // Extend candidate discovery to the true physical reach of the incoming arc.
  const curved=typeof BuildCurves!=='undefined'&&BuildCurves.isArc(w.placement);
  const b=curved?modelBounds(w):null;
  const reach=b?Math.max(5.5,Math.min(15,
   Math.hypot(b.max.x-b.min.x,b.max.z-b.min.z)*(w.placementScale||1)+2)):5.5;
  const possible=[];
  for(const entry of w.objects||[]){
   if(entry===w.moveTarget)continue;
   if(!wallCategory(catOf(w,entry))&&!(typeof BuildCurves!=='undefined'&&BuildCurves.isArc(entry.kind)))continue;
   const root=entry.mesh;
   // Fast world-space rejection based on geometry bounding sphere after pivot shift.
   const info=wallInfo(w,entry);if(!info)continue;
   if(info.unresolvedCorner)continue;
   const lines=info.segments||[info];
   const projections=lines.map(line=>({line,...nearest(line.a,line.c,p)}));
   projections.sort((a,b)=>distXZ(p,a.point)-distXZ(p,b.point));
   const closest=projections[0],d=distXZ(p,closest.point);
   if(d>reach)continue;
   possible.push({...info,projected:{point:closest.point,t:closest.t},
    bestSegment:closest.line,d});
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
  const b=model?BuildSnap.dimensionBounds(BuildSnap.attrBounds(model),w):new THREE.Box3().makeEmpty();
  return b.isEmpty()?new THREE.Box3(new THREE.Vector3(-.5,0,-.5),new THREE.Vector3(.5,1,.5)):b;
 }
 function corner(w,p,candidates,box){
  let best=null;
  const targetY=w.floorLevel>0?w.floorDatumAt?.(p.x,p.z,'wall')?.height??
   w.heightAt(p.x,p.z)+w.floorLevel*(w.storeyHeight||2.6):p.y;
  // A 1st-floor wall must never hijack corner snapping while working on
  // the 2nd floor, even when both are close to the same screen cursor.
  candidates=candidates.filter(item=>{
   const story=item.entry.data?.storey;
   return Number.isInteger(story)?story===w.floorLevel:
    w.floorLevel===0||abs(item.bottom-targetY)<.35;
  }).flatMap(item=>(item.segments||[item]).map(line=>({...item,...line})));
  const maxReach=4.5;
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
   const a=candidates[i],b=candidates[j];
   if(a.entry===b.entry)continue;
   if(abs(a.bottom-b.bottom)>.12)continue;
   if(abs(a.dir.x*b.dir.z-a.dir.z*b.dir.x)<.27)continue;
   for(const ap of (a.tipOnly?[a.a]:[a.a,a.c]))
    for(const bp of (b.tipOnly?[b.a]:[b.a,b.c])){
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
  // For a NEW L-shaped module on the end of one existing wall, attach
  // the CORNER ARM TIP, not the L's middle pivot. Placing the pivot at the
  // old wall endpoint made the corner overlap up to 1.9m of the wall.
  if(!best&&(w.placementCategory==='corner'||w.placement==='corner')&&candidates.length){
   const root=w.ghost||w.assetCache?.get(w.placement)||w.makeBuiltin?.(w.placement);
   const arms=root?cornerArms(root,w.placement,'corner'):null;
   if(arms?.length){
    const scale=w.placementScale||1,cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
    let match=null;
    for(const wall of candidates.slice(0,10)){
     for(const endpoint of (wall.tipOnly?['a']:['a','c'])){
      const target=wall[endpoint];
      const direction=wall.dir.clone().multiplyScalar(endpoint==='a'?-1:1);
      for(const arm of arms){
       const socketOut=arm.tip.clone().sub(arm.pivot).setY(0).normalize();
       const yaw=angle(new THREE.Vector3(0,0,0),direction.clone().negate())-
        angle(new THREE.Vector3(0,0,0),socketOut);
       const rotatedTip=rotate(arm.tip,yaw).multiplyScalar(scale);
       const at=new THREE.Vector3(target.x-rotatedTip.x,
        wall.bottom-arm.tip.y*scale+(w.placementLift||0),target.z-rotatedTip.z);
       const center=at.clone().add(rotate(new THREE.Vector3(cx,0,cz),yaw).multiplyScalar(scale));
       const distance=distXZ(p,center);
       if(distance>4.5)continue;
       // Manual 90° turns choose among physically valid corner arms without
       // breaking their actual cap-to-cap alignment.
       const turn=Math.atan2(Math.sin(yaw-(w.placementRotation||0)*Math.PI/180),
        Math.cos(yaw-(w.placementRotation||0)*Math.PI/180));
       const score=distance+abs(turn)*.025;
       if(!match||score<match.score)match={at,yaw,score,reference:wall.entry.data.id};
      }
     }
    }
    if(match)return {position:match.at,
     rotation:((match.yaw*180/Math.PI)%360+360)%360,snapped:true,corner:true,
     edge:true,wallEnd:true,joinedTo:'corner-socket',reference:match.reference,
     category:w.placementCategory||'corner'};
   }
  }
  // A solitary wall end may also be a corner where the next wall isn't built yet.
  if(!best&&candidates.length){
   for(const entry of candidates.slice(0,10))
    for(const ep of (entry.tipOnly?[entry.a]:[entry.a,entry.c])){
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
  const old=best.wall,line=old.bestSegment||old;
  const delta=(w.edgeShift||0),t=clamp(old.projected.t+delta/Math.max(line.length,.001),0,1);
  const anchor=new THREE.Vector3(line.a.x+(line.c.x-line.a.x)*t,old.top,
   line.a.z+(line.c.z-line.a.z)*t);
  const majorX=(box.max.x-box.min.x)>=(box.max.z-box.min.z);
  let yaw=angle(line.a,line.c)+(majorX?0:Math.PI/2)+(w.placementRotation||0)*Math.PI/180;
  return {position:solvePivot(w,box,anchor,yaw,old.top),
   rotation:((yaw*180/Math.PI)%360+360)%360,snapped:true,stacked:true,edge:false,
   reference:old.entry.data.id,category:w.placementCategory||'wall',joinedTo:'stack'};
 }
 function currentDeckTop(w,p){
  const nominal=w.heightAt(p.x,p.z)+w.floorLevel*(w.storeyHeight||2.6);
  let best=null;
  for(const entry of w.objects||[]){
   if(catOf(w,entry)!=='foundation')continue;
   const story=entry.data?.storey;
   const root=entry.mesh;root.updateWorldMatrix(true,true);
   const box=BuildSnap.attrBounds(root);if(box.isEmpty())continue;
   const y=byLocal(root,0,box.max.y,0).y;
   if(story!==w.floorLevel&&(Number.isInteger(story)||abs(y-nominal)>1.25))continue;
   const local=p.clone().applyMatrix4(root.matrixWorld.clone().invert());
   if(local.x<box.min.x-.35||local.x>box.max.x+.35||
      local.z<box.min.z-.35||local.z>box.max.z+.35)continue;
   if(best===null||y>best)best=y;
  }
  return best;
 }
 function hasCurrentDeck(w,p){return currentDeckTop(w,p)!==null}

 function joinEnd(w,p,candidates,box,onlyCorner=false){
  const category=w.placementCategory||w.categoryForKind?.(w.placement)||'wall';
  if(!['wall','door','railing'].includes(category))return null;
  const majorX=box.max.x-box.min.x>=box.max.z-box.min.z;
  const main=majorX?'x':'z',cross=majorX?'z':'x';
  const mid=(box.min[cross]+box.max[cross])/2;
  const center=new THREE.Vector3((box.min.x+box.max.x)/2,0,(box.min.z+box.max.z)/2);
  const scale=w.placementScale||1;
  const half=(box.max[main]-box.min[main])*scale/2;
  const deckTop=w.floorLevel>0?currentDeckTop(w,p):null;
  let best=null;
  for(const old of candidates){
   const floor=old.entry.data?.storey;
   if(floor!==undefined&&floor!==null&&floor!==w.floorLevel)continue;
   if(deckTop!==null&&abs(old.bottom-deckTop)>.09)continue;
   const expected=w.floorLevel>0?w.heightAt(p.x,p.z)+w.floorLevel*(w.storeyHeight||2.6):
    w.mode==='playbuild'&&w.player?w.player.position.y-.85:p.y;
   if(floor==null&&abs(old.bottom-expected)>2.2)continue;
   for(const line of (old.segments||[old])){
   const baseline=angle(line.a,line.c)+(majorX?0:Math.PI/2)+(w.placementRotation||0)*Math.PI/180;
   for(const endpoint of (line.tipOnly?['a']:['a','c'])){
    const join=line[endpoint],inwards=line.dir.clone().multiplyScalar(endpoint==='a'?1:-1);
    for(const k of (onlyCorner?[1,3]:[0,1,2,3])){
     const yaw=baseline+k*Math.PI/2;
     for(const attachment of ['min','max']){
      const local=new THREE.Vector3();
      local[main]=box[attachment][main];local[cross]=mid;
      const delta=rotate(local,yaw).multiplyScalar(scale);
      const at=new THREE.Vector3(join.x-delta.x,old.bottom-box.min.y*scale+(w.placementLift||0),join.z-delta.z);
      const middle=at.clone().add(rotate(center,yaw).multiplyScalar(scale));
      const distance=distXZ(p,middle);
      if(distance>Math.max(1.85,Math.min(3.6,half+1.35)))continue;
      const outward=middle.clone().sub(join).setY(0).normalize();
      const dot=outward.dot(inwards);
      if(dot>.77)continue; // Do not return inside the already built wall.
      const perpendicular=abs(dot)<.38;
      if(onlyCorner&&!perpendicular)continue;
      const score=distance+(perpendicular?.09:0);
      if(!best||score<best.score)
       best={position:at,yaw,perpendicular,reference:old.entry.data.id,score};
     }
    }
   }
   }
  }
  if(!best)return null;
  return {position:best.position,rotation:((best.yaw*180/Math.PI)%360+360)%360,
   snapped:true,edge:true,wallEnd:true,wallCorner:best.perpendicular,
   joinedTo:best.perpendicular?'wall-corner':'wall-end',reference:best.reference,category};
 }
 function resolve(w,p){
  const cat=w.placementCategory||w.categoryForKind?.(w.placement)||'prop';
  const mode=w.joinMode||'auto';
  const isCorner=mode==='corner'||(mode==='auto'&&cat==='corner');
  const isStack=mode==='stack'||(mode==='auto'&&cat==='wall'&&w.floorLevel>0);
  const isEnd=mode==='auto'&&(['wall','door','railing'].includes(cat)||typeof BuildCurves!=='undefined'&&BuildCurves.isArc(w.placement));
  if(!isCorner&&!isStack&&!isEnd)return null;
  const walls=nearby(w,p),box=modelBounds(w);
  // Curved modules MUST join via physical end-cap sockets and tangent,
  // never via the rectangular bounds used for ordinary straight walls.
  const curved=typeof BuildCurves!=='undefined'&&BuildCurves.isArc(w.placement);
  const nearCurves=typeof BuildCurves!=='undefined'&&walls.some(x=>BuildCurves.isArc(x.entry.kind));
  if((curved||nearCurves)&&typeof BuildCurves!=='undefined'){
   const matched=BuildCurves.connect(w,p,walls,box);
   if(matched)return matched;
  }
  const straightWalls=nearCurves?walls.filter(x=>!BuildCurves.isArc(x.entry.kind)):walls;
  if(isEnd&&!curved){
   const end=joinEnd(w,p,straightWalls,box,false);
   if(end)return end;
  }
  if(mode==='corner'&&['wall','door'].includes(cat)&&!curved){
   const end=joinEnd(w,p,straightWalls,box,true);
   if(end)return end;
  }
  if(mode==='auto'&&isStack&&hasCurrentDeck(w,p))return null;
  const result=isCorner&&!curved?corner(w,p,straightWalls,box):isStack&&!curved?stack(w,p,straightWalls,box):null;
  if(result)return result;
  if(mode!=='auto')return {position:new THREE.Vector3(p.x,w.placementHeight(p.x,p.z),p.z),
   rotation:w.placementRotation||0,snapped:false,valid:false,category:cat,
   missingTarget:mode==='stack'?'Подойди к стене, на которую ставишь следующую':'Подойди к торцу стены или углу пола'};
  return null;
 }
 return {resolve,wallInfo,nearby,corner,stack,joinEnd,cornerArms,cornerSegments};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildJoin;
