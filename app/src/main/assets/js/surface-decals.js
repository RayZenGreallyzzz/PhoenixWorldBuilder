/* Phoenix Builder v2: non-destructive, world-aligned transparent PNG decals.
 * Decals are independent mesh overlays; never reassign base materials, UVs,
 * collision surfaces, source imported GLBs or existing wall cut geometry.
 * Triangles are CLIPPED against the artwork rectangle, so a projected
 * image follows the real roof/wall/floor, including cut-outs and openings.
 */
const SurfaceDecals=(()=>{
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const vec=a=>new THREE.Vector3(...a);
 const clean=raw=>{
  if(!raw||typeof raw!=='object')return null;
  const position=raw.position,normal=raw.normal;
  if(!Array.isArray(position)||position.length!==3||
     !position.every(Number.isFinite)||!Array.isArray(normal)||
     normal.length!==3||!normal.every(Number.isFinite))return null;
  const n=vec(normal);
  if(n.lengthSq()<.4)return null;
  if(typeof raw.imageId!=='string'||!raw.imageId.startsWith('texture:')||
     !Number.isInteger(raw.targetId))return null;
  return {id:String(raw.id||'').slice(0,60),
   imageId:raw.imageId.slice(0,110),targetId:raw.targetId,
   position:position.map(v=>clamp(v,-10000,10000)),
   normal:n.normalize().toArray(),
   width:clamp(Number(raw.width)||1,.1,100),
   height:clamp(Number(raw.height)||1,.1,100),
   rotation:clamp(Number(raw.rotation)||0,-360,360),
   opacity:clamp(Number(raw.opacity)||1,.05,1),
   room:raw.room===true};
 };
 const normalize=records=>(Array.isArray(records)?records:[]).slice(0,48)
  .map(clean).filter(Boolean);
 const basis=(normal,rotation=0)=>{
  const n=vec(normal).normalize();
  const right=Math.abs(n.y)>.9?new THREE.Vector3(1,0,0):
   new THREE.Vector3(0,1,0).cross(n).normalize();
  const up=n.clone().cross(right).normalize();
  const rad=rotation*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  return {normal:n,right:right.clone().multiplyScalar(c).addScaledVector(up,s),
   up:up.multiplyScalar(c).addScaledVector(right,-s)};
 };
 // Clip a triangle in *artwork coordinates*, interpolating 3D positions too.
 // Unlike a hovering quad, there is no geometry over doors and roof gaps.
 function clip(poly,axis,bound,positive){
  const inside=p=>positive?p[axis]>=bound-1e-7:p[axis]<=bound+1e-7;
  const result=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],
    ia=inside(a),ib=inside(b);
   if(ia)result.push(a);
   if(ia!==ib){
    const den=b[axis]-a[axis];
    if(Math.abs(den)<1e-9)continue;
    const t=clamp((bound-a[axis])/den,0,1);
    result.push({p:a.p.clone().lerp(b.p,t),
     u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t,
     d:a.d+(b.d-a.d)*t});
   }
  }
  return result;
 }
 function geometryFor(decal,entries,options={}){
  const spec=clean(decal);if(!spec)return null;
  const origin=vec(spec.position),{normal,right,up}=basis(spec.normal,spec.rotation);
  const coords=[],uvs=[],maxTriangles=options.maxTriangles||12000;
  const halfW=spec.width/2,halfH=spec.height/2;
  const depthLimit=spec.room?.085:.13;
  const source=(entries||[]).filter(entry=>entry?.root&&entry.root.visible!==false);
  for(const entry of source){
   if(coords.length/9>=maxTriangles)break;
   const root=entry.root;root.updateWorldMatrix(true,true);
   const box=new THREE.Box3().setFromObject(root);
   if(box.isEmpty()||box.distanceToPoint(origin)>Math.hypot(halfW,halfH)+.3)continue;
   root.traverse(mesh=>{
    if(coords.length/9>=maxTriangles||!mesh.isMesh||!mesh.visible||
      mesh.userData?.phoenixLODProxy||mesh.userData?.phoenixDecal||
      mesh.userData?.phoenixInsert||!mesh.geometry?.attributes?.position)return;
    const g=mesh.geometry,positions=g.getAttribute('position'),idx=g.index,
     count=idx?idx.count:positions.count,groups=g.groups||[],
     materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(count>600000)return;
    mesh.updateWorldMatrix(true,false);
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),
      ab=new THREE.Vector3(),ac=new THREE.Vector3(),face=new THREE.Vector3();
    for(let i=0;i+2<count&&coords.length/9<maxTriangles;i+=3){
     if(groups.length){
      const group=groups.find(x=>i>=x.start&&i<x.start+x.count);
      const mat=materials[group?.materialIndex||0];
      if(mat?.visible===false||mat?.opacity===0)continue;
     }
     const ai=idx?idx.getX(i):i,bi=idx?idx.getX(i+1):i+1,
      ci=idx?idx.getX(i+2):i+2;
     a.fromBufferAttribute(positions,ai).applyMatrix4(mesh.matrixWorld);
     b.fromBufferAttribute(positions,bi).applyMatrix4(mesh.matrixWorld);
     c.fromBufferAttribute(positions,ci).applyMatrix4(mesh.matrixWorld);
     face.copy(ab.subVectors(b,a)).cross(ac.subVectors(c,a)).normalize();
     // Built-in BoxGeometry and rebuilt wall openings may wind front triangles
     // in opposite directions. We select by the actual physical plane DEPTH,
     // not by arbitrary triangle winding, preserving genuine door holes.
     if(Math.abs(face.dot(normal))<.66)continue;
     const poly=[a,b,c].map(p=>{
      const delta=p.clone().sub(origin);
      return {p:p.clone(),u:delta.dot(right),v:delta.dot(up),
       d:delta.dot(normal)};
     });
     if(poly.some(x=>Math.abs(x.d)>depthLimit))continue;
     let clipped=poly;
     for(const [axis,bound,positive] of [
      ['u',-halfW,true],['u',halfW,false],
      ['v',-halfH,true],['v',halfH,false]]){
      if(!clipped.length)break;
      clipped=clip(clipped,axis,bound,positive);
     }
     if(clipped.length<3)continue;
     for(let j=1;j<clipped.length-1&&coords.length/9<maxTriangles;j++)
      for(const q of [clipped[0],clipped[j],clipped[j+1]]){
       const atop=q.p.clone().addScaledVector(normal,.003);
       coords.push(atop.x,atop.y,atop.z);
       uvs.push(clamp(q.u/spec.width+.5,0,1),
        clamp(q.v/spec.height+.5,0,1));
      }
    }
   });
  }
  if(!coords.length)return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.computeVertexNormals();g.computeBoundingSphere();
  return g;
 }
 function createMesh(decal,geometry,texture){
  if(!geometry||!texture)return null;
  const map=texture.clone();
  map.wrapS=map.wrapT=THREE.ClampToEdgeWrapping;
  map.flipY=false;map.needsUpdate=true;
  const material=new THREE.MeshBasicMaterial({map,transparent:true,
   opacity:decal.opacity??1,depthWrite:false,side:THREE.DoubleSide,
   polygonOffset:true,polygonOffsetFactor:-2});
  material.name='Phoenix translucent decal '+String(decal.id||'');
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Phoenix_Decal_'+String(decal.id||'');
  mesh.userData.phoenixDecal=true;
  mesh.frustumCulled=true;mesh.renderOrder=22;
  return mesh;
 }
 function dispose(mesh){
  if(!mesh)return;
  mesh.removeFromParent();
  mesh.geometry?.dispose();
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  for(const m of mats){m?.map?.dispose();m?.dispose()}
 }
 return {normalize,clean,basis,geometryFor,createMesh,dispose};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SurfaceDecals;
