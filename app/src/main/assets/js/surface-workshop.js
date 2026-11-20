/* Phoenix Mesh Workshop surface projection for Phoenix Builder (offline Three r140).
 * UV is rebuilt per placed INSTANCE; never alter GLB templates or source meshes.
 * Real geometric UV travels with the mesh and exports directly to GLB 2.0:
 * no runtime-only shader trick or undocumented glTF extension required.
 */
const SurfaceWorkshop=(()=>{
 'use strict';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const modes=['repeat','tile','module','joined','source','seamless'];
 const number=(v,def,min,max)=>{
  const n=Number(v);return v!==null&&v!==undefined&&v!==''&&Number.isFinite(n)?
   clamp(n,min,max):def;
 };
 const settings=raw=>{
  const d=raw||{};
  return {mapping:modes.includes(d.mapping)?d.mapping:'repeat',
   tileMeters:number(d.tileMeters,1,.05,100),
   imageScale:number(d.imageScale,1,.1,10),
   offsetU:number(d.offsetU,0,-1000,1000),
   offsetV:number(d.offsetV,0,-1000,1000),
   rotation:number(d.rotation,0,-360,360),
   roughness:number(d.roughness,.9,0,1),
   metalness:number(d.metalness,0,0,1),
   relief:number(d.relief,0,0,2),
   applyFrames:d.applyFrames===true,
   region:Array.isArray(d.region)&&d.region.length===4&&
    d.region.every(v=>typeof v==='number'&&Number.isFinite(v))&&
    d.region[2]-d.region[0]>.001&&d.region[3]-d.region[1]>.001?
    d.region.map(Number):null};
 };
 // Calculate the true cumulative physical length along an elliptical arc.
 function curveLengths(root,kind){
  if(kind!=='arc90'&&kind!=='arc180')return null;
  root.updateWorldMatrix(true,true);
  const angle=kind==='arc90'?Math.PI/2:Math.PI,
   steps=128,dist=[0],vec=new THREE.Vector3();
  let prev=null;
  for(let i=0;i<=steps;i++){
   const theta=angle*i/steps;
   const p=vec.set(2*Math.cos(theta),0,2*Math.sin(theta))
    .clone().applyMatrix4(root.matrixWorld);
   if(i)dist.push(dist[i-1]+p.distanceTo(prev));
   prev=p;
  }
  return {length:dist[steps],at(theta){
   const s=clamp(theta/angle*steps,0,steps),i=Math.min(steps-1,Math.floor(s));
   return dist[i]+(dist[i+1]-dist[i])*(s-i);
  }};
 }
 const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
 const paddedImages=new WeakMap();
 function singleImageTexture(texture,background='#ffffff'){
  const image=texture?.image;
  if(!image?.width||!image?.height||typeof document==='undefined')return texture;
  const variants=paddedImages.get(texture)||new Map();
  if(variants.has(background))return variants.get(background);
  const canvas=document.createElement('canvas'),pad=2;
  const scale=Math.min(1,(4096-pad*2)/Math.max(image.width,image.height));
  const w=Math.max(1,Math.round(image.width*scale));
  const h=Math.max(1,Math.round(image.height*scale));
  canvas.width=w+pad*2;canvas.height=h+pad*2;
  const ctx=canvas.getContext('2d');
  if(!ctx?.drawImage)return texture;
  try{
   ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(image,pad,pad,w,h);
  }catch(err){return texture}
  const result=new THREE.CanvasTexture(canvas);
  result.flipY=false;result.encoding=texture.encoding;
  result.wrapS=result.wrapT=THREE.ClampToEdgeWrapping;
  result.userData.phoenixImageInset=[pad/canvas.width,pad/canvas.height];
  result.userData.phoenixImageAspect=image.width/image.height;
  variants.set(background,result);paddedImages.set(texture,variants);
  return result;
 }
 // World-space UV keeps real tiles equally sized on flat walls and corners.
 // Arc sides use physical walk-length rather than a new [0,1] map per triangle.
 function projectLegacy(root,mesh,source,raw,kind=''){
  const V=()=>new THREE.Vector3();
  if(!source?.attributes?.position)return null;
  const spec=settings(raw);
  const mode=spec.mapping==='joined'&&!spec.region?'module':spec.mapping;
  if(mesh.isSkinnedMesh||source.morphAttributes&&
   Object.values(source.morphAttributes).some(x=>x?.length))return null;
  const attribute=source.attributes.position;
  if(attribute.count>350000)return null; // GPU/CPU guard for offline tablets.
  root.updateWorldMatrix(true,true);
  const box=new THREE.Box3().setFromObject(root);
  if(box.isEmpty())return null;
  const rootInverse=root.matrixWorld.clone().invert();
  const localBox=new THREE.Box3(),rootToWorld=mesh.matrixWorld;
  const relative=rootInverse.clone().multiply(rootToWorld);
  const tmp=V();
  root.traverse(part=>{
   if(!part.isMesh||part.userData?.phoenixLODProxy||!part.geometry?.attributes?.position)return;
   const position=part.geometry.getAttribute('position');
   const transform=rootInverse.clone().multiply(part.matrixWorld);
   for(let i=0;i<position.count;i++)
    localBox.expandByPoint(tmp.fromBufferAttribute(position,i).applyMatrix4(transform));
  });
  const localExt=localBox.getSize(V());
  // Anchor ordinary UVs in object space (in physical metres). World-space UV
  // would visibly swim after every move/rotation and tile maps would stretch
  // when a wall was rotated relative to the world axes.
  const worldOrigin=root.getWorldPosition(V());
  const rootInverseRotation=root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const worldScale=root.getWorldScale(V());
  const physicalExt=localExt.clone().multiply(V(
   Math.abs(worldScale.x),Math.abs(worldScale.y),Math.abs(worldScale.z)));
  const geometry=source.index?source.toNonIndexed():source.clone();
  const pos=geometry.getAttribute('position');
  if(!pos?.count||pos.count%3!==0){geometry.dispose();return null}
  const uvs=new Float32Array(pos.count*2);
  const p0=V(),p1=V(),p2=V(),n=V(),e=V(),f=V(),local=V(),faceCenter=V();
  const mapScale=spec.tileMeters/Math.max(.01,Number(raw?.repeat)||1);
  const curve=curveLengths(root,kind);
  // Real continuous walk-distance across the two perpendicular arms of an L
  // wall. This removes the old quarter/half-tile jump at its inner corner.
  const corner=kind==='corner'?(()=>{
   const a=new THREE.Vector3(-1.9,0,0).applyMatrix4(root.matrixWorld);
   const b=new THREE.Vector3(0,0,0).applyMatrix4(root.matrixWorld);
   const c=new THREE.Vector3(0,0,-1.9).applyMatrix4(root.matrixWorld);
   const first=b.clone().sub(a),second=c.clone().sub(b);
   const firstLength=first.length();
   return {start:a,turn:b,firstLength,length:firstLength+second.length(),
    first:first.normalize(),second:second.normalize()};
  })():null;
  const angle=spec.rotation*Math.PI/180;
  const co=Math.cos(angle),si=Math.sin(angle);
  const sourceUV=mode==='source'?geometry.getAttribute('uv'):null;
  const inset=mode==='module'?raw?.imageInset:null;
  const reversed=rootToWorld.determinant()<0;
  for(let i=0;i<pos.count;i+=3){
   p0.fromBufferAttribute(pos,i).applyMatrix4(rootToWorld);
   p1.fromBufferAttribute(pos,i+1).applyMatrix4(rootToWorld);
   p2.fromBufferAttribute(pos,i+2).applyMatrix4(rootToWorld);
   n.copy(e.subVectors(p1,p0)).cross(f.subVectors(p2,p0)).normalize();
   if(reversed)n.negate();
   const orientedNormal=mode==='joined'?n:n.clone().applyQuaternion(rootInverseRotation);
   faceCenter.copy(p0).add(p1).add(p2).multiplyScalar(1/3).applyMatrix4(rootInverse);
   // Openings can reverse winding. The physical side determines reading direction.
   if(kind==='wall'&&Math.abs(orientedNormal.z)>.72&&orientedNormal.z*faceCenter.z<0)
    orientedNormal.negate();
   const top=Math.abs(orientedNormal.y)>.55;
   const axis=top?'xz':Math.abs(orientedNormal.x)>=Math.abs(orientedNormal.z)?'zy':'xy';
   const flipU=top?orientedNormal.y<0:axis==='zy'?orientedNormal.x>0:orientedNormal.z<0;
   // For angled walls, project onto a unit physical tangent, not world X/Z
   // coordinates (which shrink texture scale by cos(rotation)).
   const tangent=new THREE.Vector3(orientedNormal.z,0,-orientedNormal.x).normalize();
   const plane=p=>axis==='xz'?[p.x,p.z]:
    [p.x*tangent.x+p.z*tangent.z,p.y];
   const ext=physicalExt;
   const dimensions=axis==='xz'?[ext.x,ext.z]:
    axis==='zy'?[ext.z,ext.y]:[ext.x,ext.y];
   const radial=Math.hypot(faceCenter.x,faceCenter.z);
   const onCurve=curve&&!top&&radial>.01&&Math.abs(
    orientedNormal.x*faceCenter.x+orientedNormal.z*faceCenter.z)>.65*radial;
   const firstArm=axis==='xy';
   const armOffset=firstArm?faceCenter.z:faceCenter.x;
   const onCorner=corner&&!top&&Math.abs(armOffset)<.35;
   const pathLength=onCurve?curve.length:onCorner?corner.length:0;
   if(pathLength)dimensions[0]=pathLength;
   let imagePlacement;
   if(inset){
    const w=Math.max(.00001,dimensions[0]),h=Math.max(.00001,dimensions[1]);
    const c=Math.abs(co),s=Math.abs(si),aspect=number(raw.textureAspect,1,.01,100);
    const imageH=Math.min(w/(aspect*c+s),h/(aspect*s+c))*Math.min(1,spec.imageScale);
    const imageW=imageH*aspect;
    const marginX=Math.max(0,(w-imageW*c-imageH*s)/2);
    const marginY=Math.max(0,(h-imageW*s-imageH*c)/2);
    imagePlacement={w,h,imageW,imageH,
     x:clamp(-spec.offsetU*w,-marginX,marginX),
     y:clamp(-spec.offsetV*h,-marginY,marginY)};
   }
   for(let j=0;j<3;j++){
    tmp.fromBufferAttribute(pos,i+j);
    const world=tmp.clone().applyMatrix4(rootToWorld);
    local.copy(tmp).applyMatrix4(relative);
    let u,v;
    let pathU;
    if(onCurve){
     const distance=curve.at(Math.atan2(local.z,local.x));
     pathU=radial>=2?curve.length-distance:distance;
    }else if(onCorner){
     const dir=firstArm?corner.first:corner.second;
     const origin=firstArm?corner.start:corner.turn;
     const distance=(firstArm?0:corner.firstLength)+world.clone().sub(origin).dot(dir);
     pathU=armOffset>=0?distance:corner.length-distance;
    }
    if(sourceUV){
     // Indexed/non-indexed coordinates remain identical after toNonIndexed.
     u=sourceUV.getX(i+j);v=sourceUV.getY(i+j);
    }else if(mode==='joined'){
     u=(world.x-spec.region[0])/(spec.region[2]-spec.region[0]);
     v=(world.z-spec.region[1])/(spec.region[3]-spec.region[1]);
    }else if(mode==='seamless'){
     // New opt-in world-anchored projection. Neighbouring coplanar modules
     // sample identical texture coordinates at their shared physical edge.
     // Unlike 'module', this repeats in metres and is intentionally fixed
     // to the scene when the object moves. All legacy modes stay untouched.
     const topSurface=Math.abs(n.y)>.55;
     const sideZ=Math.abs(n.z)>=Math.abs(n.x);
     u=(topSurface?world.x:sideZ?world.x:world.z)/mapScale;
     v=(topSurface?world.z:-world.y)/mapScale;
    }else if(mode==='repeat'){
     // Repeat always follows the object, preserving its metre scale on move.
     const point=world.clone().sub(worldOrigin).applyQuaternion(rootInverseRotation);
     [u,v]=plane(point);
     u=(pathU??(top&&flipU?-u:u))/mapScale;
     v=(top?v:-v)/mapScale;
    }else{
     // One complete image per module, or aspect-correct crop of one image.
     const localPoint=local,localMin=localBox.min;
     const q=axis==='xz'?[localPoint.x-localMin.x,localPoint.z-localMin.z]:
      axis==='zy'?[localPoint.z-localMin.z,localPoint.y-localMin.y]:
      [localPoint.x-localMin.x,localPoint.y-localMin.y];
     const ext=axis==='xz'?[localExt.x,localExt.z]:
      axis==='zy'?[localExt.z,localExt.y]:[localExt.x,localExt.y];
     u=q[0]/Math.max(.00001,ext[0]);
     v=q[1]/Math.max(.00001,ext[1]);
     if(pathLength)u=pathU/pathLength;
     else if(flipU)u=1-u;
     if(!top)v=1-v;
     if(mode==='tile'){
      const aspect=number(raw?.textureAspect,1,.01,100);
      const surfaceAspect=dimensions[0]/Math.max(.001,dimensions[1]);
      if(surfaceAspect>aspect)v=.5+(v-.5)*aspect/surfaceAspect;
      else u=.5+(u-.5)*surfaceAspect/aspect;
     }
     if(!imagePlacement){
      u=.5+(u-.5)/spec.imageScale;v=.5+(v-.5)/spec.imageScale;
     }
    }
    if(imagePlacement){
     const {w,h,imageW,imageH,x:shiftX,y:shiftY}=imagePlacement;
     const x=(u-.5)*w-shiftX,y=(v-.5)*h-shiftY;
     const imageU=.5+(co*x-si*y)/imageW,imageV=.5+(si*x+co*y)/imageH;
     uvs[2*(i+j)]=inset[0]+imageU*(1-2*inset[0]);
     uvs[2*(i+j)+1]=inset[1]+imageV*(1-2*inset[1]);
     continue;
    }
    // Transform UV directly so GLB exporter and real-time renderer agree.
    const center=mode==='repeat'||mode==='seamless'?0:.5;
    const x=u-center,y=v-center;
    u=co*x-si*y+center+spec.offsetU;
    v=si*x+co*y+center+spec.offsetV;
    uvs[2*(i+j)]=u;uvs[2*(i+j)+1]=v;
   }
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
  return geometry;
 }
 function projectShaped(root,mesh,source,raw,kind=''){
  if(!source?.attributes?.position)return null;
  const spec=settings(raw);
  // Built-in arcs/corners have no meaningful authored UVs (the arc
  // generator originally gave every triangle an isolated 0..1 triangle).
  // Even when the user chooses Source UV, use physical metre projection.
  const requested=spec.mapping==='joined'&&!spec.region?'module':spec.mapping;
  const mode=requested==='source'&&['corner','arc90','arc180'].includes(kind)?
   'repeat':requested;
  if(mesh.isSkinnedMesh||source.morphAttributes&&
   Object.values(source.morphAttributes).some(x=>x?.length))return null;
  const attribute=source.attributes.position;
  if(attribute.count>350000)return null; // GPU/CPU guard for offline tablets.
  root.updateWorldMatrix(true,true);
  const box=new THREE.Box3().setFromObject(root);
  if(box.isEmpty())return null;
  const rootInverse=root.matrixWorld.clone().invert();
  const localBox=new THREE.Box3(),rootToWorld=mesh.matrixWorld;
  const relative=rootInverse.clone().multiply(rootToWorld);
  const tmp=V();
  root.traverse(part=>{
   if(!part.isMesh||part.userData?.phoenixLODProxy||!part.geometry?.attributes?.position)return;
   const position=part.geometry.getAttribute('position');
   const transform=rootInverse.clone().multiply(part.matrixWorld);
   for(let i=0;i<position.count;i++)
    localBox.expandByPoint(tmp.fromBufferAttribute(position,i).applyMatrix4(transform));
  });
  const localExt=localBox.getSize(V());
  // Anchor ordinary UVs in object space (in physical metres). World-space UV
  // would visibly swim after every move/rotation and tile maps would stretch
  // when a wall was rotated relative to the world axes.
  const worldOrigin=root.getWorldPosition(V());
  const rootInverseRotation=root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const worldScale=root.getWorldScale(V());
  const physicalExt=localExt.clone().multiply(V(
   Math.abs(worldScale.x),Math.abs(worldScale.y),Math.abs(worldScale.z)));
  const geometry=source.index?source.toNonIndexed():source.clone();
  const pos=geometry.getAttribute('position');
  if(!pos?.count||pos.count%3!==0){geometry.dispose();return null}
  const uvs=new Float32Array(pos.count*2);
  const p0=V(),p1=V(),p2=V(),n=V(),e=V(),f=V(),local=V(),faceCenter=V();
  const mapScale=spec.tileMeters/Math.max(.01,Number(raw?.repeat)||1);
  const curve=curveLengths(root,kind);
  // Actual physical path of each visible rim of the watertight L wall.
  // The inner and outer rims have different lengths: the original version
  // used a single centreline and jumped by the wall thickness at the elbow.
  const corner=kind==='corner'?(()=>{
   const cx=Math.max(0,localBox.max.x),cz=Math.max(0,localBox.max.z);
   // PHOENIX_UV44_POSTFIX_20261109: mirrored objects need positive metre lengths.
   const scaleX=Math.abs(worldScale.x),scaleZ=Math.abs(worldScale.z);
   return {cx,cz,scaleX,scaleZ,
    outer:(1.9+cx)*scaleX+(1.9+cz)*scaleZ,
    inner:(1.9-cx)*scaleX+(1.9-cz)*scaleZ};
  })():null;
  const angle=spec.rotation*Math.PI/180;
  const co=Math.cos(angle),si=Math.sin(angle);
  const sourceUV=mode==='source'?geometry.getAttribute('uv'):null;
  // On a curved or L-shaped wall, a 'module' image must cover the whole
  // physical side instead of leaving white strips at the ends of a long arc.
  const shapedModule=mode==='module'&&['corner','arc90','arc180'].includes(kind);
  const inset=mode==='module'&&!shapedModule?raw?.imageInset:null;
  const reversed=rootToWorld.determinant()<0;
  for(let i=0;i<pos.count;i+=3){
   p0.fromBufferAttribute(pos,i).applyMatrix4(rootToWorld);
   p1.fromBufferAttribute(pos,i+1).applyMatrix4(rootToWorld);
   p2.fromBufferAttribute(pos,i+2).applyMatrix4(rootToWorld);
   n.copy(e.subVectors(p1,p0)).cross(f.subVectors(p2,p0)).normalize();
   if(reversed)n.negate();
   const orientedNormal=mode==='joined'?n:n.clone().applyQuaternion(rootInverseRotation);
   faceCenter.copy(p0).add(p1).add(p2).multiplyScalar(1/3).applyMatrix4(rootInverse);
   // PHOENIX_UV44_POSTFIX_20261109: classify built-in corner arms in
   // root-local space, not rotated/mirrored world normals.
   const cornerNormal=kind==='corner'?p1.clone().applyMatrix4(rootInverse)
    .sub(p0.clone().applyMatrix4(rootInverse))
    .cross(p2.clone().applyMatrix4(rootInverse)
     .sub(p0.clone().applyMatrix4(rootInverse))).normalize():null;

   // Openings can reverse winding. The physical side determines reading direction.
   if(kind==='wall'&&Math.abs(orientedNormal.z)>.72&&orientedNormal.z*faceCenter.z<0)
    orientedNormal.negate();
   const faceNormal=cornerNormal||orientedNormal;
   const top=Math.abs(faceNormal.y)>.55;
   const axis=top?'xz':Math.abs(faceNormal.x)>=Math.abs(faceNormal.z)?'zy':'xy';
   const flipU=top?faceNormal.y<0:axis==='zy'?faceNormal.x>0:faceNormal.z<0;
   // For angled walls, project onto a unit physical tangent, not world X/Z
   // coordinates (which shrink texture scale by cos(rotation)).
   const tangent=new THREE.Vector3(orientedNormal.z,0,-orientedNormal.x).normalize();
   const plane=p=>axis==='xz'?[p.x,p.z]:
    [p.x*tangent.x+p.z*tangent.z,p.y];
   const ext=physicalExt;
   const dimensions=axis==='xz'?[ext.x,ext.z]:
    axis==='zy'?[ext.z,ext.y]:[ext.x,ext.y];
   const radial=Math.hypot(faceCenter.x,faceCenter.z);
   const onCurve=curve&&!top&&radial>.01&&Math.abs(
    orientedNormal.x*faceCenter.x+orientedNormal.z*faceCenter.z)>.65*radial;
   const firstArm=axis==='xy';
   const armOffset=firstArm?faceCenter.z:faceCenter.x;
   const onCorner=corner&&!top&&Math.abs(armOffset)<.35;
   const outer=onCorner?(firstArm?faceCenter.z>=0:faceCenter.x>=0):false;
   const pathLength=onCurve?curve.length*(radial/2):onCorner?
    (outer?corner.outer:corner.inner):0;
   if(pathLength)dimensions[0]=pathLength;
   let imagePlacement;
   if(inset){
    const w=Math.max(.00001,dimensions[0]),h=Math.max(.00001,dimensions[1]);
    const c=Math.abs(co),s=Math.abs(si),aspect=number(raw.textureAspect,1,.01,100);
    const imageH=Math.min(w/(aspect*c+s),h/(aspect*s+c))*Math.min(1,spec.imageScale);
    const imageW=imageH*aspect;
    const marginX=Math.max(0,(w-imageW*c-imageH*s)/2);
    const marginY=Math.max(0,(h-imageW*s-imageH*c)/2);
    imagePlacement={w,h,imageW,imageH,
     x:clamp(-spec.offsetU*w,-marginX,marginX),
     y:clamp(-spec.offsetV*h,-marginY,marginY)};
   }
   for(let j=0;j<3;j++){
    tmp.fromBufferAttribute(pos,i+j);
    const world=tmp.clone().applyMatrix4(rootToWorld);
    local.copy(tmp).applyMatrix4(relative);
    let u,v;
    let pathU;
    if(onCurve){
     // Use the true path distance on each radial rim, not flat projected
     // X/Z coordinates. This also keeps metre-sized tiles on ellipses.
     const distance=curve.at(Math.atan2(local.z,local.x));
     const rimRatio=Math.hypot(local.x,local.z)/2;
     const rimLength=curve.length*rimRatio;
     pathU=radial>=2?rimLength-distance*rimRatio:distance*rimRatio;
    }else if(onCorner){
     // Both arms meet with exactly the SAME UV at their physical join.
     // x in [-1.9,+cx]; z in [+cz,-1.9] along the outer rim.
     const cx=corner.cx,cz=corner.cz;
     const dist=firstArm?(local.x+1.9)*corner.scaleX:
      (1.9+(outer?cx:-cx))*corner.scaleX+
      ((outer?cz:-cz)-local.z)*corner.scaleZ;
     pathU=outer?dist:corner.inner-dist;
    }
    if(sourceUV){
     // Indexed/non-indexed coordinates remain identical after toNonIndexed.
     u=sourceUV.getX(i+j);v=sourceUV.getY(i+j);
    }else if(mode==='joined'){
     u=(world.x-spec.region[0])/(spec.region[2]-spec.region[0]);
     v=(world.z-spec.region[1])/(spec.region[3]-spec.region[1]);
    }else if(mode==='seamless'){
     // New opt-in world-anchored projection. Neighbouring coplanar modules
     // sample identical texture coordinates at their shared physical edge.
     // Unlike 'module', this repeats in metres and is intentionally fixed
     // to the scene when the object moves. All legacy modes stay untouched.
     const topSurface=Math.abs(n.y)>.55;
     const sideZ=Math.abs(n.z)>=Math.abs(n.x);
     u=(topSurface?world.x:sideZ?world.x:world.z)/mapScale;
     v=(topSurface?world.z:-world.y)/mapScale;
    }else if(mode==='repeat'){
     // Repeat always follows the object, preserving its metre scale on move.
     const point=world.clone().sub(worldOrigin).applyQuaternion(rootInverseRotation);
     [u,v]=plane(point);
     u=(pathU??(top&&flipU?-u:u))/mapScale;
     v=(top?v:-v)/mapScale;
    }else{
     // One complete image per module, or aspect-correct crop of one image.
     const localPoint=local,localMin=localBox.min;
     const q=axis==='xz'?[localPoint.x-localMin.x,localPoint.z-localMin.z]:
      axis==='zy'?[localPoint.z-localMin.z,localPoint.y-localMin.y]:
      [localPoint.x-localMin.x,localPoint.y-localMin.y];
     const ext=axis==='xz'?[localExt.x,localExt.z]:
      axis==='zy'?[localExt.z,localExt.y]:[localExt.x,localExt.y];
     u=q[0]/Math.max(.00001,ext[0]);
     v=q[1]/Math.max(.00001,ext[1]);
     if(pathLength)u=pathU/pathLength;
     else if(flipU)u=1-u;
     if(!top)v=1-v;
     if(mode==='tile'){
      const aspect=number(raw?.textureAspect,1,.01,100);
      const surfaceAspect=dimensions[0]/Math.max(.001,dimensions[1]);
      if(surfaceAspect>aspect)v=.5+(v-.5)*aspect/surfaceAspect;
      else u=.5+(u-.5)*surfaceAspect/aspect;
     }
     if(!imagePlacement){
      u=.5+(u-.5)/spec.imageScale;v=.5+(v-.5)/spec.imageScale;
     }
    }
    if(imagePlacement){
     const {w,h,imageW,imageH,x:shiftX,y:shiftY}=imagePlacement;
     const x=(u-.5)*w-shiftX,y=(v-.5)*h-shiftY;
     const imageU=.5+(co*x-si*y)/imageW,imageV=.5+(si*x+co*y)/imageH;
     uvs[2*(i+j)]=inset[0]+imageU*(1-2*inset[0]);
     uvs[2*(i+j)+1]=inset[1]+imageV*(1-2*inset[1]);
     continue;
    }
    // Transform UV directly so GLB exporter and real-time renderer agree.
    const center=mode==='repeat'||mode==='seamless'?0:.5;
    const x=u-center,y=v-center;
    u=co*x-si*y+center+spec.offsetU;
    v=si*x+co*y+center+spec.offsetV;
    if(shapedModule&&Array.isArray(raw?.imageInset)){
     // The workshop prepares custom one-image textures with a 2 px border.
     // Remap normalized face UVs to the actual image, not the white border.
     const iu=Math.max(0,Math.min(.49,Number(raw.imageInset[0])||0));
     const iv=Math.max(0,Math.min(.49,Number(raw.imageInset[1])||0));
     u=iu+Math.max(0,Math.min(1,u))*(1-2*iu);
     v=iv+Math.max(0,Math.min(1,v))*(1-2*iv);
    }
    uvs[2*(i+j)]=u;uvs[2*(i+j)+1]=v;
   }
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
  return geometry;
 }
 // Keep straight walls, floors, roofs and imported GLB objects 100% on the
 // proven TAP mapping path; only procedural corners and curved wall modules
 // use UV3's corrected physical projection.
 function project(root,mesh,source,raw,kind=''){
  return ['corner','arc90','arc180'].includes(kind)?
   projectShaped(root,mesh,source,raw,kind):
   projectLegacy(root,mesh,source,raw,kind);
 }
 // Optional low-res tangent-space normal map from the same image. Generated
 // ONCE per imported texture/strength and reusable for all instance materials.
 const normalCache=new WeakMap();
 function normalFromTexture(texture,wrap=THREE.RepeatWrapping){
  const img=texture?.image;
  if(!img?.width||!img?.height||typeof document==='undefined')return null;
  const cached=normalCache.get(texture)||new Map();
  if(cached.has(wrap))return cached.get(wrap);
  try{
   const canvas=document.createElement('canvas');
   const edge=256,factor=Math.min(1,edge/Math.max(img.width,img.height));
   canvas.width=Math.max(8,Math.round(img.width*factor));
   canvas.height=Math.max(8,Math.round(img.height*factor));
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   if(!ctx)return null;
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const w=canvas.width,h=canvas.height,pixels=ctx.getImageData(0,0,w,h),
    src=pixels.data,dest=ctx.createImageData(w,h);
   const height=(x,y)=>{
    const px=wrap===THREE.RepeatWrapping?(x+w)%w:clamp(x,0,w-1);
    const py=wrap===THREE.RepeatWrapping?(y+h)%h:clamp(y,0,h-1);
    const a=(py*w+px)*4;
    return (.2126*src[a]+.7152*src[a+1]+.0722*src[a+2])/255;
   };
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dx=height(x+1,y)-height(x-1,y),
     dy=height(x,y+1)-height(x,y-1);
    const len=Math.hypot(dx,dy,1),i=(y*w+x)*4;
    dest.data[i]=Math.round(128-127*dx/len);
    dest.data[i+1]=Math.round(128-127*dy/len);
    dest.data[i+2]=Math.round(128+127/len);
    dest.data[i+3]=255;
   }
   ctx.putImageData(dest,0,0);
   const output=new THREE.CanvasTexture(canvas);
   output.wrapS=output.wrapT=wrap;
   output.flipY=false;
   output.encoding=THREE.LinearEncoding;
   output.needsUpdate=true;cached.set(wrap,output);normalCache.set(texture,cached);
   return output;
  }catch(e){console.warn('Normal map unavailable',e);return null}
 }
 return {modes,settings,project,normalFromTexture,singleImageTexture,curveLengths};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SurfaceWorkshop;
