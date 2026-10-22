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
 function extractedSockets(root,category){
  if(category!=='wall'&&category!=='roof')return [];
  // GLB can contain dozens of decoration meshes. Only infer when there is
  // one unambiguous thick linear slab. Arcs/Ls need explicit endpoint authoring
  // or deliberate builtin templates to avoid phantom AABB magnet points.
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
   localBounds,bbox,autoRoofHeight,rotate};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CleanGeometry;
