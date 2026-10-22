/* Phoenix Builder v2 — geometry and socket contract.
 * All modules expose actual centreline end sockets. Never use a diagonal
 * bounding box endpoint for L corners or curved walls.
 * Three.js r140, no Babylon dependency.
 */
const CleanGeometry=(()=>{
 const T=()=>THREE;
 const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
 const rotate=(p,yaw)=>V(p.x*Math.cos(yaw)+p.z*Math.sin(yaw),p.y,
   -p.x*Math.sin(yaw)+p.z*Math.cos(yaw));
 const cap=(a,b,out)=>({point:V(a,0,b),out:V(out[0],0,out[1]).normalize()});
 const catalog=[
  {kind:'floor',name:'Пол 2 × 2 м',category:'floor'},
  {kind:'wall',name:'Прямая стена 2 м',category:'wall'},
  {kind:'corner',name:'Угол 90°',category:'wall'},
  {kind:'arc90',name:'Четверть круга 90°',category:'wall'},
  {kind:'arc180',name:'Полукруг 180°',category:'wall'},
  {kind:'roof',name:'Крыша — секция',category:'roof'}
 ];
 const isBuiltIn=kind=>catalog.some(x=>x.kind===kind);
 function annularMesh(angle,width=2,height=2.6,thickness=.22){
  const segments=Math.max(12,Math.ceil(angle*24/Math.PI)),R=width;
  const verts=[],uv=[];
  const addTri=(a,b,c)=>{verts.push(...a,...b,...c);uv.push(0,0,1,0,0,1)};
  const quad=(a,b,c,d)=>{addTri(a,b,c);addTri(a,c,d)};
  const pt=(r,t,y)=>[r*Math.cos(t),y,r*Math.sin(t)];
  for(let i=0;i<segments;i++){
   const a=i*angle/segments,b=(i+1)*angle/segments;
   const inner=R-thickness/2,outer=R+thickness/2;
   quad(pt(outer,a,0),pt(outer,b,0),pt(outer,b,height),pt(outer,a,height));
   quad(pt(inner,b,0),pt(inner,a,0),pt(inner,a,height),pt(inner,b,height));
   quad(pt(inner,a,height),pt(outer,a,height),pt(outer,b,height),pt(inner,b,height));
   quad(pt(outer,a,0),pt(inner,a,0),pt(inner,b,0),pt(outer,b,0));
  }
  const inn=R-thickness/2,out=R+thickness/2;
  quad(pt(inn,0,0),pt(inn,0,height),pt(out,0,height),pt(out,0,0));
  quad(pt(out,angle,0),pt(out,angle,height),pt(inn,angle,height),pt(inn,angle,0));
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  return g;
 }
 function create(kind,thickness=.22){
  const mat=new THREE.MeshStandardMaterial({color:'#d2c5ac',roughness:.86,side:THREE.DoubleSide});
  const root=new THREE.Group();root.name=kind;
  const add=(g,x=0,y=0,z=0,rotationZ=0)=>{const m=new THREE.Mesh(g,mat);m.position.set(x,y,z);
   m.rotation.z=rotationZ;root.add(m);return m};
  const h=2.6;
  if(kind==='floor')add(new THREE.BoxGeometry(2,.18,2),0,.09,0);
  if(kind==='wall')add(new THREE.BoxGeometry(2,h,thickness),0,h/2,0);
  if(kind==='corner'){
   add(new THREE.BoxGeometry(2,h,thickness),-.9,h/2,0);
   add(new THREE.BoxGeometry(thickness,h,2),0,h/2,-.9);
  }
  if(kind==='arc90')add(annularMesh(Math.PI/2,2,h,thickness));
  if(kind==='arc180')add(annularMesh(Math.PI,2,h,thickness));
  if(kind==='roof'){
   add(new THREE.BoxGeometry(2.5,.16,1.65),-.62,.65,0,-Math.PI/4);
   add(new THREE.BoxGeometry(2.5,.16,1.65), .62,.65,0, Math.PI/4);
  }
  return root.children.length?root:null;
 }
 function builtinSockets(kind){
  switch(kind){
   case 'wall':return [cap(-1,0,[-1,0]),cap(1,0,[1,0])];
   case 'corner':return [cap(-1.9,0,[-1,0]),cap(0,-1.9,[0,-1])];
   case 'arc90':return [cap(2,0,[0,-1]),cap(0,2,[-1,0])];
   case 'arc180':return [cap(2,0,[0,-1]),cap(-2,0,[0,-1])];
   case 'roof':return [cap(0,-.825,[0,-1]),cap(0,.825,[0,1])];
   default:return [];
  }
 }
 const bbox=root=>{
  root.updateWorldMatrix(true,true);
  return new THREE.Box3().setFromObject(root);
 };
 function localBounds(root){
  root.updateWorldMatrix(true,true);
  const inv=root.matrixWorld.clone().invert(),m=new THREE.Matrix4(),bounds=new THREE.Box3();
  root.traverse(child=>{
   if(!child.isMesh||!child.geometry)return;
   if(!child.geometry.boundingBox)child.geometry.computeBoundingBox();
   if(!child.geometry.boundingBox)return;
   m.multiplyMatrices(inv,child.matrixWorld);
   bounds.union(child.geometry.boundingBox.clone().applyMatrix4(m));
  });
  return bounds;
 }
 // Recognize arc GLB cross-sections in root-local space. The importer does
 // not need names: the geometry itself must prove two radial edges, uniform
 // thickness and a consistent centreline circle. Ambiguous meshes remain manual.
 function arcSockets(root){
  root.updateWorldMatrix(true,true);
  const meshes=[];root.traverse(m=>{if(m.isMesh&&m.geometry?.attributes?.position)meshes.push(m)});
  if(meshes.length!==1)return [];
  const mesh=meshes[0],attr=mesh.geometry.attributes.position;
  if(attr.count<16||attr.count>150000)return [];
  const inverse=root.matrixWorld.clone().invert(),toRoot=new THREE.Matrix4()
   .multiplyMatrices(inverse,mesh.matrixWorld);
  const bounds=localBounds(root),base=bounds.min.y,points=[],temp=V();
  for(let i=0;i<attr.count;i++){
   temp.set(attr.getX(i),attr.getY(i),attr.getZ(i)).applyMatrix4(toRoot);
   if(Math.abs(temp.y-base)>.014)continue;
   if(!points.length||points[points.length-1].distanceToSquared(temp)>1e-8)
    points.push(temp.clone());
  }
  if(points.length<8||points.length%2!==0)return [];
  const mid=(a,b)=>a.clone().add(b).multiplyScalar(.5);
  const cross=[];
  for(let i=0;i<points.length;i+=2){
   const thick=points[i].distanceTo(points[i+1]);
   if(thick<.015||thick>1.2)return [];
   cross.push({at:mid(points[i],points[i+1]),thick,a:points[i],b:points[i+1]});
  }
  const first=cross[0],last=cross[cross.length-1],
   middle=cross[Math.floor(cross.length/2)];
  const a=first.at,b=middle.at,d=last.at;
  const den=2*(a.x*(b.z-d.z)+b.x*(d.z-a.z)+d.x*(a.z-b.z));
  if(Math.abs(den)<1e-6)return [];
  const aa=a.x*a.x+a.z*a.z,bb=b.x*b.x+b.z*b.z,dd=d.x*d.x+d.z*d.z;
  const cx=(aa*(b.z-d.z)+bb*(d.z-a.z)+dd*(a.z-b.z))/den;
  const cz=(aa*(d.x-b.x)+bb*(a.x-d.x)+dd*(b.x-a.x))/den;
  const radius=Math.hypot(a.x-cx,a.z-cz),width=cross.reduce((s,x)=>s+x.thick,0)/cross.length;
  if(radius<.5||radius>120||width>radius*.7)return [];
  if(cross.some(s=>Math.abs(s.thick-width)>.06||
   Math.abs(Math.hypot(s.at.x-cx,s.at.z-cz)-radius)>.065))return [];
  const tangent=(section,near)=>{
   const capVec=section.b.clone().sub(section.a).setY(0);
   if(capVec.lengthSq()<.00001)return null;
   const normal=V(-capVec.z,0,capVec.x).normalize();
   const rough=section.at.clone().sub(near.at).setY(0);
   if(normal.dot(rough)<0)normal.negate();
   return normal;
  };
  const outgoingA=tangent(first,cross[1]);
  const outgoingB=tangent(last,cross[cross.length-2]);
  if(!outgoingA||!outgoingB)return [];
  const sockets=[{point:first.at,out:outgoingA},{point:last.at,out:outgoingB}];
  sockets.profile={cx,cz,radius,thickness:width};
  return sockets;
 }
 function lCornerSockets(root){
  root.updateWorldMatrix(true,true);
  const inv=root.matrixWorld.clone().invert();
  const slabs=[];
  root.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry?.attributes?.position)return;
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   const trans=new THREE.Matrix4().multiplyMatrices(inv,mesh.matrixWorld);
   const box=mesh.geometry.boundingBox.clone().applyMatrix4(trans);
   const sx=box.max.x-box.min.x,sz=box.max.z-box.min.z,
    thin=Math.min(sx,sz),long=Math.max(sx,sz);
   if(long>.65&&thin>.012&&thin<.7&&long/thin>3.5)
    slabs.push({box,axis:sx>sz?'x':'z'});
  });
  if(slabs.length!==2||slabs[0].axis===slabs[1].axis)return [];
  const x=slabs.find(s=>s.axis==='x'),z=slabs.find(s=>s.axis==='z');
  const ix=(z.box.min.x+z.box.max.x)/2,iz=(x.box.min.z+x.box.max.z)/2;
  if(ix<x.box.min.x-.13||ix>x.box.max.x+.13||
    iz<z.box.min.z-.13||iz>z.box.max.z+.13)return [];
  const xEnd=Math.abs(x.box.min.x-ix)>Math.abs(x.box.max.x-ix)?x.box.min.x:x.box.max.x;
  const zEnd=Math.abs(z.box.min.z-iz)>Math.abs(z.box.max.z-iz)?z.box.min.z:z.box.max.z;
  if(Math.abs(xEnd-ix)<.4||Math.abs(zEnd-iz)<.4)return [];
  const y=Math.min(x.box.min.y,z.box.min.y);
  return [{point:V(xEnd,y,iz),out:V(Math.sign(xEnd-ix),0,0)},
   {point:V(ix,y,zEnd),out:V(0,0,Math.sign(zEnd-iz))}];
 }
 function extractedSockets(root,category){
  if(category!=='wall'&&category!=='roof')return [];
  // Use actual curved cross-sections and separate L-arms when recognizable.
  if(category==='wall'){
   const curved=arcSockets(root);if(curved.length===2)return curved;
   const angle=lCornerSockets(root);if(angle.length===2)return angle;
  }
  const children=[];root.traverse(c=>{if(c.isMesh&&c.geometry)children.push(c)});
  if(children.length!==1)return [];
  const box=localBounds(root),sz=box.getSize(V());
  if(!Number.isFinite(sz.x)||sz.y<.4)return [];
  if(category==='wall'){
   const thin=Math.min(sz.x,sz.z),long=Math.max(sz.x,sz.z);
   if(thin>.8||thin<.01||long<.5||long/thin<3.2)return [];
   const y=box.min.y,xc=(box.min.x+box.max.x)/2,zc=(box.min.z+box.max.z)/2;
   return sz.x>=sz.z?[
    {point:V(box.min.x,y,zc),out:V(-1,0,0)},
    {point:V(box.max.x,y,zc),out:V(1,0,0)}
   ]:[
    {point:V(xc,y,box.min.z),out:V(0,0,-1)},
    {point:V(xc,y,box.max.z),out:V(0,0,1)}
   ];
  }
  return [];
 }
 // Optional true mesh thickness for imported GLBs with verifiable geometry.
 // It moves only material across the wall cross-section in root-local space.
 // Arbitrary sculptures/merged non-annular shapes remain unmodified.
 function importedProfile(obj){
  if(!obj||obj.category!=='wall'||isBuiltIn(obj.kind))return null;
  const root=obj.root;root.updateWorldMatrix(true,true);
  const meshes=[];root.traverse(m=>{if(m.isMesh&&m.geometry?.attributes?.position)meshes.push(m)});
  const meshBox=mesh=>{
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   const inv=root.matrixWorld.clone().invert();
   const matrix=new THREE.Matrix4().multiplyMatrices(inv,mesh.matrixWorld);
   return mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
  };
  const slab=mesh=>{
   const b=meshBox(mesh),size=b.getSize(V());
   const thin=Math.min(size.x,size.z),long=Math.max(size.x,size.z);
   if(size.y<.4||thin<.01||thin>.9||long<.65||long/thin<3.3)return null;
   const axis=size.x>size.z?'z':'x';
   return {mesh,axis,centre:(b.min[axis]+b.max[axis])/2,sourceThickness:thin};
  };
  if(meshes.length===1){
   const curved=arcSockets(root);
   if(curved.profile){
    if(Math.abs(root.scale.x-root.scale.z)>Math.max(.01,root.scale.x*.03))return null;
    return {type:'arc',parts:[{mesh:meshes[0],axis:'radial',
     cx:curved.profile.cx,cz:curved.profile.cz,radius:curved.profile.radius,
     sourceThickness:curved.profile.thickness}]};
   }
   const line=slab(meshes[0]);
   return line?{type:'straight',parts:[line]}:null;
  }
  if(meshes.length===2){
   const parts=meshes.map(slab);
   if(parts.every(Boolean)&&parts[0].axis!==parts[1].axis&&lCornerSockets(root).length===2)
    return {type:'corner',parts};
  }
  return null;
 }
 function thicknessInfo(obj){
  const p=importedProfile(obj);
  if(!p)return null;
  const lengths=p.parts.map(part=>{
   const axis=part.axis==='radial'?'x':part.axis;
   return Math.abs(obj.root.scale[axis])*part.sourceThickness;
  });
  return {type:p.type,meters:lengths.reduce((s,x)=>s+x,0)/lengths.length};
 }
 function resizeImportedThickness(obj,metres){
  const target=Number(metres),p=importedProfile(obj);
  if(!p||!Number.isFinite(target)||target<.025||target>.8)return false;
  const prepared=[];
  const root=obj.root;root.updateMatrixWorld(true,true);
  for(const part of p.parts){
   const axis=part.axis==='radial'?'x':part.axis;
   const unit=Math.abs(root.scale[axis]);
   const factor=target/(part.sourceThickness*unit);
   if(!Number.isFinite(factor)||factor<.1||factor>8)return false;
   const geo=part.mesh.geometry.clone(),attr=geo.attributes.position;
   const inv=root.matrixWorld.clone().invert();
   const toRoot=new THREE.Matrix4().multiplyMatrices(inv,part.mesh.matrixWorld);
   const toMesh=toRoot.clone().invert(),point=V();
   for(let i=0;i<attr.count;i++){
    point.set(attr.getX(i),attr.getY(i),attr.getZ(i)).applyMatrix4(toRoot);
    if(part.axis==='radial'){
     const dx=point.x-part.cx,dz=point.z-part.cz,r=Math.hypot(dx,dz);
     if(r>.00001){
      const next=part.radius+(r-part.radius)*factor;
      point.x=part.cx+dx*next/r;point.z=part.cz+dz*next/r;
     }
    }else point[part.axis]=part.centre+(point[part.axis]-part.centre)*factor;
    point.applyMatrix4(toMesh);attr.setXYZ(i,point.x,point.y,point.z);
   }
   attr.needsUpdate=true;geo.computeBoundingBox();geo.computeBoundingSphere();
   geo.computeVertexNormals();
   prepared.push({mesh:part.mesh,geo});
  }
  for(const item of prepared)item.mesh.geometry=item.geo;
  root.updateMatrixWorld(true);return true;
 }
 function sockets(kind,root,custom=null,category='wall'){
  if(Array.isArray(custom)&&custom.length===2)
   return custom.map(s=>({point:V(...s.point),out:V(...s.out).setY(0).normalize()}));
  if(isBuiltIn(kind))return builtinSockets(kind);
  return extractedSockets(root,category);
 }
 function worldSockets(entry){
  const root=entry.root,local=sockets(entry.kind,root,entry.sockets,entry.category);
  root.updateWorldMatrix(true,true);
  return local.map((socket,i)=>({
   index:i,point:socket.point.clone().applyMatrix4(root.matrixWorld),
   out:socket.out.clone().transformDirection(root.matrixWorld).setY(0).normalize()
  }));
 }
 function localCenters(kind,root,custom,category){
  return sockets(kind,root,custom,category);
 }
 function solveSnap(preview,entries,cursor,storey=0,extraRotation=0){
  if(!preview||!cursor)return null;
  const own=localCenters(preview.kind,preview.root,preview.sockets,preview.category);
  if(!own.length)return null;
  const shape=localBounds(preview.root);
  const center=shape.getCenter(V());
  let best=null;
  for(const entry of entries){
   if(entry.storey!==storey||entry.id===preview.id)continue;
   if(entry.category!==preview.category)continue;
   for(const tgt of worldSockets(entry))for(let i=0;i<own.length;i++){
    const src=own[i];
    if(src.out.lengthSq()<.5||tgt.out.lengthSq()<.5)continue;
    const desired=tgt.out.clone().negate();
    const theta=x=>Math.atan2(-x.z,x.x);
    const yaw=theta(desired)-theta(src.out)+extraRotation;
    const scaled=V(src.point.x*preview.root.scale.x,src.point.y*preview.root.scale.y,
       src.point.z*preview.root.scale.z);
    const projected=rotate(scaled,yaw);
    const pos=tgt.point.clone().sub(projected);
    const middle=rotate(V(center.x*preview.root.scale.x,center.y*preview.root.scale.y,
      center.z*preview.root.scale.z),yaw).add(pos);
    const distance=Math.hypot(middle.x-cursor.x,middle.z-cursor.z);
    // Magnets activate only when placement preview is genuinely near a
    // matching physical end, not wherever an AABB edge happens to be.
    const maxDist=Math.min(3.6,Math.max(1.6,shape.getSize(V()).length()*.49));
    if(distance>maxDist)continue;
    const score=distance+Math.hypot(tgt.point.x-cursor.x,tgt.point.z-cursor.z)*.1;
    if(!best||score<best.score)best={score,position:pos,rotation:yaw,
      from:i,to:tgt.index,target:entry.id,kind:entry.kind};
   }
  }
  return best;
 }
 function autoRoofHeight(preview,entries,cursor,base){
  if(preview.category!=='roof')return base;
  const footprint=localBounds(preview.root).getSize(V());
  const px=Math.max(1.5,footprint.x*preview.root.scale.x/2),
    pz=Math.max(1,footprint.z*preview.root.scale.z/2);
  const supporters=entries.filter(e=>e.category==='wall'&&
   Math.abs(e.root.position.x-cursor.x)<px+1 &&
   Math.abs(e.root.position.z-cursor.z)<pz+1).map(e=>bbox(e.root).max.y);
  if(!supporters.length)return base;
  const roofMin=localBounds(preview.root).min.y*preview.root.scale.y;
  return Math.max(...supporters)-roofMin;
 }
 return {catalog,isBuiltIn,create,builtinSockets,sockets,worldSockets,solveSnap,
   localBounds,bbox,autoRoofHeight,rotate,thicknessInfo,resizeImportedThickness};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CleanGeometry;
