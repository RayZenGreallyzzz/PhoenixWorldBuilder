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
const defaultSettings=()=>({scale:1,axes:{x:1,y:1,z:1},thickness:.22,rot:0,rotation:{x:0,y:0,z:0}});
const categoryOf=kind=>builtins.find(x=>x.kind===kind)?.category||'prop';
const safeName=name=>String(name).replace(/[<>]/g,'').slice(0,60);
function notify(message,type='neutral'){
 $('status').textContent=message;$('placementDot').className='dot '+type;
}
function openAssets(){
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open('phoenix-builder-clean-assets',2);
  r.onupgradeneeded=()=>{
   if(!r.result.objectStoreNames.contains('glb'))r.result.createObjectStore('glb');
   if(!r.result.objectStoreNames.contains('previews'))
    r.result.createObjectStore('previews');
  };
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
async function getPreview(_store,id){
 const db=await openAssets();
 return new Promise((resolve,reject)=>{
  const request=db.transaction('previews','readonly').objectStore('previews').get(id);
  request.onsuccess=()=>{db.close();resolve(request.result)};
  request.onerror=()=>{db.close();reject(request.error)};
 });
}
async function putPreview(_store,id,value){
 const db=await openAssets();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('previews','readwrite');
  tx.objectStore('previews').put(value,id);
  tx.oncomplete=()=>{db.close();resolve(true)};
  tx.onerror=()=>{db.close();reject(tx.error)};
 });
}
class CleanBuilder{
 constructor(){
  this.canvas=$('view');this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#7e9eae');
  this.scene.fog=new THREE.Fog('#7e9eae',70,220);
  this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:false,powerPreference:'low-power'});
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
  this.performanceMonitor=new AndroidPerformance.Monitor({
   maxPixelRatio:this.renderer.getPixelRatio()
  });
  this.autoResolution=localStorage.getItem('phoenix-builder-auto-resolution')==='on';
  this.performanceMonitor.setAuto(this.autoResolution);
  this.renderer.outputEncoding=THREE.sRGBEncoding;
  this.decoderStatus=GLB.configure(this.renderer);
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
  this.gizmo=new BuilderGizmo(this.scene,this.camera,this.canvas,this.ray);
  this.mode='build';this.tool='place';this.floor=0;this.magnet=true;
  this.gridSnap=localStorage.getItem('phoenix-builder-grid-snap')==='on';
  this.gridStep=PrecisionPlacement.step(
   localStorage.getItem('phoenix-builder-grid-step'),.25);
  this.entries=[];this.assets=new Map();this.nextId=1;this.preview=null;
  this.history=new EditorHistory(20);
  this.catalogMeta=this.loadCatalogMeta();this.smartCatalogFolder='all';
  this.selected=null;this.previewStatus=null;this.outline=null;
  this.presets=this.loadPresets();this.dragMove=null;this.openingPickMode=false;
  this.cameraFocusPick=false;this.surfaceSidePick=false;
  this.catalogGroup='structure';this.previewOutline=null;
  this.textureFiles=this.loadTextureFiles();this.textureCache=new Map();
  this.activeTextureId='';this.pendingTexture=null;this.avatarFitGroup=null;this.avatarMetrics=null;
  this.avatarHeightCm=175;
  this.showAvatarInBuild=localStorage.getItem('phoenix-builder-avatar-build')==='on';
  this.collisionsEnabled=localStorage.getItem('phoenix-builder-collisions')!=='off';
  this.collisionSolver=new CharacterCollision.Solver();
  this.optimizationQuality=AndroidAssetOpt.quality(
   localStorage.getItem('phoenix-builder-optimization-quality')||'balanced');
  this.lodEnabled=localStorage.getItem('phoenix-builder-optimization-lod')!=='off';
  this.settings=defaultSettings();this.clock=new THREE.Clock();
  this.player=new THREE.Group();this.player.position.set(0,0,0);this.scene.add(this.player);
  this.avatarMixer=null;this.avatarClips=[];this.avatarActions={};this.avatarState='';this.playerMoving=false;
  this.setDefaultAvatar();
  this.keys=new Set();this.joy={x:0,y:0};this.pointerStart=null;this.lastFrame=0;
  this.bind();
  this.joystick=new TouchJoystick($('joystickPad'),value=>{this.joy=value;},
   {deadzone:.12});
  $('gridSnap').checked=this.gridSnap;
  $('gridStep').value=String(this.gridStep);
  $('moveStep').value=String(PrecisionPlacement.step(
   localStorage.getItem('phoenix-builder-move-step'),.001));
  $('optimizationQuality').value=this.optimizationQuality;
  $('optimizationLOD').checked=this.lodEnabled;
  $('optimizationAutoResolution').checked=this.autoResolution;
  $('avatarInBuild').checked=this.showAvatarInBuild;
  $('enableCollisions').checked=this.collisionsEnabled;
  this.setMode('build');this.selectKind('wall');
  this.resize();window.addEventListener('resize',()=>this.resize());
  this.animate=now=>{requestAnimationFrame(this.animate);
   if(now-this.lastFrame<30)return;
   const dt=Math.min(this.clock.getDelta(),.075);this.lastFrame=now;
   this.updatePlayer(dt);this.controls.update();this.gizmo.update();
   if(this.previewOutline&&this.previewOutline.visible)this.previewOutline.update();
   this.renderer.render(this.scene,this.camera);
   // Read renderer counters AFTER drawing the visible frame.
   const stats=this.performanceMonitor.frame(now,this.renderer,
    typeof performance!=='undefined'?performance.memory?.usedJSHeapSize:null);
   if(stats){
    if(Math.abs(this.renderer.getPixelRatio()-this.performanceMonitor.pixelRatio)>.025){
     this.renderer.setPixelRatio(this.performanceMonitor.pixelRatio);
     this.resize();
    }
    $('performanceStats').textContent='FPS: '+stats.fps+
     ' · Draw calls: '+stats.calls+' · Треугольники: '+
     stats.triangles.toLocaleString('ru-RU')+
     ' · Текстуры: '+stats.textures+' · Геометрии: '+stats.geometries+
     ' · Чёткость: '+Math.round(stats.pixelRatio*100)+'%';
   }
  };
  requestAnimationFrame(this.animate);
 }
 resize(){
  const b=this.canvas.getBoundingClientRect();if(!b.width||!b.height)return;
  this.renderer.setSize(Math.max(1,Math.round(b.width)),Math.max(1,Math.round(b.height)),false);
  this.camera.aspect=b.width/b.height;this.camera.updateProjectionMatrix();
 }
 setDefaultAvatar(){
  this.player.clear();this.avatarFitGroup=null;this.avatarMetrics=null;
  this.avatarMixer=null;this.avatarClips=[];this.avatarActions={};this.avatarState='';
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
 applyAvatarHeight(cm=this.avatarHeightCm){
  const value=clamp(Number(cm)||175,100,210);
  this.avatarHeightCm=value;
  $('avatarSizeLabel').textContent=value+' см';
  if(!$('avatarHeight').matches(':focus'))$('avatarHeight').value=String(value);
  if(!this.avatarFitGroup||!this.avatarMetrics)return;
  const fit=AvatarFit.apply(this.avatarFitGroup,this.avatarMetrics,value);
  // The imported animation stays on the source GLB root, not this fit wrapper.
  this.player.updateMatrixWorld(true);
  return fit;
 }
 async importAvatar(file){
  if(!file)return;
  try{
   const scene=await GLB.load(file);
   AndroidAssetOpt.optimize(scene.root,this.optimizationQuality);
   const root=THREE.SkeletonUtils?.clone?
    THREE.SkeletonUtils.clone(scene.root):scene.root.clone(true);
   const metrics=AvatarFit.measure(root);
   const fitted=new THREE.Group();fitted.name='avatar:stable-fit';
   fitted.add(root);
   const fit=AvatarFit.apply(fitted,metrics,this.avatarHeightCm);
   this.player.clear();this.player.add(fitted);
   this.avatarFitGroup=fitted;this.avatarMetrics=metrics;
   this.avatarClips=scene.animations||[];
   this.avatarMixer=this.avatarClips.length?new THREE.AnimationMixer(root):null;
   this.avatarActions={};this.avatarState='';
   if(this.avatarMixer){
    for(const clip of this.avatarClips)this.avatarActions[clip.name]=
     this.avatarMixer.clipAction(clip);
    this.setAvatarAnimation(false);
   }
   notify('Персонаж подогнан: '+safeName(file.name)+
    ' — высота '+Math.round(metrics.size.y*fit.uniform*100)+' см','success');
  }catch(err){console.error(err);this.setDefaultAvatar();notify('Ошибка персонажа: '+err.message,'error')}
 }

 setMode(mode){
  this.mode=mode;
  for(const m of ['Build','Character','Drone'])$('mode'+m).classList.toggle('active',
   mode===m.toLowerCase());
  this.player.visible=mode==='character'||mode==='build'&&this.showAvatarInBuild;
  $('charControls').hidden=mode!=='character';
  if(mode!=='character')this.joystick?.reset();
  // Building can pan/orbit around any world point, not fixed map origin.
  // Keep character follow intact; drone retains 3D/free-height panning.
  this.controls.enablePan=mode!=='character';
  this.controls.screenSpacePanning=mode==='drone';
  this.controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  this.controls.enableRotate=true;
  if(mode==='character'&&this.cameraFocusPick){
   this.cameraFocusPick=false;
   $('btnFocusCamera').classList.remove('active');
  }
  if(mode==='character'){
   this.controls.target.copy(this.player.position).add(V(0,1.15,0));
   this.camera.position.copy(this.player.position).add(V(0,3.6,6));
  }
  if(mode==='drone'){
   this.controls.enablePan=true;
   notify('Дрон: вращай камеру, передвигайся двумя пальцами и приближай зумом');
  }else if(mode==='character')notify('Персонаж: плавный джойстик слева, второй палец вращает камеру');
  else notify('Строительство: выбери деталь, затем коснись места установки');
  $('inspector').classList.remove('unavailable');
  this.preview?.root&&(this.preview.root.visible=this.tool==='place');
  this.controls.update();this.aimPlacement();
 }
 async cacheModel(id,buffer,category='wall',name='GLB',keep=true){
  const started=typeof performance!=='undefined'?performance.now():Date.now();
  const parsed=await GLB.load(buffer),root=parsed.root;
  const decodeMs=Math.max(0,Math.round((typeof performance!=='undefined'?
   performance.now():Date.now())-started));
  const textureStats=AndroidAssetOpt.optimize(root,this.optimizationQuality);
  // Make a stable axis-aligned origin at ground/base, independent of source pivot.
  const b=new THREE.Box3().setFromObject(root);if(b.isEmpty())throw Error('В GLB нет геометрии');
  const centre=b.getCenter(V());
  const wrapper=new THREE.Group();
  root.position.x-=centre.x;root.position.y-=b.min.y;root.position.z-=centre.z;
  wrapper.add(root);
  const meta=this.catalogMeta?.get(id);
  this.assets.set(id,{template:wrapper,name:meta?.name||safeName(name),
   category:meta?.category||category,folder:meta?.folder,
   animations:parsed.animations||[],glbInfo:parsed.info||null,textureStats});
  const used=(parsed.info?.extensions||[]).filter(e=>
   ['EXT_meshopt_compression','KHR_draco_mesh_compression','KHR_texture_basisu'].includes(e));
  this.lastGLBImport={decodedMs:decodeMs,
   fileMiB:Math.round((buffer.byteLength||0)/1048576*100)/100,
   triangles:Math.round(parsed.triangles),extensions:used.slice()};
  $('optimizationStats').textContent='GLB: '+Math.round(parsed.triangles).toLocaleString('ru-RU')+
   ' треугольников · сжатие: '+(used.join(', ')||'обычное')+
   ' · декодирование: '+decodeMs+' мс'+
   ' · уменьшено текстур: '+textureStats.resized;
  if(keep)await putAsset(id,buffer);
  this.renderCatalog();
  return wrapper;
 }
 updateAutoResolution(){
  this.autoResolution=$('optimizationAutoResolution').checked;
  localStorage.setItem('phoenix-builder-auto-resolution',this.autoResolution?'on':'off');
  const ratio=this.performanceMonitor.setAuto(this.autoResolution);
  if(Math.abs(this.renderer.getPixelRatio()-ratio)>.025){
   this.renderer.setPixelRatio(ratio);this.resize();
  }
  notify(this.autoResolution?
   'Авторазрешение включено: при длительном снижении FPS уменьшается только разрешение отрисовки':
   'Авторазрешение выключено: исходная чёткость восстановлена','success');
 }
 async exportPerformanceReport(){
  const report=this.performanceMonitor.report({
   objects:this.entries.length,
   imported:this.entries.filter(e=>!CleanGeometry.isBuiltIn(e.kind)).length,
   codecs:GLB.codecStatus(),
   importStats:this.lastGLBImport||null,
   userAgent:navigator.userAgent
  });
  const reportText=JSON.stringify(report,null,2);
  if(navigator.clipboard?.writeText){
   try{await navigator.clipboard.writeText(reportText);
    notify('📋 Отчёт FPS скопирован: можно отправить разработчику','success');return;
   }catch(e){console.warn('Clipboard permission unavailable',e)}
  }
  // Android file:// WebViews may not grant clipboard permissions.
  window.prompt('Скопируй диагностический отчёт (он не содержит модель или проект)',reportText);
 }
 updateOptimizer(){
  this.optimizationQuality=AndroidAssetOpt.quality($('optimizationQuality').value);
  this.lodEnabled=$('optimizationLOD').checked;
  localStorage.setItem('phoenix-builder-optimization-quality',this.optimizationQuality);
  localStorage.setItem('phoenix-builder-optimization-lod',this.lodEnabled?'on':'off');
  for(const obj of this.entries){
   if(CleanGeometry.isBuiltIn(obj.kind))continue;
   AndroidLOD.setEnabled(obj.root,this.lodEnabled);
   if(this.lodEnabled)this.attachImportedLOD(obj);
  }
  $('optimizationStats').textContent='Настройки сохранены. Для новых GLB: '+
   (this.optimizationQuality==='original'?'без уменьшения текстур':
    this.optimizationQuality==='battery'?'не более 1024 px':'не более 2048 px')+
   '. LOD: '+(this.lodEnabled?'вкл.':'выкл.');
 }
 attachImportedLOD(obj){
  if(!obj||CleanGeometry.isBuiltIn(obj.kind)||!this.lodEnabled||
     CleanMeshEdit.active(obj.meshEdit)||obj.autoEdgeCuts?.length||obj.manualEdgeCut||
     obj.floorTrim?.enabled)return;
  const original=obj.root;
  const source=this.assets.get(obj.kind);
  const isStale=()=>obj.root!==original||!this.lodEnabled||
   !this.entries.includes(obj)||CleanMeshEdit.active(obj.meshEdit)||
   !!obj.autoEdgeCuts?.length||!!obj.manualEdgeCut;
  AndroidLOD.prepare(original,source?.animations||[],
   {enabled:true,shouldAbort:isStale}).then(summary=>{
   if(isStale())return;
   if(summary.attached)console.info('Phoenix LOD:',obj.kind,summary);
  }).catch(err=>console.warn('LOD skipped for '+obj.kind,err));
 }
 async importGLB(file){
  if(!file)return;
  const id='glb:'+Date.now().toString(36)+'-'+file.name.replace(/[^a-zA-Zа-яА-Я0-9._-]/g,'_');
  try{
   const buf=await file.arrayBuffer();
   const category=$('importCategory').value;
   const guess=SmartCatalog.classify(file.name);
   const folder=guess?.category===category?guess.folder:
    category==='wall'?'walls':category==='floor'?'floors':
    category==='roof'?'roofs':category==='decor'?'decor':'my-modules';
   this.catalogMeta.set(id,{id,name:safeName(file.name),
    folder,category,path:file.name,source:'GLB',bytes:buf.byteLength});
   await this.cacheModel(id,buf,category,file.name);
   this.saveCatalogMeta();
   this.selectKind(id);
   notify('GLB импортирован: '+safeName(file.name)+' · '+
    $('optimizationStats').textContent+'. Оригинальный файл сохранён.','success');
  }catch(err){
   this.catalogMeta.delete(id);this.saveCatalogMeta();
   console.error(err);notify('Не удалось импортировать GLB: '+err.message,'error')
  }
 }
 async ensureTemplate(kind,category='wall'){
  if(CleanGeometry.isBuiltIn(kind)||this.assets.has(kind))return true;
  const buf=await getAsset(kind);
  if(!buf)return false;
  const meta=this.catalogMeta.get(kind);
  await this.cacheModel(kind,buf,meta?.category||category,meta?.name||kind,false);
  return true;
 }
 cloneTemplate(kind,thickness=.22,scale=1,axes={x:1,y:1,z:1}){
  if(CleanGeometry.isBuiltIn(kind))return CleanGeometry.create(kind,thickness,
   scale*(axes?.x||1),scale*(axes?.z||1));
  const source=this.assets.get(kind)?.template;
  if(!source)return null;
  return THREE.SkeletonUtils?.clone?THREE.SkeletonUtils.clone(source):source.clone(true);
 }
 descriptor(kind){
  return builtins.find(x=>x.kind===kind)||this.assets.get(kind)||
   this.catalogMeta.get(kind);
 }
 loadCatalogMeta(){
  try{
   const list=JSON.parse(localStorage.getItem('phoenix-builder-smart-catalog-v1')||'[]');
   return new Map(Array.isArray(list)?list.filter(row=>
    row&&typeof row.id==='string'&&row.id.startsWith('glb:')&&
    typeof row.name==='string'&&SmartCatalog.labels[row.folder]&&
    typeof row.category==='string').slice(-2000).map(row=>[row.id,row]):[]);
  }catch(err){console.warn('Catalog metadata damaged',err);return new Map()}
 }
 saveCatalogMeta(){
  try{
   localStorage.setItem('phoenix-builder-smart-catalog-v1',
    JSON.stringify([...this.catalogMeta.values()].slice(-2000)));
  }catch(err){notify('Не удалось сохранить папки: '+err.message,'error')}
 }
 async importZIP(file){
  if(!file)return;
  const status=$('zipImportStatus'),start=performance.now();
  let models=0,textures=0,skipped=0,errors=[],index=0;
  try{
   status.textContent='📦 Распаковка '+safeName(file.name)+'...';
   const list=await ZipUtils.extract(file,{maxEntries:1200,maxTotal:200000000,maxEntry:50000000});
   const paths=Object.keys(list);
   if(!paths.length)throw Error('В ZIP нет файлов GLB или PNG/JPG/WebP');
   const override=$('zipFolderOverride').value;
   for(const path of paths){
    const bytes=list[path];
    const guess=SmartCatalog.classify(path,override==='auto'?null:override);
    if(!guess||!SmartCatalog.safeEntry(path)){skipped++;continue}
    const filename=path.split('/').pop();
    const idSuffix=Date.now().toString(36)+'-'+index.toString(36)+'-'+
     Math.random().toString(36).slice(2,7);
    index++;
    try{
     if(guess.type==='model'){
      if(bytes.length<20||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
       .getUint32(0,true)!==0x46546c67){
       errors.push(filename+': не GLB 2.0');skipped++;continue;
      }
      const id='glb:zip:'+idSuffix;
      await putAsset(id,bytes.slice().buffer);
      this.catalogMeta.set(id,{id,name:safeName(filename),
       folder:guess.folder,category:guess.category,path,bytes:bytes.length,
       source:'ZIP'});
      models++;
     }else{
      const type=filename.toLowerCase().endsWith('.png')?'image/png':
       /\.jpe?g$/i.test(filename)?'image/jpeg':'image/webp';
      const fileImage=new File([bytes],filename,{type});
      const edge=Math.min(4096,this.renderer?.capabilities?.maxTextureSize||4096);
      const processed=await PhoenixFiles.prepareTexture(fileImage,edge);
      const id='texture:zip:'+idSuffix;
      await putAsset(id,processed.bytes);
      this.textureFiles.push({id,name:safeName(filename),folder:guess.folder,
       type:processed.type,width:processed.width,height:processed.height,
       bytes:processed.storedBytes,path});
      textures++;
     }
    }catch(err){
     skipped++;errors.push(filename+': '+(err?.message||err));
    }
    if(index%5===0){
     status.textContent='📦 ZIP: '+index+'/'+paths.length+' — GLB: '+
      models+', текстуры: '+textures+', пропущено: '+skipped;
     // Release main thread so controls remain responsive on slow tablets.
     await new Promise(resolve=>setTimeout(resolve,0));
    }
   }
   this.textureFiles=this.textureFiles.slice(-1500);
   localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
   this.saveCatalogMeta();this.renderCatalog();this.renderTextureLibrary();
   status.textContent='✅ '+safeName(file.name)+': '+models+' моделей, '+
    textures+' текстур, '+skipped+' пропущено. '+Math.round((performance.now()-start)/1000)+
    ' с. '+(errors.length?'Ошибки: '+errors.slice(0,2).join('; '):'Открой нужную папку для просмотра миниатюр.');
   notify('📦 Импорт завершён: '+models+' GLB и '+textures+
    ' текстур. Выбирай папку и смотри модели на карточках.','success');
  }catch(err){
   console.error('ZIP import',err);
   this.saveCatalogMeta();
   localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
   this.renderCatalog();this.renderTextureLibrary();
   status.textContent='Ошибка ZIP: '+(err?.message||err)+
    '. Уже сохранённые модели остаются в библиотеке.';
   notify(status.textContent,'error');
  }
 }
 loadTextureFiles(){
  try{const list=JSON.parse(localStorage.getItem('phoenix-builder-v2-textures')||'[]');
   return Array.isArray(list)?list.filter(o=>o&&typeof o.id==='string'&&typeof o.name==='string').slice(-1500):[];
  }catch(e){return []}
 }
 setTextureTab(active='parts'){
  const textures=active==='textures';
  $('tabParts').classList.toggle('active',!textures);
  $('tabTextures').classList.toggle('active',textures);
  $('catalogItems').hidden=textures;
  $('catalogQuick').hidden=textures;
  document.querySelector('.myCatalog').hidden=textures;
  $('catalogImport').hidden=textures;
  $('textureLibrary').hidden=!textures;
  document.querySelector('.smartLibrary').hidden=textures;
  if(textures)this.renderTextureLibrary();
 }
 renderTextureLibrary(){
  const container=$('textureCards');container.textContent='';
  this.textureObserver?.disconnect();this.textureObserver=null;
  const current=this.target(),face=$('textureFaceScope').value;
  const selected=(face!=='all'&&current?.surfaceSides?.[face])||
   current?.surface||{style:'none'};
  const folder=$('textureCategoryFilter').value;
  const term=SmartCatalog.tokenize($('textureSearch').value);
  if(folder==='all'&&!term){
   for(const [style,label] of Object.entries(SurfaceMaterials.labels)){
    if(style==='custom')continue;
    const btn=document.createElement('button');btn.textContent=label;
    btn.classList.toggle('active',selected.style===style);
    btn.onclick=()=>this.chooseTexture(style);
    container.append(btn);
   }
  }
  const list=this.textureFiles.filter(item=>{
   const group=item.folder==='textures'?'textures':'my-textures';
   return (folder==='all'||folder===group)&&
    (!term||SmartCatalog.tokenize(item.name+' '+(item.path||'')).includes(term));
  });
  const gallery=document.createElement('div');gallery.className='textureVisualGrid';
  for(const item of list){
   const card=document.createElement('button');card.className='textureCard';
   card.classList.toggle('active',selected.style==='custom'&&selected.imageId===item.id);
   const img=document.createElement('img');img.className='texturePreview';
   img.dataset.texturePreview=item.id;img.alt='Образец текстуры '+item.name;
   img.loading='lazy';
   const title=document.createElement('strong');title.textContent=item.name;
   const size=document.createElement('small');
   size.textContent=(item.width&&item.height?item.width+'×'+item.height:'Изображение')+
    ' · '+(item.folder==='textures'?'Текстуры':'Мои текстуры');
   card.append(img,title,size);
   card.onclick=()=>this.chooseTexture('custom',item.id);gallery.append(card);
  }
  container.append(gallery);
  if(!list.length&&folder!=='all'){
   const hint=document.createElement('small');hint.textContent='В этой папке пока нет текстур';
   container.append(hint);
  }
  if(typeof IntersectionObserver!=='undefined'&&gallery.children.length){
   this.textureObserver=new IntersectionObserver(items=>{
    for(const entry of items){
     if(!entry.isIntersecting)continue;
     this.textureObserver.unobserve(entry.target);
     this.loadTextureThumbnail(entry.target,entry.target.dataset.texturePreview);
    }
   },{rootMargin:'80px'});
   gallery.querySelectorAll('img').forEach(img=>this.textureObserver.observe(img));
  }
 }
 async loadTextureThumbnail(image,id){
  try{
   const key='tex:v1:'+id;
   const saved=await getPreview('previews',key);
   if(saved){image.src=saved;return}
   const buffer=await getAsset(id);if(!buffer)return;
   const meta=this.textureFiles.find(t=>t.id===id);
   const url=URL.createObjectURL(new Blob([buffer],{type:meta?.type||'image/webp'}));
   const source=new Image();
   try{
    await new Promise((resolve,reject)=>{
     source.onload=resolve;source.onerror=()=>reject(Error('Texture preview failed'));
     source.src=url;
    });
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=98;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#e8e4dd';ctx.fillRect(0,0,128,98);
    const factor=Math.min(128/source.width,98/source.height);
    const w=Math.round(source.width*factor),h=Math.round(source.height*factor);
    ctx.drawImage(source,(128-w)/2,(98-h)/2,w,h);
    const thumb=canvas.toDataURL('image/jpeg',.72);
    await putPreview('previews',key,thumb);
    if(image.isConnected)image.src=thumb;
   }finally{URL.revokeObjectURL(url)}
  }catch(err){console.warn('Texture thumbnail skipped',err)}
 }

 chooseTexture(style,imageId=''){
  const obj=this.target();
  if(!obj){
   this.pendingTexture={style,imageId};
   this.activeTextureId=imageId||this.activeTextureId;
   this.setMode('build');this.setTool('pick');
   $('textureLibraryStatus').textContent='Материал выбран. Коснись нужной детали.';
   return notify('🎨 Материал готов — коснись детали, чтобы применить','warn');
  }
  this.pendingTexture=null;
  this.activeTextureId=imageId||this.activeTextureId;
  const scope=this.textureScope(obj);
  if(style==='none'){this.changeSurface(true);return}
  const current=scope==='all'?obj.surface:obj.surfaceSides?.[scope]||obj.surface;
  const next=SurfaceMaterials.normalize({...current,style,
   imageId:style==='custom'?this.activeTextureId:''});
  if(next.style==='custom'&&!next.imageId)
   return notify('Загрузи свою текстуру кнопкой PNG / JPG / WebP','warn');
  if(scope==='all'){obj.surface=next;obj.surfaceSides={};}
  else{obj.surfaceSides=obj.surfaceSides||{};obj.surfaceSides[scope]=next;}
  this.applySurfaceTo(obj);
  this.syncInspector();this.renderTextureLibrary();
  $('textureLibraryStatus').textContent='Материал назначен детали '+(this.descriptor(obj.kind)?.name||obj.kind)+
   '. Резервная копия сохраняет изображения для другого устройства.';
  notify('Материал «'+(SurfaceMaterials.labels[style]||style)+'» выбран. Размер рисунка можно настроить справа.','success');
 }
 async importTextureFile(file){
  if(!file)return;
  try{
   notify('🖼 Подготавливаю большую текстуру для Android...','neutral');
   $('textureLibraryStatus').textContent='Обработка изображения '+safeName(file.name)+'...';
   const maxEdge=Math.min(4096,this.renderer?.capabilities?.maxTextureSize||4096);
   const processed=await PhoenixFiles.prepareTexture(file,maxEdge);
   $('textureLibraryStatus').textContent='Оптимизировано: '+processed.width+'×'+
    processed.height+' px. Сохраняю в библиотеку...';
   const id='texture:'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
   await putAsset(id,processed.bytes);
   const texture={id,name:safeName(file.name),type:processed.type,
    width:processed.width,height:processed.height,bytes:processed.storedBytes};
   this.textureFiles=[...this.textureFiles,texture].slice(-1500);
   localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
   this.setTextureTab('textures');this.renderTextureLibrary();
   $('textureLibraryStatus').textContent='Сохранено: '+texture.name+' — '+
    texture.width+'×'+texture.height+' px, '+Math.round(texture.bytes/1024)+' КБ.'+
    ' Для переноса между устройствами используй резервную копию.';
   if(this.target())this.chooseTexture('custom',id);
   else{
    this.pendingTexture={style:'custom',imageId:id};
    this.activeTextureId=id;
    this.setMode('build');this.setTool('pick');
    notify('🖼 Текстура сохранена. Коснись стены или детали для применения','success');
   }
  }catch(err){
   console.error(err);notify('Ошибка текстуры: '+(err?.message||err),'error');
  }
 }
 async textureAsset(id){
  if(this.textureCache.has(id))return this.textureCache.get(id);
  const buf=await getAsset(id);
  if(!buf)throw Error('Файл текстуры больше не найден на этом устройстве');
  const info=this.textureFiles.find(item=>item.id===id);
  const url=URL.createObjectURL(new Blob([buf],{type:info?.type||'image/png'}));
  try{
   const tex=await new Promise((resolve,reject)=>{
    new THREE.TextureLoader().load(url,resolve,undefined,reject);
   });
   tex.encoding=THREE.sRGBEncoding;tex.flipY=false;
   this.textureCache.set(id,tex);return tex;
  }finally{URL.revokeObjectURL(url)}
 }
 textureScope(obj=this.target()){
  const selected=$('textureFaceScope').value;
  return obj&&['wall','floor'].includes(obj.category)&&
   ['front','back'].includes(selected)?selected:'all';
 }
 applySurfaceTo(obj){
  if(!obj)return Promise.resolve(false);
  const root=obj.root,settings=SurfaceMaterials.normalize(obj.surface);
  const sides=SurfaceMaterials.normalizeSides(obj.surfaceSides);
  const requested=[settings,...Object.values(sides)];
  const missing=[...new Set(requested.filter(s=>s.style==='custom'&&s.imageId&&
   !this.textureCache.has(s.imageId)).map(s=>s.imageId))];
  if(missing.length){
   const fingerprint=JSON.stringify({settings,sides});
   return Promise.all(missing.map(id=>this.textureAsset(id))).then(()=>{
    if(obj.root!==root||fingerprint!==JSON.stringify({settings:
     SurfaceMaterials.normalize(obj.surface),
     sides:SurfaceMaterials.normalizeSides(obj.surfaceSides)}))return false;
    return this.applySurfaceTo(obj);
   }).catch(err=>{notify('Текстура: '+err.message,'warn');return false});
  }
  if(settings.style==='custom'&&!settings.imageId)return Promise.resolve(false);
  const result=SurfaceMaterials.applyFaces(root,settings,sides,this.textureCache,
   {kind:obj.kind,category:obj.category});
  return Promise.resolve(result.ok);
 }
 joinedFloorRegion(obj){
  // Old SurfacePaint.joinedFloors idea, but as REAL mesh UV:
  // one image across a connected floor group, retained in GLB.
  if(!obj||obj.category!=='floor')return null;
  const all=[...this.entries.filter(e=>e.category==='floor'&&
   e.storey===obj.storey)];
  if(!all.includes(obj))all.push(obj);
  const boxed=all.map(entry=>({entry,box:new THREE.Box3().setFromObject(entry.root)}));
  const start=boxed.find(x=>x.entry===obj);
  if(!start)return null;
  const selected=[start],seen=new Set([start.entry]);
  const overlap=(a,b,c,d)=>Math.max(0,Math.min(b,d)-Math.max(a,c));
  const gap=(a,b,c,d)=>Math.max(0,a-d,c-b);
  for(let i=0;i<selected.length&&selected.length<128;i++){
   const a=selected[i].box;
   for(const candidate of boxed){
    if(seen.has(candidate.entry))continue;
    const b=candidate.box;
    if(Math.abs(a.max.y-b.max.y)>.25)continue;
    const dx=gap(a.min.x,a.max.x,b.min.x,b.max.x),
     dz=gap(a.min.z,a.max.z,b.min.z,b.max.z);
    const ox=overlap(a.min.x,a.max.x,b.min.x,b.max.x),
     oz=overlap(a.min.z,a.max.z,b.min.z,b.max.z);
    if((dx<=.15&&oz>.2)||(dz<=.15&&ox>.2)){
     selected.push(candidate);seen.add(candidate.entry);
     if(selected.length>=128)break;
    }
   }
  }
  const minX=Math.min(...selected.map(x=>x.box.min.x)),
   minZ=Math.min(...selected.map(x=>x.box.min.z)),
   maxX=Math.max(...selected.map(x=>x.box.max.x)),
   maxZ=Math.max(...selected.map(x=>x.box.max.z));
  return {region:[minX,minZ,maxX,maxZ],entries:selected.map(x=>x.entry)};
 }
 surfaceFromControls(obj){
  const scope=this.textureScope(obj);
  const prev=SurfaceMaterials.normalize(scope==='all'?obj?.surface:
   obj?.surfaceSides?.[scope]||obj?.surface);
  const mode=$('textureMapping').value;
  const joined=mode==='joined'?this.joinedFloorRegion(obj):null;
  return SurfaceMaterials.normalize({...prev,
   region:mode==='joined'?joined?.region||prev.region:null,
   style:$('textureStyle').value,color:$('textureTint').value,
   repeat:Number($('textureRepeat').value),
   mapping:mode,
   tileMeters:Number($('textureTileMeters').value),
   imageScale:Number($('textureImageScale').value),
   offsetU:Number($('textureOffsetU').value),
   offsetV:Number($('textureOffsetV').value),
   rotation:Number($('textureRotation').value),
   roughness:Number($('textureRoughness').value),
   metalness:Number($('textureMetalness').value),
   relief:Number($('textureRelief').value),
   applyFrames:$('textureApplyFrames').checked,
   imageId:prev.imageId||this.activeTextureId||''});
 }
 shiftTexture(direction){
  const obj=this.target();
  if(!obj||!['wall','floor'].includes(obj.category))
   return notify('Выбери пол или стену, чтобы расположить текстуру','warn');
  // Read any edits already entered into the inspector. Change the UV offsets
  // only: neither 3D coordinates nor source imported GLB are modified.
  const style=this.surfaceFromControls(obj);
  if(style.style==='none'||style.style==='paint')
   return notify('Сначала выбери рисунок/изображение и примени его к полу или стене','warn');
  if(style.style==='custom'&&!style.imageId)
   return notify('Сначала выбери своё изображение из библиотеки','warn');
  const step=Number($('textureAlignStep').value);
  const next=SurfaceMaterials.normalize(TexturePlacement.move(style,direction,step));
  const scope=this.textureScope(obj);
  if(scope==='all')obj.surface=next;
  else{obj.surfaceSides=obj.surfaceSides||{};obj.surfaceSides[scope]=next;}
  this.applySurfaceTo(obj);
  this.syncInspector();
  const label={left:'влево',right:'вправо',up:'вверх',down:'вниз',
   reset:'в центр'}[direction]||'изменена';
  notify('🎨 Текстура '+(direction==='reset'?'возвращена ':'сдвинута ')+
   label+' на '+(obj.category==='floor'?'полу':'стене')+
   '. Положение рисунка сохраняется в проекте','success');
 }
 applySurfaceToAllWalls(){
  const source=this.selected;
  if(this.tool!=='pick'||!source||!['wall','floor'].includes(source.category))
   return notify('Выдели построенную стену или плиту пола','warn');
  const surface=this.surfaceFromControls(source);
  if(surface.style==='custom'&&!surface.imageId)
   return notify('Сначала выбери своё изображение','warn');
  let count=0;
  const group=source.category==='floor'&&surface.mapping==='joined'?
   this.joinedFloorRegion(source)?.entries||[source]:
   this.entries.filter(entry=>entry.category===source.category&&
    entry.storey===source.storey);
  for(const target of group){
   target.surface=SurfaceMaterials.normalize(surface);
   this.applySurfaceTo(target);count++;
  }
  this.syncInspector();this.renderTextureLibrary();
  notify('🎨 Единая настройка рисунка: '+count+
   (source.category==='floor'?' соединённых плит пола':' стен(ы)')+
   '. Материал сохраняется в проекте и GLB','success');
 }
 changeSurface(reset=false){
  const obj=this.target();
  if(!obj)return notify('Выбери деталь','warn');
  const scope=this.textureScope(obj);
  const next=reset?SurfaceMaterials.normalize({style:'none'}):
   this.surfaceFromControls(obj);
  if(next.style==='custom'&&!next.imageId)return notify('Выбери или загрузи картинку слева','warn');
  if(scope!=='all'){
   obj.surfaceSides=obj.surfaceSides||{};
   if(reset)delete obj.surfaceSides[scope];
   else obj.surfaceSides[scope]=next;
   this.applySurfaceTo(obj);
   this.syncInspector();this.renderTextureLibrary();
   return notify(reset?'Покрытие этой стороны сброшено':
    'Покрытие назначено только выбранной стороне','success');
  }
  obj.surface=next;obj.surfaceSides={};
  // Rebuild on reset to recover original imported GLB PBR maps.
  if(reset){
   if(obj.kind==='floor')this.rebuildFloor(obj,obj.floorTrim);
   else if(WallOpenings.supported(obj.kind))this.updateGeometry(obj);
   else if(CleanGeometry.isBuiltIn(obj.kind)){
    const root=this.cloneTemplate(obj.kind,obj.thickness,obj.scale,obj.axes);
    const old=obj.root;root.position.copy(old.position);root.rotation.copy(old.rotation);
    root.scale.copy(old.scale);this.scene.add(root);old.removeFromParent();obj.root=root;
    if(this.outline&&obj===this.selected)this.outline.setFromObject(root);
   }else this.rebuildImported(obj);
  }else this.applySurfaceTo(obj);
  if(obj===this.preview)this.updatePreview(this.cursor,false);
  this.syncInspector();this.renderTextureLibrary();
  notify(reset?'Исходный материал восстановлен':'Материал применён к модулю','success');
 }
 loadPresets(){
  try{const records=JSON.parse(localStorage.getItem('phoenix-builder-clean-presets-v1')||'[]');
   return Array.isArray(records)?records.filter(p=>p&&typeof p.kind==='string'&&typeof p.name==='string').slice(0,100):[];
  }catch(e){return []}
 }
 physicalSize(obj){
  if(!obj)return null;
  obj.root.updateWorldMatrix(true,true);
  // Completely removed submeshes are hidden by GLB clipping and must not
  // enlarge the displayed/saved size of the remaining shape.
  const inverse=obj.root.matrixWorld.clone().invert(),bounds=new THREE.Box3().makeEmpty();
  obj.root.traverse(mesh=>{
   if(!mesh.isMesh||mesh.userData.phoenixLODProxy||
      (!mesh.visible&&!mesh.userData.phoenixLODInstalled)||
      !mesh.geometry?.attributes?.position)return;
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   if(mesh.geometry.boundingBox.isEmpty())return;
   const relative=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
   bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(relative));
  });
  if(bounds.isEmpty())return null;
  const size=bounds.getSize(V()),scale=obj.root.scale;
  return {x:Math.round(Math.abs(size.x*scale.x)*100),
   y:Math.round(Math.abs(size.y*scale.y)*100),
   z:Math.round(Math.abs(size.z*scale.z)*100)};
 }
 sizeText(obj){
  const size=this.physicalSize(obj);
  return size?'Ш '+size.x+' × В '+size.y+' × Г '+size.z+' см':'Размер не определён';
 }
 saveModulePreset(){
  const obj=this.target();if(!obj)return notify('Выбери деталь для сохранения','warn');
  const name=prompt('Название новой детали в «Мои»',this.descriptor(obj.kind)?.name||'Моя деталь');
  if(name===null)return;
  if(!name.trim())return notify('Укажи название детали','warn');
  const preset={...this.encode(obj),name:safeName(name.trim()),sizeCm:this.physicalSize(obj),
   savedAt:new Date().toISOString(),presetId:'custom:'+Date.now().toString(36)};
  delete preset.id;delete preset.position;
  try{
   const records=[...this.presets,preset].slice(-100);
   localStorage.setItem('phoenix-builder-clean-presets-v1',JSON.stringify(records));
   this.presets=records;this.renderCatalog();
   notify('💾 Сохранено в «Мои»: '+preset.name+' — '+this.sizeText(obj),'success');
  }catch(err){notify('Библиотека недоступна: '+err.message,'error')}
 }
 async usePreset(preset){
  try{
   if(!await this.ensureTemplate(preset.kind,preset.category))
    throw Error('Исходный GLB отсутствует в памяти устройства');
   this.selectKind(preset.kind);
   const obj=this.preview;
   obj.category=preset.category||obj.category;
   obj.scale=Number(preset.scale)||1;obj.axes={x:1,y:1,z:1,...(preset.axes||{})};
   obj.thickness=Number(preset.thickness)||.22;obj.rot=Number(preset.rot)||0;
   obj.sockets=preset.sockets||null;
   obj.meshEdit=CleanMeshEdit.normalize(preset.meshEdit);
   obj.doorAngle=clamp(Number(preset.doorAngle)||0,-110,110);
   obj.openings=WallOpenings.normalize(preset.openings);
   obj.surface=SurfaceMaterials.normalize(preset.surface);
   obj.manualEdgeCut=preset.manualEdgeCut||null;
   obj.autoEdgeCuts=FloorClip.normalizeCuts(preset.autoEdgeCuts);
   if(obj.kind==='floor')this.rebuildFloor(obj,preset.floorTrim);
   else if(CleanGeometry.isBuiltIn(obj.kind))this.updateGeometry(obj);
   else this.rebuildImported(obj);
   this.applyTransform(obj);this.updatePreview(this.cursor);this.syncInspector();
   notify('Выбрана деталь «'+preset.name+'»: '+this.sizeText(obj),'success');
  }catch(err){notify('Невозможно открыть мою деталь: '+err.message,'error')}
 }
 renderCatalog(){
  const container=$('catalogItems');container.textContent='';
  const term=$('smartCatalogSearch')?.value||'';
  const folder=this.smartCatalogFolder||'all';
  $('smartCategoryFilter').value=folder;
  $('catalogImportsShortcut').hidden=this.catalogMeta.size===0&&this.assets.size===0;
  const shortcuts={structure:'walls',doors:'doors',frames:'frames',
   roofs:'roofs',imports:'my-modules'};
  for(const button of document.querySelectorAll('#catalogQuick [data-catalog-group]'))
   button.classList.toggle('active',shortcuts[button.dataset.catalogGroup]===folder);
  // Merge builtins, imported models currently loaded, and raw ZIP models
  // saved in IndexedDB but not yet decoded. No ZIP is lost after relaunch.
  const models=new Map();
  for(const base of builtins){
   let smart=SmartCatalog.classify(base.kind+'.glb');
   if(!smart)smart=SmartCatalog.classify(base.name+'.glb');
   const builtinFolder=base.kind==='floor'?'floors':
    base.kind==='wall'?'walls':
    ['corner','arc90','arc180'].includes(base.kind)?'corners':
    base.group==='doors'?'doors':base.group==='frames'?'frames':
    base.group==='roofs'?'roofs':smart?.folder||'my-modules';
   models.set(base.kind,{id:base.kind,kind:base.kind,name:base.name,
    folder:builtinFolder,category:base.category,path:base.name,builtin:true});
  }
  for(const [id,asset] of this.assets){
   const guessed=SmartCatalog.classify(asset.name+'.glb');
   models.set(id,{id,kind:id,name:asset.name,category:asset.category,
    folder:asset.folder||guessed?.folder||'my-modules',
    path:asset.name,builtin:false});
  }
  for(const [id,meta] of this.catalogMeta)
   models.set(id,{...meta,id,kind:id,builtin:false});
  const entries=[...models.values()];
  const folders=folder==='all'?SmartCatalog.order:[folder];
  for(const category of folders){
   const matching=SmartCatalog.filteredEntries(entries,category,term);
   if(!matching.length)continue;
   const section=document.createElement('details');section.className='catalogGroup';
   section.open=folder!=='all'||!!term||['walls','my-modules'].includes(category);
   const heading=document.createElement('summary');
   heading.textContent=(SmartCatalog.labels[category]||category)+
    ' · '+matching.length;
   section.append(heading);
   const rows=document.createElement('div');rows.className='catalogRows smartGrid';
   for(const module of matching){
    const card=document.createElement('div');card.className='moduleCard';
    const btn=document.createElement('button');btn.type='button';
    btn.className='modulePick';
    const frame=document.createElement('div');frame.className='moduleImage';
    const symbol=document.createElement('span');symbol.className='moduleIcon';
    symbol.textContent=SmartCatalog.labels[category]?.split(' ')[0]||'◈';
    const img=document.createElement('img');img.className='catalogThumb unloaded';
    img.dataset.previewId=module.kind;
    img.dataset.builtin=module.builtin?'1':'0';
    img.alt='3D-просмотр: '+module.name;img.loading='lazy';
    frame.append(symbol,img);
    const name=document.createElement('strong');name.textContent=module.name;
    const description=document.createElement('small');
    description.textContent=module.builtin?'Встроенный модуль':
     'GLB · '+Math.round((module.bytes||0)/1024)+' КБ'+
     (module.path&&module.path!==module.name?' · '+module.path:'');
    btn.append(frame,name,description);
    btn.classList.toggle('active',this.preview?.kind===module.kind);
    btn.onclick=async()=>{
     try{
      if(!module.builtin){
       notify('📦 Загружаю '+module.name+' для установки...','neutral');
       if(!await this.ensureTemplate(module.kind,module.category))
        throw Error('Исходный GLB недоступен в памяти устройства');
      }
      this.setTextureTab('parts');this.selectKind(module.kind);
      notify('✅ Выбран модуль: '+module.name,'success');
     }catch(err){notify('Не удалось открыть модель: '+err.message,'error')}
    };
    card.append(btn);
    if(!module.builtin){
     const select=document.createElement('select');
     select.className='moduleFolderEdit';
     select.setAttribute('aria-label','Папка модуля '+module.name);
     for(const key of SmartCatalog.order){
      const opt=document.createElement('option');opt.value=key;
      opt.textContent=SmartCatalog.labels[key];select.append(opt);
     }
     select.value=module.folder;
     select.onchange=()=>{
      const record=this.catalogMeta.get(module.kind)||{
       id:module.kind,name:module.name,path:module.path,source:'GLB'
      };
      record.folder=select.value;
      record.category=SmartCatalog.category(select.value);
      this.catalogMeta.set(module.kind,record);
      if(this.assets.has(module.kind)){
       const asset=this.assets.get(module.kind);
       asset.folder=record.folder;asset.category=record.category;
      }
      this.saveCatalogMeta();this.renderCatalog();
      notify('📂 «'+module.name+'» перемещён в '+SmartCatalog.labels[record.folder],
       'success');
     };
     card.append(select);
    }
    rows.append(card);
   }
   section.append(rows);container.append(section);
  }
  if(!container.children.length){
   const hint=document.createElement('p');hint.className='tip';
   hint.textContent='Здесь пока нет моделей. Загрузить ZIP или изменить поиск/папку.';
   container.append(hint);
  }
  const saved=$('myCatalogItems');saved.textContent='';
  for(const preset of this.presets){
   const card=document.createElement('button');card.className='presetCard';
   const thumb=document.createElement('img');thumb.className='catalogThumb unloaded';
   thumb.dataset.previewId=preset.kind;
   thumb.dataset.builtin=CleanGeometry.isBuiltIn(preset.kind)?'1':'0';
   thumb.alt='Моя деталь: '+preset.name;
   const label=document.createElement('strong');label.textContent=preset.name;
   const size=document.createElement('span'),d=preset.sizeCm;
   size.textContent=d?'Ш '+d.x+' × В '+d.y+' × Г '+d.z+' см':
    'Размеры при выборе';
   card.append(thumb,label,size);
   card.onclick=()=>this.usePreset(preset);saved.append(card);
  }
  if(!this.presets.length){
   const hint=document.createElement('small');
   hint.textContent='Сохранённые детали появятся здесь';saved.append(hint);
  }
  if(typeof CatalogPreview!=='undefined'&&typeof IntersectionObserver!=='undefined'){
   CatalogPreview.observeCards($('catalog'),async(kind,isBuiltin)=>{
    if(isBuiltin){
     const model=this.cloneTemplate(kind);
     if(model)model.userData.catalogTemporary=true;
     return model;
    }
    if(this.assets.has(kind))return this.assets.get(kind).template;
    const buf=await getAsset(kind);if(!buf)return null;
    const model=await GLB.load(buf);
    model.root.userData.catalogTemporary=true;return model.root;
   },getPreview,putPreview);
  }
 }

 createEntry(kind,config={}){
  const data={...defaultSettings(),...config};
  data.axes={...defaultSettings().axes,...(config.axes||{})};
  // Backwards compatible: old projects have rot (yaw) only; new ones
  // additionally store all three Euler angles in radians.
  const rotation={x:Number(config.rotation?.x)||0,
   y:Number(config.rotation?.y??config.rot)||0,z:Number(config.rotation?.z)||0};
  const root=this.cloneTemplate(kind,data.thickness,data.scale,data.axes);if(!root)return null;
  const meta=this.descriptor(kind);
  const obj={id:config.id||this.nextId++,kind,category:config.category||meta?.category||
    categoryOf(kind),root,sockets:config.sockets||null,
    storey:Number.isInteger(config.storey)?config.storey:this.floor,
    scale:data.scale,axes:data.axes,thickness:data.thickness,rot:rotation.y,rotation,
    doorAngle:clamp(Number(config.doorAngle)||0,-110,110),
    meshEdit:CleanMeshEdit.normalize(config.meshEdit),
    floorTrim:FloorClip.normalize(config.floorTrim),
    manualEdgeCut:config.manualEdgeCut||null,
    autoEdgeCuts:FloorClip.normalizeCuts(config.autoEdgeCuts),
    openings:WallOpenings.normalize(config.openings),
    surface:SurfaceMaterials.normalize(config.surface),
    surfaceSides:SurfaceMaterials.normalizeSides(config.surfaceSides),
    groupId:typeof config.groupId==='string'?config.groupId.slice(0,72):'',
    roomRole:['wall','floor','ceiling'].includes(config.roomRole)?config.roomRole:''};
  if(WallOpenings.supported(kind)&&obj.openings.length){
   const result=WallOpenings.render(obj.root,kind,obj.openings,
    {thickness:obj.thickness,axes:obj.axes});
   if(!result.ok)throw Error('Проём стены не удалось восстановить: '+result.reason);
  }
  if(kind==='floor'&&(obj.floorTrim.enabled||obj.floorTrim.cuts?.length)){
   const result=FloorClip.apply(obj.root,obj.floorTrim);
   if(!result.ok)throw Error('Не удалось восстановить подрезку пола: '+result.reason);
  }
  this.applyTransform(obj);
  if(obj.groupId&&obj.roomRole)
   obj.root.name=obj.roomRole+':'+obj.groupId+':'+obj.id;
  if(!CleanGeometry.isBuiltIn(kind)&&obj.category==='wall'){
   const detected=CleanGeometry.thicknessInfo(obj);
   if(detected){
    if(config.thickness!==undefined&&Math.abs(data.thickness-detected.meters)>.001)
     CleanGeometry.resizeImportedThickness(obj,data.thickness);
    else obj.thickness=detected.meters;
    obj.thicknessEditable=true;
   }else obj.thicknessEditable=false;
  }
  if(!CleanGeometry.isBuiltIn(kind)&&CleanMeshEdit.active(obj.meshEdit)){
   const changed=CleanMeshEdit.apply(obj.root,obj.meshEdit);
   if(!changed.ok)throw Error('Не удалось восстановить изгиб/обрезку: '+changed.reason);
   obj.thicknessEditable=false;
  }
  if(config.position)obj.root.position.fromArray(config.position);
  this.applySurfaceTo(obj);
  return obj;
 }
 applyTransform(obj){
  const a=obj.axes||defaultSettings().axes;
  obj.root.scale.set(obj.scale*a.x,obj.scale*a.y,obj.scale*a.z);
  obj.rotation=obj.rotation||{x:0,y:obj.rot||0,z:0};
  obj.rotation.y=Number(obj.rot)||0;
  obj.root.rotation.set(Number(obj.rotation.x)||0,obj.rotation.y,
   Number(obj.rotation.z)||0,'XYZ');
  if(obj.kind.startsWith('door')&&ArchitectureKit.has(obj.kind))
   ArchitectureKit.setDoorAngle(obj.root,obj.doorAngle||0);
  obj.root.updateMatrixWorld(true);
 }
 disposePreview(){
  if(this.previewOutline){
   this.previewOutline.removeFromParent();
   this.previewOutline.geometry?.dispose();
   this.previewOutline.material?.dispose();
   this.previewOutline=null;
  }
  if(this.preview){this.preview.root.removeFromParent();this.preview=null}
 }
 selectKind(kind){
  this.disposePreview();this.selected=null;this.tool='place';this.gizmo.attach(null);
  const type=this.descriptor(kind);
  this.catalogGroup=type?.group||(this.assets.has(kind)?'imports':
   type?.category==='roof'?'roofs':'structure');
  this.settings=defaultSettings();
  this.preview=this.createEntry(kind,{category:this.descriptor(kind)?.category||categoryOf(kind)});
  if(!this.preview){notify('Не удалось открыть модель','error');return}
  this.scene.add(this.preview.root);
  // Always show a high-contrast cyan outline over the pale floor grid.
  this.previewOutline=new THREE.BoxHelper(this.preview.root,0x4efcff);
  this.previewOutline.material.depthTest=false;
  this.previewOutline.renderOrder=900;
  this.scene.add(this.previewOutline);
  this.preview.root.traverse(m=>{if(!m.isMesh)return;
   m.material=Array.isArray(m.material)?m.material.map(v=>v.clone()):m.material.clone();
   for(const mat of(Array.isArray(m.material)?m.material:[m.material])){
    mat.transparent=true;mat.opacity=.55;mat.depthWrite=false;
   }
  });
  this.preview.root.visible=true;
  this.setTool('place');this.syncInspector();this.renderCatalog();this.updatePreview(this.cursor);
 }
 setTool(tool){
  this.tool=tool;
  $('btnPick').classList.toggle('active',tool==='pick');
  $('btnPlace').classList.toggle('active',tool==='place');
  if(this.preview)this.preview.root.visible=tool==='place';
  if(this.previewOutline)this.previewOutline.visible=tool==='place';
  this.gizmo.attach(tool==='pick'?this.selected:null);
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
  $('moduleCategory').disabled=!obj;
  $('moduleCategory').value=obj?.category||'wall';
  $('meshPanel').style.display=obj&&!CleanGeometry.isBuiltIn(obj.kind)?'block':'none';
  const meshEdit=CleanMeshEdit.normalize(obj?.meshEdit);
  const fields={trimAxis:meshEdit.axis,trimStart:meshEdit.cutStart,
   trimEnd:meshEdit.cutEnd,bendAxis:meshEdit.bendAxis,bendAngle:meshEdit.bend};
  for(const [id,v] of Object.entries(fields))
   if(document.activeElement!==$(id))$(id).value=String(v);
  read('scaleAll',Math.round((obj?.scale||1)*100));
  for(const [key,axis] of [['sizeX','x'],['sizeY','y'],['sizeZ','z']])
   read(key,Math.round(a[axis]*100));
  read('thickness',Math.round((obj?.thickness||.22)*1000)/10);
  $('physicalDimensions').textContent=obj?'Габариты: '+this.sizeText(obj):'Габариты: —';
  $('btnSaveModule').disabled=!obj;
  $('floorCutPanel').style.display=obj?.kind==='floor'?'block':'none';
  $('autoCutPanel').style.display=obj?.category==='floor'?'block':'none';
  $('glbCutPanel').style.display=obj&&!CleanGeometry.isBuiltIn(obj.kind)?'block':'none';
  const glbCut=obj?.manualEdgeCut||{angle:0,offset:0,side:'less'};
  read('glbCutAngle',glbCut.angle);read('glbCutOffset',glbCut.offset);
  if(document.activeElement!==$('glbCutSide'))$('glbCutSide').value=glbCut.side;
  const floorCut=FloorClip.normalize(obj?.floorTrim);
  read('floorCutAngle',floorCut.angle);read('floorCutOffset',floorCut.offset);
  if(document.activeElement!==$('floorCutSide'))$('floorCutSide').value=floorCut.side;
  const pos=obj?.root.position||V();
  for(const [key,axis] of [['posX','x'],['posY','y'],['posZ','z']])read(key,rounded(pos[axis]));
  for(const axis of ['x','y','z']){
   const rad=axis==='y'?(obj?.rot||0):(obj?.rotation?.[axis]||0);
   read('rot'+axis.toUpperCase(),Math.round(rad*180/Math.PI*10)/10);
  }
  const builtin=obj&&CleanGeometry.isBuiltIn(obj.kind);
  const wallBuiltin=builtin&&['wall','corner','arc90','arc180'].includes(obj.kind);
  const physical=wallBuiltin||!!obj?.thicknessEditable;
  $('thickness').disabled=!physical;
  $('thicknessHint').textContent=physical?
   'Точная толщина меняет только поперечное сечение, не радиус и не длину':
   'Для этой формы толщина не определена. Можно менять X/Y/Z без повреждения исходного GLB.';
  const editable=!!obj;
  for(const id of ['scaleAll','sizeX','sizeY','sizeZ','posX','posY','posZ','rotX','rotY','rotZ'])
   $(id).disabled=!editable;
  $('socketPanel').style.display=obj&&!builtin&&obj.category==='wall'?'block':'none';
  for(const id of ['moveLeft','moveRight','moveForward','moveBack'])$(id).disabled=!(obj&&this.selected===obj);
  $('openingPanel').style.display=this.openingPickMode||
   obj&&WallOpenings.supported(obj.kind)?'block':'none';
  $('prefabDoorPanel').style.display=obj?.kind?.startsWith('door')&&
   ArchitectureKit.has(obj.kind)?'block':'none';
  read('prefabDoorSwing',obj?.doorAngle||0);
  const choices=$('openingNeighbor'),savedNeighbor=choices.value;choices.textContent='';
  const automatic=document.createElement('option');automatic.value='';
  automatic.textContent='Авто (ближайшая)';choices.append(automatic);
  if(obj&&WallOpenings.supported(obj.kind)){
   const own=CleanGeometry.worldSockets(obj);
   for(const neighbor of this.entries){
    if(neighbor===obj||neighbor.category!=='wall'||neighbor.storey!==obj.storey||
       !WallOpenings.supported(neighbor.kind))continue;
    const ends=CleanGeometry.worldSockets(neighbor);
    if(!ends.some(b=>own.some(a=>a.point.distanceTo(b.point)<.15)))continue;
    const opt=document.createElement('option');opt.value=String(neighbor.id);
    opt.textContent='#'+neighbor.id+' — '+(this.descriptor(neighbor.kind)?.name||neighbor.kind);
    choices.append(opt);
   }
  }
  if([...choices.options].some(v=>v.value===savedNeighbor))choices.value=savedNeighbor;
  const openList=$('openingSelect'),prior=openList.value;openList.textContent='';
  for(const o of obj?.openings||[]){
   const opt=document.createElement('option');opt.value=o.id;
   opt.textContent=(o.type==='door'?'🚪 Дверь ':o.type==='passage'?'🚶 Проход ':'🪟 Окно ')+o.id.slice(-10);
   openList.append(opt);
  }
  if([...openList.options].some(opt=>opt.value===prior))openList.value=prior;
  if(obj?.openings?.length){
   const chosen=obj.openings.find(o=>o.id===openList.value)||obj.openings[0];
   read('doorSwing',chosen.angle||0);
   $('openingDoorStyle').value=chosen.doorStyle||'classic';
   $('openingFrameStyle').value=chosen.frameStyle||'classic';
  }
  const scope=this.textureScope(obj);
  const surf=SurfaceMaterials.normalize(scope==='all'?obj?.surface:
   obj?.surfaceSides?.[scope]||obj?.surface);
  const category=obj?.category;
  $('textureFaceScope').disabled=!['wall','floor'].includes(category);
  $('textureFaceScope').options[1].textContent=category==='floor'?
   'Верхняя сторона пола':'Лицевая сторона стены (+Z)';
  $('textureFaceScope').options[2].textContent=category==='floor'?
   'Нижняя сторона пола':'Обратная сторона стены (-Z)';
  $('btnPickTextureFace').disabled=!(obj&&this.entries.includes(obj)&&
   ['wall','floor'].includes(category));
  $('btnPickTextureFace').classList.toggle('active',this.surfaceSidePick);
  $('textureFaceStatus').textContent=scope==='all'?
   'Вся деталь: материал для всех граней. Для камня снаружи и штукатурки внутри выбирай стороны по очереди.':
   'Выбрана '+(scope==='front'?(category==='floor'?'верхняя':'лицевая'):
    (category==='floor'?'нижняя':'обратная'))+
   ' сторона. Материал противоположной стороны не изменится.';
  read('textureStyle',surf.style);read('textureTint',surf.color);
  read('textureRepeat',surf.repeat);
  const controls={textureMapping:surf.mapping,textureTileMeters:surf.tileMeters,
   textureImageScale:surf.imageScale,textureRotation:surf.rotation,
   textureOffsetU:surf.offsetU,textureOffsetV:surf.offsetV,
   textureRoughness:surf.roughness,textureMetalness:surf.metalness,
   textureRelief:surf.relief};
  for(const [id,value] of Object.entries(controls))read(id,value);
  $('textureApplyFrames').checked=surf.applyFrames;
  for(const [id,value] of [['textureRoughnessValue',surf.roughness],
   ['textureMetalnessValue',surf.metalness],['textureReliefValue',surf.relief]])
   $(id).textContent=Number(value).toFixed(2);
  $('btnSurfaceAllWalls').disabled=!(this.tool==='pick'&&['wall','floor'].includes(obj?.category));
  const mayShiftTexture=!!obj&&['floor','wall'].includes(obj.category);
  $('texturePlacementTarget').textContent=mayShiftTexture?
   (obj.category==='floor'?'Пол: рисунок двигается по поверхности X/Z.':
    'Стена: рисунок двигается по горизонтали и вертикали.')+
   ' Можно использовать шаг 1%, 5%, 10% или 25%.':
   'Выдели пол или стену, чтобы перемещать их текстуру.';
  for(const id of ['textureShiftUp','textureShiftDown','textureShiftLeft',
   'textureShiftRight','textureShiftReset'])$(id).disabled=!mayShiftTexture;
  this.gizmo.attach(this.tool==='pick'?this.selected:null);
  this.updateOpeningInfo();
  this.readSockets();
 }
 // Navigation only: this must never mutate the building or its coordinates.
 startCameraFocus(){
  if(this.mode==='character')this.setMode('build');
  const center=this.mode==='build'&&this.tool==='pick'&&this.selected?
   FreeCamera.selectedCenter(THREE,this.selected.root):null;
  if(center){
   FreeCamera.focus(this.camera,this.controls,center);
   this.cameraFocusPick=false;
   $('btnFocusCamera').classList.remove('active');
   return notify('🎯 Камера вращается вокруг выбранной детали, дом не перемещён','success');
  }
  this.cameraFocusPick=!this.cameraFocusPick;
  if(this.cameraFocusPick)this.openingPickMode=false;
  $('btnFocusCamera').classList.toggle('active',this.cameraFocusPick);
  notify(this.cameraFocusPick?
   '🎯 Коснись стены, крыши или земли, чтобы перенести точку вращения камеры':
   '🎯 Выбор точки камеры отменён','neutral');
 }
 setCameraFocusAt(event){
  if(event.isPrimary===false)return;
  const point=FreeCamera.hitPosition(THREE,this.camera,this.ray,this.canvas,
   this.entries,this.ground,event);
  if(!point)return notify('🎯 Коснись дома или земли для нового центра обзора','warn');
  if(!FreeCamera.focus(this.camera,this.controls,point))
   return notify('Не удалось переместить точку обзора','warn');
  this.cameraFocusPick=false;
  $('btnFocusCamera').classList.remove('active');
  notify('🎯 Центр вращения перенесён. Два пальца перемещают обзор','success');
 }
 startOpeningTool(){
  // Never leave conflicting pick-only camera/opening tools active together.
  this.cameraFocusPick=false;
  $('btnFocusCamera').classList.remove('active');
  // A wall cannot be selected in drone camera mode; switch automatically.
  this.setMode('build');
  this.setTextureTab('parts');
  const ready=!!this.selected&&WallOpenings.supported(this.selected.kind);
  this.openingPickMode=!ready;
  this.setTool('pick');this.syncInspector();
  $('openingPanel').open=true;
  $('openingPanel').scrollIntoView({block:'nearest',behavior:'auto'});
  if(ready){
   this.updateOpeningInfo();
   notify('✂ Стена выбрана. Задай размер и место, затем вырежи проём','success');
  }else notify('✂ Коснись стены, где должен быть центр проёма','warn');
 }
 updateOpeningInfo(){
  const info=$('openingPositionInfo'),wall=this.selected;
  if(!wall||!WallOpenings.supported(wall.kind)){
   info.textContent='Коснись готовой стены, угла или дуги, чтобы выбрать точку.';
   return;
  }
  if(!$('openingPanel').open)return;
  const m=WallOpenings.pathMetric(wall);
  if(!m)return;
  const shift=Number($('openingX').value)||0;
  const w=Number($('openingWidth').value)||0;
  const from=m.length*50+shift,total=m.length*100;
  info.textContent='Центр '+(Math.round(from*10)/10)+
   ' см от начала; длина стены/дуги '+(Math.round(total*10)/10)+
   ' см, ширина '+w+' см.'+
   (from-w/2<-.1||from+w/2>total+.1?
    ' Проём пересекает край — нужна соединённая соседняя стена.':
    ' Отверстие внутри выбранного модуля.');
 }
 chooseOpeningPosition(value){
  const wall=this.selected;
  if(!wall||!WallOpenings.supported(wall.kind)){
   $('openingPositionPreset').value='manual';
   return notify('Сначала выбери стандартную стену или коснись её пальцем','warn');
  }
  const m=WallOpenings.pathMetric(wall);
  let shift=0;
  if(value==='start')shift=-m.length/2;
  if(value==='end')shift=m.length/2;
  if(value==='corner'){
   if(wall.kind!=='corner'){
    $('openingPositionPreset').value='manual';
    return notify('Внутренний угол есть в Г-образной стене','warn');
   }
   shift=m.distanceAt(1.9)-m.length/2;
  }
  $('openingX').value=String(Math.round(shift*1000)/10);
  this.updateOpeningInfo();
 }
 pickOpeningCentre(event){
  const r=this.canvas.getBoundingClientRect();
  this.pointer.set((event.clientX-r.left)/r.width*2-1,
   -(event.clientY-r.top)/r.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  const walls=this.entries.filter(e=>e.category==='wall'&&WallOpenings.supported(e.kind));
  const hits=this.ray.intersectObjects(walls.map(e=>e.root),true);
  if(!hits.length)return notify('Коснись самой поверхности стены, угла или дуги','warn');
  const hit=hits[0],wall=walls.find(w=>{
   let node=hit.object;
   while(node){if(node===w.root)return true;node=node.parent}
   return false;
  });
  if(!wall)return notify('Не удалось выбрать стену для проёма','warn');
  this.selected=wall;this.openingPickMode=false;
  if(this.outline){
   this.outline.removeFromParent();this.outline.geometry?.dispose();this.outline=null;
  }
  this.outline=new THREE.BoxHelper(wall.root,0x44ffb8);this.scene.add(this.outline);
  const local=wall.root.worldToLocal(hit.point.clone());
  const at=WallOpenings.pathAtPoint(wall.kind,local,wall.thickness,wall.axes);
  const metric=WallOpenings.pathMetric(wall);
  if(!at||!metric)return notify('Не получилось измерить длину стены','warn');
  $('openingX').value=String(Math.round((metric.distanceAt(at.s)-
   metric.length/2)*1000)/10);
  $('openingPositionPreset').value='manual';
  $('openingPanel').open=true;
  this.syncInspector();this.updateOpeningInfo();
  $('openingPanel').scrollIntoView({block:'nearest',behavior:'auto'});
  notify('🎯 Точка центра выбрана. Введи размер в см и нажми «Вырезать»','success');
 }
 cutForPrefabDoor(){
  const door=this.selected;
  if(this.tool!=='pick'||!door||!ArchitectureKit.has(door.kind)||
   !door.kind.startsWith('door'))
   return notify('Сначала выдели готовую дверь из библиотеки','warn');
  const dimensions=this.physicalSize(door);
  if(!dimensions)return notify('Не удалось измерить размер двери','warn');
  $('openingType').value='passage';
  $('openingSizePreset').value='';
  $('openingWidth').value=String(Math.round((dimensions.x+1)*10)/10);
  $('openingHeight').value=String(Math.round((dimensions.y+1)*10)/10);
  $('openingBottom').value='0';
  this.openingPickMode=true;
  this.setTool('pick');this.syncInspector();
  $('openingPanel').open=true;
  $('openingPanel').scrollIntoView({block:'nearest',behavior:'auto'});
  notify('Подготовлен пустой проём '+(dimensions.x+1)+' × '+
   (dimensions.y+1)+' см под дверь с зазором 1 см. Коснись стены','success');
 }
 openingParts(plan){
  const staged=[];
  for(const [obj,newOpenings] of plan){
   const check=WallOpenings.validate(newOpenings,obj.kind);
   if(!check.ok)return {ok:false,reason:check.reason};
   const root=this.cloneTemplate(obj.kind,obj.thickness,obj.scale,obj.axes);
   if(!root)return {ok:false,reason:'Не найдена исходная стена: '+obj.kind};
   const result=WallOpenings.render(root,obj.kind,newOpenings,
    {thickness:obj.thickness,axes:obj.axes});
   if(!result.ok)return result;
   root.position.copy(obj.root.position);
   root.rotation.copy(obj.root.rotation);
   root.scale.copy(obj.root.scale);
   staged.push({obj,root,openings:WallOpenings.normalize(newOpenings)});
  }
  return {ok:true,staged};
 }
 commitOpenings(plan){
  if(!plan.ok)return false;
  for(const item of plan.staged){
   const old=item.obj.root;
   this.scene.add(item.root);old.removeFromParent();
   item.obj.root=item.root;item.obj.openings=item.openings;
   this.applySurfaceTo(item.obj);
  }
  if(this.outline&&this.selected)this.outline.setFromObject(this.selected.root);
  this.gizmo.attach(this.tool==='pick'?this.selected:null);
  this.syncInspector();return true;
 }
 addOpening(){
  const obj=this.selected;
  if(this.tool!=='pick'||!obj||!WallOpenings.supported(obj.kind))
   return notify('Выдели построенную прямую, угловую или полукруглую стену','warn');
  const typ=$('openingType').value,x=Number($('openingX').value)/100,
   y=Number($('openingBottom').value)/100,
   w=Number($('openingWidth').value)/100,h=Number($('openingHeight').value)/100;
  if(![x,y,w,h].every(Number.isFinite)||w<.1||h<.2)
   return notify('Укажи размеры и положение проёма','warn');
  const id='doorcut:'+Date.now().toString(36);
  const definition={id,group:id,type:typ,x,y,w,h,
   doorStyle:$('openingDoorStyle').value,
   frameStyle:$('openingFrameStyle').value,
   hinge:$('openingHinge').value,angle:0};
  const split=WallOpenings.splitAtJunction(obj,this.entries,definition,$('openingNeighbor').value);
  if(!split.ok)return notify(split.reason,'warn');
  const changes=new Map();
  for(const part of split.parts){
   const items=changes.get(part.entry)||[...(part.entry.openings||[])];
   items.push(part.opening);changes.set(part.entry,items);
  }
  const staged=this.openingParts(changes);
  if(!staged.ok)return notify(staged.reason,'warn');
  this.commitOpenings(staged);
  $('openingSelect').value=split.parts[0].opening.id;
  notify('✂ Вырезан '+(typ==='door'?'дверной':typ==='passage'?'пустой дверной':'оконный')+' проём'+
   (split.joint?' через стык двух стен':' вдоль формы стены')+
   (typ==='passage'?', без рамы и створки':', вставлены '+
    (typ==='door'?'петли и дверные створки':'рама и стекло')),'success');
 }
 restyleOpening(){
  const selected=this.selected;
  if(this.tool!=='pick'||!selected)return notify('Выдели стену с готовым проёмом','warn');
  const id=$('openingSelect').value,opening=selected.openings?.find(o=>o.id===id);
  if(!opening)return notify('Выбери дверной или оконный проём в списке','warn');
  const group=opening.group||opening.id,changes=new Map();
  for(const wall of this.entries){
   if(!WallOpenings.supported(wall.kind))continue;
   if(!wall.openings?.some(o=>(o.group||o.id)===group))continue;
   changes.set(wall,wall.openings.map(o=>(o.group||o.id)===group?
    {...o,doorStyle:$('openingDoorStyle').value,
     frameStyle:$('openingFrameStyle').value}:o));
  }
  const staged=this.openingParts(changes);
  if(!staged.ok)return notify('Новый стиль нельзя применить: '+staged.reason,'error');
  if(!this.commitOpenings(staged))return;
  $('openingSelect').value=id;
  this.syncInspector();
  notify('Стиль '+(opening.type==='door'?'двери':'рамы')+
   ' применён к '+changes.size+' модулям стены. Сохрани проект.','success');
 }
 removeOpening(){
  const obj=this.selected;
  if(!obj||!WallOpenings.supported(obj.kind))return notify('Выдели стену с проёмом','warn');
  const id=$('openingSelect').value,o=(obj.openings||[]).find(o=>o.id===id);
  if(!o)return notify('Выбери готовый проём','warn');
  const group=o.group||o.id,changes=new Map();
  for(const e of this.entries){
   if(!WallOpenings.supported(e.kind)||!e.openings?.some(x=>(x.group||x.id)===group))continue;
   changes.set(e,e.openings.filter(x=>(x.group||x.id)!==group));
  }
  const staged=this.openingParts(changes);
  if(!staged.ok)return notify(staged.reason,'error');
  this.commitOpenings(staged);
  notify('Проём удалён, '+changes.size+' стен восстановлено','success');
 }
 setDoorSwing(){
  const obj=this.selected;if(!obj)return;
  const o=obj.openings?.find(o=>o.id===$('openingSelect').value);
  if(!o||o.type!=='door')return;
  const angle=clamp(Number($('doorSwing').value)||0,-110,110),group=o.group||o.id;
  for(const wall of this.entries){
   for(const sibling of wall.openings||[]){
    if((sibling.group||sibling.id)!==group||sibling.type!=='door')continue;
    sibling.angle=angle;WallOpenings.setDoorAngle(wall.root,sibling.id,angle);
   }
  }
  notify('Петли: дверь открыта на '+angle+'°. Состояние сохранится в проекте','success');
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
  const old=obj.root,newRoot=this.cloneTemplate(obj.kind,obj.thickness,obj.scale,obj.axes);
  newRoot.position.copy(old.position);newRoot.rotation.copy(old.rotation);newRoot.scale.copy(old.scale);
  this.scene.add(newRoot);old.removeFromParent();
  if(obj===this.preview){
   newRoot.traverse(m=>{if(m.isMesh){
    m.material=m.material.clone();m.material.transparent=true;
    m.material.opacity=.55;m.material.depthWrite=false;
   }});
  }
  obj.root=newRoot;
  if(obj.openings?.length){
   const result=WallOpenings.render(newRoot,obj.kind,obj.openings,
    {thickness:obj.thickness,axes:obj.axes});
   if(!result.ok)throw Error('Не удалось восстановить проёмы: '+result.reason);
  }
  this.applySurfaceTo(obj);
  if(this.outline&&obj===this.selected)this.outline.setFromObject(newRoot);
  this.gizmo.attach(this.tool==='pick'?this.selected:null);
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
   if(id===field){
    obj.root.position[axis]=PrecisionPlacement.roundMM(clamp(value,-100,100));
    if(obj===this.preview){
     if(axis==='y')obj.manualPlacementY=obj.root.position.y;
     else this.cursor[axis]=obj.root.position[axis];
    }
   }
  if(['rotX','rotY','rotZ'].includes(id)){
   const axis=id.slice(-1).toLowerCase();
   obj.rotation=obj.rotation||{x:0,y:obj.rot||0,z:0};
   obj.rotation[axis]=value*Math.PI/180;
   if(axis==='y')obj.rot=obj.rotation.y;
  }
  if(['scaleAll','sizeX','sizeY','sizeZ'].includes(id)&&
    CleanGeometry.isBuiltIn(obj.kind)&&['wall','corner','arc90','arc180'].includes(obj.kind))
   this.updateGeometry(obj);
  this.applyTransform(obj);
  if(['scaleAll','sizeX','sizeY','sizeZ'].includes(id)&&obj.thicknessEditable)
   this.rebuildImported(obj);
  // Direct XYZ entry is authoritative: never overwrite a manually typed
  // millimetre position with a cursor position (or 25 cm grid rounding).
  if(obj===this.preview&&!['posX','posY','posZ'].includes(id))
   this.updatePreview(this.cursor,false);
  if(obj.surface?.style!=='none'&&obj===this.selected)this.applySurfaceTo(obj);
  if(this.outline){this.outline.setFromObject(obj.root)}
  this.syncInspector();
 }
 // Rebuild the original closed slab. Trim is never applied cumulatively.
 rebuildFloor(obj,rawEdit){
  if(!obj||obj.kind!=='floor')return false;
  const edit=FloorClip.normalize(rawEdit),fresh=this.cloneTemplate('floor',obj.thickness,obj.scale,obj.axes);
  const result=FloorClip.apply(fresh,edit);
  if(!result.ok){notify(result.reason,'error');return false}
  const old=obj.root;
  fresh.position.copy(old.position);fresh.rotation.copy(old.rotation);fresh.scale.copy(old.scale);
  if(obj===this.preview){
   fresh.traverse(mesh=>{if(!mesh.isMesh)return;
    mesh.material=mesh.material.clone();mesh.material.transparent=true;
    mesh.material.opacity=.55;mesh.material.depthWrite=false;
   });
  }
  this.scene.add(fresh);old.removeFromParent();
  obj.root=fresh;obj.floorTrim=edit;
  this.applySurfaceTo(obj);
  if(this.outline&&obj===this.selected)this.outline.setFromObject(fresh);
  return true;
 }
 applyFloorSettings(reset=false){
  const obj=this.target();
  if(obj?.kind!=='floor')return notify('Выбери стандартную плиту пола','warn');
  const edit=reset?{...obj.floorTrim,enabled:false}:{...obj.floorTrim,enabled:true,
   angle:Number($('floorCutAngle').value),offset:Number($('floorCutOffset').value),
   side:$('floorCutSide').value};
  if(!this.rebuildFloor(obj,edit))return;
  if(obj===this.preview)this.updatePreview(this.cursor);
  this.syncInspector();
  notify(reset?'Оригинальная плита восстановлена':'Плита подрезана по линии, торец закрыт','success');
 }
 // Convert a user's angle to one root-local half-plane. The GLB stays untouched.
 manualPlane(raw){
  if(!raw)return null;
  const angle=Number(raw.angle),offset=Number(raw.offset);
  if(!Number.isFinite(angle)||!Number.isFinite(offset)||Math.abs(offset)>10000)
   throw Error('Укажи допустимый угол и смещение среза');
  const rad=clamp(angle,-180,180)*Math.PI/180,sign=raw.side==='greater'?1:-1;
  return {nx:sign*Math.cos(rad),nz:sign*Math.sin(rad),offset:sign*offset};
 }
 importedCuts(obj,manual=obj.manualEdgeCut,auto=obj.autoEdgeCuts){
  const cut=this.manualPlane(manual);
  return [...(cut?[cut]:[]),...FloorClip.normalizeCuts(auto)];
 }
 applyImportedCut(reset=false){
  const obj=this.target();
  if(!obj||CleanGeometry.isBuiltIn(obj.kind))return notify('Выбери импортированную GLB-деталь','warn');
  try{
   const settings=reset?null:{angle:Number($('glbCutAngle').value),
    offset:Number($('glbCutOffset').value),side:$('glbCutSide').value};
   const cuts=this.importedCuts(obj,settings,obj.autoEdgeCuts);
   const edit=CleanMeshEdit.normalize({...obj.meshEdit,planeCuts:cuts});
   if(!this.rebuildImported(obj,edit))return;
   obj.manualEdgeCut=settings;
   if(obj===this.preview)this.updatePreview(this.cursor);
   this.syncInspector();
   notify(reset?'Ручной срез GLB снят':
    ('Точный срез GLB применён: '+(obj.capResult?.openCut?
     'открытая сетка, торец не закрыт':'замкнутая геометрия, торец закрыт')+
     '. Сохранение запомнит форму.'),'success');
  }catch(err){notify(err.message,'error')}
 }
 trimWholeProject(reset=false){
  const floors=this.entries.filter(e=>e.category==='floor').length;
  if(!floors)return notify('В проекте нет плит пола','warn');
  const action=reset?'Снять автоподрезку со всех плит':'Подрезать все плиты по стенам';
  if(!confirm(action+' на всех этажах?\\nПлит: '+floors+
   '. Изменения сохранятся в проекте после нажатия «Сохранить».'))return;
  try{
   const plan=BulkFloorTrim.prepare(this.entries,(kind,thickness,scale,axes)=>
    this.cloneTemplate(kind,thickness,scale,axes),reset);
   if(!plan.ok)return notify(plan.reason,'error');
   if(!plan.staged.length)return notify(reset?
    'Нет плит с автоподрезкой для восстановления':
    'Плитки не пересекают стены — изменения не требуются','warn');
   BulkFloorTrim.commit(plan,this.scene,this.selected,this.outline);
   this.syncInspector();
   notify((reset?'Автоподрезка снята: ':'Массовая подрезка выполнена: ')+
    plan.count+' плит, границ: '+plan.cutCount+
    ', без изменений: '+plan.unchanged+
    (plan.openGLB?', GLB с открытым торцом: '+plan.openGLB:'')+
    '. Нажми 💾 Сохранить.','success');
  }catch(err){
   console.error('Bulk trim failed',err);
   notify('Массовая подрезка отменена: '+err.message,'error');
  }
 }
 applyAutomaticTrim(reset=false){
  const obj=this.target();
  if(!obj||obj.category!=='floor')return notify('Выбери плиту или GLB категории «Пол»','warn');
  const builtin=obj.kind==='floor';
  let cuts=[];
  if(!reset){
   const fresh=this.cloneTemplate(obj.kind,obj.thickness,obj.scale,obj.axes);
   if(!fresh)return notify('Исходная модель не найдена','error');
   const bounds=CleanGeometry.localBounds(fresh);
   const result=EdgeAutoTrim.resolve(obj,this.entries.filter(e=>e!==obj),bounds);
   if(!result.ok)return notify(result.reason+(result.skippedCurved?' (дуги пока не поддерживаются)':''),'warn');
   cuts=result.cuts;
  }
  if(builtin){
   if(!this.rebuildFloor(obj,{...obj.floorTrim,cuts}))return;
  }else{
   try{
    const edit=CleanMeshEdit.normalize({...obj.meshEdit,
     planeCuts:this.importedCuts(obj,obj.manualEdgeCut,cuts)});
    if(!this.rebuildImported(obj,edit))return;
   }catch(err){return notify(err.message,'error')}
   obj.autoEdgeCuts=cuts;
  }
  if(obj===this.preview)this.updatePreview(this.cursor);
  this.syncInspector();
  notify(reset?'Автоподрезка по стенам снята':
   'Подрезка выполнена по '+cuts.length+' границам стен'+
   (builtin?' (торцы закрыты)':(obj.capResult?.openCut?' (у GLB торец открыт)':' (торцы GLB закрыты)')),'success');
 }
 // Rebuild from a pristine asset copy so edits never accumulate or damage GLB.
 rebuildImported(obj,newEdit=obj.meshEdit){
  if(!obj||CleanGeometry.isBuiltIn(obj.kind))return false;
  const template=this.cloneTemplate(obj.kind);if(!template)return false;
  const old=obj.root;
  template.position.copy(old.position);template.rotation.copy(old.rotation);
  template.scale.copy(old.scale);
  const temp={...obj,root:template};
  const requested=CleanMeshEdit.normalize(newEdit);
  if(obj.category==='wall'){
   const info=CleanGeometry.thicknessInfo(temp);
   if(info&&obj.thickness&&Math.abs(info.meters-obj.thickness)>.002)
    CleanGeometry.resizeImportedThickness(temp,obj.thickness);
  }
  let editResult=null;
  if(CleanMeshEdit.active(requested)){
   editResult=CleanMeshEdit.apply(template,requested);
   if(!editResult.ok){notify('Правка модели: '+editResult.reason,'error');return false}
  }
  if(obj===this.preview){
   template.traverse(mesh=>{if(!mesh.isMesh)return;
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
    for(const mat of(Array.isArray(mesh.material)?mesh.material:[mesh.material])){
     mat.transparent=true;mat.opacity=.78;mat.depthWrite=false;
    }
   });
  }
  this.scene.add(template);old.removeFromParent();
  obj.root=template;obj.meshEdit=requested;
  this.applySurfaceTo(obj);
  obj.capResult=editResult;
  if(obj!==this.preview)this.attachImportedLOD(obj);
  obj.thicknessEditable=!CleanMeshEdit.active(requested)&&
   !!CleanGeometry.thicknessInfo(obj);
  if(this.outline&&obj===this.selected)this.outline.setFromObject(obj.root);
  return true;
 }
 applyMeshSettings(reset=false){
  const obj=this.target();
  if(!obj||CleanGeometry.isBuiltIn(obj.kind))
   return notify('Выбери импортированную GLB-модель','warn');
  const raw=reset?{}:{
   axis:$('trimAxis').value,cutStart:Number($('trimStart').value),
   cutEnd:Number($('trimEnd').value),bendAxis:$('bendAxis').value,
   bend:Number($('bendAngle').value),planeCuts:obj.meshEdit?.planeCuts
  };
  const edit=CleanMeshEdit.normalize(raw);
  if(edit.cutStart+edit.cutEnd>94)
   return notify('Нельзя срезать больше 94% длины модели','error');
  if(!this.rebuildImported(obj,edit))return;
  if(reset){obj.manualEdgeCut=null;obj.autoEdgeCuts=[]}
  if(obj===this.preview)this.updatePreview(this.cursor);
  this.syncInspector();
  notify(reset?'Исходная форма восстановлена (GLB в библиотеке не изменён)':
   'Изгиб и обрезка применены к выбранной детали. Сохранение проекта запомнит форму.','success');
 }
 changeCategory(){
  const obj=this.target();if(!obj)return;
  obj.category=$('moduleCategory').value;
  if(this.assets.has(obj.kind))this.assets.get(obj.kind).category=obj.category;
  if(obj.category==='wall'&&!CleanGeometry.isBuiltIn(obj.kind))
   obj.thicknessEditable=!!CleanGeometry.thicknessInfo(obj);
  if(obj===this.preview)this.updatePreview(this.cursor);
  this.syncInspector();
  notify('Назначение детали изменено: '+$('moduleCategory').selectedOptions[0].textContent,'success');
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
 nudgeSelected(dx,dz,dy=0){
  const obj=this.selected;
  if(!obj||this.tool!=='pick')return notify('Нажми «Выделить» и выбери готовую деталь','warn');
  const step=PrecisionPlacement.step($('moveStep').value,.001);
  obj.root.position.x=PrecisionPlacement.nudge(obj.root.position.x,dx,step);
  obj.root.position.y=PrecisionPlacement.nudge(obj.root.position.y,dy,step);
  obj.root.position.z=PrecisionPlacement.nudge(obj.root.position.z,dz,step);
  obj.root.updateMatrixWorld(true);
  if(obj.surface?.style!=='none')this.applySurfaceTo(obj);
  if(this.outline)this.outline.setFromObject(obj.root);
  this.syncInspector();
  this.gizmo.update();
  notify('Точная подгонка: X '+rounded(obj.root.position.x)+
   ' м · Y '+rounded(obj.root.position.y)+
   ' м · Z '+rounded(obj.root.position.z)+' м','success');
 }
 // Two-stage touch drag: first tap selects, second gesture moves in any X/Z direction.
 beginObjectDrag(e){
  if(this.surfaceSidePick||this.cameraFocusPick||this.openingPickMode||this.tool!=='pick'||!this.selected||e.button!==0||e.isPrimary===false)return;
  const rect=this.canvas.getBoundingClientRect();
  this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  if(!this.ray.intersectObject(this.selected.root,true).length)return;
  const hit=this.rayPoint(e,this.selected.root.position.y);
  if(!hit)return;
  this.dragMove={pointerId:e.pointerId,x:e.clientX,y:e.clientY,
   hit,base:this.selected.root.position.clone(),moved:false};
  this.controls.enabled=false;
  if(this.canvas.setPointerCapture)this.canvas.setPointerCapture(e.pointerId);
  e.preventDefault();e.stopImmediatePropagation();
 }
 continueObjectDrag(e){
  const drag=this.dragMove;
  if(!drag||drag.pointerId!==e.pointerId)return;
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;
  drag.moved=true;
  const point=this.rayPoint(e,drag.base.y);
  if(!point)return;
  const obj=this.selected;
  if(!obj)return;
  obj.root.position.x=PrecisionPlacement.drag(
   drag.base.x,drag.hit.x,point.x,this.gridSnap,this.gridStep);
  obj.root.position.z=PrecisionPlacement.drag(
   drag.base.z,drag.hit.z,point.z,this.gridSnap,this.gridStep);
  obj.root.updateMatrixWorld(true);
  if(this.outline)this.outline.setFromObject(obj.root);
  this.gizmo.update();this.syncInspector();
  e.preventDefault();e.stopImmediatePropagation();
 }
 finishObjectDrag(e){
  const drag=this.dragMove;
  if(!drag||drag.pointerId!==e.pointerId)return;
  this.dragMove=null;this.controls.enabled=true;
  if(this.canvas.hasPointerCapture?.(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
  if(drag.moved){
   if(this.selected?.surface?.style!=='none')this.applySurfaceTo(this.selected);
   notify('Деталь перемещена по X/Z: '+this.sizeText(this.selected),'success');
  }
  e.preventDefault();e.stopImmediatePropagation();
 }
 // Mounted decorations live on real wall faces, never imaginary wall sockets.
 wallHit(ray){
  const walls=this.entries.filter(e=>e.category==='wall');
  if(!walls.length)return null;
  const hits=ray.intersectObjects(walls.map(e=>e.root),true);
  for(const hit of hits){
   const entry=walls.find(e=>{
    let parent=hit.object;
    while(parent){if(parent===e.root)return true;parent=parent.parent}return false;
   });
   if(!entry||!hit.face)continue;
   const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
   if(Math.abs(normal.y)>.25)continue;
   return {point:hit.point.clone(),normal,entry};
  }
  return null;
 }
 locatePointer(event){
  const r=this.canvas.getBoundingClientRect();
  this.pointer.set((event.clientX-r.left)/r.width*2-1,
   -(event.clientY-r.top)/r.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  this.surfaceHit=this.wallHit(this.ray);
  const ground=new THREE.Plane(V(0,1,0),-this.floor*2.6),where=V();
  const found=this.ray.ray.intersectPlane(ground,where);
  if(this.preview?.category==='decor')return this.surfaceHit?.point.clone()||null;
  return found?where:null;
 }
 aimPlacement(){
  if(!this.preview||this.tool!=='place')return;
  const ray=new THREE.Raycaster(),dir=V();
  this.camera.getWorldDirection(dir);
  ray.set(this.camera.position.clone(),dir.normalize());
  this.surfaceHit=this.wallHit(ray);
  const plane=new THREE.Plane(V(0,1,0),-this.floor*2.6),point=V();
  const hit=ray.ray.intersectPlane(plane,point);
  if(this.preview.category==='decor'&&this.surfaceHit)
   this.cursor.copy(this.surfaceHit.point);
  else if(hit&&hit.distanceTo(this.camera.position)<75)this.cursor.copy(hit);
  else if(this.mode==='character')this.cursor.copy(this.player.position)
   .addScaledVector(dir.setY(0).normalize(),3);
  else this.cursor.copy(this.controls.target);
  this.updatePreview(this.cursor);
 }
 attachDecor(obj,hit){
  if(!hit)return false;
  const bounds=CleanGeometry.localBounds(obj.root),center=bounds.getCenter(V()),
   size=bounds.getSize(V()),scale=obj.root.scale;
  const yaw=Math.atan2(hit.normal.x,hit.normal.z);
  const rotated=center.clone().multiply(scale).applyAxisAngle(V(0,1,0),yaw);
  const offset=size.z*Math.abs(scale.z)/2+.015;
  obj.root.position.copy(hit.point).addScaledVector(hit.normal,offset).sub(rotated);
  obj.root.rotation.y=yaw;obj._snapRotation=yaw;
  return true;
 }
 updatePreview(cursor,snapAllowed=true){
  const obj=this.preview;if(!obj||this.tool!=='place')return;
  const pos=cursor||V();
  obj.root.position.set(
   PrecisionPlacement.coordinate(pos.x,this.gridSnap,this.gridStep),
   obj.manualPlacementY??this.floor*2.6,
   PrecisionPlacement.coordinate(pos.z,this.gridSnap,this.gridStep));
  if(obj.category==='decor'){
   obj._hasWallTarget=this.attachDecor(obj,this.surfaceHit);
   if(!obj._hasWallTarget){
    this.previewStatus=null;notify('Коснись стены, чтобы закрепить настенный декор','warn');
   }else notify('🟢 Декор прикреплён к поверхности стены','success');
   obj.root.updateMatrixWorld(true);this.syncInspector();return;
  }
  if(obj.category==='roof'&&obj.manualPlacementY===undefined)
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
 updateHistoryButtons(){
  $('btnUndo').disabled=!this.history.canUndo||this.history.busy;
  $('btnRedo').disabled=!this.history.canRedo||this.history.busy;
 }
 recordEdit(snapshot){
  const ok=this.history.record(snapshot||this.project());
  this.updateHistoryButtons();return ok;
 }
 async historyAction(direction){
  if(this.history.busy)return;
  try{
   const change=direction==='undo'?
    this.history.undo(this.project(),doc=>this.restore(doc)):
    this.history.redo(this.project(),doc=>this.restore(doc));
   const done=await change;this.updateHistoryButtons();
   notify(done?(direction==='undo'?'↶ Изменение отменено':'↷ Изменение повторено'):
    'История действий пуста',done?'success':'warn');
  }catch(err){this.updateHistoryButtons();
   notify('История: '+err.message,'error');}
 }
 addPlannedModules(data,label){
  if(!Array.isArray(data)||!data.length)throw Error('Нет деталей для создания');
  if(data.length>BuildingWorkflow.MAX_OBJECTS||
   this.entries.length+data.length>BuildingWorkflow.MAX_OBJECTS)
   throw Error('Достигнут предел 900 деталей для одного проекта');
  const oldNextId=this.nextId,staged=[];
  try{
   for(const spec of data){
    if(!Array.isArray(spec.position)||spec.position.length!==3||
     !spec.position.every(Number.isFinite))throw Error('Неверное положение детали');
    const entry=this.createEntry(spec.kind,spec);
    if(!entry)throw Error('Модель не найдена: '+spec.kind);
    staged.push(entry);
   }
  }catch(err){
   for(const entry of staged)entry.root.removeFromParent();
   this.nextId=oldNextId;throw err;
  }
  this.recordEdit();
  for(const entry of staged){
   this.entries.push(entry);this.scene.add(entry.root);
   this.attachImportedLOD(entry);
  }
  this.selected=staged[0];this.setTool('pick');
  if(this.outline){this.scene.remove(this.outline);this.outline.geometry.dispose();}
  this.outline=new THREE.BoxHelper(this.selected.root,0x44ffb8);
  this.scene.add(this.outline);this.gizmo.attach(this.selected);
  this.syncInspector();
  notify('🏠 '+label+': '+staged.length+' деталей. Можно редактировать каждую','success');
  return staged;
 }
 createRoom(){
  try{
   const plan=BuildingWorkflow.roomPlan({
    width:$('roomWidth').value,depth:$('roomDepth').value,
    x:$('roomX').value,z:$('roomZ').value,storey:this.floor,
    floor:$('roomIncludeFloor').checked,
    ceiling:$('roomIncludeCeiling').checked
   });
   this.addPlannedModules(plan.items,'Комната '+plan.width+' × '+plan.depth+' м');
  }catch(err){notify('Комната: '+err.message,'error')}
 }
 copySelectedRoom(){
  try{
   const group=this.selected?.groupId;
   if(!group)throw Error('Сначала выдели стену/пол созданной комнаты');
   const members=this.entries.filter(entry=>entry.groupId===group);
   const bounds=new THREE.Box3();
   for(const entry of members)bounds.expandByObject(entry.root);
   const distance=Math.ceil((bounds.max.x-bounds.min.x+2)/2)*2;
   const plan=BuildingWorkflow.duplicateRoom(
    this.project().objects,group,[distance,0,0]);
   this.addPlannedModules(plan,'Копия комнаты');
  }catch(err){notify('Копия комнаты: '+err.message,'error')}
 }
 copyCurrentStorey(){
  try{
   const plan=BuildingWorkflow.duplicateStorey(this.project().objects,this.floor);
   this.addPlannedModules(plan,'Копия этажа '+(this.floor+2));
   this.floor++;$('levelLabel').textContent=this.floor+1;
  }catch(err){notify('Копия этажа: '+err.message,'error')}
 }
 async exportGameManifest(){
  if(!this.entries.length)return notify('Сначала построй здание','warn');
  try{
   const manifest=BuildingWorkflow.gameManifest(this.project());
   const blob=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'});
   await PhoenixFiles.saveBlob(blob,'PhoenixBuilder_GameScene.json','application/json');
   notify('🎮 JSON экспортирован: отдельно выгрузи GLB. В игре создай коллайдеры по метаданным','success');
  }catch(err){notify('Игровой экспорт: '+err.message,'error')}
 }
 place(){
  if(!this.preview)return;
  if(this.preview.category==='decor'&&!this.preview._hasWallTarget)return notify('Коснись стены для настенного декора','warn');
  const source=this.preview;
  const data={category:source.category,storey:this.floor,scale:source.scale,
   axes:cloneJSON(source.axes),thickness:source.thickness,
   rot:source._snapRotation??source.rot,
   rotation:{x:source.root.rotation.x,y:source._snapRotation??source.root.rotation.y,
    z:source.root.rotation.z},
   sockets:source.sockets?cloneJSON(source.sockets):null,
   doorAngle:source.doorAngle||0,
   meshEdit:CleanMeshEdit.normalize(source.meshEdit),floorTrim:FloorClip.normalize(source.floorTrim),
   openings:WallOpenings.normalize(source.openings),surface:SurfaceMaterials.normalize(source.surface),
   surfaceSides:SurfaceMaterials.normalizeSides(source.surfaceSides),
    manualEdgeCut:source.manualEdgeCut||null,autoEdgeCuts:FloorClip.normalizeCuts(source.autoEdgeCuts),
   position:source.root.position.toArray()};
  const entry=this.createEntry(source.kind,data);
  if(!entry){notify('Не удалось разместить модуль','error');return}
  this.recordEdit();
  this.scene.add(entry.root);this.entries.push(entry);
  this.attachImportedLOD(entry);
  this.selectKind(source.kind);
  this.preview.root.position.fromArray(data.position);
  this.settings={scale:data.scale,axes:data.axes,thickness:data.thickness};
  this.preview.scale=data.scale;this.preview.axes=data.axes;this.preview.thickness=data.thickness;
  this.preview.meshEdit=CleanMeshEdit.normalize(data.meshEdit);
  this.preview.doorAngle=data.doorAngle||0;
  this.preview.openings=WallOpenings.normalize(data.openings);
  this.preview.surface=SurfaceMaterials.normalize(data.surface);
  this.preview.surfaceSides=SurfaceMaterials.normalizeSides(data.surfaceSides);
  this.preview.floorTrim=FloorClip.normalize(data.floorTrim);
  this.preview.manualEdgeCut=data.manualEdgeCut||null;
  this.preview.autoEdgeCuts=FloorClip.normalizeCuts(data.autoEdgeCuts);
  if(this.preview.kind==='floor')this.rebuildFloor(this.preview,this.preview.floorTrim);
  else if(CleanGeometry.isBuiltIn(this.preview.kind))this.updateGeometry(this.preview);
  else this.rebuildImported(this.preview);
  this.applyTransform(this.preview);
  this.updatePreview(V(data.position[0],0,data.position[2]));
  notify('Деталь установлена. Для редактирования нажми «Выделить».','success');
 }
 pickTextureFace(event){
  const rect=this.canvas.getBoundingClientRect();
  this.pointer.set((event.clientX-rect.left)/rect.width*2-1,
   -(event.clientY-rect.top)/rect.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  const options=this.entries.filter(obj=>['floor','wall'].includes(obj.category));
  const hits=this.ray.intersectObjects(options.map(obj=>obj.root),true);
  for(const hit of hits){
   const obj=options.find(candidate=>{
    let parent=hit.object;
    while(parent){if(parent===candidate.root)return true;parent=parent.parent;}
    return false;
   });
   if(!obj)continue;
   const side=SurfaceMaterials.faceFromHit(hit,obj.root,obj.category);
   if(!side)continue;
   this.pick(event);
   if(this.selected!==obj)return notify('Не удалось выделить нужную сторону','warn');
   $('textureFaceScope').value=side;
   this.surfaceSidePick=false;
   $('textureInspector').open=true;
   this.syncInspector();this.renderTextureLibrary();
   notify('✅ Выбрана '+(obj.category==='floor'?
    (side==='front'?'верхняя':'нижняя'):
    (side==='front'?'лицевая':'обратная'))+
    ' сторона. Теперь выбери материал (камень или штукатурка)','success');
   return;
  }
  notify('Коснись широкой поверхности стены или плиты, не её торца','warn');
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
  this.gizmo.attach(this.selected);
  this.syncInspector();
  if(this.selected&&this.pendingTexture){
   const pending=this.pendingTexture;this.pendingTexture=null;
   this.chooseTexture(pending.style,pending.imageId);
  }
 }
 duplicate(){
  const obj=this.selected;if(!obj)return notify('Сначала выдели деталь','warn');
  const data=this.encode(obj);delete data.id;
  data.position[0]+=1.5;
  const clone=this.createEntry(obj.kind,data);if(!clone)return;
  this.recordEdit();
  this.entries.push(clone);this.scene.add(clone.root);this.selected=clone;
  this.attachImportedLOD(clone);this.setTool('pick');
  if(this.outline){this.scene.remove(this.outline);this.outline.geometry.dispose()}
  this.outline=new THREE.BoxHelper(clone.root,0x44ffb8);this.scene.add(this.outline);
  this.gizmo.attach(clone);
  this.syncInspector();notify('Создана копия детали','success');
 }
 delete(){
  if(!this.selected)return notify('Сначала выдели деталь','warn');
  this.recordEdit();
  const idx=this.entries.indexOf(this.selected);
  if(idx>=0)this.entries.splice(idx,1);
  this.selected.root.removeFromParent();this.selected=null;
  this.gizmo.attach(null);
  if(this.outline){this.scene.remove(this.outline);this.outline.geometry.dispose();this.outline=null}
  this.syncInspector();notify('Деталь удалена');
 }
 encode(obj){
  return {id:obj.id,kind:obj.kind,category:obj.category,
   position:obj.root.position.toArray().map(rounded),rot:obj.rot,
   rotation:{x:obj.root.rotation.x,y:obj.root.rotation.y,z:obj.root.rotation.z},
   displayRotation:obj.root.rotation.y,storey:obj.storey,
   scale:obj.scale,axes:obj.axes,thickness:obj.thickness,sockets:obj.sockets,
   doorAngle:obj.doorAngle||0,
   meshEdit:CleanMeshEdit.normalize(obj.meshEdit),floorTrim:FloorClip.normalize(obj.floorTrim),
   manualEdgeCut:obj.manualEdgeCut||null,autoEdgeCuts:FloorClip.normalizeCuts(obj.autoEdgeCuts),
   openings:WallOpenings.normalize(obj.openings),surface:SurfaceMaterials.normalize(obj.surface),
   surfaceSides:SurfaceMaterials.normalizeSides(obj.surfaceSides),
   groupId:obj.groupId||'',roomRole:obj.roomRole||'',
   sizeCm:this.physicalSize(obj)};
 }
 project(){
  return {version:2,app:'Phoenix Builder Clean',
   heights:[],objects:this.entries.map(obj=>{
    const item=this.encode(obj);item.rot=obj.root.rotation.y;return item;
   }),floor:this.floor,nextId:this.nextId,
    textureLibrary:this.textureFiles.map(t=>({
     id:t.id,name:t.name,type:t.type,width:t.width,height:t.height,
     bytes:t.bytes,folder:t.folder||'my-textures',path:t.path||''
    })),
    catalogLibrary:[...this.catalogMeta.values()].map(m=>({
     id:m.id,name:m.name,category:m.category,folder:m.folder,
     path:m.path||'',source:m.source||'ZIP',bytes:m.bytes||0
    })),created:new Date().toISOString()};
 }
 async exportGLB(){
  if(!this.entries.length)return notify('Сначала установи хотя бы один модуль','warn');
  try{
   notify('📦 Подготавливаю GLB со стенами, проёмами, крышами и текстурами...','neutral');
   // Ensure IndexedDB images are loaded and actually assigned to meshes
   // before generating the GLB's embedded baseColorTexture images.
   for(const obj of this.entries){
    const updated=await this.applySurfaceTo(obj);
    if(!updated)throw Error('Не удалось подготовить материалы для '+obj.kind);
   }
   const scene={objects:this.entries.map(obj=>({mesh:obj.root,data:{
    kind:obj.kind,category:obj.category,storey:obj.storey,
    groupId:obj.groupId||null,roomRole:obj.roomRole||null,
    suggestedCollider:['wall','floor','roof'].includes(obj.category)||
     obj.kind==='stairsStraight'?'static-mesh':'manual'
   }}))};
   const blob=await SceneExporter.build(scene,{houseOnly:true,
    keepWorldCoordinates:true});
   await PhoenixFiles.saveBlob(blob,'PhoenixBuilder_Scene.glb','model/gltf-binary');
   notify('📦 GLB подготовлен: выбери место сохранения. Модели и текстуры включены','success');
  }catch(err){console.error('GLB export',err);
   notify('Ошибка GLB: '+(err?.message||err),'error')}
 }
 async exportBackup(){
  if(!this.entries.length&&!this.textureFiles.length)
   return notify('В проекте ещё нет модулей или текстур','warn');
  try{
   notify('📁 Собираю редактируемый проект вместе с изображениями и GLB...','neutral');
   const doc=await PhoenixFiles.packageProject(this.project(),this.textureFiles,
    [...new Set([...this.entries.map(o=>o.kind),...this.assets.keys(),
     ...this.catalogMeta.keys()])],
    id=>getAsset(id));
   const blob=new Blob([JSON.stringify(doc)],{type:'application/json'});
   await PhoenixFiles.saveBlob(blob,'PhoenixBuilder_Project.phoenix.json','application/json');
   notify('📁 Резервная копия готова: выбери папку. Внутри текстуры и импортированные модели','success');
  }catch(err){console.error('Project backup',err);
   notify('Ошибка резервной копии: '+(err?.message||err),'error')}
 }
 async importBackup(file){
  if(!file)return;
  try{
   notify('📁 Читаю резервную копию и восстанавливаю изображения...','neutral');
   const doc=JSON.parse(await file.text());
   const result=await PhoenixFiles.unpackProject(doc,(id,data)=>putAsset(id,data));
   // Assets are now on disk; invalidate stale in-memory maps before restore.
   for(const item of doc.assets){
    if(item.id.startsWith('glb:'))this.assets.delete(item.id);
    if(item.id.startsWith('texture:'))this.textureCache.delete(item.id);
   }
   this.textureFiles=[...this.textureFiles.filter(t=>!
    result.textures.some(x=>x.id===t.id)),
    ...result.textures.map(t=>({
     ...t,...doc.project.textureLibrary?.find(meta=>meta.id===t.id)
    }))].slice(-1500);
   localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
   await this.restore(result.project);
   this.renderTextureLibrary();this.renderCatalog();
   this.save();
   notify('✅ Восстановлен проект: '+this.entries.length+
    ' деталей, '+this.textureFiles.length+' текстур. Можно продолжить редактирование','success');
  }catch(err){console.error('Import backup',err);
   notify('Ошибка открытия копии: '+(err?.message||err),'error')}
 }
 save(){
  const json=JSON.stringify(this.project());
  try{
   if(window.NativeBridge?.saveCleanProject){
    const done=window.NativeBridge.saveCleanProject(json);
    if(done){
     localStorage.setItem('phoenix-builder-clean-v2',json);
     notify('💾 Проект сохранён внутри приложения. Для переносимой копии: 📁 Файлы проекта','success');
     return true;
    }
   }
   localStorage.setItem('phoenix-builder-clean-v2',json);
   notify('💾 Проект сохранён на устройстве. Для переноса с текстурами: 📁 Файлы проекта','success');
   return true;
  }catch(err){notify('Ошибка сохранения: '+err.message,'error');return false}
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
   if(!CleanGeometry.isBuiltIn(item.kind)&&!await this.ensureTemplate(item.kind,item.category||'wall'))
    throw Error('Не найден импортированный GLB: '+item.kind);
   const e=this.createEntry(item.kind,item);
   if(!e)throw Error('Невозможно загрузить модуль: '+item.kind);
   e.rot=Number(item.rotation?.y??item.rot)||0;
   e.rotation={x:Number(item.rotation?.x)||0,y:e.rot,
    z:Number(item.rotation?.z)||0};
   this.applyTransform(e);staged.push(e);
  }
  // Preserve texture library metadata alongside each internal save. Image
  // bytes remain in IndexedDB; portable backup embeds them for transfer.
  if(Array.isArray(doc.textureLibrary)){
   const records=doc.textureLibrary.filter(t=>t&&typeof t.id==='string'&&
    t.id.startsWith('texture:')&&typeof t.name==='string');
   this.textureFiles=[...this.textureFiles.filter(t=>!
    records.some(record=>record.id===t.id)),...records].slice(-1500);
   localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
  }
  // Portable backups preserve folder names for unplaced imported GLB too.
  if(Array.isArray(doc.catalogLibrary)){
   for(const meta of doc.catalogLibrary){
    if(!meta?.id?.startsWith('glb:')||!SmartCatalog.labels[meta.folder]||
     typeof meta.name!=='string')continue;
    this.catalogMeta.set(meta.id,{
     id:meta.id,name:safeName(meta.name),folder:meta.folder,
     category:SmartCatalog.category(meta.folder),
     path:String(meta.path||'').slice(0,260),
     source:'ZIP',bytes:Number(meta.bytes)||0
    });
   }
   this.saveCatalogMeta();
  }
  // All-or-nothing restore: keep current scene if a GLB was lost.
  for(const obj of this.entries)obj.root.removeFromParent();
  this.entries=staged;for(const e of staged){this.scene.add(e.root);this.attachImportedLOD(e)}
  this.floor=Number.isInteger(doc.floor)?clamp(doc.floor,0,49):0;
  this.nextId=Math.max(1,...this.entries.map(e=>e.id+1),doc.nextId||1);
  this.selected=null;this.setTool('place');this.selectKind('wall');
  $('levelLabel').textContent=this.floor+1;
 }
 setAvatarAnimation(moving){
  if(!this.avatarMixer||!this.avatarClips.length)return;
  const mode=moving?'walk':'idle';
  if(this.avatarState===mode)return;
  const clip=moving?
   this.avatarClips.find(c=>/walk|move|run|ход|бег/i.test(c.name)):
   this.avatarClips.find(c=>/idle|stand|rest|breath|покой/i.test(c.name));
  const selected=clip||this.avatarClips[0];
  if(!selected)return;
  const action=this.avatarActions[selected.name];if(!action)return;
  for(const [name,other] of Object.entries(this.avatarActions))
   if(name!==selected.name&&other.isRunning())other.fadeOut(.18);
  if(!action.isRunning())action.reset().fadeIn(.18).play();
  this.avatarState=mode;
 }
 updatePlayer(dt){
  if(this.avatarMixer)this.avatarMixer.update(dt);
  if(this.mode!=='character'&&this.mode!=='drone')return;
  const down=(...keys)=>keys.some(k=>this.keys.has(k));
  const left=down('a','arrowleft','left'),right=down('d','arrowright','right'),
   up=down('w','arrowup','up'),back=down('s','arrowdown','down');
  const raw=V(Number(right)-Number(left)+(this.joy?.x||0),
   0,Number(back)-Number(up)+(this.joy?.y||0));
  if(this.mode==='character'&&raw.lengthSq()<.0025)this.setAvatarAnimation(false);
  if(this.mode==='drone'){
   const rise=(Number(down('e'))-Number(down('q')))*dt*7;
   if(rise){const v=V(0,rise,0);this.controls.target.add(v);this.camera.position.add(v)}
  }
  if(raw.lengthSq()<.0025){if(this.tool==='place'&&this.mode==='drone')this.aimPlacement();return}
  raw.clampLength(0,1).multiplyScalar(dt*(this.mode==='drone'?10:3));
  const facing=V();this.camera.getWorldDirection(facing);facing.y=0;facing.normalize();
  const side=V(-facing.z,0,facing.x);
  const step=side.multiplyScalar(raw.x).addScaledVector(facing,-raw.z);
  if(this.mode==='drone'){
   this.controls.target.add(step);this.camera.position.add(step);
  }else{
   const previous=this.player.position.clone();
   const movement=this.collisionsEnabled?
    this.collisionSolver.move(previous,step,this.entries).displacement:step;
   this.player.position.add(movement);
   if(movement.lengthSq()>.0000001)
    this.player.rotation.y=Math.atan2(movement.x,movement.z);
   this.controls.target.add(movement);this.camera.position.add(movement);
   this.setAvatarAnimation(movement.lengthSq()>.0000001);
  }
  if(this.tool==='place')this.aimPlacement();
 }
 bind(){
  $('modeBuild').onclick=()=>this.setMode('build');
  $('modeCharacter').onclick=()=>this.setMode('character');
  $('modeDrone').onclick=()=>this.setMode('drone');
  $('optimizationQuality').onchange=()=>this.updateOptimizer();
  $('optimizationLOD').onchange=()=>this.updateOptimizer();
  $('optimizationAutoResolution').onchange=()=>this.updateAutoResolution();
  $('btnPerfReport').onclick=()=>this.exportPerformanceReport();
  $('tabParts').onclick=()=>this.setTextureTab('parts');
  for(const button of document.querySelectorAll('#catalogQuick [data-catalog-group]'))
   button.onclick=()=>{
    this.catalogGroup=button.dataset.catalogGroup;
    this.smartCatalogFolder={structure:'walls',doors:'doors',frames:'frames',
     roofs:'roofs',imports:'my-modules'}[this.catalogGroup]||'all';
    this.renderCatalog();
   };
  $('smartCategoryFilter').onchange=e=>{
   this.smartCatalogFolder=e.target.value;this.renderCatalog();
  };
  $('smartCatalogSearch').oninput=()=>this.renderCatalog();
  $('textureCategoryFilter').onchange=()=>this.renderTextureLibrary();
  $('textureSearch').oninput=()=>this.renderTextureLibrary();
  $('importZip').onchange=e=>{
   const file=e.target.files?.[0];e.target.value='';
   this.importZIP(file);
  };
  $('tabTextures').onclick=()=>this.setTextureTab('textures');
  $('btnQuickImportGLB').onclick=()=>{
   this.setTextureTab('parts');
   $('catalogImport').open=true;
   $('catalogImport').scrollIntoView({block:'nearest',behavior:'auto'});
   notify('📥 Выбери тип модуля и нажми «Загрузить GLB»','neutral');
  };
  $('avatarInBuild').onchange=e=>{
   this.showAvatarInBuild=e.target.checked;
   localStorage.setItem('phoenix-builder-avatar-build',this.showAvatarInBuild?'on':'off');
   this.player.visible=this.mode==='character'||
    this.mode==='build'&&this.showAvatarInBuild;
   notify(this.showAvatarInBuild?
    '🧍 Персонаж виден в режиме строительства':'Персонаж скрыт во время строительства',
    'success');
  };
  $('avatarHeight').oninput=e=>this.applyAvatarHeight(e.target.value);
  $('enableCollisions').onchange=e=>{
   this.collisionsEnabled=e.target.checked;
   localStorage.setItem('phoenix-builder-collisions',this.collisionsEnabled?'on':'off');
   notify(this.collisionsEnabled?'🛡 Коллизии включены (проверяются реальные проёмы)':
    'Коллизии персонажа выключены','success');
  };
  $('importTexture').onchange=e=>{this.importTextureFile(e.target.files?.[0]);e.target.value=''};
  $('textureFaceScope').onchange=()=>{
   this.syncInspector();this.renderTextureLibrary();
  };
  $('btnPickTextureFace').onclick=()=>{
   if(this.surfaceSidePick){
    this.surfaceSidePick=false;this.syncInspector();
    return notify('Выбор стороны отменён','neutral');
   }
   if(this.mode!=='build')this.setMode('build');
   if(this.tool!=='pick')this.setTool('pick');
   this.surfaceSidePick=true;this.syncInspector();
   notify('👆 Коснись большой поверхности стены/плиты — я определю её сторону','warn');
  };
  $('btnApplyTexture').onclick=()=>this.changeSurface();
  $('btnClearTexture').onclick=()=>this.changeSurface(true);
  $('btnSurfaceAllWalls').onclick=()=>this.applySurfaceToAllWalls();
  for(const [id,direction] of [
   ['textureShiftUp','up'],['textureShiftDown','down'],
   ['textureShiftLeft','left'],['textureShiftRight','right'],
   ['textureShiftReset','reset']])
   $(id).onclick=()=>this.shiftTexture(direction);
  for(const id of ['textureRoughness','textureMetalness','textureRelief'])
   $(id).oninput=e=>$(id+'Value').textContent=Number(e.target.value).toFixed(2);
  $('btnOpeningTool').onclick=()=>this.startOpeningTool();
  $('btnQuickOpening').onclick=()=>this.startOpeningTool();
  $('btnFocusCamera').onclick=()=>this.startCameraFocus();
  $('btnCutForPrefabDoor').onclick=()=>this.cutForPrefabDoor();
  $('btnPickOpeningPoint').onclick=()=>{
   this.setMode('build');
   this.openingPickMode=true;this.setTool('pick');this.syncInspector();
   $('openingPanel').open=true;
   notify('🎯 Коснись пальцем точки, где должен быть центр отверстия','warn');
  };
  $('openingSizePreset').onchange=e=>{
   if(!e.target.value)return;
   const [w,h,type]=e.target.value.split(':');
   $('openingWidth').value=w;$('openingHeight').value=h;
   if(type==='window'){$('openingType').value='window';$('openingBottom').value='90'}
   this.updateOpeningInfo();
  };
  $('openingPositionPreset').onchange=e=>this.chooseOpeningPosition(e.target.value);
  $('openingX').oninput=()=>{
   $('openingPositionPreset').value='manual';this.updateOpeningInfo();
  };
  $('openingWidth').oninput=()=>{
   $('openingSizePreset').value='';this.updateOpeningInfo();
  };
  $('openingPanel').addEventListener('toggle',()=>this.updateOpeningInfo());
  $('btnAddOpening').onclick=()=>this.addOpening();
  $('btnChangeOpeningStyle').onclick=()=>this.restyleOpening();
  $('btnRemoveOpening').onclick=()=>this.removeOpening();
  $('openingSelect').onchange=()=>this.syncInspector();
  $('doorSwing').oninput=()=>this.setDoorSwing();
  $('prefabDoorSwing').oninput=()=>{
   const obj=this.target();if(!obj||!ArchitectureKit.has(obj.kind))return;
   obj.doorAngle=clamp(Number($('prefabDoorSwing').value)||0,-110,110);
   ArchitectureKit.setDoorAngle(obj.root,obj.doorAngle);
  };
  $('openingType').onchange=()=>{
   if($('openingType').value==='window'){
    $('openingBottom').value=90;$('openingWidth').value=110;$('openingHeight').value=100;
   }else{
    $('openingBottom').value=0;$('openingWidth').value=85;$('openingHeight').value=205;
   }
  };
  for(const mode of ['move','rotate','scale']){
   const id='gizmo'+mode[0].toUpperCase()+mode.slice(1);
   $(id).onclick=()=>{
    this.gizmo.setMode(mode);
    for(const name of ['move','rotate','scale'])
     $('gizmo'+name[0].toUpperCase()+name.slice(1)).classList.toggle('active',mode===name);
    if(this.tool!=='pick')notify('Для гизмо нажми «Выделить» и выбери деталь','warn');
   };
  }
  $('btnHideUi').onclick=()=>document.body.classList.toggle('uiHidden');
  $('btnSave').onclick=()=>this.save();
  $('btnLoad').onclick=()=>this.load();
  $('btnExportGLB').onclick=()=>this.exportGLB();
  $('btnBackupProject').onclick=()=>this.exportBackup();
  $('btnImportBackup').onclick=()=>$('importProjectBackup').click();
  $('importProjectBackup').onchange=e=>{
   this.importBackup(e.target.files?.[0]);
   e.target.value='';
  };
  $('btnPick').onclick=()=>{this.setTool('pick');this.syncInspector()};
  $('btnPlace').onclick=()=>{this.selected=null;this.setTool('place');this.syncInspector()};
  $('btnConfirm').onclick=()=>{if(this.mode!=='build')this.aimPlacement();this.place()};
  $('btnCancel').onclick=()=>{this.setTool('pick');this.syncInspector()};
  $('btnLevelDown').onclick=()=>{this.floor=clamp(this.floor-1,0,49);
   $('levelLabel').textContent=this.floor+1;this.updatePreview(this.cursor)};
  $('btnLevelUp').onclick=()=>{this.floor=clamp(this.floor+1,0,49);
   $('levelLabel').textContent=this.floor+1;this.updatePreview(this.cursor)};
  $('magnet').onchange=e=>{this.magnet=e.target.checked;this.updatePreview(this.cursor)};
  $('gridSnap').onchange=e=>{
   this.gridSnap=e.target.checked;
   localStorage.setItem('phoenix-builder-grid-snap',this.gridSnap?'on':'off');
   if(this.tool==='place')this.updatePreview(this.cursor);
   else notify(this.gridSnap?'Сетка включена':'Сетка выключена: свободное перемещение до 1 мм','success');
  };
  $('gridStep').onchange=e=>{
   this.gridStep=PrecisionPlacement.step(e.target.value,.25);
   localStorage.setItem('phoenix-builder-grid-step',String(this.gridStep));
   if(this.tool==='place')this.updatePreview(this.cursor);
  };
  $('moveStep').onchange=e=>{
   const size=PrecisionPlacement.step(e.target.value,.001);
   localStorage.setItem('phoenix-builder-move-step',String(size));
  };
  $('moduleCategory').onchange=()=>this.changeCategory();
  $('btnSaveModule').onclick=()=>this.saveModulePreset();
  $('btnApplyFloorCut').onclick=()=>this.applyFloorSettings();
  $('btnResetFloorCut').onclick=()=>this.applyFloorSettings(true);
  $('btnAutoTrim').onclick=()=>this.applyAutomaticTrim();
  $('btnResetAutoTrim').onclick=()=>this.applyAutomaticTrim(true);
  $('btnBulkTrim').onclick=()=>this.trimWholeProject();
  $('btnBulkTrimReset').onclick=()=>this.trimWholeProject(true);
  $('btnApplyGlbCut').onclick=()=>this.applyImportedCut();
  $('btnResetGlbCut').onclick=()=>this.applyImportedCut(true);
  for(const [id,dx,dz,dy] of [['moveLeft',-1,0,0],['moveRight',1,0,0],
   ['moveForward',0,-1,0],['moveBack',0,1,0],
   ['moveDown',0,0,-1],['moveUp',0,0,1]])
   $(id).onclick=()=>this.nudgeSelected(dx,dz,dy);
  $('btnApplyMeshEdit').onclick=()=>this.applyMeshSettings();
  $('btnResetMeshEdit').onclick=()=>this.applyMeshSettings(true);
  $('importModel').onchange=e=>{this.importGLB(e.target.files?.[0]);e.target.value=''};
  $('importAvatar').onchange=e=>{this.importAvatar(e.target.files?.[0]);e.target.value=''};
  for(const id of ['scaleAll','sizeX','sizeY','sizeZ','thickness','posX','posY','posZ','rotX','rotY','rotZ'])
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
  this.canvas.addEventListener('pointerdown',e=>{
   if(this.surfaceSidePick||this.cameraFocusPick||this.openingPickMode||this.tool!=='pick'||!this.selected||!this.gizmo.start(e))return;
   this.gizmoPointer=e.pointerId;this.controls.enabled=false;
   if(this.canvas.setPointerCapture)this.canvas.setPointerCapture(e.pointerId);
   e.preventDefault();e.stopImmediatePropagation();
  },true);
  this.canvas.addEventListener('pointermove',e=>{
   if(this.gizmoPointer!==e.pointerId)return;
   this.gizmo.move(e,this.selected,{
    gridEnabled:this.gridSnap,gridStep:this.gridStep
   });
   if(this.outline&&this.selected)this.outline.setFromObject(this.selected.root);
   e.preventDefault();e.stopImmediatePropagation();
  },true);
  const finishGizmo=e=>{
   if(this.gizmoPointer!==e.pointerId)return;
   const drag=this.gizmo.end(e);this.gizmoPointer=null;this.controls.enabled=true;
   if(this.canvas.hasPointerCapture?.(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
   if(drag?.mode==='scale'&&drag.changed&&this.selected){
    if(WallOpenings.supported(this.selected.kind))this.updateGeometry(this.selected);
    else if(this.selected.kind==='floor')this.rebuildFloor(this.selected,this.selected.floorTrim);
    else if(this.selected.thicknessEditable)this.rebuildImported(this.selected);
   }
   if(drag?.changed){
    if(this.selected){
     this.selected.root.updateMatrixWorld(true);
     if(this.selected.surface?.style!=='none')this.applySurfaceTo(this.selected);
    }
    this.syncInspector();
    notify('Гизмо: изменение выполнено, параметры сохраняются в проекте','success');
   }
   e.preventDefault();e.stopImmediatePropagation();
  };
  for(const type of ['pointerup','pointercancel'])
   this.canvas.addEventListener(type,finishGizmo,true);
  this.canvas.addEventListener('pointerdown',e=>this.beginObjectDrag(e),true);
  this.canvas.addEventListener('pointermove',e=>this.continueObjectDrag(e),true);
  for(const type of ['pointerup','pointercancel'])
   this.canvas.addEventListener(type,e=>this.finishObjectDrag(e),true);
  this.canvas.addEventListener('pointerdown',e=>{
   // A second finger must not generate a click/placement at the end of pan.
   if(e.isPrimary===false){this.pointerStart=null;return}
   this.pointerStart={pointerId:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now()};
  });
  this.canvas.addEventListener('pointerup',e=>{
   const start=this.pointerStart;
   if(!start||e.pointerId!==start.pointerId||e.isPrimary===false)return;
   this.pointerStart=null;
   if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)return;
   if(this.surfaceSidePick){this.pickTextureFace(e);return}
   if(this.cameraFocusPick){this.setCameraFocusAt(e);return}
   if(this.tool==='pick'){
    if(this.openingPickMode)this.pickOpeningCentre(e);
    else this.pick(e);
    return;
   }
   const point=this.locatePointer(e);if(!point){this.updatePreview(this.cursor);return}
   this.cursor.copy(point);this.updatePreview(point);
  });
  this.canvas.addEventListener('pointercancel',()=>{this.pointerStart=null});
  this.canvas.addEventListener('pointermove',e=>{
   if(e.buttons||this.cameraFocusPick||this.tool!=='place')return;
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