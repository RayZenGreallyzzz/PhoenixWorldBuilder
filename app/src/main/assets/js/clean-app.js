/* Phoenix Builder v2 — deliberately small offline application.
 * Separate from legacy world.js/app.js. Only building, character, drone,
 * independent proportions, wall thickness and truthful endpoint magnet.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const cloneJSON=x=>JSON.parse(JSON.stringify(x));
const rounded=x=>Math.round(x*1000)/1000;
const builtins=CleanGeometry.catalog;
const defaultSettings=()=>({scale:1,axes:{x:1,y:1,z:1},thickness:.22,rot:0});
const categoryOf=kind=>builtins.find(x=>x.kind===kind)?.category||'prop';
const safeName=name=>String(name).replace(/[<>]/g,'').slice(0,60);
function notify(message,type='neutral'){
 $('status').textContent=message;$('placementDot').className='dot '+type;
}
function openAssets(){
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open('phoenix-builder-clean-assets',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('glb');
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
}
async function putAsset(id,arrayBuffer){
 const db=await openAssets();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('glb','readwrite');
  tx.objectStore('glb').put(arrayBuffer,id);
  tx.oncomplete=()=>{db.close();resolve(true)};
  tx.onerror=()=>{db.close();reject(tx.error)};
 });
}
async function getAsset(id){
 const db=await openAssets();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('glb','readonly'),request=tx.objectStore('glb').get(id);
  request.onsuccess=()=>{db.close();resolve(request.result)};
  request.onerror=()=>{db.close();reject(request.error)};
 });
}
class CleanBuilder{
 constructor(){
  this.canvas=$('view');this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#7e9eae');
  this.scene.fog=new THREE.Fog('#7e9eae',70,220);
  this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:false,powerPreference:'low-power'});
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
  this.renderer.outputEncoding=THREE.sRGBEncoding;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;
  this.scene.add(new THREE.HemisphereLight(0xe2efff,0x6b765f,.95));
  const sun=new THREE.DirectionalLight(0xffedcf,1);
  sun.position.set(-28,50,24);this.scene.add(sun);
  this.scene.add(new THREE.GridHelper(128,64,0x54837f,0x81a3a1));
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(128,128),
   new THREE.MeshStandardMaterial({color:0x657e64,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.012;this.scene.add(ground);
  this.ground=ground;
  this.camera=new THREE.PerspectiveCamera(59,1,.05,240);
  this.camera.position.set(12,14,18);
  this.controls=new THREE.OrbitControls(this.camera,this.canvas);
  this.controls.target.set(0,1.2,0);
  this.controls.enableDamping=true;this.controls.dampingFactor=.1;
  this.controls.minDistance=1.5;this.controls.maxDistance=140;this.controls.maxPolarAngle=Math.PI*.495;
  this.controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  this.ray=new THREE.Raycaster();this.cursor=V();this.pointer=new THREE.Vector2();
  this.mode='build';this.tool='place';this.floor=0;this.magnet=true;
  this.entries=[];this.assets=new Map();this.nextId=1;this.preview=null;
  this.selected=null;this.previewStatus=null;this.outline=null;
  this.settings=defaultSettings();this.clock=new THREE.Clock();
  this.player=new THREE.Group();this.player.position.set(0,0,0);this.scene.add(this.player);
  this.avatarMixer=null;this.avatarClips=[];this.avatarActions=[];this.playerMoving=false;
  this.setDefaultAvatar();
  this.keys=new Set();this.pointerStart=null;this.lastFrame=0;
  this.bind();this.setMode('build');this.selectKind('wall');
  this.resize();window.addEventListener('resize',()=>this.resize());
  this.animate=now=>{requestAnimationFrame(this.animate);
   if(now-this.lastFrame<30)return;
   const dt=Math.min(this.clock.getDelta(),.075);this.lastFrame=now;
   this.updatePlayer(dt);this.controls.update();this.renderer.render(this.scene,this.camera);
  };
  requestAnimationFrame(this.animate);
 }
 resize(){
  const b=this.canvas.getBoundingClientRect();if(!b.width||!b.height)return;
  this.renderer.setSize(Math.max(1,Math.round(b.width)),Math.max(1,Math.round(b.height)),false);
  this.camera.aspect=b.width/b.height;this.camera.updateProjectionMatrix();
 }
 setDefaultAvatar(){
  this.player.clear();this.avatarMixer=null;this.avatarClips=[];
  const cloth=new THREE.MeshStandardMaterial({color:0x355d82});
  const skin=new THREE.MeshStandardMaterial({color:0xe0b783});
  const dark=new THREE.MeshStandardMaterial({color:0x21384b});
  const make=(geo,mat,x,y,z)=>{
   const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);this.player.add(m);return m;
  };
  make(new THREE.CapsuleGeometry(.27,.65,4,8),cloth,0,1,0);
  make(new THREE.SphereGeometry(.23,10,8),skin,0,1.77,0);
  make(new THREE.BoxGeometry(.19,.78,.24),dark,-.16,.4,0);
  make(new THREE.BoxGeometry(.19,.78,.24),dark,.16,.4,0);
  make(new THREE.BoxGeometry(.17,.75,.22),skin,-.42,1.18,0);
  make(new THREE.BoxGeometry(.17,.75,.22),skin,.42,1.18,0);
 }
 async importAvatar(file){
  if(!file)return;
  try{
   const scene=await GLB.load(file);
   this.player.clear();
   const root=THREE.SkeletonUtils?.clone?
    THREE.SkeletonUtils.clone(scene.root):scene.root.clone(true);
   const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(V());
   if(bounds.isEmpty()||size.y<.00001)throw Error('Невозможно определить размеры персонажа');
   const fitted=new THREE.Group();root.scale.multiplyScalar(1.8/Math.max(size.y,size.x/1.5,size.z/1.5));
   const low=bounds.min.y*root.scale.y;
   root.position.y-=low;fitted.add(root);this.player.add(fitted);
   this.avatarClips=scene.animations||[];
   this.avatarMixer=this.avatarClips.length?new THREE.AnimationMixer(root):null;
   if(this.avatarMixer){
    let idle=this.avatarClips.find(c=>/idle|stand|rest|покой/i.test(c.name))||this.avatarClips[0];
    this.avatarMixer.clipAction(idle).play();
   }
   notify('Персонаж загружен: '+safeName(file.name),'success');
  }catch(err){console.error(err);this.setDefaultAvatar();notify('Ошибка персонажа: '+err.message,'error')}
 }
 setMode(mode){
  this.mode=mode;
  for(const m of ['Build','Character','Drone'])$('mode'+m).classList.toggle('active',
   mode===m.toLowerCase());
  this.player.visible=mode==='character';
  $('charControls').hidden=mode!=='character';
  this.controls.enablePan=mode==='drone';this.controls.enableRotate=true;
  if(mode==='character'){
   this.controls.target.copy(this.player.position).add(V(0,1.15,0));
   this.camera.position.copy(this.player.position).add(V(0,3.6,6));
  }
  if(mode==='drone'){
   this.controls.enablePan=true;
   notify('Дрон: вращай камеру, передвигайся двумя пальцами и приближай зумом');
  }else if(mode==='character')notify('Персонаж: WASD или стрелки на экране');
  else notify('Строительство: выбери деталь, затем коснись места установки');
  $('inspector').classList.toggle('unavailable',mode==='character');
  this.preview?.root&&(this.preview.root.visible=mode==='build');
  this.controls.update();
 }
 async cacheModel(id,buffer,category='wall',name='GLB',keep=true){
  const parsed=await GLB.load(buffer),root=parsed.root;
  // Make a stable axis-aligned origin at ground/base, independent of source pivot.
  const b=new THREE.Box3().setFromObject(root);if(b.isEmpty())throw Error('В GLB нет геометрии');
  const centre=b.getCenter(V());
  const wrapper=new THREE.Group();
  root.position.x-=centre.x;root.position.y-=b.min.y;root.position.z-=centre.z;
  wrapper.add(root);
  this.assets.set(id,{template:wrapper,name:safeName(name),category,animations:parsed.animations||[]});
  if(keep)await putAsset(id,buffer);
  this.renderCatalog();
  return wrapper;
 }
 async importGLB(file){
  if(!file)return;
  const id='glb:'+Date.now().toString(36)+'-'+file.name.replace(/[^a-zA-Zа-яА-Я0-9._-]/g,'_');
  try{
   const buf=await file.arrayBuffer();
   await this.cacheModel(id,buf,$('importCategory').value,file.name);
   this.selectKind(id);
   notify('Модель импортирована и сохранена на устройстве: '+safeName(file.name),'success');
  }catch(err){console.error(err);notify('Не удалось импортировать GLB: '+err.message,'error')}
 }
 async ensureTemplate(kind){
  if(CleanGeometry.isBuiltIn(kind)||this.assets.has(kind))return true;
  const buf=await getAsset(kind);
  if(!buf)return false;
  await this.cacheModel(kind,buf,'wall',kind,false);
  return true;
 }
 cloneTemplate(kind,thickness=.22){
  if(CleanGeometry.isBuiltIn(kind))return CleanGeometry.create(kind,thickness);
  const source=this.assets.get(kind)?.template;
  if(!source)return null;
  return THREE.SkeletonUtils?.clone?THREE.SkeletonUtils.clone(source):source.clone(true);
 }
 descriptor(kind){
  return builtins.find(x=>x.kind===kind)||this.assets.get(kind);
 }
 renderCatalog(){
  const container=$('catalogItems');container.textContent='';
  for(const module of [...builtins,...[...this.assets].map(([kind,value])=>({kind,
    name:value.name,category:value.category}))]){
   const btn=document.createElement('button');
   btn.textContent=module.name;
   const second=document.createElement('span');second.textContent=module.category==='wall'?
    'Стена / магнитные торцы':module.category==='roof'?'Кровля':'Модуль';
   btn.append(second);
   btn.classList.toggle('active',this.preview?.kind===module.kind);
   btn.onclick=()=>this.selectKind(module.kind);
   container.append(btn);
  }
 }
 createEntry(kind,config={}){
  const data={...defaultSettings(),...config};
  data.axes={...defaultSettings().axes,...(config.axes||{})};
  const root=this.cloneTemplate(kind,data.thickness);if(!root)return null;
  const meta=this.descriptor(kind);
  const obj={id:config.id||this.nextId++,kind,category:config.category||meta?.category||
    categoryOf(kind),root,sockets:config.sockets||null,
    storey:Number.isInteger(config.storey)?config.storey:this.floor,
    scale:data.scale,axes:data.axes,thickness:data.thickness,rot:data.rot};
  this.applyTransform(obj);
  if(!CleanGeometry.isBuiltIn(kind)&&obj.category==='wall'){
   const detected=CleanGeometry.thicknessInfo(obj);
   if(detected){
    if(config.thickness!==undefined&&Math.abs(data.thickness-detected.meters)>.001)
     CleanGeometry.resizeImportedThickness(obj,data.thickness);
    else obj.thickness=detected.meters;
    obj.thicknessEditable=true;
   }else obj.thicknessEditable=false;
  }
  if(config.position)obj.root.position.fromArray(config.position);
  return obj;
 }
 applyTransform(obj){
  const a=obj.axes||defaultSettings().axes;
  obj.root.scale.set(obj.scale*a.x,obj.scale*a.y,obj.scale*a.z);
  obj.root.rotation.y=obj.rot||0;
  obj.root.updateMatrixWorld(true);
 }
 disposePreview(){
  if(this.preview){this.preview.root.removeFromParent();this.preview=null}
 }
 selectKind(kind){
  this.disposePreview();this.selected=null;this.tool='place';
  this.settings=defaultSettings();
  this.preview=this.createEntry(kind,{category:this.descriptor(kind)?.category||categoryOf(kind)});
  if(!this.preview){notify('Не удалось открыть модель','error');return}
  this.scene.add(this.preview.root);
  this.preview.root.traverse(m=>{if(!m.isMesh)return;
   m.material=Array.isArray(m.material)?m.material.map(v=>v.clone()):m.material.clone();
   for(const mat of(Array.isArray(m.material)?m.material:[m.material])){
    mat.transparent=true;mat.opacity=.55;mat.depthWrite=false;
   }
  });
  this.preview.root.visible=this.mode==='build';
  this.setTool('place');this.syncInspector();this.renderCatalog();this.updatePreview(this.cursor);
 }
 setTool(tool){
  this.tool=tool;
  $('btnPick').classList.toggle('active',tool==='pick');
  $('btnPlace').classList.toggle('active',tool==='place');
  if(this.preview)this.preview.root.visible=this.mode==='build'&&tool==='place';
  notify(tool==='pick'?'Коснись готовой детали, чтобы изменить её':
   'Коснись места на земле для установки детали','neutral');
 }
 target(){return this.tool==='pick'?this.selected:this.preview}
 syncInspector(){
  const obj=this.target();$('currentLabel').textContent=obj?
   this.descriptor(obj.kind)?.name||obj.kind:'Выбери установленную деталь';
  $('currentHint').textContent=obj?.id&&this.entries.includes(obj)?
   'Настройки выбранной детали':'Параметры нового модуля';
  const read=(id,v)=>{if(document.activeElement!==$(id))$(id).value=String(v)};
  const a=obj?.axes||defaultSettings().axes;
  read('scaleAll',Math.round((obj?.scale||1)*100));
  for(const [key,axis] of [['sizeX','x'],['sizeY','y'],['sizeZ','z']])
   read(key,Math.round(a[axis]*100));
  read('thickness',Math.round((obj?.thickness||.22)*1000)/10);
  const pos=obj?.root.position||V();
  for(const [key,axis] of [['posX','x'],['posY','y'],['posZ','z']])read(key,rounded(pos[axis]));
  read('rotY',Math.round((obj?.rot||0)*180/Math.PI*10)/10);
  const builtin=obj&&CleanGeometry.isBuiltIn(obj.kind);
  const wallBuiltin=builtin&&['wall','corner','arc90','arc180'].includes(obj.kind);
  const physical=wallBuiltin||!!obj?.thicknessEditable;
  $('thickness').disabled=!physical;
  $('thicknessHint').textContent=physical?
   'Точная толщина меняет только поперечное сечение, не радиус и не длину':
   'Для этой формы толщина не определена. Можно менять X/Y/Z без повреждения исходного GLB.';
  const editable=!!obj;
  for(const id of ['scaleAll','sizeX','sizeY','sizeZ','posX','posY','posZ','rotY'])
   $(id).disabled=!editable;
  $('socketPanel').style.display=obj&&!builtin&&obj.category==='wall'?'block':'none';
  this.readSockets();
 }
 readSockets(){
  const obj=this.target();if(!obj||CleanGeometry.isBuiltIn(obj.kind))return;
  const slots=obj.sockets||CleanGeometry.sockets(obj.kind,obj.root,null,obj.category);
  for(const [prefix,index] of [['A',0],['B',1]]){
   const p=slots[index]?.point||V();const out=slots[index]?.out||V(1,0,0);
   const angle=Math.atan2(-out.z,out.x)*180/Math.PI;
   for(const [field,value] of [['X',p.x],['Z',p.z],['Angle',angle]])
    if(document.activeElement!==$('socket'+prefix+field))
     $('socket'+prefix+field).value=String(rounded(value));
  }
 }
 updateGeometry(obj){
  if(!obj||!CleanGeometry.isBuiltIn(obj.kind)||!['wall','corner','arc90','arc180'].includes(obj.kind))return;
  const old=obj.root,newRoot=this.cloneTemplate(obj.kind,obj.thickness);
  newRoot.position.copy(old.position);newRoot.rotation.copy(old.rotation);newRoot.scale.copy(old.scale);
  this.scene.add(newRoot);old.removeFromParent();
  if(obj===this.preview){
   newRoot.traverse(m=>{if(m.isMesh){
    m.material=m.material.clone();m.material.transparent=true;
    m.material.opacity=.55;m.material.depthWrite=false;
   }});
  }
  obj.root=newRoot;
 }
 editField(id){
  const obj=this.target();if(!obj)return;
  const value=Number($(id).value);if(!Number.isFinite(value))return;
  if(id==='scaleAll')obj.scale=clamp(value/100,.1,10);
  if(id==='sizeX')obj.axes.x=clamp(value/100,.1,10);
  if(id==='sizeY')obj.axes.y=clamp(value/100,.1,10);
  if(id==='sizeZ')obj.axes.z=clamp(value/100,.1,10);
  if(id==='thickness'){
   const desired=clamp(value/100,.025,.8);
   if(CleanGeometry.isBuiltIn(obj.kind)){
    if(!['wall','corner','arc90','arc180'].includes(obj.kind))return;
    obj.thickness=desired;this.updateGeometry(obj);
   }else if(obj.thicknessEditable&&CleanGeometry.resizeImportedThickness(obj,desired)){
    obj.thickness=desired;
   }else return notify('У этого GLB невозможно безопасно изменить реальную толщину','error');
  }
  for(const [field,axis] of [['posX','x'],['posY','y'],['posZ','z']])
   if(id===field)obj.root.position[axis]=clamp(value,-100,100);
  if(id==='rotY')obj.rot=value*Math.PI/180;
  this.applyTransform(obj);
  if(obj===this.preview)this.updatePreview(this.cursor,false);
  if(this.outline){this.outline.setFromObject(obj.root)}
  this.syncInspector();
 }
 setSockets(){
  const obj=this.target();if(!obj||CleanGeometry.isBuiltIn(obj.kind))return;
  const extract=prefix=>{
   const x=Number($('socket'+prefix+'X').value),z=Number($('socket'+prefix+'Z').value),
    degrees=Number($('socket'+prefix+'Angle').value);
   if(![x,z,degrees].every(Number.isFinite))throw Error('Проверь координаты торцов');
   const a=degrees*Math.PI/180;return {point:[x,0,z],out:[Math.cos(a),0,-Math.sin(a)]};
  };
  try{
   const [a,b]=[extract('A'),extract('B')];
   if(Math.hypot(a.point[0]-b.point[0],a.point[2]-b.point[2])<.1)
    throw Error('Торцы A и B должны отличаться');
   obj.sockets=[a,b];notify('Оба торца сохранены: магнит будет использовать их вместо границ модели','success');
  }catch(error){notify(error.message,'error')}
 }
 clearSockets(){const obj=this.target();if(!obj)return;obj.sockets=null;this.syncInspector();
  notify('Возврат к автоматическому распознаванию прямой стены','neutral')}
 rayPoint(event,planeY=this.floor*2.6){
  const r=this.canvas.getBoundingClientRect();
  this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  const plane=new THREE.Plane(V(0,1,0),-planeY);
  const hit=V();return this.ray.ray.intersectPlane(plane,hit)?hit:null;
 }
 updatePreview(cursor,snapAllowed=true){
  const obj=this.preview;if(!obj||this.tool!=='place'||this.mode!=='build')return;
  const pos=cursor||V(),q=(x)=>Math.round(x*4)/4;
  obj.root.position.set(q(pos.x),this.floor*2.6,q(pos.z));
  if(obj.category==='roof')
   obj.root.position.y=CleanGeometry.autoRoofHeight(obj,this.entries,pos,this.floor*2.6);
  obj.storey=this.floor;
  obj.root.rotation.y=obj.rot;
  obj.root.updateMatrixWorld(true);
  let snap=null;
  if(this.magnet&&snapAllowed)
   snap=CleanGeometry.solveSnap(obj,this.entries,pos,this.floor,obj.rot);
  if(snap){
   obj.root.position.copy(snap.position);
   obj.root.rotation.y=snap.rotation;
   obj._snapRotation=snap.rotation;this.previewStatus=snap;
   const target=this.entries.find(e=>e.id===snap.target);
   const mismatch=target&&obj.category==='wall'&&Math.abs(target.thickness-obj.thickness)>.015;
   notify(mismatch?'🟡 Торцы совпали, но толщина деталей отличается':
    '🟢 Магнит: точное соединение с '+(target?.kind||'модулем'),mismatch?'warn':'success');
  }else{
   this.previewStatus=null;obj._snapRotation=null;
   notify(this.magnet?'🟡 Свободная установка — торец не найден':'🟡 Магнит отключён','warn');
  }
  obj.root.updateMatrixWorld(true);
  this.syncInspector();
 }
 place(){
  if(!this.preview||this.mode!=='build')return;
  const source=this.preview;
  const data={category:source.category,storey:this.floor,scale:source.scale,
   axes:cloneJSON(source.axes),thickness:source.thickness,
   rot:source._snapRotation??source.rot,sockets:source.sockets?cloneJSON(source.sockets):null,
   position:source.root.position.toArray()};
  const entry=this.createEntry(source.kind,data);
  if(!entry){notify('Не удалось разместить модуль','error');return}
  this.scene.add(entry.root);this.entries.push(entry);
  this.selectKind(source.kind);
  this.preview.root.position.fromArray(data.position);
  this.settings={scale:data.scale,axes:data.axes,thickness:data.thickness};
  this.preview.scale=data.scale;this.preview.axes=data.axes;this.preview.thickness=data.thickness;
  this.updateGeometry(this.preview);this.applyTransform(this.preview);
  this.updatePreview(V(data.position[0],0,data.position[2]));
  notify('Деталь установлена. Для редактирования нажми «Выделить».','success');
 }
 pick(event){
  const r=this.canvas.getBoundingClientRect();
  this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  const hits=this.ray.intersectObjects(this.entries.map(e=>e.root),true);
  this.selected=null;
  for(const hit of hits){
   this.selected=this.entries.find(e=>{let c=hit.object;while(c){if(c===e.root)return true;c=c.parent}return false});
   if(this.selected)break;
  }
  if(this.outline){this.scene.remove(this.outline);this.outline.geometry.dispose();this.outline=null}
  if(this.selected){
   this.outline=new THREE.BoxHelper(this.selected.root,0x44ffb8);this.scene.add(this.outline);
   notify('Выбрана деталь: '+this.selected.kind,'success');
  }else notify('Коснись строительной детали, чтобы выделить её');
  this.syncInspector();
 }
 duplicate(){
  const obj=this.selected;if(!obj)return notify('Сначала выдели деталь','warn');
  const data=this.encode(obj);delete data.id;
  data.position[0]+=1.5;
  const clone=this.createEntry(obj.kind,data);if(!clone)return;
  this.entries.push(clone);this.scene.add(clone.root);this.selected=clone;this.setTool('pick');
  if(this.outline){this.scene.remove(this.outline);this.outline.geometry.dispose()}
  this.outline=new THREE.BoxHelper(clone.root,0x44ffb8);this.scene.add(this.outline);
  this.syncInspector();notify('Создана копия детали','success');
 }
 delete(){
  if(!this.selected)return notify('Сначала выдели деталь','warn');
  const idx=this.entries.indexOf(this.selected);
  if(idx>=0)this.entries.splice(idx,1);
  this.selected.root.removeFromParent();this.selected=null;
  if(this.outline){this.scene.remove(this.outline);this.outline.geometry.dispose();this.outline=null}
  this.syncInspector();notify('Деталь удалена');
 }
 encode(obj){
  return {id:obj.id,kind:obj.kind,category:obj.category,
   position:obj.root.position.toArray().map(rounded),rot:obj.rot,
   displayRotation:obj.root.rotation.y,storey:obj.storey,
   scale:obj.scale,axes:obj.axes,thickness:obj.thickness,sockets:obj.sockets};
 }
 project(){
  return {version:2,app:'Phoenix Builder Clean',
   heights:[],objects:this.entries.map(obj=>{
    const item=this.encode(obj);item.rot=obj.root.rotation.y;return item;
   }),floor:this.floor,nextId:this.nextId,created:new Date().toISOString()};
 }
 save(){
  const json=JSON.stringify(this.project());
  try{
   if(window.NativeBridge?.saveCleanProject){
    const done=window.NativeBridge.saveCleanProject(json);
    if(done){notify('💾 Проект сохранён отдельно от старой версии редактора','success');return}
   }
   localStorage.setItem('phoenix-builder-clean-v2',json);
   notify('💾 Проект сохранён локально. Для резервной копии экспортируй JSON.','success');
  }catch(err){notify('Ошибка сохранения: '+err.message,'error')}
 }
 async load(){
  try{
   const json=window.NativeBridge?.loadCleanProject?.()||
    localStorage.getItem('phoenix-builder-clean-v2');
   if(!json){notify('Нет сохранённого проекта версии 2.0','warn');return}
   await this.restore(JSON.parse(json));
   notify('Проект загружен из сохранения','success');
  }catch(err){notify('Ошибка загрузки: '+err.message,'error')}
 }
 async restore(doc){
  if(doc?.version!==2||!Array.isArray(doc.objects))throw Error('Нужен проект Phoenix Builder 2.0');
  const staged=[];
  for(const item of doc.objects){
   if(!CleanGeometry.isBuiltIn(item.kind)&&!await this.ensureTemplate(item.kind))
    throw Error('Не найден импортированный GLB: '+item.kind);
   const e=this.createEntry(item.kind,item);
   if(!e)throw Error('Невозможно загрузить модуль: '+item.kind);
   e.rot=Number(item.rot)||0;
   e.root.rotation.y=e.rot;staged.push(e);
  }
  // All-or-nothing restore: keep current scene if a GLB was lost.
  for(const obj of this.entries)obj.root.removeFromParent();
  this.entries=staged;for(const e of staged)this.scene.add(e.root);
  this.floor=Number.isInteger(doc.floor)?clamp(doc.floor,0,49):0;
  this.nextId=Math.max(1,...this.entries.map(e=>e.id+1),doc.nextId||1);
  this.selected=null;this.setTool('place');this.selectKind('wall');
  $('levelLabel').textContent=this.floor+1;
 }
 updatePlayer(dt){
  if(this.avatarMixer)this.avatarMixer.update(dt);
  if(this.mode!=='character'&&this.mode!=='drone')return;
  const down=(...keys)=>keys.some(k=>this.keys.has(k));
  const left=down('a','arrowleft','left'),right=down('d','arrowright','right'),
   up=down('w','arrowup','up'),back=down('s','arrowdown','down');
  const raw=V(Number(right)-Number(left),0,Number(back)-Number(up));
  if(raw.lengthSq()<.1)return;
  raw.normalize().multiplyScalar(dt*(this.mode==='drone'?10:3));
  const facing=V();this.camera.getWorldDirection(facing);facing.y=0;facing.normalize();
  const side=V(-facing.z,0,facing.x);
  const step=side.multiplyScalar(raw.x).addScaledVector(facing,-raw.z);
  if(this.mode==='drone'){
   this.controls.target.add(step);this.camera.position.add(step);
  }else{
   this.player.position.add(step);
   this.player.rotation.y=Math.atan2(step.x,step.z);
   this.controls.target.add(step);this.camera.position.add(step);
  }
 }
 bind(){
  $('modeBuild').onclick=()=>this.setMode('build');
  $('modeCharacter').onclick=()=>this.setMode('character');
  $('modeDrone').onclick=()=>this.setMode('drone');
  $('btnHideUi').onclick=()=>document.body.classList.toggle('uiHidden');
  $('btnSave').onclick=()=>this.save();
  $('btnLoad').onclick=()=>this.load();
  $('btnPick').onclick=()=>{this.setTool('pick');this.syncInspector()};
  $('btnPlace').onclick=()=>{this.selected=null;this.setTool('place');this.syncInspector()};
  $('btnConfirm').onclick=()=>this.place();
  $('btnCancel').onclick=()=>{this.setTool('pick');this.syncInspector()};
  $('btnLevelDown').onclick=()=>{this.floor=clamp(this.floor-1,0,49);
   $('levelLabel').textContent=this.floor+1;this.updatePreview(this.cursor)};
  $('btnLevelUp').onclick=()=>{this.floor=clamp(this.floor+1,0,49);
   $('levelLabel').textContent=this.floor+1;this.updatePreview(this.cursor)};
  $('magnet').onchange=e=>{this.magnet=e.target.checked;this.updatePreview(this.cursor)};
  $('importModel').onchange=e=>{this.importGLB(e.target.files?.[0]);e.target.value=''};
  $('importAvatar').onchange=e=>{this.importAvatar(e.target.files?.[0]);e.target.value=''};
  for(const id of ['scaleAll','sizeX','sizeY','sizeZ','thickness','posX','posY','posZ','rotY'])
   $(id).onchange=()=>this.editField(id);
  $('btnRotate').onclick=()=>{
   const obj=this.target();if(!obj)return;
   obj.rot+=Math.PI/2;this.applyTransform(obj);
   this.updatePreview(this.cursor);this.syncInspector();
  };
  $('btnDuplicate').onclick=()=>this.duplicate();
  $('btnDelete').onclick=()=>this.delete();
  $('btnSetSockets').onclick=()=>this.setSockets();
  $('btnClearSockets').onclick=()=>this.clearSockets();
  this.canvas.addEventListener('pointerdown',e=>{this.pointerStart={x:e.clientX,y:e.clientY,time:performance.now()}});
  this.canvas.addEventListener('pointerup',e=>{
   const start=this.pointerStart;this.pointerStart=null;
   if(!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>10||this.mode!=='build')return;
   if(this.tool==='pick'){this.pick(e);return}
   const point=this.rayPoint(e);if(!point)return;
   this.cursor.copy(point);this.updatePreview(point);
  });
  this.canvas.addEventListener('pointermove',e=>{
   if(e.buttons||this.tool!=='place'||this.mode!=='build')return;
   const point=this.rayPoint(e);if(!point)return;
   this.cursor.copy(point);this.updatePreview(point);
  });
  window.addEventListener('keydown',e=>{
   const tag=document.activeElement?.tagName;
   if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
   this.keys.add(e.key.toLowerCase());
   if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))e.preventDefault();
   if(e.key==='Delete'&&this.tool==='pick')this.delete();
  });
  window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>this.keys.clear());
  for(const [id,key] of [['charUp','up'],['charDown','down'],['charLeft','left'],['charRight','right']]){
   const b=$(id);
   b.addEventListener('pointerdown',e=>{e.preventDefault();this.keys.add(key);b.setPointerCapture(e.pointerId)});
   for(const type of ['pointerup','pointercancel','lostpointercapture'])
    b.addEventListener(type,()=>this.keys.delete(key));
  }
 }
}
window.addEventListener('DOMContentLoaded',()=>{try{
 window.PhoenixClean=new CleanBuilder();
 document.body.dataset.cleanReady='true';
 }catch(error){
 console.error(error);
 document.body.dataset.cleanReady='false';
 notify('Ошибка запуска 3D: '+error.message,'error');
 }});
})();