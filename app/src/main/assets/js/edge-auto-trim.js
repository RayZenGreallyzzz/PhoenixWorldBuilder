/* Automatic wall-face trimming of floor modules.
 * Works with straight walls at any angle and built-in 90-degree corners.
 * An infinite clipping plane is considered ONLY when its physical wall
 * segment intersects the uncut slab footprint and crosses its area.
 * Curved/non-planar walls are deliberately not guessed.
 */
const EdgeAutoTrim=(()=>{
 'use strict';
 const EPS=1e-5;
 const dot=(a,b)=>a.x*b.x+a.z*b.z;
 const midpoint=(a,b)=>({x:(a.x+b.x)/2,z:(a.z+b.z)/2});
 function wallSegments(entries,storey){
  const segments=[];
  let skippedCurved=0;
  for(const entry of entries||[]){
   if(entry.category!=='wall'||entry.storey!==storey||!entry.root)continue;
   if(entry.kind==='arc90'||entry.kind==='arc180'){skippedCurved++;continue}
   entry.root.updateWorldMatrix(true,true);
   entry.root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes?.position||mesh.isSkinnedMesh)return;
    const g=mesh.geometry;
    if(!g.boundingBox)g.computeBoundingBox();
    const b=g.boundingBox;
    if(!b||b.isEmpty())return;
    const dx=b.max.x-b.min.x,dz=b.max.z-b.min.z,dy=b.max.y-b.min.y;
    const major=Math.max(dx,dz),minor=Math.min(dx,dz);
    // Reject roofs, decorative assets, curved walls and wide/multi-angled geometry.
    if(major<.3||dy<.3||minor>.9||major/Math.max(minor,.001)<2.2)return;
    const mid=b.getCenter(new THREE.Vector3()),xMajor=dx>=dz;
    const a=mid.clone(),c=mid.clone();
    if(xMajor){a.x=b.min.x;c.x=b.max.x}
    else{a.z=b.min.z;c.z=b.max.z}
    mesh.updateWorldMatrix(true,false);
    a.applyMatrix4(mesh.matrixWorld);c.applyMatrix4(mesh.matrixWorld);
    const p={x:a.x,z:a.z},q={x:c.x,z:c.z};
    const length=Math.hypot(q.x-p.x,q.z-p.z);
    if(length<EPS)return;
    const short0=mid.clone(),short1=mid.clone();
    if(xMajor){short0.z=b.min.z;short1.z=b.max.z}
    else{short0.x=b.min.x;short1.x=b.max.x}
    short0.applyMatrix4(mesh.matrixWorld);short1.applyMatrix4(mesh.matrixWorld);
    const thickness=Math.hypot(short0.x-short1.x,short0.z-short1.z);
    segments.push({a:p,b:q,length,thickness,id:entry.id,kind:entry.kind});
   });
  }
  return {segments,skippedCurved};
 }
 function footprint(root,bounds){
  if(!bounds||bounds.isEmpty())return null;
  root.updateWorldMatrix(true,true);
  const b=bounds,corners=[
   [b.min.x,b.min.z],[b.max.x,b.min.z],[b.max.x,b.max.z],[b.min.x,b.max.z]
  ];
  const world=corners.map(([x,z])=>{
   const v=new THREE.Vector3(x,0,z).applyMatrix4(root.matrixWorld);
   return {x:v.x,z:v.z};
  });
  const c=new THREE.Vector3((b.min.x+b.max.x)/2,0,(b.min.z+b.max.z)/2)
   .applyMatrix4(root.matrixWorld);
  return {world,center:{x:c.x,z:c.z},local:corners.map(([x,z])=>({x,z}))};
 }
 function resolve(tile,entries,sourceBounds,options={}){
  if(!tile?.root||!['floor'].includes(tile.category))
   return {ok:false,reason:'Для подрезки выбери деталь категории «Пол»'};
  const footprintData=footprint(tile.root,sourceBounds);
  if(!footprintData)return {ok:false,reason:'Не найдена геометрия детали'};
  const {segments,skippedCurved}=wallSegments(entries,tile.storey);
  if(!segments.length)return {ok:false,reason:'На этом этаже нет подходящих прямых стен или углов',skippedCurved};
  const center=footprintData.center;
  const roomCenter=segments.reduce((v,s)=>{
   const mid=midpoint(s.a,s.b);v.x+=mid.x;v.z+=mid.z;return v;
  },{x:0,z:0});
  roomCenter.x/=segments.length;roomCenter.z/=segments.length;
  const matrix=tile.root.matrixWorld.elements;
  let polygon=footprintData.local,cuts=[],used=[];
  // Nearby walls first; clipping each candidate reduces false positives.
  const candidates=segments.map(s=>{
   const tx=(s.b.x-s.a.x)/s.length,tz=(s.b.z-s.a.z)/s.length;
   const nx=-tz,nz=tx;
   const dist=nx*(center.x-s.a.x)+nz*(center.z-s.a.z);
   return {s,tx,tz,nx,nz,dist};
  }).sort((a,b)=>Math.abs(a.dist)-Math.abs(b.dist));
  for(const item of candidates){
   if(cuts.length>=12)break;
   const {s,tx,tz,nx,nz}=item;
   const p=footprintData.world;
   const along=p.map(v=>(v.x-s.a.x)*tx+(v.z-s.a.z)*tz);
   // Do not extend a short wall across distant slabs.
   if(Math.max(...along)<-.03||Math.min(...along)>s.length+.03)continue;
   let side=Math.sign(item.dist);
   if(Math.abs(item.dist)<Math.max(.035,s.thickness*.55)&&segments.length>=2){
    const interior=nx*(roomCenter.x-s.a.x)+nz*(roomCenter.z-s.a.z);
    if(Math.abs(interior)>.05)side=Math.sign(interior);
   }
   if(!side)side=1;
   const normal={x:nx*side,z:nz*side},half=s.thickness/2+(Number(options.gap)||0);
   const worldDistances=p.map(v=>dot(normal,{x:v.x-s.a.x,z:v.z-s.a.z}));
   if(Math.min(...worldDistances)>half-.003||Math.max(...worldDistances)<half+.002)continue;
   // Convert world-space plane to the selected item's unscaled local X/Z space.
   const x=normal.x*matrix[0]+normal.z*matrix[2],
    z=normal.x*matrix[8]+normal.z*matrix[10],norm=Math.hypot(x,z);
   if(norm<EPS)continue;
   const cut={nx:x/norm,nz:z/norm,
    offset:(half-normal.x*(matrix[12]-s.a.x)-normal.z*(matrix[14]-s.a.z))/norm};
   const clipped=FloorClip.clipHalfPlane(polygon,cut.nx,cut.nz,cut.offset);
   if(clipped.length<3||FloorClip.polygonArea(clipped)<.0005)continue;
   if(FloorClip.polygonArea(polygon)-FloorClip.polygonArea(clipped)<.001)continue;
   polygon=clipped;cuts.push(cut);used.push(s.id);
  }
  if(!cuts.length)return {ok:false,
   reason:'Стены не пересекают выбранную плиту: поставь плиту у края и повтори',skippedCurved};
  return {ok:true,cuts,used,skippedCurved,area:FloorClip.polygonArea(polygon)};
 }
 return {wallSegments,footprint,resolve};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=EdgeAutoTrim;
