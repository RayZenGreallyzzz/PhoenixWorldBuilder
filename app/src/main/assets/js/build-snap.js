/* Smart placement for user-imported floors. Three.js r140; offline. */
const BuildSnap=(()=>{
 const clamp=THREE.MathUtils.clamp;
 const boundsCache=new WeakMap();
 const structural=(cat)=>cat==='foundation'||cat==='ceiling';
 const edgable=(cat,kind)=>{
  if(['wall','door','stairs','railing'].includes(cat))return true;
  return /(?:rail|railing|fence|balustrade|перил|огражд|забор)/i.test(String(kind));
 };
 const attrBounds=(root)=>{
  if(boundsCache.has(root))return boundsCache.get(root).clone();
  root.updateWorldMatrix(true,true);
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
  if(!result.isEmpty())boundsCache.set(root,result.clone());
  return result;
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
  const storyHeight=w.storeyHeight||2.6,ground=w.heightAt(p.x,p.z),nominal=ground+w.floorLevel*storyHeight;
  const foot=w.mode==='playbuild'&&w.floorLevel===0&&w.player?
   w.player.position.y-.85:nominal;
  const candidates=[];
  for(const entry of w.objects){
   if(kindOf(w,entry)!=='foundation')continue;
   if(storyOf(entry)!==null&&storyOf(entry)!==w.floorLevel)continue;
   const s=surface(entry);if(!s)continue;
   const d=areaDistance(s,p);
   if(d>1.3)continue;
   const vertical=Math.min(Math.abs(s.top-nominal),Math.abs(s.top-foot));
   // Older projects may have elevated decks without an assigned storey.
   if(storyOf(entry)===null&&vertical>4.5)continue;
   candidates.push({s,score:d+vertical*.25});
  }
  candidates.sort((a,b)=>a.score-b.score);
  let base=candidates[0]?.s||null,baseY=base?base.top:nominal;
  let walls=[],ceilings=[];
  for(const entry of w.objects){
   const typ=kindOf(w,entry);
   if(!['wall','door','ceiling'].includes(typ))continue;
   if(storyOf(entry)!==null&&storyOf(entry)!==w.floorLevel)continue;
   const s=surface(entry);if(!s)continue;
   const proximity=base?areaDistance(base,worldCenter(s)):areaDistance(s,p);
   const near=base?proximity<=1.5:proximity<=4;
   if(!near)continue;
   // Do not borrow a roof or a wall belonging to another vertical storey.
   if(typ==='ceiling'){
    if(s.top>=baseY+.3&&s.top<=baseY+8)ceilings.push(s);
   }else if((storyOf(entry)===w.floorLevel||Math.abs(s.bottom-baseY)<=Math.max(1.7,storyHeight*.55))&&
     s.top>baseY+.65&&s.top<baseY+9){
    walls.push(s);
   }
  }
  // A wall is a measured height reference. Do not force it to the catalogue's 2.6 m preset.
  let target=baseY+storyHeight;
  if(walls.length)target=Math.max(...walls.map(s=>s.top));
  if(cat==='roof'&&ceilings.length)target=Math.max(target,...ceilings.map(s=>s.top));
  if(!base&&!walls.length&&!ceilings.length)return null;
  let x=p.x,z=p.z;
  if(base&&w.centerOverhead){
   const center=worldCenter(base);x=center.x;z=center.z;
  }
  let yaw=(base?localFrameYaw(base.root):0)+(w.placementRotation||0)*Math.PI/180;
  let anchor=new THREE.Vector3(x,target,z);
  if(model&&!modelBox.isEmpty()){
   const centerX=(modelBox.min.x+modelBox.max.x)/2,centerZ=(modelBox.min.z+modelBox.max.z)/2;
   const centerShift=rotated(new THREE.Vector3(centerX,0,centerZ),yaw).multiplyScalar(w.placementScale||1);
   anchor.x-=centerShift.x;anchor.z-=centerShift.z;
   anchor.y-=modelBox.min.y*(w.placementScale||1);
  }
  return {position:anchor,rotation:((yaw*180/Math.PI)%360+360)%360,
   snapped:true,overhead:true,edge:false,
   reference:base?.entry.data.id||walls[0]?.entry.data.id||ceilings[0]?.entry.data.id,
   targetHeight:target,category:cat};
 }
 function resolve(w,p){
  const kind=w.placement||'',cat=w.placementCategory||w.categoryForKind?.(kind)||'prop';
  const aligned=edgable(cat,kind),useSnap=w.smartSnap!==false;
  const raw=new THREE.Vector3(Math.round(p.x/w.snap)*w.snap,w.placementHeight(p.x,p.z),Math.round(p.z/w.snap)*w.snap);
  const basic={position:raw,rotation:w.placementRotation||0,snapped:false,edge:false,reference:null,category:cat};
  const model=w.ghost||w.makeBuiltin(kind)||w.assetCache?.get(kind);
  const modelBox=model?attrBounds(model):new THREE.Box3().makeEmpty();
  const lifted=out=>{
   out.position.y+=(w.placementLift||0);
   return out;
  };
  // Roofs and ceilings use the actual wall tops, slab thickness and storey datum.
  if(cat==='roof'||cat==='ceiling'){
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
 return {resolve,attrBounds,nearestEdge};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildSnap;
