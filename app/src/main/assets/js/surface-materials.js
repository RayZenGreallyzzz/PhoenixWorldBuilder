/* Offline material/texture palette for Phoenix Builder modules.
 * Texture choices persist as small descriptors, custom image bytes in IndexedDB.
 * Only instance materials are modified; catalog GLBs and their maps stay intact.
 */
const SurfaceMaterials=(()=>{
 'use strict';
 const styles=['none','paint','brick','stone','wood','tile','concrete','plaster','metal','custom'];
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const modes=['auto','repeat','tile','module','joined','source','seamless'];
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
 function mappingFor(mapping,kind){
  return mapping==='auto'?(String(kind).startsWith('glb:')?'source':'repeat'):mapping;
 }
 function wrappingFor(mapping){
  return ['module','tile','joined'].includes(mapping)?
   THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;
 }
 function materialTexture(source,spec,mapping,workshop){
  if(!source)return null;
  const fit=mapping==='module'||mapping==='joined'&&!spec.region;
  const texture=(fit&&workshop?workshop.singleImageTexture(source):source).clone();
  texture.wrapS=texture.wrapT=wrappingFor(mapping);
  texture.flipY=false;texture.repeat.set(1,1);texture.offset.set(0,0);texture.rotation=0;
  texture.encoding=THREE.sRGBEncoding;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
 }
 function textureProjection(texture,spec,mapping){
  return {...spec,mapping,imageInset:texture.userData.phoenixImageInset,
   textureAspect:texture.userData.phoenixImageAspect||
    texture.image?.width/Math.max(1,texture.image?.height)};
 }
 function apply(root,raw,customTexture=null,options={}){
  const style=normalize(raw),kind=String(options.kind||root?.name||'');
  if(!root)return {ok:false,reason:'Нет 3D-объекта'};
  // GLB models have authored UVs. Procedural walls/arcs use physical world UVs.
  const mapping=mappingFor(style.mapping,kind);
  if(style.style==='custom'&&!customTexture)
   return {ok:false,reason:'Сначала выбери загруженное изображение'};
  const template=style.style==='custom'?customTexture:
   style.style==='paint'||style.style==='none'?null:canvasPattern(style.style);
  if(!['paint','none'].includes(style.style)&&!template)
   return {ok:false,reason:'Не удалось создать текстуру'};
  root.updateWorldMatrix(true,true);
  let count=0,changedGeometry=0;
  const workshop=typeof SurfaceWorkshop!=='undefined'?SurfaceWorkshop:null;
  const texture=materialTexture(template,style,mapping,workshop);
  let normal=style.relief>0&&texture&&workshop?
   workshop.normalFromTexture(template,texture.wrapS):null;
  if(normal&&texture.userData.phoenixImageInset)
   normal=workshop.singleImageTexture(normal,'#8080ff');
  root.traverse(mesh=>{
   if(!mesh.isMesh||mesh.userData.phoenixLODProxy)return;
   const isFrame=mesh.name?.startsWith('frame:');
   if(mesh.userData.phoenixInsert&&!(isFrame&&style.applyFrames))return;
   if(mesh.name?.includes('glass')||mesh.name?.includes('door:leaf'))return;
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
    const g=workshop.project(root,mesh,original.geometry,textureProjection(texture,style,mapping),kind);
    if(g){mesh.geometry=g;original.ownedGeometry=g;changedGeometry++}
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
   const copies=(Array.isArray(original.material)?original.material:[original.material])
    .map(update);
   mesh.material=Array.isArray(original.material)?copies:copies[0];
   original.ownedMaterials=copies;
   count++;
  });
  return {ok:true,changed:count>0,meshes:count,mapped:changedGeometry,mode:mapping};
 }
 // Per-part material overrides for the 1337 bundled GLBs. Paths are stable
 // indices in the imported scene hierarchy; they refer to the INSTANCE, not
 // the shared catalog template. #n selects one original material primitive.
 function normalizeParts(raw){
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  for(const [key,spec] of Object.entries(raw).slice(0,250)){
   if(!/^(?:\d+)(?:\.\d+){0,16}(?:#\d{1,3})?$/.test(key) ||
      !spec||!styles.includes(spec.style)||spec.style==='none')continue;
   out[key]=normalize(spec);
  }
  return out;
 }
 function meshPath(root,mesh){
  if(!root||!mesh||!mesh.isMesh)return null;
  const nums=[];
  let child=mesh;
  while(child&&child!==root&&nums.length<=16){
   const parent=child.parent;
   if(!parent)return null;
   const index=parent.children.indexOf(child);
   if(index<0)return null;
   nums.unshift(index);child=parent;
  }
  return child===root?nums.join('.'):null;
 }
 function isGlass(material){
  return !!material&&(material.transparent===true||material.opacity<.95||material.transmission>.05||
   /glass|стекл|витраж/i.test(material.name||''));
 }
 function hitPart(root,hit){
  const mesh=hit?.object,path=meshPath(root,mesh);
  if(path===null||!mesh?.isMesh||mesh.userData?.phoenixLODProxy||
    mesh.userData?.phoenixInsert||mesh.name?.includes('door:leaf'))return null;
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const visibleIndex=Math.max(0,Number(hit?.face?.materialIndex)||0);
  const material=mats[visibleIndex]||mats[0];
  if(isGlass(material))return null;
  // Once a custom material is appended, raycasting returns its *new* slot.
  // Translate back to the original immutable primitive identifier so that
  // re-painting the same part never creates a phantom second part.
  const originalIndex=mesh.userData?.phoenixPartMaterialReverse?.[visibleIndex]??
   visibleIndex;
  const originalCount=mesh.userData?.phoenixPartOriginalMaterialCount??mats.length;
  return {key:path+(originalCount>1?'#'+originalIndex:''),name:mesh.name||
   'Часть '+path,materialIndex:originalIndex};
 }
 function applyParts(root,rawParts,textures=new Map(),options={}){
  const specs=normalizeParts(rawParts);
  if(!root)return {ok:false,parts:0};
  // SurfaceMaterials.applyFaces restores original materials before this call.
  // Reset transient hit-index maps even if all part finishes were cleared.
  root.traverse(mesh=>{
   if(!mesh.isMesh)return;
   mesh.userData.phoenixPartOriginalMaterialCount=Array.isArray(mesh.material)?
    mesh.material.length:1;
   mesh.userData.phoenixPartMaterialReverse=null;
  });
  if(!Object.keys(specs).length)return {ok:true,parts:0};
  const workshop=typeof SurfaceWorkshop!=='undefined'?SurfaceWorkshop:null;
  let changed=0;
  root.updateWorldMatrix(true,true);
  const indexed=new Map();
  root.traverse(mesh=>{
   const path=meshPath(root,mesh);
   if(path!==null&&mesh.isMesh)indexed.set(path,mesh);
  });
  const batches=new Map();
  for(const [key,spec] of Object.entries(specs)){
   const sharp=key.lastIndexOf('#');
   const path=sharp<0?key:key.slice(0,sharp);
   const slot=sharp<0?'*':Number(key.slice(sharp+1));
   if(!indexed.has(path))continue;
   if(!batches.has(path))batches.set(path,new Map());
   batches.get(path).set(slot,spec);
  }
  for(const [path,overrides] of batches){
   const mesh=indexed.get(path);
   if(!mesh?.geometry?.getAttribute('position')||mesh.isSkinnedMesh||
    mesh.userData?.phoenixLODProxy||mesh.userData?.phoenixInsert)continue;
   const baseline=mesh.geometry;
   const pos=baseline.getAttribute('position');
   if(pos.count>350000)continue; // Android memory guard
   const baseMaterials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   const materials=baseMaterials.slice();
   const reverse={};for(let i=0;i<baseMaterials.length;i++)reverse[i]=i;
   const groups=baseline.groups||[];
   const prepared=new Map(),temporary=[];
   for(const [slot,spec] of overrides){
    if(slot!=='*'&&(!Number.isInteger(slot)||slot>=baseMaterials.length))continue;
    const source=faceTexture(spec,textures);
    if(spec.style==='custom'&&!source)continue;
    const mapping=mappingFor(spec.mapping,options.kind);
    const texture=materialTexture(source,spec,mapping,workshop);
    const targetMaterial=slot==='*'?baseMaterials.find(m=>!isGlass(m)):baseMaterials[slot];
    if(!targetMaterial||isGlass(targetMaterial))continue;
    const copy=faceMaterial(targetMaterial,spec,texture,workshop,source);
    // Avoid replacement of imported transparent glass and original specular maps.
    prepared.set(slot,{index:materials.length,spec,texture,source});
    reverse[materials.length]=slot==='*'?0:slot;
    materials.push(copy);temporary.push(copy);
   }
   if(!prepared.size)continue;
   // Convert indexes to triangles before changing per-part UV and groups.
   const geo=baseline.index?baseline.toNonIndexed():baseline.clone();
   const p=geo.getAttribute('position');
   if(p.count%3){geo.dispose();for(const m of temporary)m.dispose();continue}
   let uv=geo.getAttribute('uv');
   if(!uv){uv=new THREE.Float32BufferAttribute(new Float32Array(p.count*2),2);
    geo.setAttribute('uv',uv)}
   const projections=new Map();
   for(const [slot,desc] of prepared){
    if(!desc.texture||!workshop)continue;
    const mapping=mappingFor(desc.spec.mapping,options.kind);
    const projected=workshop.project(root,mesh,baseline,
     textureProjection(desc.texture,desc.spec,mapping),options.kind||'');
    if(projected){
     const attr=projected.getAttribute('uv');
     if(attr?.count===p.count)projections.set(slot,attr);
     else projected.dispose();
     if(projections.has(slot))projections.get(slot).userData={_temporaryGeometry:projected};
    }
   }
   const groupAt=face=>{
    const g=groups.find(g=>face>=g.start&&face<g.start+g.count);
    return Number.isInteger(g?.materialIndex)?g.materialIndex:0;
   };
   geo.clearGroups();let active=-1,start=0,applied=0;
   for(let face=0;face<p.count;face+=3){
    const old=groupAt(face);
    const spec=prepared.get(old)||prepared.get('*');
    const matIndex=spec&&!isGlass(baseMaterials[old]||baseMaterials[0])?
     spec.index:Math.min(old,baseMaterials.length-1);
    if(matIndex!==old)applied++;
    if(active!==matIndex){
     if(face>start)geo.addGroup(start,face-start,active);
     active=matIndex;start=face;
    }
    if(matIndex!==old){
     const projected=projections.get(prepared.get(old)?old:'*');
     if(projected)for(let j=0;j<3;j++)uv.setXY(face+j,
      projected.getX(face+j),projected.getY(face+j));
    }
   }
   if(p.count>start)geo.addGroup(start,p.count-start,active);
   for(const attr of projections.values())attr.userData?._temporaryGeometry?.dispose();
   if(!applied){geo.dispose();for(const m of temporary)m.dispose();continue}
   const owned=cache.get(mesh);
   if(owned){
    if(owned.ownedGeometry&&owned.ownedGeometry!==baseline)owned.ownedGeometry.dispose();
    owned.ownedGeometry=geo;
    owned.ownedMaterials=[...(owned.ownedMaterials||[]),...temporary];
   }
   if(owned?.ownedGeometry&&baseline!==owned.geometry&&baseline!==geo)
    baseline.dispose();
   mesh.geometry=geo;mesh.material=materials;
   mesh.userData.phoenixPartMaterialReverse=reverse;
   changed++;
  }
  return {ok:true,parts:changed};
 }
 // Normalize user-visible surface overrides. A missing side inherits the base
 // material rather than forcing an opaque invisible plane across openings.
 function normalizeSides(raw){
  const output={};
  for(const side of ['front','back','end','endStart','endFinish','reveal','top','bottom','edgeE','edgeW','edgeN','edgeS'])
   if(raw?.[side]&&styles.includes(raw[side].style))
    output[side]=normalize(raw[side]);
  return output;
 }
 // Classify the narrow face by its actual position: tapping one wall
 // endpoint must not paint the other end of the same wall. Window/door
 // reveals have their own material scope as well.
 function wallEndScope(kind,point){
  if(!point)return 'end';
  if(kind==='wall'){
   if(Math.abs(point.x)<.83)return 'reveal';
   return point.x<0?'endStart':'endFinish';
  }
  if(kind==='arc90'||kind==='arc180'){
   const angle=kind==='arc90'?Math.PI/2:Math.PI;
   const t=(Math.atan2(point.z,point.x)+Math.PI*2)%(Math.PI*2);
   if(t<.1||Math.abs(t-2*Math.PI)<.1)return 'endStart';
   if(Math.abs(t-angle)<.1)return 'endFinish';
   return 'reveal';
  }
  if(kind==='corner'){
   if(point.x<-1.2)return 'endStart';
   if(point.z<-1.2)return 'endFinish';
   return 'reveal';
  }
  return 'end';
 }
 // PHOENIX_UV44_POSTFIX_20261109: derive imported wall faces from real
 // physical sockets, without trusting face winding or world rotation.
 function importedWallProfile(root,kind,category){
  if(category!=='wall'||!String(kind).startsWith('glb:')||
     typeof CleanGeometry==='undefined'||!root)return null;
  const sockets=CleanGeometry.sockets(kind,root,null,'wall');
  if(sockets.length===2){
   const [start,end]=sockets;
   const a=start.point,b=end.point;
   const d=start.out.clone().negate().setY(0),e=end.out.clone().negate().setY(0);
   const cross=d.x*e.z-d.z*e.x;
   if(Math.abs(cross)>.85){
    const dx=b.x-a.x,dz=b.z-a.z;
    const t=(dx*e.z-dz*e.x)/cross;
    const u=(dx*d.z-dz*d.x)/cross;
    const turn=a.clone().addScaledVector(d,t);
    if(t>.4&&u>.4&&t<120&&u<120){
     const first=turn.clone().sub(a),second=b.clone().sub(turn);
     if(first.length()>.4&&second.length()>.4)
      return {type:'corner',a:a.clone(),turn,b:b.clone(),
       first,second,outsideSign:cross>0?1:-1};
    }
   }
  }
  // Only thin, upright bounding boxes with known physical end sockets
  // qualify as flat walls. Everything else keeps UV44's original behavior.
  if(sockets.length!==2||Math.abs(sockets[0].out.dot(sockets[1].out)+1)>.18)
   return null;
  const box=CleanGeometry.localBounds(root),size=box.getSize(new THREE.Vector3());
  const thickness=Math.min(size.x,size.z),length=Math.max(size.x,size.z);
  if(box.isEmpty()||size.y<.4||thickness<.01||thickness>.8||
     length<.5||length/thickness<3.2)return null;
  const thinAxis=size.x<size.z?'x':'z';
  return {type:'flat',thinAxis,centre:(box.min[thinAxis]+box.max[thinAxis])/2};
 }
 function segmentDistance(point,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;
  const t=Math.max(0,Math.min(1,den>1e-9?
   ((point.x-a.x)*dx+(point.z-a.z)*dz)/den:0));
  return Math.hypot(point.x-a.x-dx*t,point.z-a.z-dz*t);
 }
 // A wall side is a PHYSICAL surface, not the sign of a triangle's
 // normal: the generator for cut-out walls has opposite winding to BoxGeometry,
 // and circular walls turn through X/Z as they go around the building.
 // point is a root-local position on the face (not a world position).
 // "front" = local +Z on a straight wall, outer radius on a round wall,
 // or the outside of the two arms of the built-in L corner.
 function sideFromNormal(normal,category='wall',kind='',point=null,profile=null){
  if(category==='floor'){
   // Thin upright faces are slab END faces, not the walking surface.
   // Keep top/bottom materials independent from the narrow rim.
   if(Math.abs(normal.y)<.65){
    const nx=normal.x,nz=normal.z;
    return Math.abs(nx)>Math.abs(nz)?
     (nx>=0?'edgeE':'edgeW'):(nz>=0?'edgeS':'edgeN');
   }
   return normal.y>0?'front':'back'; // top / bottom
  }
  if(category!=='wall')return null;
  if(Math.abs(normal.y)>.45){
   // Some extruded arcs have inverted triangle winding on their top caps.
   // Use the actual local height of standard walls instead of winding.
   if(point&&['wall','corner','arc90','arc180'].includes(kind))
    return point.y>=1.3?'top':'bottom';
   return normal.y>0?'top':'bottom';
  }
  const nx=normal.x,nz=normal.z;
  if(point&&kind==='wall'){
   // Ends and opening reveals are paintable separately from broad faces.
   if(Math.abs(nz)<.72)return wallEndScope(kind,point);
   if(Math.abs(point.z)<.0005)return wallEndScope(kind,point);
   return point.z>0?'front':'back';
  }
  if(point&&(kind==='arc90'||kind==='arc180')){
   const radius=Math.hypot(point.x,point.z);
   if(radius<.01)return null;
   // Tangential cuts at each arc end are narrow END faces.
   // Absolute dot product accepts both pristine and cut-out winding.
   const radial=(nx*point.x+nz*point.z)/radius;
   if(Math.abs(radial)<.72)return wallEndScope(kind,point);
   // Built-in arcs are centred at the local origin, radius 2 m.
   return radius>=2?'front':'back';
  }
  if(point&&kind==='corner'){
   // First arm runs along negative X with its broad faces at Z=+/-thick.
   // Second arm runs along negative Z with its broad faces at X=+/-thick.
   // The little terminal cuts of either arm are independently paintable.
   if(Math.abs(nz)>.72&&point.z>-.48&&point.z<.48)
    return point.z>=0?'front':'back';
   if(Math.abs(nx)>.72&&point.x>-.48&&point.x<.48)
    return point.x>=0?'front':'back';
   return wallEndScope(kind,point);
  }
  if(point&&profile?.type==='corner'){
   const first=segmentDistance(point,profile.a,profile.turn)<=
    segmentDistance(point,profile.turn,profile.b);
   const start=first?profile.a:profile.turn;
   const along=first?profile.first:profile.second;
   const length=Math.hypot(along.x,along.z);
   if(length>.0001){
    // Narrow cuts, wall ends, and reveals must not be repainted as fronts.
    const perpendicularX=-along.z/length,perpendicularZ=along.x/length;
    if(Math.abs(normal.x*perpendicularX+normal.z*perpendicularZ)<.68)
     return 'end';
    const sign=((point.x-start.x)*perpendicularX+
     (point.z-start.z)*perpendicularZ)*profile.outsideSign;
    return sign>=0?'front':'back';
   }
  }
  if(point&&profile?.type==='flat'){
   const axis=profile.thinAxis;
   if(Math.abs(normal[axis])<.68)return 'end';
   return point[axis]>=profile.centre?'front':'back';
  }
  // Imported arbitrary GLB walls: retain the previous object-local mapping
  // rather than assume a circular or rectangular profile.
  if(Math.abs(nz)<.65||Math.abs(nz)<Math.abs(nx))return 'end';
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
  if(isGlass(Array.isArray(hit.object.material)?
    hit.object.material[hit.face.materialIndex]||hit.object.material[0]:
    hit.object.material))return null;
  return sideFromNormal(normal,category,kind,position,
   importedWallProfile(root,kind,category));
 }
 function faceTexture(spec,textures){
  const source=spec.style==='custom'?textures?.get(spec.imageId):
   ['none','paint'].includes(spec.style)?null:canvasPattern(spec.style);
  return source||null;
 }
 function faceMaterial(base,style,texture,workshop,source){
  const result=(base||new THREE.MeshStandardMaterial()).clone();
  result.name='Phoenix '+style.style+' (отдельная сторона)';
  result.map=texture||null;
  if(result.color)result.color.set(style.color);
  if('roughness' in result)result.roughness=style.roughness;
  if('metalness' in result)result.metalness=style.metalness;
  if(style.relief>0&&texture&&workshop&&'normalMap' in result){
   let normal=workshop.normalFromTexture(source,texture.wrapS);
   if(normal&&texture.userData.phoenixImageInset)
    normal=workshop.singleImageTexture(normal,'#8080ff');
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
  const profile=importedWallProfile(root,options.kind,category);
  let modified=0;
  root.traverse(mesh=>{
   if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.userData?.phoenixLODProxy||
    mesh.userData?.phoenixInsert||mesh.name?.includes('glass')||
    mesh.name?.includes('door:leaf')||!mesh.geometry?.getAttribute('position'))return;
   const remembered=cache.get(mesh);
   const baseline=mesh.geometry;
   const renderGeometry=baseline.index?baseline.toNonIndexed():baseline.clone();
   const pos=renderGeometry.getAttribute('position');
   if(pos.count%3!==0){renderGeometry.dispose();return}
   const originalGroups=baseline.groups||[];
   const baseMaterials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   const sideMaterial=new Map(),sideUV=new Map(),materials=baseMaterials.slice();
   const originals=remembered?.geometry||baseline;
   for(const side of overrides){
    const spec=sides[side],mapping=mappingFor(spec.mapping,options.kind);
    const source=faceTexture(spec,textures);
    const texture=materialTexture(source,spec,mapping,workshop);
    if(spec.style==='custom'&&!texture)continue;
    const mat=faceMaterial(baseMaterials[0],spec,texture,workshop,source);
    sideMaterial.set(side,materials.length);materials.push(mat);
    if(texture&&workshop){
     const projected=workshop.project(root,mesh,originals,
      textureProjection(texture,spec,mapping),options.kind||'');
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
    // Keep transparent GLB primitives (windows/glass) untouched.
    const originalIndex=groupAt(i);
    const index=isGlass(baseMaterials[originalIndex])?undefined:sideMaterial.get(side);
    const matIndex=index===undefined?groupAt(i):index;
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
 return {styles,modes,labels,normalize,normalizeSides,normalizeParts,
  meshPath,hitPart,apply,applyFaces,applyParts,
  faceFromHit,sideFromNormal,canvasPattern};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SurfaceMaterials;
