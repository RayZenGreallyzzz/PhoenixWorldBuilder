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
 const architecture=typeof ArchitectureKit!=='undefined'?ArchitectureKit:
  (typeof require==='function'?require('./architecture-kit.js'):null);
 const catalog=[
  {kind:'floor',name:'Пол 2 × 2 м',category:'floor'},
  {kind:'stairsStraight',name:'🪜 Лестница 2,6 м — 13 ступеней',category:'prop',group:'stairs'},
  {kind:'wall',name:'Прямая стена 2 м',category:'wall'},
  {kind:'corner',name:'Угол 90°',category:'wall'},
  {kind:'arc90',name:'Четверть круга 90°',category:'wall'},
  {kind:'arc180',name:'Полукруг 180°',category:'wall'},
  {kind:'roof',name:'Крыша — секция',category:'roof'},
  ...(architecture?architecture.catalog:[])
 ];
 const isBuiltIn=kind=>catalog.some(x=>x.kind===kind);
 function annularMesh(angle,width=2,height=2.6,thickness=.22,sx=1,sz=1){
  const segments=Math.max(12,Math.ceil(angle*24/Math.PI)),R=width;
  const verts=[],uv=[];
  const addTri=(a,b,c)=>{verts.push(...a,...b,...c);uv.push(0,0,1,0,0,1)};
  const quad=(a,b,c,d)=>{addTri(a,b,c);addTri(a,c,d)};
  // The wall is built around its centreline, compensating for X/Z
  // scaling so physical thickness remains constant even on an ellipse.
  const pt=(side,t,y)=>{
   const co=Math.cos(t),si=Math.sin(t);
   const nx=co/sx,nz=si/sz,norm=Math.hypot(nx,nz)||1;
   return [width*co+side*(thickness/2)*nx/norm/sx,y,
    width*si+side*(thickness/2)*nz/norm/sz];
  };
  for(let i=0;i<segments;i++){
   const a=i*angle/segments,b=(i+1)*angle/segments;
   quad(pt(1,a,0),pt(1,b,0),pt(1,b,height),pt(1,a,height));
   quad(pt(-1,b,0),pt(-1,a,0),pt(-1,a,height),pt(-1,b,height));
   quad(pt(-1,a,height),pt(1,a,height),pt(1,b,height),pt(-1,b,height));
   quad(pt(1,a,0),pt(-1,a,0),pt(-1,b,0),pt(1,b,0));
  }
  quad(pt(-1,0,0),pt(-1,0,height),pt(1,0,height),pt(1,0,0));
  quad(pt(1,angle,0),pt(1,angle,height),pt(-1,angle,height),pt(-1,angle,0));
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  return g;
 }
 function create(kind,thickness=.22,sx=1,sz=1){
  if(architecture?.has(kind))return architecture.create(kind);
  sx=Math.max(.1,Math.abs(sx));sz=Math.max(.1,Math.abs(sz));
  const mat=new THREE.MeshStandardMaterial({color:'#d2c5ac',roughness:.86,side:THREE.DoubleSide});
  const root=new THREE.Group();root.name=kind;
  const add=(g,x=0,y=0,z=0,rotationZ=0)=>{const m=new THREE.Mesh(g,mat);m.position.set(x,y,z);
   m.rotation.z=rotationZ;root.add(m);return m};
  const h=2.6;
  if(kind==='floor')add(new THREE.BoxGeometry(2,.18,2),0,.09,0);
  if(kind==='stairsStraight'){
   // Each step is supported from the ground: 13 risers x 0.2m = 2.6m.
   // 0.30m treads and 1.2m width make it walkable by the existing
   // 0.26m character step-height collision solver.
   const tread=.30,riser=.20,steps=13,width=1.2;
   for(let i=0;i<steps;i++){
    const height=(i+1)*riser;
    const mesh=add(new THREE.BoxGeometry(width,height,tread),
     0,height/2,-steps*tread/2+(i+.5)*tread);
    mesh.name='stairs:tread:'+String(i+1);
   }
  }
  if(kind==='wall')add(new THREE.BoxGeometry(2,h,thickness/sz),0,h/2,0);
  if(kind==='corner'){
   // A single L-shaped solid, not two overlapping boxes. The old crossing
   // surfaces created discontinuous projection and overdraw at the elbow.
   // Keep the original 1.9 m end sockets and thickness/scale contract.
   const tx=thickness/(2*sx),tz=thickness/(2*sz);
   const outline=[[-1.9,-tz],[-tx,-tz],[-tx,-1.9],
    [tx,-1.9],[tx,tz],[-1.9,tz]];
   const vectors=outline.map(([x,z])=>new THREE.Vector2(x,z));
   const triangles=THREE.ShapeUtils.triangulateShape(vectors,[]);
   const positions=[];
   const tri=(a,b,c)=>positions.push(...a,...c,...b);
   for(const indices of triangles){
    const [a,b,c]=indices.map(i=>outline[i]);
    tri([a[0],h,a[1]],[b[0],h,b[1]],[c[0],h,c[1]]);
    tri([c[0],0,c[1]],[b[0],0,b[1]],[a[0],0,a[1]]);
   }
   for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];
    tri([a[0],0,a[1]],[b[0],0,b[1]],[b[0],h,b[1]]);
    tri([a[0],0,a[1]],[b[0],h,b[1]],[a[0],h,a[1]]);
   }
   const g=new THREE.BufferGeometry();
   g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
   // The texture workshop writes continuous physical UV for every face.
   g.setAttribute('uv',new THREE.Float32BufferAttribute(
    new Float32Array(positions.length/3*2),2));
   g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
   add(g);
  }
  if(kind==='arc90')add(annularMesh(Math.PI/2,2,h,thickness,sx,sz));
  if(kind==='arc180')add(annularMesh(Math.PI,2,h,thickness,sx,sz));
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
 function localBounds(root,include=null){
  root.updateWorldMatrix(true,true);
  const inv=root.matrixWorld.clone().invert(),m=new THREE.Matrix4(),bounds=new THREE.Box3();
  root.traverse(child=>{
   if(!child.isMesh||!child.geometry||(include&&!include(child)))return;
   if(!child.geometry.boundingBox)child.geometry.computeBoundingBox();
   if(!child.geometry.boundingBox)return;
   m.multiplyMatrices(inv,child.matrixWorld);
   bounds.union(child.geometry.boundingBox.clone().applyMatrix4(m));
  });
  return bounds;
 }
 function socketMesh(mesh){
  return mesh.isMesh&&mesh.geometry?.attributes?.position&&
   !mesh.userData?.phoenixLODProxy&&!mesh.userData?.phoenixInsert&&
   (mesh.visible!==false||mesh.userData?.phoenixLODInstalled);
 }
 // Recognize arc GLB cross-sections in root-local space. The importer does
 // not need names: the geometry itself must prove two radial edges, uniform
 // thickness and a consistent centreline circle. Ambiguous meshes remain manual.
 function arcSockets(root){
  root.updateWorldMatrix(true,true);
  const meshes=[];root.traverse(m=>{if(socketMesh(m))meshes.push(m)});
  if(meshes.length!==1)return [];
  const mesh=meshes[0],attr=mesh.geometry.attributes.position;
  if(attr.count<16||attr.count>150000)return [];
  const inverse=root.matrixWorld.clone().invert(),toRoot=new THREE.Matrix4()
   .multiplyMatrices(inverse,mesh.matrixWorld);
  const bounds=localBounds(root,socketMesh),base=bounds.min.y,points=[],temp=V();
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
 // Recover the physical rim from side triangles. GLB exporters can reorder
 // or duplicate vertices, so consecutive POSITION records need not form pairs.
 function wallRim(root,meshes,base){
  const inverse=root.matrixWorld.clone().invert(),vertices=new Map();
  const point=V(),triangle=[V(),V(),V()];
  const node=p=>{
   const key=Math.round(p.x*10000)+':'+Math.round(p.z*10000);
   if(!vertices.has(key))vertices.set(key,{point:V(p.x,base,p.z),neighbors:new Set()});
   return vertices.get(key);
  };
  let total=0;
  for(const mesh of meshes){
   const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
   const count=index?.count||position.count;
   total+=count;if(total>450000)return [];
   const transform=inverse.clone().multiply(mesh.matrixWorld);
   for(let i=0;i+2<count;i+=3){
    const rim=[];
    for(let j=0;j<3;j++){
     const p=point.fromBufferAttribute(position,index?index.getX(i+j):i+j)
      .applyMatrix4(transform);
     if(Math.abs(p.y-base)<.014)rim.push(triangle[j].copy(p));
    }
    if(rim.length!==2)continue;
    const [a,b]=rim.map(node);
    if(a===b)continue;
    a.neighbors.add(b);b.neighbors.add(a);
   }
  }
  if(vertices.size<4||vertices.size>1500)return [];
  if([...vertices.values()].some(item=>item.neighbors.size!==2))return [];
  const first=vertices.values().next().value,loop=[];
  let current=first,previous=null;
  do{
   loop.push(current.point);
   const next=[...current.neighbors].find(item=>item!==previous);
   previous=current;current=next;
  }while(current!==first&&loop.length<vertices.size);
  if(loop.length!==vertices.size||current!==first)return [];
  // Material seams can split a single flat cap into several rim edges.
  return loop.filter((p,i)=>{
   const before=loop[(i+loop.length-1)%loop.length];
   const after=loop[(i+1)%loop.length];
   return p.clone().sub(before).normalize().dot(after.clone().sub(p).normalize())<.9995;
  });
 }
 function arcRimSockets(loop){
  if(loop.length<8)return [];
  const at=i=>loop[(i+loop.length)%loop.length];
  const sharp=loop.map((p,i)=>Math.abs(at(i-1).clone().sub(p).normalize()
   .dot(at(i+1).clone().sub(p).normalize()))<.48);
  const caps=loop.flatMap((p,i)=>{
   if(!sharp[i]||!sharp[(i+1)%loop.length])return [];
   const next=at(i+1),direction=next.clone().sub(p),width=direction.length();
   if(width<.015||width>1.2)return [];
   const center=p.clone().lerp(next,.5);
   direction.normalize();
   const out=V(-direction.z,0,direction.x);
   if(out.dot(center.clone().sub(at(i-1).clone().lerp(at(i+2),.5)))<0)out.negate();
   return [{a:p,b:next,point:center,direction,width,out}];
  });
  if(caps.length!==2)return [];
  const [first,last]=caps;
  if(Math.abs(first.width-last.width)>.06)return [];
  const cross=(a,b)=>a.x*b.z-a.z*b.x;
  const delta=last.point.clone().sub(first.point);
  const det=cross(first.direction,last.direction);
  let center;
  if(Math.abs(det)<.025){
   if(Math.abs(cross(delta,first.direction))>.065)return [];
   center=first.point.clone().lerp(last.point,.5);
  }else{
   center=first.point.clone().addScaledVector(first.direction,cross(delta,last.direction)/det);
  }
  const r1=center.distanceTo(first.a),r2=center.distanceTo(first.b);
  const width=(first.width+last.width)/2,radius=(r1+r2)/2;
  if(radius<.5||radius>120||width>radius*.7||Math.abs(Math.abs(r1-r2)-width)>.065)
   return [];
  const tolerance=Math.max(.012,Math.min(.065,width*.25));
  if(loop.some(p=>{
   const r=p.distanceTo(center);
   return Math.min(Math.abs(r-r1),Math.abs(r-r2))>tolerance;
  }))return [];
  return caps.map(({point,out})=>({point,out}));
 }
 function lCornerSockets(root){
  root.updateWorldMatrix(true,true);
  const inv=root.matrixWorld.clone().invert();
  const slabs=[];
  root.traverse(mesh=>{
   if(!socketMesh(mesh))return;
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
 // A straight GLB may have separate material primitives. When it does,
 // require physical cap triangles at both ends rather than guessing from bounds.
 function hasStraightCaps(root,meshes,box,axis,crossAxis){
  const inverse=root.matrixWorld.clone().invert();
  const area=[0,0],ends=[box.min[axis],box.max[axis]],p=[V(),V(),V()];
  let total=0;
  for(const mesh of meshes){
   const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
   const count=index?.count||position.count;
   total+=count;if(total>450000)return false;
   const transform=inverse.clone().multiply(mesh.matrixWorld);
   for(let i=0;i+2<count;i+=3){
    for(let j=0;j<3;j++)
     p[j].fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(transform);
    for(let side=0;side<2;side++){
     if(p.some(point=>Math.abs(point[axis]-ends[side])>.015))continue;
     const [a,b,c]=p;
     area[side]+=Math.abs((b[crossAxis]-a[crossAxis])*(c.y-a.y)-
      (c[crossAxis]-a[crossAxis])*(b.y-a.y))*.5;
    }
   }
  }
  const full=(box.max[crossAxis]-box.min[crossAxis])*(box.max.y-box.min.y);
  return area.every(value=>value>=full*.35);
 }
 function straightSockets(root,meshes,box){
  const size=box.getSize(V());
  if(!meshes.length||!Number.isFinite(size.x)||size.y<.4)return [];
  const thin=Math.min(size.x,size.z),long=Math.max(size.x,size.z);
  if(thin>.8||thin<.01||long<.5||long/thin<3.2)return [];
  const axis=size.x>=size.z?'x':'z',crossAxis=axis==='x'?'z':'x';
  if(meshes.length>1&&!hasStraightCaps(root,meshes,box,axis,crossAxis)){
   // Sloped tops or cutouts can leave small end faces. A complete
   // rectangular base still gives two physical ends at the same level.
   const rim=wallRim(root,meshes,box.min.y);
   if(rim.length!==4||!['min','max'].every(end=>['min','max'].every(side=>
    rim.some(p=>Math.abs(p[axis]-box[end][axis])<.015&&
      Math.abs(p[crossAxis]-box[side][crossAxis])<.015))))return [];
  }
  return [-1,1].map(side=>{
   const point=box.getCenter(V()),out=V();
   point.y=box.min.y;point[axis]=side<0?box.min[axis]:box.max[axis];
   out[axis]=side;
   return {point,out};
  });
 }
 function extractedSockets(root,category){
  if(category!=='wall')return [];
  // Use actual curved cross-sections and separate L-arms when recognizable.
  const curved=arcSockets(root);if(curved.length===2)return curved;
  const angle=lCornerSockets(root);if(angle.length===2)return angle;
  const children=[];root.traverse(c=>{if(socketMesh(c))children.push(c)});
  const box=localBounds(root,socketMesh);
  if(box.isEmpty())return [];
  const straight=straightSockets(root,children,box);
  return straight.length?straight:arcRimSockets(wallRim(root,children,box.min.y));
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
 // Four REAL horizontal edge midpoints for rectangular floor slabs. The
 // previous socket contract had only wall ENDPOINTS, so floor tiles never
 // participated in magnet joins (even the built-in 2 x 2 m floor).
 // Custom GLB floors must have all four physical footprint corners. This
 // deliberately rejects triangular/curved/quarter-circle tiles: an AABB is
 // NOT enough evidence that a curved edge can join a straight slab.
 function floorSockets(kind,root){
  if(!root)return [];
  const box=localBounds(root,socketMesh),size=box.getSize(V());
  if(box.isEmpty()||size.x<.15||size.z<.15)return [];
  if(kind!=='floor'){
   root.updateWorldMatrix(true,true);
   const inv=root.matrixWorld.clone().invert();
   const required=[[box.min.x,box.min.z],[box.min.x,box.max.z],
    [box.max.x,box.min.z],[box.max.x,box.max.z]];
   const covered=required.map(()=>false);
   const margin=Math.max(.012,Math.min(.07,Math.min(size.x,size.z)*.025));
   let scanned=0;
   root.traverse(mesh=>{
    if(!socketMesh(mesh))return;
    const points=mesh.geometry.attributes.position;
    const transform=inv.clone().multiply(mesh.matrixWorld),p=V();
    // Keep this cheap for huge imported libraries on an Android tablet.
    const stride=Math.max(1,Math.ceil(points.count/12000));
    for(let i=0;i<points.count;i+=stride){
     p.fromBufferAttribute(points,i).applyMatrix4(transform);scanned++;
     for(let j=0;j<required.length;j++)
      if(Math.abs(p.x-required[j][0])<=margin&&
         Math.abs(p.z-required[j][1])<=margin)covered[j]=true;
    }
   });
   if(!scanned||!covered.every(Boolean))return [];
  }
  const cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2,
   y=box.min.y;
  return [
   {point:V(box.max.x,y,cz),out:V(1,0,0),span:size.z},
   {point:V(box.min.x,y,cz),out:V(-1,0,0),span:size.z},
   {point:V(cx,y,box.max.z),out:V(0,0,1),span:size.x},
   {point:V(cx,y,box.min.z),out:V(0,0,-1),span:size.x}
  ];
 }
 const catalogSocketCache=new WeakMap();
 function catalogSockets(kind,root,category){
  if(!root)return [];
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),parts=[];
  root.traverse(mesh=>{
   if(!socketMesh(mesh))return;
   const {index,attributes:{position}}=mesh.geometry;
   parts.push({position,index,version:position.version??position.data?.version,
    indexVersion:index?.version,matrix:inverse.clone().multiply(mesh.matrixWorld)});
  });
  const cached=catalogSocketCache.get(root);
  if(cached?.category===category&&cached.parts.length===parts.length&&
   parts.every((part,i)=>{
    const old=cached.parts[i];
    return part.position===old.position&&part.index===old.index&&
     part.version===old.version&&part.indexVersion===old.indexVersion&&
     part.matrix.elements.every((value,j)=>Math.abs(value-old.matrix.elements[j])<1e-8);
   }))return cached.sockets;
  const exact=category==='floor'?floorSockets(kind,root):extractedSockets(root,category);
  // Curved and quarter-circle floor GLBs have no four AABB corners, so the
  // rectangular tile check intentionally rejects them. Recover only REAL
  // straight boundaries from the physical triangle contour; never invent
  // a missing square corner or use the round perimeter as a straight edge.
  const raw=exact.length?exact:perimeterSockets(parts,category);
  const maxPhysicalEdge=Math.max(0,...raw.map(s=>s.span||0));
  // Arc tessellation consists of short little chords; only the long radial
  // edges of a 90/180 degree sector may act as magnetic join edges.
  const threshold=category==='floor'&&!exact.length?
   Math.max(.22,maxPhysicalEdge*.5):0;
  const sockets=threshold?raw.filter(socket=>socket.span>=threshold):raw;
  catalogSocketCache.set(root,{category,parts,sockets});
  return sockets;
 }
 const crossXZ=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 function perimeterSockets(parts,category){
  const vertices=new Map(),triangles=[];
  let base=Infinity;
  for(const {position,index,matrix} of parts){
   const points=[];
   for(let i=0;i<position.count;i++){
    const point=V().fromBufferAttribute(position,i).applyMatrix4(matrix);
    const key=Math.round(point.x*10000)+':'+Math.round(point.z*10000);
    base=Math.min(base,point.y);
    if(!vertices.has(key))vertices.set(key,point.setY(0));
    points.push(vertices.get(key));
   }
   triangles.push({points,index,count:index?.count??points.length});
  }
  const sorted=[...vertices.values()].sort((a,b)=>a.x-b.x||a.z-b.z);
  if(sorted.length<3)return [];
  // Convex support lines keep two models on opposite sides of the contact.
  const half=points=>{
   const chain=[];
   for(const point of points){
    while(chain.length>=2&&crossXZ(chain[chain.length-2],chain.at(-1),point)<=0)
     chain.pop();
    chain.push(point);
   }
   chain.pop();
   return chain;
  };
  const hull=half(sorted).concat(half(sorted.slice().reverse()));
  const edges=hull.map((a,i)=>{
   const b=hull[(i+1)%hull.length],along=b.clone().sub(a),length=along.length();
   along.normalize();
   return {a,along,length,out:V(along.z,0,-along.x),segments:[]};
  }).filter(edge=>edge.length>.0001);
  if(!edges.length)return [];
  for(const edge of edges){
   const plane=edge.out.dot(edge.a),origin=edge.along.dot(edge.a);
   for(const {points,index,count} of triangles){
    const offsets=points.map(p=>Math.abs(edge.out.dot(p)-plane)<.001?
     edge.along.dot(p)-origin:NaN);
    for(let i=0;i+2<count;i+=3){
     const on=[offsets[index?index.getX(i):i],offsets[index?index.getX(i+1):i+1],
      offsets[index?index.getX(i+2):i+2]].filter(Number.isFinite);
     if(on.length<2)continue;
     const start=Math.max(0,Math.min(...on)),end=Math.min(edge.length,Math.max(...on));
     if(end-start>.002)edge.segments.push([start,end]);
    }
   }
  }
  const choices=edges.map(edge=>{
   const runs=[];
   for(const [start,end] of edge.segments.sort((a,b)=>a[0]-b[0])){
    const last=runs.at(-1);
    if(last&&start<=last[1]+.001)last[1]=Math.max(last[1],end);
    else runs.push([start,end]);
   }
   const longest=runs.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0];
   const span=longest?longest[1]-longest[0]:0;
   const point=edge.a.clone().addScaledVector(edge.along,
    longest?(longest[0]+longest[1])/2:0).setY(base);
   // If the support line crosses a concavity, use a real mesh vertex.
   return {point,out:edge.out,boundary:true,span};
  });
  const size=new THREE.Box3().setFromPoints(hull).getSize(V());
  const axis=size.x>=size.z?'x':'z',other=axis==='x'?'z':'x';
  let sockets;
  if(category==='wall'&&size[axis]>=size[other]*2.2){
   // Prefer the short ends of a wall over the long front/back faces.
   return [-1,1].map(side=>choices.reduce((best,socket)=>
    side*socket.out[axis]>side*best.out[axis]?socket:best));
  }
  const directions=new Map();
  for(const socket of choices){
   const bucket=(Math.round(Math.atan2(socket.out.z,socket.out.x)*8/Math.PI)+16)%16;
   if((directions.get(bucket)?.span??-1)<socket.span)directions.set(bucket,socket);
  }
  return [...directions.values()];
 }
 function sockets(kind,root,custom=null,category='wall'){
  if(Array.isArray(custom)&&custom.length===2)
   return custom.map(s=>({point:V(...s.point),out:V(...s.out).setY(0).normalize()}));
  if(kind.startsWith('glb:pwb:')&&(category==='floor'||category==='wall'))
   return catalogSockets(kind,root,category);
  if(category==='floor'){
   if(kind==='floor')return floorSockets(kind,root);
   const regular=floorSockets(kind,root);
   if(regular.length)return regular;
   // Light user-imported quarter / half circle floors can snap by their
   // measured radial edges. Skip polygon analysis for large arbitrary GLBs.
   let count=0;
   root.traverse(mesh=>{if(socketMesh(mesh))count+=mesh.geometry.attributes.position.count});
   return count>0&&count<=12000?catalogSockets(kind,root,category):[];
  }
  return isBuiltIn(kind)?builtinSockets(kind):extractedSockets(root,category);
 }
 function worldSockets(entry){
  const root=entry.root,local=sockets(entry.kind,root,entry.sockets,entry.category);
  root.updateWorldMatrix(true,true);
  const normal=new THREE.Matrix3().getNormalMatrix(root.matrixWorld);
  const linear=new THREE.Matrix3().setFromMatrix4(root.matrixWorld);
  return local.map((socket,i)=>({
   index:i,point:socket.point.clone().applyMatrix4(root.matrixWorld),
   out:(socket.boundary?socket.out.clone().applyMatrix3(normal):
    socket.out.clone().transformDirection(root.matrixWorld)).setY(0).normalize(),
   boundary:socket.boundary,
   span:socket.span?V(socket.out.z,0,-socket.out.x).applyMatrix3(linear).length()*socket.span:0
  }));
 }
 function localCenters(kind,root,custom,category){
  return sockets(kind,root,custom,category);
 }
 // A new course follows the actual top of the same wall on the level below.
 function stackWall(preview,entries,cursor,storey,ray=null){
  if(storey<1||preview.category!=='wall'||Number.isFinite(preview.manualPlacementY))return null;
  const upright=root=>Math.abs(root.rotation.x)+Math.abs(root.rotation.z)<.001;
  if(!upright(preview.root))return null;
  const scale=preview.root.scale;
  const candidates=entries.filter(entry=>entry.storey===storey-1&&entry.kind===preview.kind&&
   entry.category==='wall'&&!entry.hidden&&upright(entry.root)&&
   Math.abs(entry.root.scale.x-scale.x)<.001&&Math.abs(entry.root.scale.z-scale.z)<.001);
  if(!candidates.length)return null;
  const bounds=localBounds(preview.root,socketMesh);
  if(bounds.isEmpty())return null;
  const center=bounds.getCenter(V()).multiply(scale),foot=bounds.getSize(V()).multiply(scale);
  const radius=Math.min(.7,Math.max(.25,Math.max(Math.abs(foot.x),Math.abs(foot.z))*.22));
  let aimed=null;
  if(ray){
   const owners=new Map(candidates.map(entry=>[entry.root,entry]));
   const hit=ray.intersectObjects([...owners.keys()],true)[0];
   for(let node=hit?.object;node&&!aimed;node=node.parent)aimed=owners.get(node);
  }
  let best=null;
  for(const target of candidates){
   const {root}=target,rotation=root.rotation.y;
   const middle=rotate(center,rotation).add(root.position);
   const distanceTo=point=>Math.hypot(point.x-cursor.x,point.z-cursor.z);
   let distance=Math.min(distanceTo(middle),distanceTo(root.position));
   if(target!==aimed&&distance>radius){
    if(distance>Math.hypot(foot.x,foot.z)+radius)continue;
    distance=Math.min(distance,distanceTo(bbox(root).getCenter(V())));
    if(distance>radius)continue;
   }
   const base=localBounds(root,socketMesh);
   if(base.isEmpty()||['x','z'].some(axis=>Math.abs(base.min[axis]-bounds.min[axis])>.015||
    Math.abs(base.max[axis]-bounds.max[axis])>.015))continue;
   const position=root.position.clone();
   position.y+=base.max.y*root.scale.y-bounds.min.y*scale.y;
   if(entries.some(entry=>entry.storey===storey&&entry.kind===preview.kind&&
    entry.root.position.distanceToSquared(position)<.0004))continue;
   const score=target===aimed?0:distance;
   if(!best||score<best.score)best={score,position,rotation,target:target.id,stack:true};
  }
  return best;
 }
 function solveSnap(preview,entries,cursor,storey=0,extraRotation=0){
  if(!preview||!cursor)return null;
  const own=localCenters(preview.kind,preview.root,preview.sockets,preview.category);
  if(!own.length)return null;
  const shape=localBounds(preview.root);
  const center=shape.getCenter(V());
  const scaledCenter=center.multiply(preview.root.scale);
  const foot=shape.getSize(V()),floorJoin=preview.category==='floor';
  const maxDist=floorJoin?(own.length<=2?1.25:Math.max(.18,Math.min(.65,
   Math.min(foot.x*Math.abs(preview.root.scale.x),
    foot.z*Math.abs(preview.root.scale.z))*.28))):
   Math.min(3.6,Math.max(1.6,foot.length()*.49));
  let best=null;
  for(const entry of entries){
   if(entry.storey!==storey||entry.id===preview.id||entry.hidden)continue;
   if(entry.category!==preview.category)continue;
   for(const tgt of worldSockets(entry))for(let i=0;i<own.length;i++){
    const src=own[i];
    if(src.out.lengthSq()<.5||tgt.out.lengthSq()<.5)continue;
    const desired=tgt.out.clone().negate();
    const theta=x=>Math.atan2(-x.z,x.x);
    // The magnet must always oppose the two end tangents. A user rotation
    // may affect free positioning, but may never fake a green socket join.
     const outgoing=src.out.clone();
     if(src.boundary)outgoing.divide(preview.root.scale);
     else outgoing.multiply(preview.root.scale);
     outgoing.setY(0).normalize();
     const yaw=theta(desired)-theta(outgoing);
    const scaled=V(src.point.x*preview.root.scale.x,src.point.y*preview.root.scale.y,
       src.point.z*preview.root.scale.z);
    const projected=rotate(scaled,yaw);
    const pos=tgt.point.clone().sub(projected);
    if(floorJoin){
     // Align the *visible top* rather than the bottom: two otherwise
     // compatible floor modules can differ in slab thickness by 2-3 mm.
     const targetBounds=localBounds(entry.root,socketMesh);
     if(!targetBounds.isEmpty()){
      const targetTop=entry.root.position.y+targetBounds.max.y*entry.root.scale.y;
      const selfTop=pos.y+shape.max.y*preview.root.scale.y;
      if(Math.abs(targetTop-selfTop)<=.035)pos.y+=targetTop-selfTop;
     }
    }
    const middle=rotate(scaledCenter,yaw).add(pos);
    const distance=Math.hypot(middle.x-cursor.x,middle.z-cursor.z);
    if(floorJoin){
     // A floor at another manually raised level must never pull a slab
     // upward/downward into an unrelated surface on the same storey.
     const currentBase=preview.root.position.y+
      src.point.y*preview.root.scale.y;
     if(Math.abs(currentBase-tgt.point.y)>.035)continue;
    }
    if(distance>maxDist)continue;
    const boundary=!!(src.boundary||tgt.boundary);
    const turn=Math.atan2(Math.sin(yaw-extraRotation),Math.cos(yaw-extraRotation));
    const score=distance+Math.hypot(tgt.point.x-cursor.x,tgt.point.z-cursor.z)*.1+
     (floorJoin||boundary?Math.abs(turn)*.12:0)+(boundary ? .08 : 0);
    if(!best||score<best.score)best={score,position:pos,rotation:yaw,
      from:i,to:tgt.index,target:entry.id,kind:entry.kind,boundary};
   }
  }
  if(best||preview.category!=='wall')return best;
  return wallOnFloor(preview,own,entries,cursor,storey,extraRotation);
 }
 // A straight wall can follow a slab edge at the same construction level.
 // Leave longer walls free so a short or curved edge cannot claim support.
 function wallOnFloor(preview,ends,entries,cursor,storey,yaw){
  if(ends.length!==2||ends[0].out.dot(ends[1].out)>-.995||
   Math.abs(preview.root.rotation.x)+Math.abs(preview.root.rotation.z)>.001)return null;
  const scale=preview.root.scale;
  const a=ends[0].point.clone().multiply(scale),b=ends[1].point.clone().multiply(scale);
  const middle=a.clone().lerp(b,.5),length=a.distanceTo(b);
  const currentBase=preview.root.position.y+middle.y;
  const axis=b.clone().sub(a);
  const theta=vector=>Math.atan2(-vector.z,vector.x);
  let best=null;
  for(const entry of entries){
   if(entry.category!=='floor'||entry.storey!==storey||entry.hidden||
    Math.abs(entry.root.rotation.x)+Math.abs(entry.root.rotation.z)>.001)continue;
   for(const edge of worldSockets(entry)){
    if(edge.span<length-.015||Math.abs(edge.point.y-currentBase)>.035)continue;
    const distance=Math.hypot(edge.point.x-cursor.x,edge.point.z-cursor.z);
    if(distance>.32||best&&distance>=best.score)continue;
    const parallel=theta(V(edge.out.z,0,-edge.out.x))-theta(axis);
    const rotation=parallel+(Math.cos(parallel-yaw)<0?Math.PI:0);
    best={score:distance,position:edge.point.clone().sub(rotate(middle,rotation)),
     rotation,target:entry.id,kind:entry.kind,wallOnFloor:true};
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
 // UV19: snap to the wall *face* the user actually points at, not the
 // assumed location of the future slab centre. A centre-only threshold
 // silently refused to rotate slabs when the touch was directly on the wall.
 // Never mutate installed walls, floors, or any old project data.
 function floorOnWall(preview,entries,cursor,storey){
  if(!preview||preview.category!=='floor'||!preview.root||!cursor||
     Math.abs(preview.root.rotation.x)+Math.abs(preview.root.rotation.z)>.001||
     preview.floorTrim?.enabled||preview.floorTrim?.cuts?.length||
     preview.autoEdgeCuts?.length||preview.manualEdgeCut)return null;
  if(floorSockets(preview.kind,preview.root).length!==4)return null;
  const root=preview.root,box=localBounds(root,socketMesh);
  if(box.isEmpty())return null;
  const sx=Math.abs(root.scale.x),sy=Math.abs(root.scale.y),sz=Math.abs(root.scale.z);
  const w=(box.max.x-box.min.x)*sx,d=(box.max.z-box.min.z)*sz;
  if(w<.1||d<.1)return null;
  const floorBase=root.position.y+box.min.y*sy;
  const floorCentre=V((box.min.x+box.max.x)/2,0,(box.min.z+box.max.z)/2)
   .multiply(root.scale);
  const currentYaw=root.rotation.y;
  const candidates=[];
  for(const wall of entries){
   if(wall===preview||wall.hidden||wall.category!=='wall'||wall.storey!==storey||
      !wall.root||Math.abs(wall.root.rotation.x)+Math.abs(wall.root.rotation.z)>.001)continue;
   const wallRoot=wall.root,b=localBounds(wallRoot,socketMesh);
   if(b.isEmpty())continue;
   const wx=(b.max.x-b.min.x)*Math.abs(wallRoot.scale.x);
   const wz=(b.max.z-b.min.z)*Math.abs(wallRoot.scale.z);
   const wallAlongX=wx>=wz,wallLength=Math.max(wx,wz),thickness=Math.min(wx,wz);
   // Do not treat towers, curved walls, corner blocks or wide decorations as
   // straight wall faces. Curved rooms require a separate polygon trim tool.
   if(wallLength<.65||thickness<.01||thickness>.75||
      wallLength<thickness*3)continue;
   wallRoot.updateWorldMatrix(true,true);
   const centre=V((b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,
    (b.min.z+b.max.z)/2).applyMatrix4(wallRoot.matrixWorld);
   const wallBase=V(0,b.min.y,0).applyMatrix4(wallRoot.matrixWorld).y;
   if(Math.abs(floorBase-wallBase)>.28)continue;
   const tangent=(wallAlongX?V(1,0,0):V(0,0,1))
    .transformDirection(wallRoot.matrixWorld).setY(0).normalize();
   const baseNormal=V(-tangent.z,0,tangent.x);
   const relative=cursor.clone().sub(centre).setY(0);
   const along=relative.dot(tangent),across=relative.dot(baseNormal);
   // Proximity is measured to the *wall edge*, where the finger points.
   // Older UV18 measured to the intended slab centre 1m away, so the magnet
   // failed silently even when the cursor visibly touched a wall.
   const outside=Math.max(0,Math.abs(along)-wallLength/2);
   const sideDistance=Math.abs(across)-thickness/2;
   const maxWallDistance=Math.max(.65,Math.min(1.5,d*.55+.35));
   if(outside>.3||sideDistance>maxWallDistance)continue;
   // The finger chooses which side of the wall is the room. Keep the side
   // predictable even on the exact centreline: use the previous preview side.
   let signed=across;
   if(Math.abs(signed)<.015){
    signed=root.position.clone().sub(centre).setY(0).dot(baseNormal);
    if(Math.abs(signed)<.015)signed=1;
   }
   const normal=baseNormal.clone().multiplyScalar(signed<0?-1:1);
   const slots=Math.max(1,Math.floor(wallLength/w+1e-5));
   const first=-(slots-1)*w/2;
   const slot=Math.max(0,Math.min(slots-1,Math.round((along-first)/w)));
   const tangentOffset=first+slot*w;
   const physicalCentre=centre.clone().addScaledVector(tangent,tangentOffset)
    .addScaledVector(normal,thickness/2+d/2);
   const yaw=Math.atan2(normal.x,normal.z);
   const shift=rotate(floorCentre,yaw);
   const position=V(physicalCentre.x-shift.x,root.position.y,
    physicalCentre.z-shift.z);
   const savePos=root.position.clone(),saveYaw=root.rotation.y;
   root.position.copy(position);root.rotation.y=yaw;root.updateMatrixWorld(true,true);
   const placement=slabFootprint(preview);
   let occupied=false;
   if(placement)for(const old of entries){
    if(old===preview||old.category!=='floor'||old.hidden||old.storey!==storey)continue;
    if(slabsOverlap(placement,slabFootprint(old))){occupied=true;break}
   }
   root.position.copy(savePos);root.rotation.y=saveYaw;root.updateMatrixWorld(true,true);
   if(occupied)continue;
   const turn=Math.abs(Math.atan2(Math.sin(yaw-currentYaw),Math.cos(yaw-currentYaw)));
   // Prefer the wall directly under the finger, not a distant parallel wall.
   const proximity=Math.max(0,sideDistance)+outside;
   candidates.push({position,rotation:yaw,target:wall.id,kind:wall.kind,
    floorOnWall:true,score:proximity+Math.abs(along-tangentOffset)*.08+turn*.001});
  }
  candidates.sort((a,b)=>a.score-b.score);
  if(!candidates.length)return null;
  const {score,...best}=candidates[0];return best;
 }
 // UV12: rectangular slab occupancy guard. The original socket magnet only
 // checked that the cursor was near the *destination centre*. A tap over a
 // previously laid tile was therefore accepted as a new coplanar floor,
 // causing z-fighting as soon as an opaque texture was applied.
 //
 // Operates on real transformed slab footprints, not the grid or a screen
 // approximation. It never changes placed modules. Non-rectangular floors
 // remain on their existing placement path (no false rectangular guess).
 function slabFootprint(entry){
  if(!entry||entry.category!=='floor'||entry.hidden||!entry.root)return null;
  const root=entry.root;
  if(Math.abs(root.rotation.x)+Math.abs(root.rotation.z)>.001)return null;
  if(floorSockets(entry.kind,root).length!==4)return null;
  const b=localBounds(root,socketMesh);
  if(b.isEmpty())return null;
  root.updateWorldMatrix(true,true);
  const corners=[[b.min.x,b.min.z],[b.max.x,b.min.z],
   [b.max.x,b.max.z],[b.min.x,b.max.z]].map(([x,z])=>{
    const p=V(x,b.max.y,z).applyMatrix4(root.matrixWorld);
    return {x:p.x,z:p.z};
   });
  const mid=V((b.min.x+b.max.x)/2,b.max.y,(b.min.z+b.max.z)/2)
   .applyMatrix4(root.matrixWorld);
  return {corners,top:mid.y,center:mid};
 }
 // Separating-axis test on the actual two rotated rectangles. Touching edges
 // are valid. A 2-mm true penetration counts as an unwanted overlap.
 function slabsOverlap(a,b){
  if(!a||!b||Math.abs(a.top-b.top)>.035)return false;
  for(const rect of [a,b])for(let i=0;i<4;i++){
   const p=rect.corners[i],q=rect.corners[(i+1)%4],dx=q.x-p.x,dz=q.z-p.z;
   const length=Math.hypot(dx,dz);if(length<1e-7)continue;
   const nx=-dz/length,nz=dx/length;
   const range=o=>{
    const values=o.corners.map(c=>c.x*nx+c.z*nz);
    return [Math.min(...values),Math.max(...values)];
   };
   const [amin,amax]=range(a),[bmin,bmax]=range(b);
   if(Math.min(amax,bmax)-Math.max(amin,bmin)<=.002)return false;
  }
  return true;
 }
 function preventFloorOverlap(preview,entries,cursor,storey){
  if(preview?.category!=='floor')return null;
  const here=slabFootprint(preview);if(!here)return null;
  // Only coplanar slabs from this floor are blockers: a ceiling or a floor on
  // another storey must never shift this module sideways.
  const neighbours=[];
  for(const entry of entries){
   if(entry.storey!==storey||entry.hidden||entry.id===preview.id||
      entry.category!=='floor')continue;
   const fp=slabFootprint(entry);
   if(fp&&Math.abs(fp.top-here.top)<=.035)neighbours.push({entry,fp});
  }
  if(!neighbours.some(n=>slabsOverlap(here,n.fp)))return null;
  // Consider only real floor-edge sockets. Keep the current yaw/scale when
  // possible; never invent an AABB corner socket for a curved slab.
  const own=floorSockets(preview.kind,preview.root);
  const initialPos=preview.root.position.clone(),initialYaw=preview.root.rotation.y;
  const scale=preview.root.scale;
  const theta=dir=>Math.atan2(-dir.z,dir.x);
  let best=null;
  for(const target of neighbours){
   // A far-away floor must not attract a module across the building.
   if(Math.hypot(target.fp.center.x-cursor.x,target.fp.center.z-cursor.z)>10)continue;
   for(const tgt of worldSockets(target.entry))for(const src of own){
    if(!src.out||!tgt.out||src.out.lengthSq()<.5||tgt.out.lengthSq()<.5)continue;
    const desired=tgt.out.clone().negate();
    const outgoing=src.out.clone();
    if(src.boundary)outgoing.divide(scale);else outgoing.multiply(scale);
    outgoing.setY(0).normalize();
    const yaw=theta(desired)-theta(outgoing);
    const local=V(src.point.x*scale.x,src.point.y*scale.y,src.point.z*scale.z);
    const position=tgt.point.clone().sub(rotate(local,yaw));
    // The floor guard also works with slightly different slab thicknesses.
    // Align visible top faces, never overlap the actual footprints.
    const sourceBounds=localBounds(preview.root,socketMesh);
    const targetBounds=localBounds(target.entry.root,socketMesh);
    if(!sourceBounds.isEmpty()&&!targetBounds.isEmpty()){
     const targetTop=target.entry.root.position.y+targetBounds.max.y*target.entry.root.scale.y;
     const selfTop=position.y+sourceBounds.max.y*preview.root.scale.y;
     if(Math.abs(targetTop-selfTop)<=.035)position.y+=targetTop-selfTop;
    }
    preview.root.position.copy(position);preview.root.rotation.y=yaw;
    preview.root.updateWorldMatrix(true,true);
    const candidate=slabFootprint(preview);
    if(!candidate||neighbours.some(other=>slabsOverlap(candidate,other.fp)))continue;
    const distance=Math.hypot(candidate.center.x-cursor.x,candidate.center.z-cursor.z);
    // Stay near the tapped location and preserve manual rotation when ties.
    const turn=Math.abs(Math.atan2(Math.sin(yaw-initialYaw),Math.cos(yaw-initialYaw)));
    const score=distance+turn*.04;
    if(!best||score<best.score)best={score,position:position.clone(),rotation:yaw,
     target:target.entry.id,kind:target.entry.kind,boundary:true,floorGuard:true};
   }
  }
  preview.root.position.copy(initialPos);preview.root.rotation.y=initialYaw;
  preview.root.updateWorldMatrix(true,true);
  if(!best)return {blocked:true,floorGuard:true};
  const {score,...result}=best;return result;
 }
 return {catalog,isBuiltIn,create,builtinSockets,sockets,worldSockets,solveSnap,stackWall,
   localBounds,bbox,autoRoofHeight,rotate,thicknessInfo,resizeImportedThickness,
   preventFloorOverlap,slabFootprint,slabsOverlap,floorOnWall};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CleanGeometry;
