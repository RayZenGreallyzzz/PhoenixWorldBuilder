/* Smart placement for user-imported floors. Three.js r140; offline. */
const BuildSnap=(()=>{
 const clamp=THREE.MathUtils.clamp;
 const boundsCache=new WeakMap();
 // A root can keep the exact same transform while a building edit replaces
 // the vertices/geometry. Cache the geometry revision and child transforms,
 // not just the root reference, or snapping uses pre-edit dimensions.
 const geometryRevision=root=>{
  const result=[];
  root.traverse(obj=>{
   const geo=obj.geometry,pos=geo?.attributes?.position;
   if(!obj.isMesh||!pos)return;
   result.push(geo.uuid,pos.version,pos.count);
   result.push(...obj.matrix.elements);
  });
  return result;
 };
 const geometrySignature=root=>geometryRevision(root).join('|');
 const structural=(cat)=>cat==='foundation'||cat==='ceiling';
 const edgable=(cat,kind)=>{
  if(['wall','door','stairs','railing'].includes(cat))return true;
  return /(?:rail|railing|fence|balustrade|перил|огражд|забор)/i.test(String(kind));
 };
 const attrBounds=(root)=>{
  root.updateWorldMatrix(true,true);
  const signature=geometrySignature(root);
  const cached=boundsCache.get(root);
  if(cached&&cached.signature===signature)return cached.box.clone();
  const inv=root.matrixWorld.clone().invert();
  const result=new THREE.Box3().makeEmpty(),m=new THREE.Matrix4(),p=new THREE.Vector3();
  root.traverse(obj=>{
   if(!obj.isMesh||!obj.geometry?.attributes?.position)return;
   const geo=obj.geometry;
   // A position buffer may have changed without replacing the geometry.
   // A stale geometry.boundingBox must not survive such an edit.
   geo.computeBoundingBox();
   if(!geo.boundingBox)return;
   m.multiplyMatrices(inv,obj.matrixWorld);
   const b=geo.boundingBox;
   for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
    p.set(x,y,z).applyMatrix4(m);result.expandByPoint(p);
   }
  });
  if(!result.isEmpty())boundsCache.set(root,{signature,box:result.clone()});
  return result;
 };
 // Resolve with physical per-axis dimensions without modifying the imported
 // GLB's vertices. All legacy uniform-scale models retain identical bounds.
 const dimensionBounds=(box,w)=>{
  if(!box||box.isEmpty())return box;
  const axes=w.placementAxes||{},x=Number(axes.x)||1,y=Number(axes.y)||1,z=Number(axes.z)||1;
  const b=box.clone();
  b.min.multiply(new THREE.Vector3(x,y,z));
  b.max.multiply(new THREE.Vector3(x,y,z));
  return b;
 };
 const worldPoint=(root,x,y,z)=>new THREE.Vector3(x,y,z).applyMatrix4(root.matrixWorld);
 const surface=(entry)=>{
  const root=entry.mesh,box=attrBounds(root);
  if(box.isEmpty())return null;
  root.updateWorldMatrix(true,true);
  const inv=root.matrixWorld.clone().invert();
  return {entry,root,box,inv,top:worldPoint(root,0,box.max.y,0).y,bottom:worldPoint(root,0,box.min.y,0).y};
 };
 const planeNormal=(root,nx,nz)=>{
  const p=new THREE.Vector3(nx,0,nz).transformDirection(root.matrixWorld);
  p.y=0;return p.normalize();
 };
 const rotated=(v,rad)=>new THREE.Vector3(v.x*Math.cos(rad)+v.z*Math.sin(rad),0,-v.x*Math.sin(rad)+v.z*Math.cos(rad));
 function nearestEdge(s,target,dim){
  const local=target.clone().applyMatrix4(s.inv),b=s.box;
  const edges=[
   {fixed:'x',val:b.min.x,along:'z',min:b.min.z,max:b.max.z,n:[-1,0]},
   {fixed:'x',val:b.max.x,along:'z',min:b.min.z,max:b.max.z,n:[1,0]},
   {fixed:'z',val:b.min.z,along:'x',min:b.min.x,max:b.max.x,n:[0,-1]},
   {fixed:'z',val:b.max.z,along:'x',min:b.min.x,max:b.max.x,n:[0,1]}
  ];
  const best={distance:Infinity};
  for(const side of edges){
   const axis=side.along,loc=local[axis],a=clamp(loc,side.min,side.max);
   const at=side.fixed==='x'?worldPoint(s.root,side.val,b.max.y,a):worldPoint(s.root,a,b.max.y,side.val);
   const dx=at.x-target.x,dz=at.z-target.z,dist=Math.hypot(dx,dz);
   if(dist>=best.distance)continue;
   const tangentLocal=side.along==='x'?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1);
   const tangent=tangentLocal.transformDirection(s.root.matrixWorld);tangent.y=0;tangent.normalize();
   const normal=planeNormal(s.root,side.n[0],side.n[1]);
   const p0=side.fixed==='x'?worldPoint(s.root,side.val,b.max.y,side.min):worldPoint(s.root,side.min,b.max.y,side.val);
   const p1=side.fixed==='x'?worldPoint(s.root,side.val,b.max.y,side.max):worldPoint(s.root,side.max,b.max.y,side.val);
   Object.assign(best,{distance:dist,point:at,tangent,normal,first:p0,last:p1,side});
  }
  return best;
 }

 const kindOf=(w,entry)=>entry.data?.category||w.categoryForKind?.(entry.kind)||entry.kind;
 const areaDistance=(s,p,margin=0)=>{
  const v=p.clone().applyMatrix4(s.inv),b=s.box;
  const dx=Math.max(0,b.min.x-v.x,v.x-b.max.x),dz=Math.max(0,b.min.z-v.z,v.z-b.max.z);
  return Math.hypot(dx,dz);
 };
 const worldCenter=(s)=>{
  const b=s.box;
  return worldPoint(s.root,(b.min.x+b.max.x)/2,b.max.y,(b.min.z+b.max.z)/2);
 };
 const localFrameYaw=(root)=>{
  const axis=new THREE.Vector3(1,0,0).transformDirection(root.matrixWorld);
  axis.y=0;axis.normalize();
  return Math.atan2(-axis.z,axis.x);
 };
 const storyOf=(entry)=>Number.isInteger(entry.data?.storey)?entry.data.storey:null;
 function resolveOverhead(w,p,cat,model,modelBox){
  // Roofs span walls; the cursor can be many metres from every bearing wall.
  // Detect all supports intersecting the intended roof footprint, not just
  // those within the old 1.5m radius of the character/cursor.
  const storyHeight=w.storeyHeight||2.6,nominal=w.heightAt(p.x,p.z)+w.floorLevel*storyHeight;
  const roof=cat==='roof',scale=w.placementScale||1;
  const extentX=modelBox?.isEmpty()?1:(modelBox.max.x-modelBox.min.x)*scale/2;
  const extentZ=modelBox?.isEmpty()?1:(modelBox.max.z-modelBox.min.z)*scale/2;
  const radius=roof?Math.min(22,Math.max(2.4,Math.hypot(extentX,extentZ)+1.2)):3.5;
  const validStorey=entry=>{
   const story=storyOf(entry);
   return story===null||story===w.floorLevel;
  };
  const nearby=(s,margin=radius)=>areaDistance(s,p)<=margin;
  const foundations=[],walls=[],ceilings=[];
  for(const entry of w.objects||[]){
   if(entry===w.moveTarget||!validStorey(entry))continue;
   const typ=kindOf(w,entry);
   if(!['foundation','wall','corner','door','ceiling'].includes(typ))continue;
   const s=surface(entry);if(!s||!nearby(s,typ==='foundation'?radius+1:radius))continue;
   if(storyOf(entry)===null&&Math.abs(s.bottom-nominal)>Math.max(1.8,storyHeight*.65)&&
    Math.abs(s.top-nominal)>Math.max(1.8,storyHeight*.65))continue;
   if(typ==='foundation')foundations.push(s);
   else if(typ==='ceiling')ceilings.push(s);
   else walls.push(s);
  }
  const orderedBase=foundations.map(s=>({s,d:areaDistance(s,p),
   delta:Math.abs(s.top-nominal)})).sort((a,b)=>a.d-b.d+a.delta*.1-b.delta*.1);
  const base=orderedBase[0]?.s||null;
  const baseY=base?.top??(walls.length?Math.min(...walls.map(s=>s.bottom)):nominal);
  const validWalls=walls.filter(s=>s.top>baseY+.35&&
   Math.abs(s.bottom-baseY)<Math.max(.4,storyHeight*.25));
  const validCeilings=ceilings.filter(s=>s.top>=baseY-.1&&s.top<=baseY+Math.max(9,storyHeight*2));
  if(!base&&!validWalls.length&&!validCeilings.length)return null;
  // Prefer the highest compatible top, preserving real GLB heights instead of
  // placing a roof at the nominal building level with a visible gap.
  let target=baseY+storyHeight;
  if(validWalls.length)target=Math.max(...validWalls.map(s=>s.top));
  if(roof&&validCeilings.length)target=Math.max(target,...validCeilings.map(s=>s.top));
  if(!validWalls.length&&validCeilings.length)target=Math.max(...validCeilings.map(s=>s.top));
  if(!validWalls.length&&!validCeilings.length&&!base)return null;
  let x=p.x,z=p.z;
  const support=validCeilings.length&&roof?validCeilings:validWalls.length?validWalls:base?[base]:[];
  if(w.centerOverhead&&base){
   // Preserve the user's explicit "center above the chosen floor" option.
   // On custom rotated GLB decks this is more stable than averaging walls.
   const center=worldCenter(base);x=center.x;z=center.z;
  }else if(w.centerOverhead&&support.length){
   // Without a floor, center between the load-bearing walls of the room.
   const centers=support.map(s=>worldCenter(s));
   x=(Math.min(...centers.map(s=>s.x))+Math.max(...centers.map(s=>s.x)))/2;
   z=(Math.min(...centers.map(s=>s.z))+Math.max(...centers.map(s=>s.z)))/2;
  }
  const orientation=base||support[0];
  const yaw=(orientation?localFrameYaw(orientation.root):0)+
   (w.placementRotation||0)*Math.PI/180;
  const anchor=new THREE.Vector3(x,target,z);
  if(model&&!modelBox.isEmpty()){
   const middle=new THREE.Vector3((modelBox.min.x+modelBox.max.x)/2,0,
    (modelBox.min.z+modelBox.max.z)/2);
   const shift=rotated(middle,yaw).multiplyScalar(scale);
   anchor.x-=shift.x;anchor.z-=shift.z;anchor.y-=modelBox.min.y*scale;
  }
  return {position:anchor,rotation:((yaw*180/Math.PI)%360+360)%360,
   snapped:true,overhead:true,edge:false,
   reference:base?.entry.data.id||support[0]?.entry.data.id,
   targetHeight:target,category:cat,supportCount:support.length};
 }
 function matchSlab(w,p,cat,model,box){
  // Floors share a top plane and, optionally, thickness without scaling X or Z.
  // 3D cut-corner geometry is kept intact: only the parent group's Y scale changes.
  if(cat!=='foundation'||!model||box.isEmpty())return null;
  const baseLevel=w.floorLevel||0;
  const sourceThickness=box.max.y-box.min.y;
  const scale=w.placementScale||1;
  if(!Number.isFinite(sourceThickness)||sourceThickness<.012)return null;
  const possible=[];
  for(const entry of w.objects){
   if(kindOf(w,entry)!=='foundation')continue;
   const tagged=storyOf(entry);
   if(tagged!==null&&tagged!==baseLevel)continue;
   const ref=surface(entry);if(!ref)continue;
   const physicalThickness=ref.top-ref.bottom;
   if(!Number.isFinite(physicalThickness)||physicalThickness<.025||physicalThickness>1.5)continue;
   const edge=nearestEdge(ref,p),distance=edge.distance;
   if(distance>Math.max(3.5,Math.min(6,Math.max(box.max.x-box.min.x,box.max.z-box.min.z)*scale)))continue;
   const nominal=w.heightAt(p.x,p.z)+baseLevel*(w.storeyHeight||2.6);
   // Reject different floors in tall buildings, but accept raised non-standard decks.
   const playerTop=w.mode==='playbuild'&&w.player?w.player.position.y-.85:nominal;
   const delta=Math.min(Math.abs(ref.top-nominal),Math.abs(ref.top-playerTop));
   if(tagged===null&&delta>3.4)continue;
   possible.push({ref,edge,distance,thickness:physicalThickness,
    score:distance+(tagged===baseLevel?-2:0)+delta*.1});
  }
  possible.sort((a,b)=>a.score-b.score);
  if(!possible.length)return null;
  const choice=possible[0],ref=choice.ref,edge=choice.edge,normal=edge.normal;
  const yaw=(w.placementRotation||0)*Math.PI/180;
  const xx=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const zz=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
  const width=(box.max.x-box.min.x)*scale,depth=(box.max.z-box.min.z)*scale;
  const extent=.5*(Math.abs(xx.dot(normal))*width+Math.abs(zz.dot(normal))*depth);
  // Lock modular floors to whole edge intervals. Previously the cursor's
  // arbitrary projection was used as the tile centre, so moving the character
  // by half a tile produced half-overlapping slabs. Undo made that especially
  // obvious when the nearest reference edge changed.
  const edgeLength=edge.first.distanceTo(edge.last);
  const tangentSpan=Math.max(.001,
   Math.abs(xx.dot(edge.tangent))*width+Math.abs(zz.dot(edge.tangent))*depth);
  const slots=Math.max(1,Math.floor(edgeLength/tangentSpan+1e-4));
  const firstCenter=edgeLength*.5-(slots-1)*tangentSpan*.5;
  const projected=edge.point.clone().sub(edge.first).dot(edge.tangent);
  const slot=clamp(Math.round((projected-firstCenter)/tangentSpan),0,slots-1);
  const along=firstCenter+slot*tangentSpan;
  const point=edge.first.clone().addScaledVector(edge.tangent,along)
   .addScaledVector(normal,extent);
  // Explicit adjustment remains available in 25 cm increments.
  point.addScaledVector(edge.tangent,w.edgeShift||0);
  const center=rotated(new THREE.Vector3((box.min.x+box.max.x)/2,0,(box.min.z+box.max.z)/2),yaw).multiplyScalar(scale);
  point.x-=center.x;point.z-=center.z;
  let factor=1;
  if(w.autoThickness!==false){
   const match=choice.thickness/(sourceThickness*scale);
   // Do not flatten highly sculpted or accidentally miscategorized objects.
   if(match>=.15&&match<=6)factor=match;
  }
  point.y=ref.top-box.max.y*scale*factor+(w.placementLift||0);
  return {position:point,rotation:(w.placementRotation||0),snapped:true,slab:true,edge:true,
   reference:ref.entry.data.id,category:cat,thicknessY:factor,referenceThickness:choice.thickness};
 }
 // Roof section -> roof section along the roof's local longitudinal Z axis.
 // Only the same source module and matching transverse dimensions may join;
 // the snap does not alter pitch, height, or shape of either section.
 function roofSection(w,p,model,modelBox){
  if(!model||!modelBox||modelBox.isEmpty()||!w.placement)return null;
  const scale=w.placementScale||1,axes=w.placementAxes||{};
  const width=(modelBox.max.x-modelBox.min.x)*scale;
  const depth=(modelBox.max.z-modelBox.min.z)*scale;
  const centerNew=new THREE.Vector3((modelBox.min.x+modelBox.max.x)/2,0,
   (modelBox.min.z+modelBox.max.z)/2);
  if(width<.2||depth<.2)return null;
  const possible=[];
  for(const old of w.objects||[]){
   if(old.kind!==w.placement||old===w.moveTarget)continue;
   if(storyOf(old)!==null&&storyOf(old)!==w.floorLevel)continue;
   const oldCategory=kindOf(w,old);if(oldCategory!=='roof')continue;
   const base=attrBounds(old.mesh);if(base.isEmpty())continue;
   const oldScale=old.data.scale||1;
   const oldWidth=(base.max.x-base.min.x)*oldScale*(old.data.dimensionScale?.x||1);
   const oldDepth=(base.max.z-base.min.z)*oldScale*(old.data.dimensionScale?.z||1);
   if(Math.abs(oldWidth-width)>.08||Math.abs(old.mesh.scale.y-model.scale.y)>.08)continue;
   const yaw=(old.data.rot||0)*Math.PI/180;
   const rotation=((w.placementRotation||0)%360+360)%360;
   if(rotation!==0)continue; // manual rotation opts out of automatic section linking
   old.mesh.updateMatrixWorld(true);
   const oldCenter=new THREE.Vector3((base.min.x+base.max.x)/2,0,
    (base.min.z+base.max.z)/2).applyMatrix4(old.mesh.matrixWorld);
   const newRotated=rotated(centerNew,yaw).multiplyScalar(scale);
   const direction=rotated(new THREE.Vector3(0,0,1),yaw);
   for(const side of [-1,1]){
    const desired=oldCenter.clone().addScaledVector(direction,side*(oldDepth+depth)/2);
    const position=new THREE.Vector3(desired.x-newRotated.x,
     old.mesh.position.y,desired.z-newRotated.z);
    const distance=Math.hypot(desired.x-p.x,desired.z-p.z);
    if(distance<=Math.max(1.15,Math.min(2.5,depth*.75)))
     possible.push({position,rotation:((yaw*180/Math.PI)%360+360)%360,
      snapped:true,roofSection:true,reference:old.data.id,category:'roof',distance});
   }
  }
  possible.sort((a,b)=>a.distance-b.distance);
  if(!possible.length)return null;
  const {distance,...result}=possible[0];
  return result;
 }
  function resolve(w,p){
  const kind=w.placement||'',cat=w.placementCategory||w.categoryForKind?.(kind)||'prop';
  const aligned=edgable(cat,kind),useSnap=w.smartSnap!==false;
  const raw=new THREE.Vector3(Math.round(p.x/w.snap)*w.snap,w.placementHeight(p.x,p.z),Math.round(p.z/w.snap)*w.snap);
  const basic={position:raw,rotation:w.placementRotation||0,snapped:false,edge:false,reference:null,category:cat};
  const model=w.ghost||w.makeBuiltin(kind)||w.assetCache?.get(kind);
  const modelBox=model?dimensionBounds(attrBounds(model),w):new THREE.Box3().makeEmpty();
  // GLB origins are often at the mesh centre rather than the sole. The
  // selected storey represents the contact plane, not the GLB pivot.
  if(!modelBox.isEmpty()&&['foundation','wall','corner','door','railing'].includes(cat))
   basic.position.y-=modelBox.min.y*(w.placementScale||1);
  const lifted=out=>{
   out.position.y+=(w.placementLift||0);
   return out;
  };
  if(cat==='foundation'&&useSnap&&w.objects.length){
   const match=matchSlab(w,p,cat,model,modelBox);
   if(match)return match;
  }
  // Roofs and ceilings use the actual wall tops, slab thickness and storey datum.
  if(cat==='roof'||cat==='ceiling'){
   if(cat==='roof'&&useSnap&&w.objects.length){
    const section=roofSection(w,p,model,modelBox);
    if(section)return lifted(section);
   }
   if(useSnap&&w.objects.length){
    const overhead=resolveOverhead(w,p,cat,model,modelBox);
    if(overhead)return lifted(overhead);
   }
   if(!modelBox.isEmpty())basic.position.y-=modelBox.min.y*(w.placementScale||1);
   return lifted(basic);
  }
  if(!useSnap||!w.objects.length)return lifted(basic);
  // A floor is chosen from actual transformed geometry, not the global 2 m grid.
  const refY=w.floorLevel>0?w.heightAt(p.x,p.z)+w.floorLevel*(w.storeyHeight||2.6):
   w.mode==='playbuild'&&w.player?.visible!==false?w.player.position.y-.85:p.y;
  const support=[];
  for(const entry of w.objects){
   const entryCat=entry.data.category||w.categoryForKind?.(entry.kind)||entry.kind;
   if(!structural(entryCat))continue;
   // Existing slabs on other levels must not hijack the placement preview.
   if(storyOf(entry)!==null&&storyOf(entry)!==w.floorLevel &&
     !(entryCat==='ceiling'&&storyOf(entry)===w.floorLevel-1))continue;
   const s=surface(entry);if(!s)continue;
   const delta=Math.abs(s.top-refY);
   // Do not snap the ground floor to a completely different storey.
   if(delta>3.8&&storyOf(entry)!==w.floorLevel&&
    !(entryCat==='ceiling'&&storyOf(entry)===w.floorLevel-1))continue;
   const local=p.clone().applyMatrix4(s.inv),b=s.box;
   const inside=local.x>=b.min.x-.2&&local.x<=b.max.x+.2&&local.z>=b.min.z-.2&&local.z<=b.max.z+.2;
   const edge=nearestEdge(s,p);
   const eligible=aligned?edge.distance<=3.5:inside;
   if(!eligible)continue;
   const grade=(aligned?edge.distance:Math.abs(s.top-p.y)*.06)+delta*.3-
    (storyOf(entry)===w.floorLevel?10:0);
   support.push({entry,s,edge,grade});
  }
  support.sort((a,b)=>a.grade-b.grade);
  if(!support.length)return lifted(basic);
  const chosen=support[0],floor=chosen.s;
  let anchor=chosen.edge.point.clone(),yaw=(w.placementRotation||0)*Math.PI/180;
  if(aligned){
   // Walls/railings present their local X axis along the floor edge.
   const t=chosen.edge.tangent,n=chosen.edge.normal;
   const align=cat==='stairs'?Math.atan2(-n.x,-n.z):Math.atan2(-t.z,t.x);
   yaw+=align;
   const width=modelBox.isEmpty()?0:(cat==='stairs'?modelBox.max.z-modelBox.min.z:modelBox.max.x-modelBox.min.x)*w.placementScale;
   const p0=chosen.edge.first,p1=chosen.edge.last;
   const len=p0.distanceTo(p1),v=anchor.clone().sub(p0).dot(t);
   // Keep wide walls centred when they exceed the edge length.
   const safeHalf=Math.min(len/2,Math.max(0,width/2));
   const distance=clamp(v+(w.edgeShift||0),safeHalf,len-safeHalf);
   anchor=p0.clone().addScaledVector(t,distance);
   if(cat==='stairs'){
    // High end faces inwards. The first step stays outside the platform.
    const high=modelBox.isEmpty()?1:(modelBox.max.z+modelBox.min.z)/2;
    anchor.addScaledVector(n,Math.max(0,(modelBox.max.z-high)*w.placementScale));
   }
  }else{
   anchor=new THREE.Vector3(p.x,floor.top,p.z);
  }
  const scale=w.placementScale||1;
  if(model&&!modelBox.isEmpty()){
   const centerX=(modelBox.min.x+modelBox.max.x)/2,centerZ=(modelBox.min.z+modelBox.max.z)/2;
   const centerShift=rotated(new THREE.Vector3(centerX,0,centerZ),yaw).multiplyScalar(scale);
   anchor.x-=centerShift.x;anchor.z-=centerShift.z;
   if(cat==='stairs')anchor.y-=modelBox.max.y*scale;
   else anchor.y-=modelBox.min.y*scale;
  }
  // Walls, doors and staircases join the top surface of the imported platform.
  const degrees=((yaw*180/Math.PI)%360+360)%360;
  return lifted({position:anchor,rotation:degrees,snapped:true,edge:aligned,reference:chosen.entry.data.id,category:cat});
 }
 return {resolve,attrBounds,nearestEdge,matchSlab,dimensionBounds,roofSection,geometrySignature};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildSnap;
