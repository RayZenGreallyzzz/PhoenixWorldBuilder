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
   space:raw.space==='local'?'local':'world',
   position:position.map(v=>clamp(v,-10000,10000)),
   normal:n.normalize().toArray(),
   width:clamp(Number(raw.width)||1,.01,10000),
   height:clamp(Number(raw.height)||1,.01,10000),
   rotation:clamp(Number(raw.rotation)||0,-360,360),
   opacity:clamp(Number(raw.opacity)||1,.05,1),
   room:raw.room===true,
   ...(raw.room===true&&raw.fitRoom===true?{fitRoom:true}:{}),
   ...(['face','wall','corner'].includes(raw.fit)?{fit:raw.fit}:{})};
 };
 const normalize=records=>(Array.isArray(records)?records:[])
  .map(clean).filter(Boolean);
 const basis=(normal,rotation=0)=>{
  const n=vec(normal).normalize();
  const reference=Math.abs(n.y)>.55?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,1,0);
  const right=reference.cross(n).normalize();
  const up=n.clone().cross(right).normalize();
  const rad=rotation*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  return {normal:n,right:right.clone().multiplyScalar(c).addScaledVector(up,s),
   up:up.multiplyScalar(c).addScaledVector(right,-s)};
 };
 function fitFace(target,entries,position,normal,rotation,aspect,wallGroup){
  const origin=vec(position),frame=basis(normal);
  const projected=[];
  for(const entry of entries){
   const root=entry.root;
   root.updateWorldMatrix(true,true);
   const box=new THREE.Box3().setFromObject(root);
   if(box.isEmpty())continue;
   const center=box.getCenter(new THREE.Vector3()).sub(origin);
   const half=box.getSize(new THREE.Vector3()).multiplyScalar(.5);
   const radius=Math.abs(frame.normal.x)*half.x+Math.abs(frame.normal.y)*half.y+
    Math.abs(frame.normal.z)*half.z;
   if(Math.abs(center.dot(frame.normal))>radius+.035)continue;
   const rect={entry,minU:Infinity,maxU:-Infinity,minV:Infinity,maxV:-Infinity};
   const p=new THREE.Vector3();
   root.traverse(mesh=>{
    const positions=mesh.geometry?.attributes?.position;
    if(!mesh.isMesh||!mesh.visible||!positions||positions.count>350000||
      mesh.userData?.phoenixInsert||mesh.userData?.phoenixLODProxy)return;
    for(let i=0;i<positions.count;i++){
     p.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).sub(origin);
     if(Math.abs(p.dot(frame.normal))>.035)continue;
     const u=p.dot(frame.right),v=p.dot(frame.up);
     rect.minU=Math.min(rect.minU,u);rect.maxU=Math.max(rect.maxU,u);
     rect.minV=Math.min(rect.minV,v);rect.maxV=Math.max(rect.maxV,v);
    }
   });
   if(rect.maxU-rect.minU>.05&&rect.maxV-rect.minV>.05)projected.push(rect);
  }
  const first=projected.find(item=>item.entry===target);
  if(!first)return null;
  const group=[first];
  if(wallGroup){
   const seen=new Set(group);
   for(let i=0;i<group.length;i++){
    const a=group[i];
    for(const b of projected){
     if(seen.has(b)||Math.max(a.minU-b.maxU,b.minU-a.maxU)>.05||
      Math.abs(a.minV-b.minV)>.08||Math.abs(a.maxV-b.maxV)>.08)continue;
     seen.add(b);group.push(b);
    }
   }
  }
  const minU=Math.min(...group.map(x=>x.minU)),maxU=Math.max(...group.map(x=>x.maxU));
  const minV=Math.max(...group.map(x=>x.minV)),maxV=Math.min(...group.map(x=>x.maxV));
  const radians=rotation*Math.PI/180;
  const c=Math.abs(Math.cos(radians)),s=Math.abs(Math.sin(radians));
  const height=Math.min((maxU-minU)/(aspect*c+s),(maxV-minV)/(aspect*s+c));
  if(!Number.isFinite(height)||height<=0)return null;
  origin.addScaledVector(frame.right,(minU+maxU)/2).addScaledVector(frame.up,(minV+maxV)/2);
  return {position:origin.toArray(),width:height*aspect,height,entries:group.map(x=>x.entry)};
 }
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
  const source=(entries||[]).filter(entry=>entry?.root&&entry.root.visible!==false);
  for(const entry of source){
   if(coords.length/9>=maxTriangles)break;
   const root=entry.root;root.updateWorldMatrix(true,true);
   const box=new THREE.Box3().setFromObject(root);
   if(box.isEmpty()||box.distanceToPoint(origin)>Math.hypot(halfW,halfH)+.3)continue;
   const depthLimit=spec.room?Math.max(.001,Math.min(.085,(box.max.y-box.min.y)*.49)):
    options.depthLimit??.13;
   const depthOffset=spec.room?box.max.y-origin.y:0;
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
     if(poly.some(x=>Math.abs(x.d-depthOffset)>depthLimit))continue;
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
        clamp(.5-q.v/spec.height,0,1));
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
 // New opt-in UV33 mode: unwrap a rectangular PNG across nearby aligned
 // wall faces and, when possible, one real 90-degree corner. Legacy modes
 // continue to use geometryFor() verbatim; no base wall is modified.
 function geometryForCorner(raw,host,allWalls){
  const spec=clean(raw);
  if(!spec||!host?.root)return null;
  const origin=vec(spec.position),frame=basis(spec.normal),axis=frame.right;
  const up=new THREE.Vector3(0,1,0),n=frame.normal;
  // The 90-degree unwrap is defined for upright walls only. On sloping
  // roofs/floors this mode falls back to the existing safe plane projector.
  if(Math.abs(n.y)>.16)return geometryFor(spec,[host]);
  const reach=Math.hypot(spec.width,spec.height)/2+.6;
  const nearby=(allWalls||[]).filter(e=>e?.root&&e.root.visible!==false&&
   new THREE.Box3().setFromObject(e.root).distanceToPoint(origin)<reach+1);
  if(!nearby.includes(host))nearby.unshift(host);
  const hostBox=new THREE.Box3().setFromObject(host.root);
  const boxCorners=[];
  for(const x of [hostBox.min.x,hostBox.max.x])
   for(const y of [hostBox.min.y,hostBox.max.y])
    for(const z of [hostBox.min.z,hostBox.max.z])
     boxCorners.push(new THREE.Vector3(x,y,z).sub(origin).dot(axis));
  const hostMin=Math.min(...boxCorners),hostMax=Math.max(...boxCorners);
  // Candidate co-planar pieces share image coordinates even when their sizes
  // or top/bottom heights differ. This deliberately does not use fitFace().
  let best=null;
  for(const entry of nearby){
   entry.root.updateWorldMatrix(true,true);
   entry.root.traverse(mesh=>{
    const g=mesh.geometry,att=g?.attributes?.position;
    if(!mesh.isMesh||!mesh.visible||!att||att.count>24000||
     mesh.userData?.phoenixInsert||mesh.userData?.phoenixLODProxy)return;
    const idx=g.index,count=idx?idx.count:att.count;
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    const ab=new THREE.Vector3(),ac=new THREE.Vector3(),f=new THREE.Vector3();
    for(let i=0;i+2<count;i+=3){
     a.fromBufferAttribute(att,idx?idx.getX(i):i).applyMatrix4(mesh.matrixWorld);
     b.fromBufferAttribute(att,idx?idx.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);
     c.fromBufferAttribute(att,idx?idx.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
     f.subVectors(b,a);ab.subVectors(c,a);f.cross(ab).normalize();
     if(Math.abs(f.y)>.15||Math.abs(f.dot(n))>.22)continue;
     // An orthogonal side plane intersects the selected wall plane at u=seam.
     const den=f.dot(axis);
     if(Math.abs(den)<.87)continue;
     const seamU=f.dot(a.clone().sub(origin))/den;
     if(Math.abs(seamU)>spec.width/2+.25)continue;
     // A separate perpendicular wall may only unwrap at the host's edge.
     // Crossing another wall in the middle is not a corner.
     if(entry!==host&&Math.min(Math.abs(seamU-hostMin),
      Math.abs(seamU-hostMax))>.36)continue;
     const seam=origin.clone().addScaledVector(axis,seamU);
     const vMin=Math.min(a.y,b.y,c.y),vMax=Math.max(a.y,b.y,c.y);
     if(origin.y+spec.height/2<vMin-.3||origin.y-spec.height/2>vMax+.3)continue;
     // Only faces which physically touch the host plane near the corner.
     const edgeDistance=Math.min(Math.abs(a.clone().sub(seam).dot(n)),
      Math.abs(b.clone().sub(seam).dot(n)),Math.abs(c.clone().sub(seam).dot(n)));
     if(edgeDistance>.35)continue;
     const side=seamU>=0?1:-1;
     const outward=axis.clone().multiplyScalar(side);
     if(f.dot(outward)<.74)continue; // exterior-facing neighbour, not opposite side
     const tangent=up.clone().cross(f).normalize();
     const projections=[a,b,c].map(p=>p.clone().sub(seam).dot(tangent));
     const sgn=Math.abs(Math.min(...projections))>Math.max(...projections)?-1:1;
     const away=tangent.multiplyScalar(sgn);
     const maxAway=Math.max(...[a,b,c].map(p=>p.clone().sub(seam).dot(away)));
     if(maxAway<.35)continue; // ignore narrow wall thickness end caps
     // Prefer the physically closest seam. Crossing a distant edge is wrong.
     const score=Math.abs(seamU)+edgeDistance*3;
     if(!best||score<best.score)best={entry,normal:f.clone(),seam,
      seamU,side,away,score,planePoint:a.clone()};
    }
   });
  }
  // Drawing on two straight aligned walls: existing projector can handle
  // multiple entries without demanding equal wall dimensions.
  if(!best)return geometryFor(spec,nearby,{depthLimit:.045});
  const coords=[],uvs=[],halfW=spec.width/2,halfH=spec.height/2;
  const r=spec.rotation*Math.PI/180,cos=Math.cos(r),sin=Math.sin(r);
  const maxTriangles=12000;
  for(const entry of nearby){
   if(coords.length/9>=maxTriangles)break;
   entry.root.updateWorldMatrix(true,true);
   entry.root.traverse(mesh=>{
    if(coords.length/9>=maxTriangles||!mesh.isMesh||!mesh.visible||
     mesh.userData?.phoenixInsert||mesh.userData?.phoenixLODProxy||
     mesh.userData?.phoenixDecal||!mesh.geometry?.attributes?.position)return;
    const g=mesh.geometry,positions=g.getAttribute('position'),idx=g.index,
     count=idx?idx.count:positions.count,groups=g.groups||[],
     mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(count>600000)return;
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    const ab=new THREE.Vector3(),ac=new THREE.Vector3(),fn=new THREE.Vector3();
    for(let i=0;i+2<count&&coords.length/9<maxTriangles;i+=3){
     if(groups.length){const grp=groups.find(x=>i>=x.start&&i<x.start+x.count);
      if(mats[grp?.materialIndex||0]?.visible===false)continue}
     a.fromBufferAttribute(positions,idx?idx.getX(i):i).applyMatrix4(mesh.matrixWorld);
     b.fromBufferAttribute(positions,idx?idx.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);
     c.fromBufferAttribute(positions,idx?idx.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
     fn.subVectors(b,a).cross(ac.subVectors(c,a)).normalize();
     const base=Math.abs(fn.dot(n))>.74;
     const bend=!base&&Math.abs(fn.dot(best.normal))>.9&&
      Math.abs(best.normal.dot(a.clone().sub(best.planePoint)))<.045;
     if(!base&&!bend)continue;
     const toUV=p=>{
      const delta=p.clone().sub(origin),v=delta.dot(up);
      let u,d,offset;
      if(base){u=delta.dot(axis);d=delta.dot(n);offset=n}
      else{const rel=p.clone().sub(best.seam);
       const along=rel.dot(best.away);
       // Project full triangles before clipping; a triangle may straddle the
       // seam and must not disappear because one vertex is slightly behind it.
       u=best.seamU+best.side*along;d=p.clone().sub(best.planePoint).dot(best.normal);
       offset=best.normal;
      }
      return {p:p.clone(),u:u*cos+v*sin,v:v*cos-u*sin,d,offset};
     };
     const poly=[a,b,c].map(toUV);
     if(poly.some(p=>!p||Math.abs(p.d)>(base?.045:.05)))continue;
     let clipped=poly;
     for(const [ax,bound,positive] of [
      ['u',-halfW,true],['u',halfW,false],
      ['v',-halfH,true],['v',halfH,false]]){
      if(!clipped.length)break;
      clipped=clip(clipped,ax,bound,positive);
     }
     if(clipped.length<3)continue;
     for(let j=1;j<clipped.length-1&&coords.length/9<maxTriangles;j++)
      for(const q of [clipped[0],clipped[j],clipped[j+1]]){
       const offset=base?n:best.normal;
       const pos=q.p.clone().addScaledVector(offset,.003);
       coords.push(pos.x,pos.y,pos.z);
       uvs.push(clamp(q.u/spec.width+.5,0,1),clamp(.5-q.v/spec.height,0,1));
      }
    }
   });
  }
  if(!coords.length)return geometryFor(spec,nearby,{depthLimit:.045});
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.computeVertexNormals();g.computeBoundingSphere();
  return g;
 }

 // Exact physical-size decal on the built-in quarter/half circle walls.
 // Unwrap by arc LENGTH, rather than reject most curved triangles because
 // they are not coplanar with the finger-touch tangent. Uses only host mesh
 // faces, so genuine window and door openings remain empty.
 function geometryForArc(raw,host){
  const spec=clean(raw);
  if(!spec||!host?.root)return null;
  const origin=vec(spec.position),root=host.root;
  root.updateWorldMatrix(true,true);
  const centre=root.localToWorld(new THREE.Vector3(0,0,0));
  const d0=origin.clone().sub(centre),radius=Math.hypot(d0.x,d0.z);
  if(radius<.2)return geometryFor(spec,[host]);
  const frame=basis(spec.normal),axis=frame.right;
  const start=Math.atan2(d0.z,d0.x);
  const angularTangent=new THREE.Vector3(-Math.sin(start),0,Math.cos(start));
  const sense=Math.sign(angularTangent.dot(axis))||1;
  // Pick the ACTUAL touched shell (inner/outer) by its radial coordinate
  // in the wall's local space. Some built-in arc meshes have reversed face
  // winding, so geometric triangle normals cannot identify the touched side.
  const tapLocal=root.worldToLocal(origin.clone());
  const tapRadius=Math.hypot(tapLocal.x,tapLocal.z);
  const side=tapRadius>=2?1:-1;
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(root.matrixWorld);
  const rot=spec.rotation*Math.PI/180,cos=Math.cos(rot),sin=Math.sin(rot);
  const halfW=spec.width/2,halfH=spec.height/2;
  const coords=[],uvs=[],maxTriangles=12000;
  root.traverse(mesh=>{
   if(coords.length/9>=maxTriangles||!mesh.isMesh||!mesh.visible||
      mesh.userData?.phoenixLODProxy||mesh.userData?.phoenixInsert||
      mesh.userData?.phoenixDecal||!mesh.geometry?.attributes?.position)return;
   const g=mesh.geometry,pos=g.attributes.position,idx=g.index,count=idx?idx.count:pos.count;
   if(count>600000)return;
   mesh.updateWorldMatrix(true,false);
   const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
   const ab=new THREE.Vector3(),ac=new THREE.Vector3(),n=new THREE.Vector3();
   for(let i=0;i+2<count&&coords.length/9<maxTriangles;i+=3){
    a.fromBufferAttribute(pos,idx?idx.getX(i):i).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos,idx?idx.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos,idx?idx.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
    n.copy(ab.subVectors(b,a)).cross(ac.subVectors(c,a)).normalize();
    const midpoint=a.clone().add(b).add(c).multiplyScalar(1/3);
    const localMid=root.worldToLocal(midpoint);
    const surfaceSide=Math.hypot(localMid.x,localMid.z)>=2?1:-1;
    const radial=new THREE.Vector3(localMid.x,0,localMid.z).normalize()
     .applyMatrix3(normalMatrix).normalize();
    // The mesh's triangle winding is not guaranteed. Pick the physical shell
    // reached by the finger, and reject upper/lower planes and end caps.
    if(surfaceSide!==side||Math.abs(n.y)>.35||Math.abs(n.dot(radial))<.65)continue;
    const poly=[a,b,c].map(p=>{
     const delta=p.clone().sub(centre);
     const theta=Math.atan2(delta.z,delta.x);
     // shortest wrapped angle relative to tap; valid across +/- PI boundary.
     const wrapped=Math.atan2(Math.sin(theta-start),Math.cos(theta-start));
     const u=wrapped*radius*sense,v=p.y-origin.y;
     return {p:p.clone(),u:u*cos+v*sin,v:v*cos-u*sin};
    });
    let clipped=poly;
    for(const [ax,bound,positive] of [
     ['u',-halfW,true],['u',halfW,false],
     ['v',-halfH,true],['v',halfH,false]]){
     if(!clipped.length)break;
     clipped=clip(clipped,ax,bound,positive);
    }
    if(clipped.length<3)continue;
    for(let j=1;j<clipped.length-1&&coords.length/9<maxTriangles;j++)
     for(const q of [clipped[0],clipped[j],clipped[j+1]]){
      const radialAt=root.worldToLocal(q.p.clone());radialAt.y=0;
      radialAt.normalize().applyMatrix3(normalMatrix).normalize();
      const p=q.p.clone().addScaledVector(radialAt,side*.003);
      coords.push(p.x,p.y,p.z);
      uvs.push(clamp(q.u/spec.width+.5,0,1),clamp(.5-q.v/spec.height,0,1));
     }
   }
  });
  if(!coords.length)return geometryFor(spec,[host]);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.computeVertexNormals();g.computeBoundingSphere();
  return g;
 }
 return {normalize,clean,basis,fitFace,geometryFor,geometryForCorner,geometryForArc,createMesh,dispose};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SurfaceDecals;
