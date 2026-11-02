/* Smart placement for user-imported floors. Three.js r140; offline. */
const BuildSnap=(()=>{
 const clamp=THREE.MathUtils.clamp;
 const boundsCache=new WeakMap();
 const structural=(cat)=>cat==='foundation'||cat==='ceiling';
 const edgable=(cat,kind)=>{
  if(['wall','door','stairs','railing'].includes(cat))return true;
  return /(?:rail|railing|fence|balustrade|перил|огражд|забор)/i.test(String(kind));
 };
 // Bounds depend on the actual geometry and relative child transforms.
 // A root-only WeakMap gives stale snaps after trim, bend, wall-thickness
 // and imported GLB edits. Signature check avoids rescanning stable geometry.
 const geometrySignature=(root)=>{
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),relative=new THREE.Matrix4(),parts=[];
  root.traverse(obj=>{
   if(!obj.isMesh||!obj.geometry?.attributes?.position)return;
   const geo=obj.geometry,position=geo.attributes.position;
   relative.multiplyMatrices(inverse,obj.matrixWorld);
   parts.push(geo.uuid,position.count,position.version,
    ...relative.elements.map(n=>Math.round(n*1e5)/1e5));
  });
  return parts.join('|');
 };
 const attrBounds=(root)=>{
  const signature=geometrySignature(root),cached=boundsCache.get(root);
  if(cached?.signature===signature)return cached.box.clone();
  const inv=root.matrixWorld.clone().invert();
  const result=new THREE.Box3().makeEmpty(),m=new THREE.Matrix4(),p=new THREE.Vector3();
  root.traverse(obj=>{
   if(!obj.isMesh||!obj.geometry?.attributes?.position)return;
   const geo=obj.geometry;if(!geo.boundingBox)geo.computeBoundingBox();
   if(!geo.boundingBox)return;
   m.multiplyMatrices(inv,obj.matrixWorld);
   const b=geo.boundingBox;
   for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
    p.set(x,y,z).applyMatrix4(m);result.expandByPoint(p);
   }
  });
  boundsCache.set(root,{signature,box:result.clone()});
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
  // Geometry-first vertical placement: ceiling/roof height comes only from
  // the transformed physical top of existing supports. No storey × height math.
  const roof=cat==='roof',scale=w.placementScale||1;
  const extentX=modelBox?.isEmpty()?1:(modelBox.max.x-modelBox.min.x)*scale/2;
  const extentZ=modelBox?.isEmpty()?1:(modelBox.max.z-modelBox.min.z)*scale/2;
  const radius=roof?Math.min(22,Math.max(2.4,Math.hypot(extentX,extentZ)+1.2)):3.5;
  const nearby=(s,margin=radius)=>areaDistance(s,p)<=margin;
  const foundations=[],walls=[],ceilings=[];
  for(const entry of w.objects||[]){
   if(entry===w.moveTarget)continue;
   const typ=kindOf(w,entry);
   if(!['foundation','wall','corner','door','railing','ceiling'].includes(typ))continue;
   const s=surface(entry);if(!s||!nearby(s,typ==='foundation'?radius+1:radius))continue;
   if(typ==='foundation')foundations.push(s);
   else if(typ==='ceiling')ceilings.push(s);
   else walls.push(s);
  }
  if(!foundations.length&&!walls.length&&!ceilings.length)return null;
  const cy=Number.isFinite(p.y)?p.y:null;
  const chooseWallBand=list=>{
   if(!list.length)return [];
   if(roof)return list.filter(s=>s.top>=Math.max(...list.map(x=>x.top))-.18);
   if(cy===null)return list;
   const delta=Math.min(...list.map(s=>Math.abs(s.bottom-cy)));
   return list.filter(s=>Math.abs(s.bottom-cy)<=delta+.22);
  };
  const chooseSurfaceBand=list=>{
   if(!list.length)return [];
   if(roof)return list.filter(s=>s.top>=Math.max(...list.map(x=>x.top))-.12);
   if(cy===null)return list;
   const delta=Math.min(...list.map(s=>Math.abs(s.top-cy)));
   return list.filter(s=>Math.abs(s.top-cy)<=delta+.16);
  };
  let support=[];
  if(roof){
   const all=[...walls,...ceilings,...foundations];
   const highest=Math.max(...all.map(s=>s.top));
   support=all.filter(s=>s.top>=highest-.18);
  }else if(walls.length)support=chooseWallBand(walls);
  else if(ceilings.length)support=chooseSurfaceBand(ceilings);
  else support=chooseSurfaceBand(foundations);
  if(!support.length)return null;
  const target=Math.max(...support.map(s=>s.top));
  let x=p.x,z=p.z;
  const supportFloor=support.find(s=>kindOf(w,s.entry)==='foundation');
  const base=supportFloor||(foundations.length?chooseSurfaceBand(foundations)[0]||foundations[0]:null);
  if(w.centerOverhead&&base){
   const center=worldCenter(base);x=center.x;z=center.z;
  }else if(w.centerOverhead&&support.length){
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
   anchor.x-=shift.x;anchor.z-=shift.z;
   anchor.y=(typeof BuildCore!=='undefined'?
    BuildCore.contactPivotY(modelBox.min.y,target,scale,0):
    target-modelBox.min.y*scale);
  }
  return {position:anchor,rotation:((yaw*180/Math.PI)%360+360)%360,
   snapped:true,overhead:true,edge:false,
   reference:support[0]?.entry.data.id,targetHeight:target,category:cat,
   supportCount:support.length,physicalContact:true};
 }
 // Extract the true straight sections of a slab's top perimeter.
 // Important for quarter-circle floors: the rectangle bounds are NOT its edge.
 function slabStraightEdges(root){
  if(!root)return [];
  root.updateWorldMatrix(true,true);
  const bounds=attrBounds(root);if(bounds.isEmpty())return [];
  const inverse=root.matrixWorld.clone().invert(),relative=new THREE.Matrix4();
  const vertex=new THREE.Vector3(),counts=new Map(),lookup=new Map();
  let processed=0;
  const key=q=>Math.round(q.x*1000)+','+Math.round(q.z*1000);
  root.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry?.attributes?.position)return;
   const attr=mesh.geometry.attributes.position;
   if(attr.count>90000||processed+attr.count>120000)return;
   processed+=attr.count;
   relative.multiplyMatrices(inverse,mesh.matrixWorld);
   const indices=mesh.geometry.index,triangles=indices?indices.count:attr.count;
   for(let i=0;i+2<triangles;i+=3){
    const ps=[];
    for(let j=0;j<3;j++){
     const index=indices?indices.getX(i+j):i+j;
     const q=vertex.fromBufferAttribute(attr,index).applyMatrix4(relative).clone();
     ps.push(q);
    }
    if(!ps.every(q=>Math.abs(q.y-bounds.max.y)<.004))continue;
    for(const [j,k] of [[0,1],[1,2],[2,0]]){
     const a=ps[j],b=ps[k],ka=key(a),kb=key(b);
     if(ka===kb)continue;
     const id=ka<kb?ka+'|'+kb:kb+'|'+ka;
     counts.set(id,(counts.get(id)||0)+1);
     lookup.set(ka,a);lookup.set(kb,b);
    }
   }
  });
  const segments=[];
  for(const [id,count] of counts){
   if(count!==1)continue;
   const [a,b]=id.split('|').map(x=>lookup.get(x));
   const length=Math.hypot(a.x-b.x,a.z-b.z);
   if(length>.3)segments.push({a,b,length});
  }
  if(!segments.length)return [];
  // Discard arc tessellation chords in favor of real straight radial ends.
  const longest=Math.max(...segments.map(s=>s.length));
  return segments.filter(s=>s.length>=Math.max(.3,longest*.35));
 }
 function physicalSlabEdge(ref,p){
  const edges=slabStraightEdges(ref.root),bounds=ref.box;
  if(!edges.length)return nearestEdge(ref,p);
  const centroid=new THREE.Vector3((bounds.min.x+bounds.max.x)/2,0,
   (bounds.min.z+bounds.max.z)/2).applyMatrix4(ref.root.matrixWorld);
  let best=null;
  for(const edge of edges){
   const a=worldPoint(ref.root,edge.a.x,bounds.max.y,edge.a.z);
   const b=worldPoint(ref.root,edge.b.x,bounds.max.y,edge.b.z);
   const tangent=b.clone().sub(a).setY(0).normalize();
   const delta=p.clone().sub(a).setY(0);
   const len=a.distanceTo(b),t=clamp(delta.dot(tangent),0,len);
   const at=a.clone().addScaledVector(tangent,t);
   const distance=Math.hypot(at.x-p.x,at.z-p.z);
   const normal=new THREE.Vector3(-tangent.z,0,tangent.x);
   const middle=a.clone().add(b).multiplyScalar(.5);
   if(normal.dot(centroid.clone().sub(middle))>0)normal.negate();
   if(!best||distance<best.distance)
    best={distance,point:at,tangent,normal,first:a,last:b,length:len};
  }
  return best||nearestEdge(ref,p);
 }
 function radialFloorSnap(w,p,model,box,ref,edge,sourceThickness,scale){
  const sections=slabStraightEdges(model);
  if(!sections.length||!edge?.normal)return null;
  const xs=(box.min.x+box.max.x)/2,zs=(box.min.z+box.max.z)/2;
  const centre=new THREE.Vector3(xs,0,zs);
  // For a quarter-circle the true centroid is in the sector, not the
  // centre of its bounding rectangle. Prefer the source material interior
  // sampled from its top triangles when available.
  const arcFloor=w.placement==='arcFloor90'||model.userData?.pwbModuleShape==='arcFloor90';
  const interior=arcFloor?new THREE.Vector3(.85,0,.85):centre;
  const theta=v=>Math.atan2(-v.z,v.x);
  const sectionsSorted=[...sections].sort((a,b)=>b.length-a.length);
  let best=null;
  const targetLength=edge.first.distanceTo(edge.last);
  const thickness=ref.top-ref.bottom;
  let factor=1;
  if(w.autoThickness!==false){
   const ratio=thickness/(sourceThickness*scale);
   if(ratio>=.15&&ratio<=6)factor=ratio;
  }
  for(const section of sectionsSorted){
   const sourceLength=section.length*scale;
   if(sourceLength>targetLength+.035)continue;
   const middle=section.a.clone().add(section.b).multiplyScalar(.5);
   const tangent=section.b.clone().sub(section.a).setY(0).normalize();
   const inside=new THREE.Vector3(-tangent.z,0,tangent.x);
   if(inside.dot(interior.clone().sub(middle))<0)inside.negate();
   const yaw=theta(edge.normal)-theta(inside);
   const t=Math.max(sourceLength/2,Math.min(targetLength-sourceLength/2,
    edge.point.clone().sub(edge.first).dot(edge.tangent)+(w.edgeShift||0)));
   const dest=edge.first.clone().addScaledVector(edge.tangent,t);
   const rotatedMiddle=rotated(middle,yaw).multiplyScalar(scale);
   const position=new THREE.Vector3(dest.x-rotatedMiddle.x,
    ref.top-box.max.y*scale*factor+(w.placementLift||0),
    dest.z-rotatedMiddle.z);
   const snappedMid=new THREE.Vector3(position.x+rotatedMiddle.x,ref.top,
    position.z+rotatedMiddle.z);
   const d=Math.hypot(p.x-snappedMid.x,p.z-snappedMid.z);
   const score=d+Math.abs(yaw)*.015;
   if(!best||score<best.score)best={score,position,rotation:((yaw*180/Math.PI)%360+360)%360,
    snapped:true,slab:true,edge:true,physicalSlabEdge:true,category:'foundation',
    reference:ref.entry.data.id,thicknessY:factor,referenceThickness:thickness};
  }
  if(!best)return null;
  const {score,...result}=best;
  return result;
 }
 function matchSlab(w,p,cat,model,box){
  // Floors share a top plane and, optionally, thickness without scaling X or Z.
  // 3D cut-corner geometry is kept intact: only the parent group's Y scale changes.
  if(cat!=='foundation'||!model||box.isEmpty())return null;
  const sourceThickness=box.max.y-box.min.y;
  const scale=w.placementScale||1;
  if(!Number.isFinite(sourceThickness)||sourceThickness<.012)return null;
  const possible=[];
  for(const entry of w.objects){
   if(kindOf(w,entry)!=='foundation')continue;
   const ref=surface(entry);if(!ref)continue;
   const physicalThickness=ref.top-ref.bottom;
   if(!Number.isFinite(physicalThickness)||physicalThickness<.025||physicalThickness>1.5)continue;
   const edge=physicalSlabEdge(ref,p),distance=edge.distance;
   if(distance>Math.max(3.5,Math.min(6,Math.max(box.max.x-box.min.x,box.max.z-box.min.z)*scale)))continue;
   const vertical=Number.isFinite(p.y)?Math.abs(ref.top-p.y):0;
   // Adjacent slab snapping is only valid on the same physical Y plane.
   // A lower floor must never hijack a new slab intended for a ceiling above.
   if(Number.isFinite(p.y)&&vertical>.75)continue;
   possible.push({ref,edge,distance,thickness:physicalThickness,
    score:distance+vertical*.8});
  }
  possible.sort((a,b)=>a.score-b.score);
  if(!possible.length)return null;
  const choice=possible[0],ref=choice.ref,edge=choice.edge,normal=edge.normal;
  // A rounded/cut corner has no rectangular outside edge. Dock its real
  // straight radial boundary to a real edge of the existing floor.
  const actual=slabStraightEdges(model);
  const wide=box.max.x-box.min.x,deep=box.max.z-box.min.z;
  const topEdges=actual.filter(e=>e.length>.4);
  const shouldPhysical=w.placement==='arcFloor90'||(topEdges.length>=2&&
   topEdges.length>2&&(topEdges.length!==4||topEdges.some(e=>
    Math.abs(e.length-wide)>.03&&Math.abs(e.length-deep)>.03)));
  if(shouldPhysical){
   const joined=radialFloorSnap(w,p,model,box,ref,edge,sourceThickness,scale);
   if(joined)return joined;
   // Never pretend a rounded edge is rectangular when a physical edge fails.
   return null;
  }
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
 // Compare the actual 3D silhouette at both roof section edges before
 // permitting an automatic seam. A sloped panel with mismatched end heights
 // is NOT a continuous roof, even when both axis-aligned boxes touch.
 function roofEndProfile(root,side,scaleXYZ){
  root.updateWorldMatrix(true,true);
  const local=attrBounds(root);if(local.isEmpty())return null;
  const targetZ=side<0?local.min.z:local.max.z;
  const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4();
  const point=new THREE.Vector3(),values=new Set();
  let total=0,tooLarge=false;
  root.traverse(mesh=>{
   if(tooLarge||!mesh.isMesh||!mesh.geometry?.attributes?.position)return;
   const positions=mesh.geometry.attributes.position;
   total+=positions.count;
   if(total>200000){tooLarge=true;return;}
   matrix.multiplyMatrices(inverse,mesh.matrixWorld);
   for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i).applyMatrix4(matrix);
    if(Math.abs(point.z-targetZ)>.003)continue;
    const x=Math.round(point.x*scaleXYZ[0]*1000)/1000;
    const y=Math.round(point.y*scaleXYZ[1]*1000)/1000;
    values.add(x+':'+y);
   }
  });
  if(tooLarge||values.size<2)return null;
  return [...values].sort();
 }
 const roofEdgesMeet=(newRoot,oldRoot,side,newXYZ,oldXYZ)=>{
  const before=roofEndProfile(oldRoot,side,oldXYZ);
  const after=roofEndProfile(newRoot,-side,newXYZ);
  return !!before&&!!after&&before.length===after.length&&
   before.every((value,i)=>value===after[i]);
 };
 // Roof section -> roof section along the roof's local longitudinal Z axis.
 // Only the same source module and matching transverse dimensions may join;
 // the snap does not alter pitch, height, or shape of either section.
 function roofSection(w,p,model,modelBox){
  if(!model||!modelBox||modelBox.isEmpty()||!w.placement)return null;
  const scale=w.placementScale||1,axes=w.placementAxes||{};
  const width=(modelBox.max.x-modelBox.min.x)*scale;
  const depth=(modelBox.max.z-modelBox.min.z)*scale;
  const newXYZ=[scale*(axes.x||1),scale*(axes.y||1),scale*(axes.z||1)];
  const centerNew=new THREE.Vector3((modelBox.min.x+modelBox.max.x)/2,0,
   (modelBox.min.z+modelBox.max.z)/2);
  if(width<.2||depth<.2)return null;
  const possible=[];
  for(const old of w.objects||[]){
   if(old.kind!==w.placement||old===w.moveTarget)continue;
   const oldCategory=kindOf(w,old);if(oldCategory!=='roof')continue;
   const base=attrBounds(old.mesh);if(base.isEmpty())continue;
   const oldScale=old.data.scale||1;
   const oldWidth=(base.max.x-base.min.x)*oldScale*(old.data.dimensionScale?.x||1);
   const oldDepth=(base.max.z-base.min.z)*oldScale*(old.data.dimensionScale?.z||1);
   if(Math.abs(oldWidth-width)>.003||Math.abs(oldDepth-depth)>.003||
    Math.abs(old.mesh.scale.y-newXYZ[1])>.003)continue;
   // Roof tiles with incompatible edge heights would leave open seams.
   const oldXYZ=[old.mesh.scale.x,old.mesh.scale.y,old.mesh.scale.z];
   const yaw=(old.data.rot||0)*Math.PI/180;
   const rotation=((w.placementRotation||0)%360+360)%360;
   if(rotation!==0)continue; // manual rotation opts out of automatic section linking
   old.mesh.updateMatrixWorld(true);
   const oldCenter=new THREE.Vector3((base.min.x+base.max.x)/2,0,
    (base.min.z+base.max.z)/2).applyMatrix4(old.mesh.matrixWorld);
   const newRotated=rotated(centerNew,yaw).multiplyScalar(scale);
   const direction=rotated(new THREE.Vector3(0,0,1),yaw);
   for(const side of [-1,1]){
    if(!roofEdgesMeet(model,old.mesh,side,newXYZ,oldXYZ))continue;
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
  const rawY=Number.isFinite(p.y)?p.y:w.heightAt(p.x,p.z);
  // Grid quantization belongs to magnetic placement only.
  const raw=useSnap?new THREE.Vector3(Math.round(p.x/w.snap)*w.snap,rawY,Math.round(p.z/w.snap)*w.snap):new THREE.Vector3(p.x,rawY,p.z);
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
  // Support is selected by the actual pointed physical surface, never by a
  // floor number. This lets 12 cm floors, 40 cm slabs, 1.9 m or 4.1 m walls
  // chain naturally: every new bottom touches the previous real top.
  const support=[];
  for(const entry of w.objects){
   const entryCat=entry.data.category||w.categoryForKind?.(entry.kind)||entry.kind;
   if(!structural(entryCat))continue;
   const s=surface(entry);if(!s)continue;
   const local=p.clone().applyMatrix4(s.inv),bb=s.box;
   const inside=local.x>=bb.min.x-.2&&local.x<=bb.max.x+.2&&
    local.z>=bb.min.z-.2&&local.z<=bb.max.z+.2;
   const edge=nearestEdge(s,p);
   const eligible=aligned?edge.distance<=3.5:inside;
   if(!eligible)continue;
   const vertical=Number.isFinite(p.y)?Math.abs(s.top-p.y):0;
   const grade=(aligned?edge.distance:0)+vertical*.8;
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
 return {resolve,attrBounds,geometrySignature,nearestEdge,matchSlab,dimensionBounds,roofSection};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildSnap;
