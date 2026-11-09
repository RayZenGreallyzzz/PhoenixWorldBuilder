/* Offline material/texture palette for Phoenix Builder modules.
 * Texture choices persist as small descriptors, custom image bytes in IndexedDB.
 * Only instance materials are modified; catalog GLBs and their maps stay intact.
 */
const SurfaceMaterials=(()=>{
 'use strict';
 const styles=['none','paint','brick','stone','wood','tile','concrete','plaster','metal','custom'];
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const modes=['auto','repeat','tile','module','joined','source'];
 const cache=new WeakMap();
 const proceduralCache=new Map();
 const numeric=(v,def,min,max)=>{
  const x=Number(v);
  return v===undefined||v===null||v===''||!Number.isFinite(x)?def:clamp(x,min,max);
 };
 const labels={none:'Исходный',paint:'🎨 Краска',brick:'🧱 Кирпич',stone:'🪨 Камень',
  wood:'🪵 Дерево',tile:'▦ Плитка',concrete:'◻ Бетон',plaster:'🏠 Штукатурка',metal:'⚙ Металл',custom:'🖼 Изображение'};
 function normalize(raw){
  const d=raw||{},style=styles.includes(d.style)?d.style:'none';
  const defaults=style==='metal'?{roughness:.42,metalness:.7}:
   {roughness:.92,metalness:0};
  return {style,color:/^#[0-9a-f]{6}$/i.test(d.color||'')?d.color:'#ffffff',
   repeat:numeric(d.repeat,1,.2,12),
   imageId:typeof d.imageId==='string'?d.imageId.slice(0,110):'',
   mapping:modes.includes(d.mapping)?d.mapping:'auto',
   tileMeters:numeric(d.tileMeters,1,.05,100),
   imageScale:numeric(d.imageScale,1,.1,10),
   offsetU:numeric(d.offsetU,0,-1000,1000),
   offsetV:numeric(d.offsetV,0,-1000,1000),
   rotation:numeric(d.rotation,0,-360,360),
   roughness:numeric(d.roughness,defaults.roughness,0,1),
   metalness:numeric(d.metalness,defaults.metalness,0,1),
   relief:numeric(d.relief,0,0,2),
   applyFrames:d.applyFrames===true,
   region:Array.isArray(d.region)&&d.region.length===4&&
    d.region.every(v=>typeof v==='number'&&Number.isFinite(v))&&
    d.region[2]>d.region[0]&&d.region[3]>d.region[1]?d.region.slice():null
  };
 }
 function canvasPattern(style){
  if(proceduralCache.has(style))return proceduralCache.get(style);
  const el=document.createElement('canvas');el.width=256;el.height=256;
  const c=el.getContext('2d');if(!c)return null;
  const fill=(color,x=0,y=0,w=256,h=256)=>{c.fillStyle=color;c.fillRect(x,y,w,h)};
  let seed=0xdecafbad;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  if(style==='brick'){
   fill('#dbd0ba');
   for(let y=0,row=0;y<256;y+=54,row++){
    for(let x=-64+(row%2)*64;x<256;x+=128){
     fill('#b66b52',x+3,y+3,122,48);fill('#ca795b',x+6,y+6,114,5);
    }
   }
  }else if(style==='tile'){
   fill('#c0b8a9');
   for(let y=0;y<256;y+=64)for(let x=0;x<256;x+=64){
    fill((x+y)%128===0?'#e3dfd7':'#d1cfc8',x+3,y+3,58,58);
    fill('#f3f0e8',x+5,y+5,56,2);
   }
  }else if(style==='wood'){
   fill('#976740');for(let y=0;y<256;y+=48){
    fill(y%96===0?'#ad7950':'#8d5e3e',0,y+2,256,43);
    for(let k=0;k<8;k++){c.strokeStyle=k%2?'#835534':'#bb8860';c.lineWidth=1+rand()*2;
     c.beginPath();let py=y+4+rand()*36;c.moveTo(0,py);c.bezierCurveTo(60,py-4,170,py+5,256,py);c.stroke()}
   }
  }else if(style==='stone'){
   fill('#999c98');for(let y=0;y<256;y+=64)for(let x=0;x<256;x+=96){
    fill(rand()>.5?'#b8b7b0':'#8c908e',x+3,y+3,90,58);
    fill('#d5d2c8',x+9,y+9,62,3);
   }
  }else if(style==='plaster'){
   fill('#dfdcd2');for(let i=0;i<14000;i++){
    const a=rand()>.5?'#d2cfc7':'#ebe7df';
    fill(a,rand()*256,rand()*256,.5+rand()*1.7,.5+rand()*1.7);
   }
  }else if(style==='metal'){
   fill('#8b939e');for(let y=0;y<256;y+=32){
    fill(y%64?'#77828d':'#9ca5ac',0,y,256,28);
    for(let x=16;x<256;x+=64){c.beginPath();c.fillStyle='#46525d';c.arc(x,y+7,3,0,Math.PI*2);c.fill()}
   }
  }else if(style==='concrete'){
   fill('#b5b7b5');for(let i=0;i<5000;i++){
    c.fillStyle=rand()>.5?'#a4a7a5':'#c7c8c5';c.fillRect(rand()*256,rand()*256,1+rand()*3,1+rand()*3);
   }
  }else return null;
  const t=new THREE.CanvasTexture(el);
  t.encoding=THREE.sRGBEncoding;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=4;proceduralCache.set(style,t);return t;
 }

 // Preserve source glass / alpha materials, including transparent glass
 // primitives INSIDE a single imported multi-material GLB mesh.
 const materialList=m=>Array.isArray(m)?m:[m];
 const glassName=name=>/(glass|glaz|glazing|стекл|витраж|vitre|window.?pane)/i
  .test(String(name||''));
 function protectedMaterial(m){
  return !!m&&(glassName(m.name)||
   (Number(m.transmission)||0)>.001||
   (m.transparent===true&&(Number(m.opacity)<.999||m.alphaTest>0)));
 }
 function protectedMesh(mesh){
  return glassName(mesh.name)||materialList(mesh.material).every(protectedMaterial);
 }
 // Geometry stays a private clone. Restore AUTHOR UVs for original glass
 // triangle groups even when opaque parts of that mesh get new physical UVs.
 function restoreProtectedUV(projected,original,originalMaterials){
  const protectedSlots=new Set(originalMaterials.map((m,i)=>
   protectedMaterial(m)?i:-1).filter(i=>i>=0));
  if(!protectedSlots.size)return;
  const target=projected?.getAttribute('uv');
  const flat=original.index?original.toNonIndexed():original;
  const source=flat.getAttribute('uv');
  if(!target||!source||source.count!==target.count){
   if(flat!==original)flat.dispose();return;
  }
  const groups=original.groups||[];
  for(let i=0;i<target.count;i+=3){
   const group=groups.find(g=>i>=g.start&&i<g.start+g.count);
   const slot=group?.materialIndex||0;
   if(!protectedSlots.has(slot))continue;
   for(let j=0;j<3;j++)target.setXY(i+j,source.getX(i+j),source.getY(i+j));
  }
  target.needsUpdate=true;
  if(flat!==original)flat.dispose();
 }
 // Recognize a verified flat imported wall aligned with either local X or Z.
 // Do not repaint arbitrary GLB sculptures just because the user tagged them wall.
 function flatWallProfile(root,kind,category){
  if(category!=='wall'||!String(kind).startsWith('glb:')||
     typeof CleanGeometry==='undefined'||!CleanGeometry.localBounds)return null;
  const bounds=CleanGeometry.localBounds(root),size=bounds.getSize(new THREE.Vector3());
  if(bounds.isEmpty()||size.y<.4)return null;
  const thickness=Math.min(size.x,size.z),length=Math.max(size.x,size.z);
  if(thickness<.01||thickness>.8||length<.5||length/thickness<3.2)return null;
  return {type:'flat',axis:size.x<size.z?'x':'z',
   centre:size.x<size.z?(bounds.min.x+bounds.max.x)/2:
    (bounds.min.z+bounds.max.z)/2};
 }
 function wallProfile(root,kind,category){
  const workshop=typeof SurfaceWorkshop!=='undefined'?SurfaceWorkshop:null;
  return workshop?.importedWallProfile?.(root,kind,category)||
   flatWallProfile(root,kind,category);
 }
 function mappingFor(style,kind,profile){
  return style.mapping==='auto'?
   (String(kind).startsWith('glb:')&&
    !['arc','corner'].includes(profile?.type)?'source':'repeat'):style.mapping;
 }
 // Each L arm faces away from the INTERIOR of its own geometric bend.
 // Unlike a winding-based convention this assigns one physical exterior to
 // both arms of left- and right-handed L models and ignores cut-out reveals.
 function cornerFace(normal,point,a,b,c){
  const closest=(p,s,e)=>{
   const dx=e.x-s.x,dz=e.z-s.z;
   const u=clamp(((p.x-s.x)*dx+(p.z-s.z)*dz)/
    Math.max(1e-8,dx*dx+dz*dz),0,1);
   return Math.hypot(p.x-s.x-u*dx,p.z-s.z-u*dz);
  };
  const segmentNormal=(s,e)=>{
   const dx=e.x-s.x,dz=e.z-s.z,length=Math.hypot(dx,dz)||1;
   return [-dz/length,dx/length];
  };
  const n0=segmentNormal(a,b),n1=segmentNormal(b,c);
  const align0=Math.abs(normal.x*n0[0]+normal.z*n0[1]),
   align1=Math.abs(normal.x*n1[0]+normal.z*n1[1]);
  const d0=closest(point,a,b),d1=closest(point,b,c);
  // Closest-point alone wrongly swaps the arm for triangles beside the
  // inner L elbow (especially its back face). Require face alignment too.
  const first=align0>.72&&align1<.72?true:
   align1>.72&&align0<.72?false:d0<=d1;
  const origin=first?a:b,finish=first?b:c;
  const dx=finish.x-origin.x,dz=finish.z-origin.z,
   length=Math.hypot(dx,dz);
  if(length<.1)return null;
  const leftX=-dz/length,leftZ=dx/length;
  if(Math.abs(normal.x*leftX+normal.z*leftZ)<.72)return null;
  // For the second arm the earlier arm extends from the turn towards a.
  const towardX=first?c.x-b.x:a.x-b.x,
   towardZ=first?c.z-b.z:a.z-b.z;
  const bend=leftX*towardX+leftZ*towardZ;
  if(Math.abs(bend)<.1)return null;
  const signed=(point.x-origin.x)*leftX+(point.z-origin.z)*leftZ;
  if(Math.abs(signed)<.0005)return null;
  return signed*bend<0?'front':'back';
 }

 function apply(root,raw,customTexture=null,options={}){
  const style=normalize(raw),kind=String(options.kind||root?.name||'');
  if(!root)return {ok:false,reason:'Нет 3D-объекта'};
  // Only verified imported curved/L walls change from authored UV to metres.
  const profile=wallProfile(root,kind,options.category);
  const mapping=mappingFor(style,kind,profile);
  if(style.style==='custom'&&!customTexture)
   return {ok:false,reason:'Сначала выбери загруженное изображение'};
  const template=style.style==='custom'?customTexture:
   style.style==='paint'||style.style==='none'?null:canvasPattern(style.style);
  if(!['paint','none'].includes(style.style)&&!template)
   return {ok:false,reason:'Не удалось создать текстуру'};
  root.updateWorldMatrix(true,true);
  let count=0,changedGeometry=0;
  const texture=template?template.clone():null;
  if(texture){
   texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
   texture.flipY=false;texture.repeat.set(1,1);
   texture.offset.set(0,0);texture.rotation=0;
   texture.encoding=THREE.sRGBEncoding;texture.anisotropy=4;texture.needsUpdate=true;
  }
  const workshop=typeof SurfaceWorkshop!=='undefined'?SurfaceWorkshop:null;
  const normal=style.relief>0&&texture&&workshop?
   workshop.normalFromTexture(template):null;
  root.traverse(mesh=>{
   if(!mesh.isMesh||mesh.userData.phoenixLODProxy)return;
   const isFrame=mesh.name?.startsWith('frame:');
   if(mesh.userData.phoenixInsert&&!(isFrame&&style.applyFrames))return;
   if(mesh.name?.includes('door:leaf')||protectedMesh(mesh))return;
   let original=cache.get(mesh);
   if(!original){
    original={geometry:mesh.geometry,material:mesh.material,
     ownedGeometry:null,ownedMaterials:null};
    cache.set(mesh,original);
   }
   if(original.ownedGeometry){
    mesh.geometry=original.geometry;
    original.ownedGeometry.dispose();original.ownedGeometry=null;
   }
   if(original.ownedMaterials){
    for(const mat of original.ownedMaterials)mat.dispose();
    original.ownedMaterials=null;
   }
   if(style.style==='none'){
    mesh.material=original.material;return;
   }
   if(texture&&workshop){
    const g=workshop.project(root,mesh,original.geometry,
     {...style,mapping,textureAspect:texture.image?.width/
      Math.max(1,texture.image?.height)},kind,profile);
    if(g){
     restoreProtectedUV(g,original.geometry,materialList(original.material));
     mesh.geometry=g;original.ownedGeometry=g;changedGeometry++;
    }
   }
   const update=source=>{
    const copy=(source||new THREE.MeshStandardMaterial()).clone();
    if(texture)copy.map=texture;
    else if(style.style==='paint')copy.map=null;
    if(copy.color)copy.color.set(style.color);
    if('roughness' in copy)copy.roughness=style.roughness;
    if('metalness' in copy)copy.metalness=style.metalness;
    if(normal&&'normalMap' in copy){
     copy.normalMap=normal;
     copy.normalScale=new THREE.Vector2(style.relief,style.relief);
    }else if(style.relief===0&&'normalMap' in copy)copy.normalMap=null;
    copy.needsUpdate=true;return copy;
   };
   const sourceMaterials=materialList(original.material);
   const copies=sourceMaterials.map(m=>protectedMaterial(m)?m:update(m));
   mesh.material=Array.isArray(original.material)?copies:copies[0];
   original.ownedMaterials=copies.filter((m,i)=>m!==sourceMaterials[i]);
   count++;
  });
  return {ok:true,changed:count>0,meshes:count,mapped:changedGeometry,mode:mapping};
 }
 // Normalize user-visible surface overrides. A missing side inherits the base
 // material rather than forcing an opaque invisible plane across openings.
 function normalizeSides(raw){
  const output={};
  for(const side of ['front','back'])
   if(raw?.[side]&&styles.includes(raw[side].style))
    output[side]=normalize(raw[side]);
  return output;
 }
 // A wall side is a PHYSICAL surface, not the sign of a triangle's
 // normal: the generator for cut-out walls has opposite winding to BoxGeometry,
 // and circular walls turn through X/Z as they go around the building.
 // point is a root-local position on the face (not a world position).
 // "front" = local +Z on a straight wall, outer radius on a round wall,
 // or the outside of the two arms of the built-in L corner.
 function sideFromNormal(normal,category='wall',kind='',point=null,profile=null){
  if(category==='floor'){
   if(Math.abs(normal.y)<.65)return null;
   return normal.y>0?'front':'back'; // top / bottom
  }
  if(category!=='wall'||Math.abs(normal.y)>.45)return null;
  const nx=normal.x,nz=normal.z;
  if(point&&profile?.type==='flat'){
   const axis=profile.axis,component=axis==='x'?nx:nz,
    signed=point[axis]-profile.centre;
   if(Math.abs(component)<.72||Math.abs(signed)<.0005)return null;
   return signed>0?'front':'back';
  }
  if(point&&profile?.type==='arc'){
   const dx=point.x-profile.cx,dz=point.z-profile.cz;
   const radius=Math.hypot(dx,dz)||1;
   const radial=(nx*dx+nz*dz)/radius;
   if(Math.abs(radial)<.72)return null; // end caps / reveals
   return radius>=profile.radius?'front':'back';
  }
  if(point&&profile?.type==='corner')
   return cornerFace(normal,point,profile.a,profile.b,profile.c);
  if(point&&kind==='wall'){
   // End caps and door/window reveals must keep their own material.
   if(Math.abs(nz)<.72)return null;
   if(Math.abs(point.z)<.0005)return null;
   return point.z>0?'front':'back';
  }
  if(point&&(kind==='arc90'||kind==='arc180')){
   const radius=Math.hypot(point.x,point.z);
   if(radius<.01)return null;
   // Reject tangential end caps at the start/end of the arc. Accept both
   // normal windings, since pristine and cut-out curved walls differ.
   const radial=(nx*point.x+nz*point.z)/radius;
   if(Math.abs(radial)<.72)return null;
   // Built-in arcs are centred at the local origin, radius 2 m.
   return radius>=2?'front':'back';
  }
  if(point&&kind==='corner')
   return cornerFace(normal,point,new THREE.Vector3(-1.9,0,0),
    new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-1.9));
  // Imported arbitrary GLB walls: retain the previous object-local mapping
  // rather than assume a circular or rectangular profile.
  if(Math.abs(nz)<.65||Math.abs(nz)<Math.abs(nx))return null;
  return nz>0?'front':'back';
 }
 function faceFromHit(hit,root,category,kind=root?.name||''){
  if(!hit?.face?.normal||!hit.object||!root)return null;
  root.updateWorldMatrix(true,true);
  hit.object.updateWorldMatrix(true,false);
  const relative=root.matrixWorld.clone().invert().multiply(hit.object.matrixWorld);
  const normal=hit.face.normal.clone().applyMatrix3(
   new THREE.Matrix3().getNormalMatrix(relative)).normalize();
  const position=hit.point?root.worldToLocal(hit.point.clone()):null;
  const profile=wallProfile(root,kind,category);
  return sideFromNormal(normal,category,kind,position,profile);
 }
 function faceTexture(spec,textures){
  const source=spec.style==='custom'?textures?.get(spec.imageId):
   ['none','paint'].includes(spec.style)?null:canvasPattern(spec.style);
  if(!source)return null;
  const tex=source.clone();tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.flipY=false;tex.repeat.set(1,1);tex.offset.set(0,0);tex.rotation=0;
  tex.encoding=THREE.sRGBEncoding;tex.anisotropy=4;tex.needsUpdate=true;
  return tex;
 }
 function faceMaterial(base,style,texture,workshop){
  const result=(base||new THREE.MeshStandardMaterial()).clone();
  result.name='Phoenix '+style.style+' (отдельная сторона)';
  result.map=texture||null;
  if(result.color)result.color.set(style.color);
  if('roughness' in result)result.roughness=style.roughness;
  if('metalness' in result)result.metalness=style.metalness;
  if(style.relief>0&&texture&&workshop&&'normalMap' in result){
   const normal=workshop.normalFromTexture(
    style.style==='custom'?texture:proceduralCache.get(style.style)||texture);
   result.normalMap=normal||null;
   if(normal)result.normalScale=new THREE.Vector2(style.relief,style.relief);
  }else if('normalMap' in result)result.normalMap=null;
  result.needsUpdate=true;
  return result;
 }
 // Give each large face its own material and UV coordinates, but preserve the
 // original position, triangles, material groups and real wall openings.
 // Uses ordinary glTF material primitives: independent faces survive GLB export.
 function applyFaces(root,baseRaw,rawSides,textures=new Map(),options={}){
  const category=options.category;
  const sides=normalizeSides(rawSides);
  const overrides=Object.keys(sides).filter(side=>sides[side].style!=='none');
  const base=normalize(baseRaw);
  const mainTexture=base.style==='custom'?textures.get(base.imageId):null;
  const result=apply(root,base,mainTexture,options);
  if(!result.ok||!overrides.length||!['wall','floor'].includes(category))return result;
  const workshop=typeof SurfaceWorkshop!=='undefined'?SurfaceWorkshop:null;
  root.updateWorldMatrix(true,true);
  const inverseRoot=root.matrixWorld.clone().invert();
  const profile=wallProfile(root,options.kind,category);
  let modified=0;
  root.traverse(mesh=>{
   if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.userData?.phoenixLODProxy||
    mesh.userData?.phoenixInsert||protectedMesh(mesh)||
    mesh.name?.includes('door:leaf')||!mesh.geometry?.getAttribute('position'))return;
   const remembered=cache.get(mesh);
   const baseline=mesh.geometry;
   const renderGeometry=baseline.index?baseline.toNonIndexed():baseline.clone();
   const pos=renderGeometry.getAttribute('position');
   if(pos.count%3!==0){renderGeometry.dispose();return}
   const originalGroups=baseline.groups||[];
   const baseMaterials=materialList(mesh.material);
   const sideMaterial=new Map(),sideUV=new Map(),materials=baseMaterials.slice();
   const originals=remembered?.geometry||baseline;
   for(const side of overrides){
    const spec=sides[side],texture=faceTexture(spec,textures);
    if(spec.style==='custom'&&!texture)continue;
    const mat=faceMaterial(baseMaterials.find(m=>!protectedMaterial(m)),
     spec,texture,workshop);
    sideMaterial.set(side,materials.length);materials.push(mat);
    if(texture&&workshop){
     const mapping=mappingFor(spec,options.kind,profile);
     const projected=workshop.project(root,mesh,originals,
      {...spec,mapping,textureAspect:texture.image?.width/
       Math.max(1,texture.image?.height)},options.kind||'',profile);
     if(projected){
      if(projected.getAttribute('uv')?.count===pos.count)
       sideUV.set(side,projected.getAttribute('uv'));
      // Copy before disposing, below.
      else projected.dispose();
      if(sideUV.has(side))sideUV.get(side).userData={_temporaryGeometry:projected};
     }
    }
   }
   if(!sideMaterial.size){renderGeometry.dispose();return}
   let uv=renderGeometry.getAttribute('uv');
   if(!uv){uv=new THREE.Float32BufferAttribute(new Float32Array(pos.count*2),2);
    renderGeometry.setAttribute('uv',uv);}
   const transform=inverseRoot.clone().multiply(mesh.matrixWorld);
   const a=new THREE.Vector3(),b=new THREE.Vector3(),d=new THREE.Vector3();
   const ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3(),
    faceCenter=new THREE.Vector3();
   const groupAt=index=>{
    const entry=originalGroups.find(g=>index>=g.start&&index<g.start+g.count);
    // BoxGeometry has six face groups even if the mesh has ONE material.
    // Once this mesh is given a material array, indices 1..5 must not
    // accidentally pick newly added stone/plaster finishes for the edges.
    const materialIndex=entry?.materialIndex||0;
    return materialIndex>=0&&materialIndex<baseMaterials.length?materialIndex:0;
   };
   renderGeometry.clearGroups();let selected=-1,start=0,last=0,changed=false;
   for(let i=0;i<pos.count;i+=3){
    a.fromBufferAttribute(pos,i).applyMatrix4(transform);
    b.fromBufferAttribute(pos,i+1).applyMatrix4(transform);
    d.fromBufferAttribute(pos,i+2).applyMatrix4(transform);
    normal.copy(ab.subVectors(b,a)).cross(ac.subVectors(d,a)).normalize();
    faceCenter.copy(a).add(b).add(d).multiplyScalar(1/3);
    const side=sideFromNormal(normal,category,options.kind,faceCenter,profile);
    const originalIndex=groupAt(i);
    const index=protectedMaterial(baseMaterials[originalIndex])?
     undefined:sideMaterial.get(side);
    const matIndex=index===undefined?originalIndex:index;
    if(index!==undefined)changed=true;
    if(selected!==matIndex){
     if(i>start)renderGeometry.addGroup(start,i-start,selected);
     selected=matIndex;start=i;
    }
    if(index!==undefined&&sideUV.has(side)){
     const projected=sideUV.get(side);
     for(let j=0;j<3;j++)uv.setXY(i+j,
      projected.getX(i+j),projected.getY(i+j));
    }
    last=i+3;
   }
   if(last>start)renderGeometry.addGroup(start,last-start,selected);
   for(const attr of sideUV.values()){
    const temp=attr.userData?._temporaryGeometry;
    if(temp)temp.dispose();
   }
   if(!changed){
    renderGeometry.dispose();
    for(const mat of materials.slice(baseMaterials.length))mat.dispose();
    return;
   }
   if(remembered){
    if(remembered.ownedGeometry&&remembered.ownedGeometry!==baseline)
     remembered.ownedGeometry.dispose();
    // Keep baseline-owned original material clones until the next apply().
    remembered.ownedGeometry=renderGeometry;
    remembered.ownedMaterials=[
     ...(remembered.ownedMaterials||[]),...materials.slice(baseMaterials.length)];
   }
   if(baseline!==originals&&baseline!==renderGeometry)baseline.dispose();
   mesh.geometry=renderGeometry;mesh.material=materials;
   modified++;
  });
  return {...result,faces:modified};
 }
 return {styles,modes,labels,normalize,normalizeSides,apply,applyFaces,
  faceFromHit,sideFromNormal,canvasPattern};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SurfaceMaterials;
