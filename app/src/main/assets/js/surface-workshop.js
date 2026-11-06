/* Phoenix Mesh Workshop surface projection for Phoenix Builder (offline Three r140).
 * UV is rebuilt per placed INSTANCE; never alter GLB templates or source meshes.
 * Real geometric UV travels with the mesh and exports directly to GLB 2.0:
 * no runtime-only shader trick or undocumented glTF extension required.
 */
const SurfaceWorkshop=(()=>{
 'use strict';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const modes=['repeat','tile','module','joined','source'];
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
 const V=()=>new THREE.Vector3();
 // World-space UV keeps real tiles equally sized on flat walls and corners.
 // Arc sides use physical walk-length rather than a new [0,1] map per triangle.
 function project(root,mesh,source,raw,kind=''){
  if(!source?.attributes?.position)return null;
  const spec=settings(raw),mode=spec.mapping;
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
  const worldExt=box.getSize(V()),localExt=localBox.getSize(V());
  const geometry=source.index?source.toNonIndexed():source.clone();
  const pos=geometry.getAttribute('position');
  if(!pos?.count||pos.count%3!==0){geometry.dispose();return null}
  const uvs=new Float32Array(pos.count*2);
  const p0=V(),p1=V(),p2=V(),n=V(),e=V(),f=V(),local=V();
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
   return {start:a,turn:b,firstLength,first:first.normalize(),second:second.normalize()};
  })():null;
  const angle=spec.rotation*Math.PI/180;
  const co=Math.cos(angle),si=Math.sin(angle);
  const inset=x=>clamp(x,.0001,.9999);
  for(let i=0;i<pos.count;i+=3){
   p0.fromBufferAttribute(pos,i).applyMatrix4(rootToWorld);
   p1.fromBufferAttribute(pos,i+1).applyMatrix4(rootToWorld);
   p2.fromBufferAttribute(pos,i+2).applyMatrix4(rootToWorld);
   n.copy(e.subVectors(p1,p0)).cross(f.subVectors(p2,p0)).normalize();
   const top=Math.abs(n.y)>.55;
   const axis=top?'xz':Math.abs(n.x)>=Math.abs(n.z)?'zy':'xy';
   // For angled walls, project onto a unit physical tangent, not world X/Z
   // coordinates (which shrink texture scale by cos(rotation)).
   const tangent=new THREE.Vector3(n.z,0,-n.x).normalize();
   const plane=p=>axis==='xz'?[p.x,p.z]:
    [p.x*tangent.x+p.z*tangent.z,p.y];
   const dimensions=axis==='xz'?[worldExt.x,worldExt.z]:
    axis==='zy'?[worldExt.z,worldExt.y]:[worldExt.x,worldExt.y];
   for(let j=0;j<3;j++){
    tmp.fromBufferAttribute(pos,i+j);
    const world=tmp.clone().applyMatrix4(rootToWorld);
    local.copy(tmp).applyMatrix4(relative);
    let u,v;
    if(mode==='source'&&source.getAttribute('uv')){
     // Indexed/non-indexed coordinates remain identical after toNonIndexed.
     const srcUV=geometry.getAttribute('uv');
     u=srcUV.getX(i+j);v=srcUV.getY(i+j);
    }else if(mode==='repeat'||mode==='joined'){
     [u,v]=plane(world);
     if(curve&&!top){
      const theta=Math.atan2(local.z,local.x);
      u=curve.at(theta);
     }else if(corner&&!top){
      const firstArm=Math.abs(n.z)>=Math.abs(n.x);
      const dir=firstArm?corner.first:corner.second,
       origin=firstArm?corner.start:corner.turn;
      u=(firstArm?0:corner.firstLength)+world.clone().sub(origin).dot(dir);
     }
     if(mode==='joined'&&spec.region){
      u=(u-spec.region[0])/(spec.region[2]-spec.region[0]);
      v=(v-spec.region[1])/(spec.region[3]-spec.region[1]);
     }else{u/=mapScale;v/=mapScale}
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
     if(mode==='tile'){
      const aspect=number(raw?.textureAspect,1,.01,100);
      const surfaceAspect=dimensions[0]/Math.max(.001,dimensions[1]);
      if(surfaceAspect>aspect)v=.5+(v-.5)*aspect/surfaceAspect;
      else u=.5+(u-.5)*surfaceAspect/aspect;
     }
     u=.5+(u-.5)/spec.imageScale;v=.5+(v-.5)/spec.imageScale;
    }
    // Transform UV directly so GLB exporter and real-time renderer agree.
    const center=mode==='repeat'||mode==='joined'?0:.5;
    const x=u-center,y=v-center;
    u=co*x-si*y+(mode==='repeat'||mode==='joined'?0:.5)+spec.offsetU;
    v=si*x+co*y+(mode==='repeat'||mode==='joined'?0:.5)+spec.offsetV;
    if(mode==='module'||mode==='tile'){u=inset(u);v=inset(v)}
    uvs[2*(i+j)]=u;uvs[2*(i+j)+1]=v;
   }
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
  return geometry;
 }
 // Optional low-res tangent-space normal map from the same image. Generated
 // ONCE per imported texture/strength and reusable for all instance materials.
 const normalCache=new WeakMap();
 function normalFromTexture(texture){
  const img=texture?.image;
  if(!img?.width||!img?.height||typeof document==='undefined')return null;
  if(normalCache.has(texture))return normalCache.get(texture);
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
    const a=((y+h)%h*w+(x+w)%w)*4;
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
   output.wrapS=output.wrapT=THREE.RepeatWrapping;
   output.flipY=false;
   output.encoding=THREE.LinearEncoding;
   output.needsUpdate=true;normalCache.set(texture,output);
   return output;
  }catch(e){console.warn('Normal map unavailable',e);return null}
 }
 return {modes,settings,project,normalFromTexture,curveLengths};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SurfaceWorkshop;
