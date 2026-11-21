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
const bundledModules=new Map((typeof BundledCatalog==='undefined'?[]:BundledCatalog)
 .map(module=>[module.id,module]));
const defaultSettings=()=>({scale:1,axes:{x:1,y:1,z:1},thickness:.22,rot:0,rotation:{x:0,y:0,z:0}});
const categoryOf=kind=>builtins.find(x=>x.kind===kind)?.category||'prop';
const safeName=name=>String(name).replace(/[<>]/g,'').slice(0,60);
const textureBrushKey='phoenix-builder-texture-brush-v1';
const textureFields={
 textureStyle:'style',textureTint:'color',textureRepeat:'repeat',
 textureMapping:'mapping',textureTileMeters:'tileMeters',
 textureImageScale:'imageScale',textureRotation:'rotation',
 textureOffsetU:'offsetU',textureOffsetV:'offsetV',
 textureRoughness:'roughness',textureMetalness:'metalness',textureRelief:'relief'
};
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
 const bundled=bundledModules.get(id);
 if(bundled){
  return new Promise((resolve,reject)=>{
   const request=new XMLHttpRequest();
   request.open('GET','pwb/'+id.slice('glb:pwb:'.length)+'.glb');
   request.responseType='arraybuffer';
   const failed=()=>reject(Error('Не удалось открыть встроенный модуль '+bundled.name));
   request.onload=()=>{
    const file=request.response;
    if((request.status===0||request.status===200)&&file?.byteLength===bundled.bytes)
     resolve(file);
    else failed();
   };
   request.onerror=failed;request.onabort=failed;
   request.send();
  });
 }
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
  // No always-on grid: the world sector grid is opt-in via ▦ СЕТКА.
  // Avoid drawing tens of thousands of grid lines on 5×5 km Android scenes.
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
  this.sceneRowsSignature='';
  this.bakeSelection=new Set();this.bakeBusy=false;
  this.history=new EditorHistory(20);
  this.catalogMeta=this.loadCatalogMeta();
  this.smartCatalogFolder=localStorage.getItem('phoenix-builder-catalog-folder-v2')||'all';
  if(!SmartCatalog.order.includes(this.smartCatalogFolder))this.smartCatalogFolder='all';
  this.catalogPages=new Map();this.catalogPageKey='';
  // The catalog is a work tool, not scene history: keep its exact view across
  // part selection, placement, Cancel and Undo/Redo.
  this.catalogScroll=new Map();this.catalogDrawerScroll=new Map();
  this.catalogOpenSections=new Map();this.lastPlacementKind='wall';
  this.gizmoQuickOpen=false;this.gizmoQuickSelectionId=null;
  // UV42 wall placement preview state. Floor magnet/precision solver are untouched.
  this.wallChainAnchor=null;this.wallChainPlan=null;this.wallChainManual=false;
  this.wallChainBlocked=false;
  this.selected=null;this.previewStatus=null;this.outline=null;
  this.presets=this.loadPresets();this.dragMove=null;this.openingPickMode=false;
  this.openingTargetId=null;
  this.cameraFocusPick=false;this.surfaceSidePick=false;this.decalPickMode=false;this.decalMoveId='';
  this.shapeMode='manual';this.shapePlaceMode=false;this.shapeSourceMode=false;
  this.shapeDragPointer=null;this.shapePreview=null;this.shapePreviewTargetId=null;
  this.shapeTargetId=null;this.shapeConsumedPointer=null;this.shapeTouchSaved=null;
  this.decals=[];this.decalMeshes=[];this.decalGeneration=0;
  this.decalRebuildTimer=null;this.activeDecalImageId='';
  this.catalogGroup='structure';this.previewOutline=null;
  this.textureFiles=this.loadTextureFiles();this.textureCache=new Map();
  this.projectLoadMode=localStorage.getItem('phoenix-builder-project-load-mode-v1')||'careful';
  if(!['fast','careful'].includes(this.projectLoadMode))this.projectLoadMode='careful';
  this.projectLoadQuality=localStorage.getItem('phoenix-builder-project-load-quality-v1')||'2048';
  if(!['original','2048','1024'].includes(this.projectLoadQuality))this.projectLoadQuality='2048';
  this.activeRestoreQuality=null;this.restoringProject=false;
  this.projectLoadPaused=false;this.projectLoadGeneration=0;this.projectLoadRunning=false;
  this.activeTextureId='';this.pendingTexture=null;this.avatarFitGroup=null;this.avatarMetrics=null;
  this.textureBrush=null;this.textureMappingChosen=false;
  try{
   const saved=JSON.parse(localStorage.getItem(textureBrushKey)||'null');
   if(saved?.surface){
    this.textureBrush=SurfaceMaterials.normalize(saved.surface);
    this.textureMappingChosen=saved.mappingChosen===true;
    this.activeTextureId=this.textureBrush.imageId;
   }
  }catch(err){console.warn('Texture settings ignored',err)}
  this.avatarRoot=null;this.avatarGroundY=0;this.avatarGroundTimer=0;

  this.avatarHeightCm=175;
  this.showAvatarInBuild=localStorage.getItem('phoenix-builder-avatar-build')==='on';
  this.collisionsEnabled=localStorage.getItem('phoenix-builder-collisions')!=='off';
  this.collisionSolver=new CharacterCollision.Solver();
  this.optimizationQuality=AndroidAssetOpt.quality(
   localStorage.getItem('phoenix-builder-optimization-quality')||'balanced');
  this.lodEnabled=localStorage.getItem('phoenix-builder-optimization-lod')!=='off';
  this.placementScale=clamp(Number(localStorage.getItem('phoenix-builder-placement-scale'))||1,.1,10);
  this.clock=new THREE.Clock();
  this.player=new THREE.Group();this.player.position.set(0,0,0);this.scene.add(this.player);
  this.avatarMixer=null;this.avatarClips=[];this.avatarActions={};this.avatarState='';this.playerMoving=false;this.avatarAttackUntil=0;
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
  // Engine attaches to existing UV44 player/controls, no extra render loop.
  this.playBridge=new PhoenixPlayBridge(this,window.PhoenixCore);
  this.prefabEditor=new PhoenixPrefabEditor(this);
  this.skillEditor=new PhoenixSkillEditor(this);
  this.skillDefinitionEditor=new PhoenixSkillDefinitionEditor(this);
  this.worldEditor=new PhoenixWorldEditor(this);
  this.resize();window.addEventListener('resize',()=>this.resize());
  this.animate=now=>{requestAnimationFrame(this.animate);
   if(now-this.lastFrame<30)return;
   const dt=Math.min(this.clock.getDelta(),.075);this.lastFrame=now;
   this.updatePlayer(dt);this.prefabEditor?.update(dt);this.playBridge?.update(dt);this.controls.update();
   if(!this.playBridge?.active)this.gizmo.update();
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
  this.avatarAssetId='';this.avatarFileName='';this.avatarAttackClip='';
  if($('avatarAttackClip'))this.fillAvatarAttackClips();
  this.player.clear();this.avatarFitGroup=null;this.avatarMetrics=null;
  this.avatarRoot=null;this.avatarGroundY=0;this.avatarGroundTimer=0;
  this.avatarMixer=null;this.avatarClips=[];this.avatarActions={};this.avatarState='';this.avatarAttackUntil=0;
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
  this.avatarGroundY=fit.position.y;this.avatarGroundTimer=0;
  this.refreshAvatarFeet(true);
  // The imported animation stays on the source GLB root, not this fit wrapper.
  this.player.updateMatrixWorld(true);
  return fit;
 }
 fillAvatarAttackClips(wanted=this.avatarAttackClip||''){
  const select=$('avatarAttackClip');if(!select)return;
  select.replaceChildren();
  const add=(value,name)=>{
   const item=document.createElement('option');item.value=value;
   item.textContent=name;select.appendChild(item);
  };
  add('','Автоматически по имени клипа');
  for(const clip of this.avatarClips||[])add(clip.name,clip.name);
  const exact=this.avatarClips?.find(c=>c.name===wanted);
  this.avatarAttackClip=exact?exact.name:'';
  select.value=this.avatarAttackClip;
 }
 async importAvatar(file,{storedId='',restore=false}={}){
  if(!file)return false;
  try{
   const sourceType=ModelFormats.ext(file.name);
   const scene=sourceType==='glb'?
    await GLB.load(file):await ModelFormats.parse(file);
   AndroidAssetOpt.optimize(scene.root,this.optimizationQuality);
   const root=THREE.SkeletonUtils?.clone?
    THREE.SkeletonUtils.clone(scene.root):scene.root.clone(true);
   const fitted=new THREE.Group();fitted.name='avatar:stable-fit';
   fitted.add(root);
   // Animation can change bone positions and even root scale. The previous
   // code measured the inactive bind pose before starting the idle clip.
   // First evaluate the actual idle pose, then measure its skinned vertices.
   this.avatarClips=scene.animations||[];
   this.fillAvatarAttackClips(restore?this.avatarAttackClip:'');
   this.avatarMixer=this.avatarClips.length?new THREE.AnimationMixer(root):null;
   this.avatarActions={};this.avatarState='';this.avatarAttackUntil=0;
   if(this.avatarMixer){
    for(const clip of this.avatarClips)this.avatarActions[clip.name]=
     this.avatarMixer.clipAction(clip);
    this.setAvatarAnimation(false);
    this.avatarMixer.update(1/60);
   }
   const metrics=AvatarFit.measure(root,fitted);
   const fit=AvatarFit.apply(fitted,metrics,this.avatarHeightCm);
   this.player.clear();this.player.add(fitted);
   this.avatarRoot=root;this.avatarFitGroup=fitted;this.avatarMetrics=metrics;
   this.avatarGroundY=fit.position.y;this.avatarGroundTimer=0;
   // Fit SCALE stays fixed during walking. Only the wrapper's Y position
   // may follow the current sole position to prevent floating.
   this.refreshAvatarFeet(true);
   this.player.updateWorldMatrix(true,true);
   if(restore){
    this.avatarAssetId=storedId;this.avatarFileName=safeName(file.name);
   }else if(sourceType==='glb'){
    // The avatar was previously only an in-memory scene root. Cache the
    // original unmodified GLB once and save its reference in project JSON.
    const id='glb:avatar:'+Date.now().toString(36)+'-'+
     Math.random().toString(36).slice(2,9);
    try{
     await putAsset(id,await file.arrayBuffer());
     this.avatarAssetId=id;this.avatarFileName=safeName(file.name);
     if(!this.save())throw Error('Не удалось сохранить проект');
    }catch(error){
     this.avatarAssetId='';this.avatarFileName='';
     notify('⚠ Персонаж загружен, но НЕ сохранён: '+error.message,'warn');
     return false;
    }
   }else{
    this.avatarAssetId='';this.avatarFileName='';
    notify('⚠ FBX работает в памяти. Для постоянного сохранения импортируй GLB.','warn');
    return false;
   }
   notify('✅ Персонаж '+safeName(file.name)+' сохранён в проекте'+
    ' · '+Math.round(metrics.size.y*fit.uniform*100)+' см','success');
   return true;
  }catch(err){
   console.error(err);this.setDefaultAvatar();
   notify('Ошибка персонажа: '+err.message,'error');return false;
  }
 }
 async restoreAvatarFromProject(doc){
  if(!doc?.assetId){
   if(this.avatarAssetId)this.setDefaultAvatar();
   return true;
  }
  if(typeof doc.assetId!=='string'||!/^glb:avatar:[a-zA-Z0-9._-]{1,140}$/.test(doc.assetId))
   throw Error('Некорректная ссылка на GLB персонажа');
  this.applyAvatarHeight(doc.heightCm??175);
  this.avatarAttackClip=typeof doc.attackClip==='string'?doc.attackClip:'';
  if(this.avatarAssetId===doc.assetId&&this.avatarRoot){
   this.fillAvatarAttackClips(this.avatarAttackClip);
   return true;
  }
  const buffer=await getAsset(doc.assetId);
  if(!buffer)throw Error('Не найден сохранённый GLB персонажа '+doc.assetId+
   '. Открой переносимую резервную копию с моделями.');
  const name=String(doc.fileName||'Player.glb').replace(/[^a-zA-Zа-яА-Я0-9._-]/g,'_');
  const file=new File([buffer],/\.glb$/i.test(name)?name:name+'.glb',
   {type:'model/gltf-binary'});
  return this.importAvatar(file,{storedId:doc.assetId,restore:true});
 }

 // The physics solver keeps the PLAYER on actual floors/steps while
 // moving. Also align after entering character mode or on explicit request,
 // so a stationary character does not remain above a nearby floor.
 snapPlayerToFloor(){
  if(!this.collisionsEnabled||!this.collisionSolver)return false;
  const at=this.player.position;
  const near=this.collisionSolver.meshes(this.entries,at,1.3);
  const ground=this.collisionSolver.support(at,near);
  if(!Number.isFinite(ground))return false;
  const terrain=this.worldEditor?.heightAt(at.x,at.z);
  const naturalGround=Number.isFinite(terrain)&&Math.abs(ground-terrain)<.002;
  if(!naturalGround&&Math.abs(ground-at.y)>this.collisionSolver.stepHeight+.18)
   return false; // never teleport a player to an upper storey
  // Authored hills/valleys are the natural floor: the avatar may spawn
  // above them after loading or leaving EDIT, even with large elevation.
  this.player.position.y=ground;
  return true;
 }
 refreshAvatarFeet(instant=false){
  if(!this.avatarRoot||!this.avatarFitGroup)return false;
  try{
   this.avatarGroundY=AvatarFit.groundTarget(this.avatarRoot,this.avatarFitGroup);
   AvatarFit.ground(this.avatarFitGroup,this.avatarGroundY,0,instant);
   return true;
  }catch(err){
   console.warn('Опора персонажа GLB:',err);
   return false;
  }
 }
 placeAvatarOnGround(){
  if(!this.avatarRoot||!this.avatarFitGroup)
   return notify('Сначала загрузи персонажа GLB','warn');
  this.snapPlayerToFloor();this.refreshAvatarFeet(true);
  this.player.updateWorldMatrix(true,true);
  notify('🦶 Ступни персонажа поставлены на уровень пола; рост не изменён','success');
 }
 resetCharacterView(){
  // This only resets accidental camera zoom; do not change avatar scale.
  const centre=this.player.position.clone().add(V(0,1.15,0));
  this.controls.target.copy(centre);
  this.camera.position.copy(centre).add(V(0,2.45,6));
  this.camera.lookAt(centre);this.controls.update();
  notify('📷 Камера отдалена для просмотра персонажа в реальном масштабе','success');
 }
 setMode(mode){
  if(mode!=='build'&&this.surfaceSidePick){
   this.surfaceSidePick=false;
   this.syncQuickTextureFaces();
  }
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
   this.snapPlayerToFloor();
   this.refreshAvatarFeet(true);
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
  this.controls.update();if(!this.playBridge?.active)this.aimPlacement();
  this.gizmo.attach(mode==='build'&&this.tool==='pick'&&
   SceneManager.editingAllowed(this.selected)?this.selected:null);
  this.updateGizmoDock();
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
  // Loading the bytes of a model already listed in the catalog must not
  // rebuild the entire visible folder or move the user's scroll position.
  // Newly imported, previously unlisted models still refresh the gallery.
  if(!bundledModules.has(id)&&!this.catalogMeta.has(id))this.renderCatalog();
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
   // Quick import must never silently classify a tree as a wall.
   const choice=$('importCategory').value;
   const guess=SmartCatalog.classify(file.name);
   const folder=choice==='auto'?(guess?.folder||'misc'):
    choice==='wall'?'walls':choice==='floor'?'floors':
    choice==='roof'?'roofs':choice==='decor'?'decor':'misc';
   const category=choice==='auto'?SmartCatalog.category(folder):
    choice==='misc'?'prop':choice;
   this.catalogMeta.set(id,{id,name:safeName(file.name),
    folder,category,path:file.name,source:'GLB',bytes:buf.byteLength});
   await this.cacheModel(id,buf,category,file.name);
   this.saveCatalogMeta();
   // Reveal the imported file immediately rather than leaving the user
   // looking at the Walls folder while the GLB is stored under Decor/Misc.
   this.smartCatalogFolder=folder;
   localStorage.setItem('phoenix-builder-catalog-folder-v2',folder);
   this.renderCatalog();
   this.selectKind(id);
   this.prefabEditor?.refreshModels(id);
   notify('GLB импортирован в «'+SmartCatalog.labels[folder]+'»: '+safeName(file.name)+' · '+
    $('optimizationStats').textContent+'. Оригинальный файл сохранён.','success');
  }catch(err){
   this.catalogMeta.delete(id);this.saveCatalogMeta();
   console.error(err);notify('Не удалось импортировать GLB: '+err.message,'error')
  }
 }
 async importOtherModel(file){
  if(!file)return;
  try{
   if(!ModelFormats.accepts(file.name))
    throw Error('Поддерживаются FBX, OBJ, VOX, STL, PLY и встроенный glTF');
   notify('📐 Готовлю модель '+safeName(file.name)+' для библиотеки...','neutral');
   const converted=await ModelFormats.convertModule(file);
   const name=String(file.name).replace(/\.[^.]+$/i,'.glb');
   const wrapped=new File([converted.buffer],name,{type:'model/gltf-binary'});
   await this.importGLB(wrapped);
   notify('📦 '+safeName(file.name)+' преобразован в GLB без изменения UV. '+
    converted.triangles+' треугольников'+
    (converted.animationCount?' (для сохранения анимации импортируй как персонажа)':''),
    'success');
  }catch(err){
   console.error('Other model import',err);
   notify('Ошибка импорта '+safeName(file?.name)+': '+(err?.message||err),'error');
  }
 }
 async ensureTemplate(kind,category='wall'){
  if(CleanGeometry.isBuiltIn(kind)||this.assets.has(kind))return true;
  const buf=await getAsset(kind);
  if(!buf)return false;
  const meta=this.catalogMeta.get(kind)||bundledModules.get(kind);
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
    this.catalogMeta.get(kind)||bundledModules.get(kind);
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
 async importZIP(file,kind='mixed'){
  if(!file)return;
  const status=$('zipImportStatus'),quick=$('zipQuickStatus'),
   textureStatus=$('textureImportStatus'),start=performance.now();
  const progress=text=>{
   status.textContent=text;
   if(kind==='textures')textureStatus.textContent=text;
   else quick.textContent=text;
  };
  let models=0,textures=0,skipped=0,errors=[],index=0;
  try{
   if(!/\.zip$/i.test(file.name))throw Error('Выбери настоящий архив с расширением .zip');
   progress('📦 Открываю '+safeName(file.name)+'...');
   // Give Android a frame before a large ZIP; keep the toolbar responsive.
   await new Promise(resolve=>setTimeout(resolve,0));
   const list=await ZipUtils.extract(file,{
    maxEntries:2200,maxTotal:200000000,maxEntry:50000000,
    onProgress:(done,total)=>{if(done%10===0)progress(
     '📦 Распаковано '+done+' / '+total+' файлов. Не закрывай приложение.');}
   });
   const paths=Object.keys(list);
   if(!paths.length)throw Error('В ZIP нет поддерживаемых моделей или изображений');
   const override=$('zipFolderOverride').value;
   for(const path of paths){
    const bytes=list[path];
    const guess=SmartCatalog.classify(path,override==='auto'?null:override);
    if(!guess||!SmartCatalog.safeEntry(path)||
     (kind==='textures'&&guess.type!=='texture')){skipped++;continue}
    const filename=path.split('/').pop();
    const idSuffix=Date.now().toString(36)+'-'+index.toString(36)+'-'+
     Math.random().toString(36).slice(2,7);
    index++;
    try{
     if(guess.type==='model'){
      const format=ModelFormats.ext(filename);
      const glb=format==='glb'?bytes.slice().buffer:
       (await ModelFormats.convertModule(new File([bytes],filename))).buffer;
      if(glb.byteLength<20||
       new DataView(glb).getUint32(0,true)!==0x46546c67)
       throw Error('Не удалось подготовить GLB 2.0');
      const id='glb:zip:'+idSuffix;
      await putAsset(id,glb);
      this.catalogMeta.set(id,{id,name:safeName(filename),
       folder:guess.folder,category:guess.category,path,bytes:glb.byteLength,
       source:'ZIP'+(format==='glb'?'':' '+format.toUpperCase())});
      models++;
     }else{
      const extension=filename.split('.').pop().toLowerCase();
      const type={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
       webp:'image/webp',bmp:'image/bmp',gif:'image/gif'}[extension]||'image/png';
      const fileImage=new File([bytes],filename,{type});
      const edge=Math.min(4096,this.renderer?.capabilities?.maxTextureSize||4096);
      const processed=await PhoenixFiles.prepareTexture(fileImage,edge,
       {lossless:$('textureImportQuality').value==='lossless'});
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
     progress('📦 ZIP: '+index+'/'+paths.length+' — модели: '+
      models+', текстуры: '+textures+', пропущено: '+skipped);
     // Release main thread: user can still switch tabs while importing.
     await new Promise(resolve=>setTimeout(resolve,0));
    }
   }
   // UV32: preserve all imported image entries.
   localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
   this.saveCatalogMeta();this.renderCatalog();this.renderTextureLibrary();
   progress('✅ '+safeName(file.name)+': '+models+' моделей, '+
    textures+' текстур, '+skipped+' пропущено. '+Math.round((performance.now()-start)/1000)+
    ' с. '+(errors.length?'Ошибки: '+errors.slice(0,2).join('; '):'Открой нужную папку для просмотра миниатюр.'));
   notify('📦 Импорт завершён: '+models+' моделей и '+textures+
    ' текстур. Выбирай папку и смотри модели на карточках.','success');
  }catch(err){
   console.error('ZIP import',err);
   this.saveCatalogMeta();
   localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
   this.renderCatalog();this.renderTextureLibrary();
   progress('Ошибка ZIP: '+(err?.message||err)+
    '. Уже сохранённые модели остаются в библиотеке.');
   notify(status.textContent,'error');
  }
 }
 async deleteUserImportedModule(id,name){
  if(!id.startsWith('glb:')||bundledModules.has(id)||!this.catalogMeta.has(id))
   return notify('Штатные и встроенные PWB-модули удалять нельзя','warn');
  if(this.entries.some(item=>item.kind===id)||
     this.presets.some(item=>item.kind===id))
   return notify('Модель используется в сцене или «Моих деталях». Сначала убери эти ссылки.','warn');
  if(!confirm('Удалить «'+name+'» из библиотеки и памяти устройства?\n'
    +'В старых проектах, использующих эту модель, она может пропасть. '
    +'Сначала сохрани резервную копию JSON с моделями.'))return;
  try{
   const db=await openAssets();
   await new Promise((resolve,reject)=>{
    const tx=db.transaction(['glb','previews'],'readwrite');
    tx.objectStore('glb').delete(id);
    tx.objectStore('previews').delete(id);
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error)};
   });
   // Drop an unused placement preview without switching to the wall.
   if(this.preview?.kind===id){
    this.disposePreview();this.selected=null;this.setTool('pick');this.syncInspector();
   }
   // Do not dispose shared Three.js resources while a project is open.
   this.assets.delete(id);this.catalogMeta.delete(id);
   this.saveCatalogMeta();this.renderCatalog();
   notify('🗑 Удалено из библиотеки: '+name,'success');
  }catch(err){notify('Не удалось удалить модель: '+err.message,'error')}
 }
 loadTextureFiles(){
  try{const list=JSON.parse(localStorage.getItem('phoenix-builder-v2-textures')||'[]');
   return Array.isArray(list)?list.filter(o=>o&&typeof o.id==='string'&&typeof o.name==='string').map(o=>o.id.startsWith('texture:decal:')?{...o,folder:'transparent-graffiti'}:o):[];
  }catch(e){return []}
 }
 setTextureTab(active='parts'){
  // Do NOT move/reorder the top bar or the right inspector.
  // Only the three fixed, compact panes inside the LEFT library switch.
  const modes={parts:'tabParts',textures:'tabTextures',
   character:'tabCharacter'};
  const selected=modes[active]?active:'parts';
  const previous=this.libraryTab||'parts';
  this.libraryTab=selected;
  // Collapse long advanced forms when leaving modules. Direct import
  // actions are always visible; tab changes must remain instantaneous.
  if(previous!==selected&&previous==='parts')$('catalogImport').open=false;
  for(const [mode,id] of Object.entries(modes)){
   $(id).classList.toggle('active',mode===selected);
   $(id).setAttribute('aria-selected',String(mode===selected));
  }
  $('libraryModuleDrawer').hidden=selected!=='parts';
  $('textureLibrary').hidden=selected!=='textures';
  $('libraryCharacterDrawer').hidden=selected!=='character';
  if(previous!==selected){
   const pane=selected==='parts'?'libraryModuleDrawer':
    selected==='textures'?'textureLibrary':'libraryCharacterDrawer';
   // Do not jump to the first wall when returning to an already browsed folder.
   if(selected!=='parts')$(pane).scrollTop=0;
  }
  // The left library tabs control the active canvas interaction, not only
  // the visible library pane. Never let the texture brush intercept building.
  if(selected==='parts'){
   const wasPainting=this.surfaceSidePick;
   this.surfaceSidePick=false;
   this.decalPickMode=false;
   this.pendingTexture=null;
   if(this.mode!=='build')this.setMode('build');
   // Returning from textures always restores placement of the current module.
   // A deliberate 'Выделить' press can still switch to picking afterwards.
   if(previous!=='parts'||wasPainting){
    if(this.tool!=='place')this.setTool('place');
    this.aimPlacement();
   }
   this.syncQuickTextureFaces();
  }
  if(selected==='textures'){
   if(this.mode!=='build')this.setMode('build');
   this.openingPickMode=false;
   this.decalPickMode=false;
   this.pendingTexture=null;
   if(this.tool!=='pick')this.setTool('pick');
   // A tab switch re-arms the last chosen brush without altering the module.
   this.surfaceSidePick=true;
   this.syncQuickTextureFaces();
   // Do not synchronously build hundreds of thumbnail elements inside a
   // tap handler: this is what feels like a frozen tab on Android.
   if(!this.textureRenderQueued){
    this.textureRenderQueued=true;
    requestAnimationFrame(()=>{
     this.textureRenderQueued=false;
     if(this.libraryTab==='textures')this.renderTextureLibrary();
    });
   }
  }
 }
 syncQuickTextureFaces(){
  const painting=this.surfaceSidePick;
  $('faceQuickAll').classList.toggle('active',!painting);
  $('faceQuickPick').classList.toggle('active',painting);
  $('faceQuickPick').textContent=painting?
   '👆 Красить касанием: ВКЛ (отключить)':'👆 Красить касанием: выкл.';
  $('faceQuickTarget').textContent=painting?
   'Кисть: стены — стороны, торцы и верх; пол — верх/низ и кромки; PWB — части; внешние GLB — целиком.':
   'Обычный режим: выбранный материал наносится на весь модуль.';
 }
 quickTextureFace(side){
  if(side!=='all')return;
  this.surfaceSidePick=false;
  $('textureFaceScope').value='all';
  this.syncInspector();this.syncQuickTextureFaces();
 }
 openTextureSettings(){
  const panel=$('textureInspector');panel.open=true;
  panel.scrollIntoView({block:'nearest',behavior:'smooth'});
  notify('🎨 Настройки материала открыты справа; структура панели не изменена','neutral');
 }
 renderTextureLibrary(){
  const container=$('textureCards');container.textContent='';
  this.textureObserver?.disconnect();this.textureObserver=null;
  const selected=this.textureBrush||this.appliedSurface(this.target());
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
  const terrainFolder=folder==='landscape-tiles';
  const landscapeHint=$('landscapeLibraryHint');
  if(landscapeHint)landscapeHint.hidden=!terrainFolder;
  const faceTools=$('textureQuickFaces');
  if(faceTools)faceTools.hidden=terrainFolder;
  const list=this.textureFiles.filter(item=>{
   const group=item.id.startsWith('texture:decal:')||item.folder==='transparent-graffiti'?
    'transparent-graffiti':item.folder==='landscape-tiles'?'landscape-tiles':
    item.folder==='textures'?'textures':'my-textures';
   return (folder==='all'?group!=='transparent-graffiti':folder===group)&&
    (!term||SmartCatalog.tokenize(item.name+' '+(item.path||'')).includes(term));
  }).reverse(); // New imports visible first without losing older images.
  const gallery=document.createElement('div');gallery.className='textureVisualGrid';
  container.append(gallery);
  if(!list.length&&folder!=='all'){
   const hint=document.createElement('small');hint.textContent='В этой папке пока нет изображений';
   container.append(hint);
  }
  if(typeof IntersectionObserver!=='undefined'){
   this.textureObserver=new IntersectionObserver(items=>{
    for(const entry of items){
     if(!entry.isIntersecting)continue;
     this.textureObserver?.unobserve(entry.target);
     this.loadTextureThumbnail(entry.target,entry.target.dataset.texturePreview);
    }
   },{root:$('textureLibrary'),rootMargin:'110px'});
  }
  const progress=document.createElement('small');progress.className='textureGalleryProgress';
  const more=document.createElement('button');more.type='button';more.className='textureLoadMore';
  let rendered=0;
  const appendBatch=()=>{
   const end=Math.min(rendered+60,list.length);
   for(let i=rendered;i<end;i++){
    const item=list[i];
    const wrap=document.createElement('div');wrap.className='textureCardWrap';
    const card=document.createElement('button');card.type='button';card.className='textureCard';
    const isDecal=item.id.startsWith('texture:decal:')||item.folder==='transparent-graffiti';
    const terrain=item.folder==='landscape-tiles';
    card.classList.toggle('active',terrain?
     this.worldEditor?.textureId===item.id:
     isDecal?this.activeDecalImageId===item.id:
     selected.style==='custom'&&selected.imageId===item.id);
    const img=document.createElement('img');img.className='texturePreview';
    img.dataset.texturePreview=item.id;img.alt='Образец '+item.name;img.loading='lazy';
    const title=document.createElement('strong');title.textContent=item.name;
    const size=document.createElement('small');
    size.textContent=(item.width&&item.height?item.width+'×'+item.height:'Изображение')+
     ' · '+(terrain?'🏞 Ландшафт':isDecal?'Прозрачное граффити':
      item.folder==='textures'?'Текстуры':'Мои текстуры');
    card.append(img,title,size);
    card.onclick=()=>{
     if(terrain){
      this.surfaceSidePick=false;this.pendingTexture=null;
      this.worldEditor?.selectTexture(item.id);
      this.syncQuickTextureFaces();
      this.renderTextureLibrary();
      return;
     }
     if(isDecal){
      this.pendingTexture=null;this.activeDecalImageId=item.id;
      $('decalImageStatus').textContent=item.name;
      $('textureInspector').open=true;$('decalPanel').open=true;
      $('decalPanel').scrollIntoView({block:'nearest'});
      // Advanced UV33 fitted modes are opt-in; never silently inherit one.
      if(!$('decalExtraPanel').open){
       $('decalFit').value='manual';$('decalWholeRoom').checked=false;
       this.syncDecalSizeMode();
      }
      // New PNG selection never changes user-entered width or height.
      notify('🖼 PNG выбран для граффити. Нажми «Приклеить рисунок касанием 3D».','neutral');
     }else this.chooseTexture('custom',item.id);
    };
    wrap.append(card);
    const del=document.createElement('button');del.type='button';del.className='textureDelete';
    del.textContent='🗑 Удалить';del.title='Удалить загруженное изображение из библиотеки';
    del.onclick=event=>{event.preventDefault();event.stopPropagation();this.deleteImportedTexture(item.id)};
    wrap.append(del);gallery.append(wrap);
    if(this.textureObserver)this.textureObserver.observe(img);
    else this.loadTextureThumbnail(img,item.id);
   }
   rendered=end;
   progress.textContent='Показано '+rendered+' из '+list.length+' изображений';
   more.hidden=rendered>=list.length;
   more.textContent='⬇ Показать ещё '+Math.min(60,list.length-rendered)+' изображений';
  };
  more.onclick=appendBatch;
  if(list.length){container.append(progress,more);appendBatch();}
 }
 async deleteImportedTexture(id){
  const item=this.textureFiles.find(t=>t.id===id);
  if(!item)return;
  // A texture may be referenced in individual surfaces, wall ends, imported
  // model parts, decals, local autosave, or an undo snapshot. Never erase a
  // binary image while any such reference exists: the house must stay intact.
  const ref='"imageId":"'+id+'"';
  const projectUses=this.entries.some(e=>JSON.stringify({surface:e.surface,
   sides:e.surfaceSides,parts:e.surfaceParts}).includes(ref))||
   this.decals.some(d=>d.imageId===id)||
   this.worldEditor?.usesTexture(id)||
   (this.preview&&JSON.stringify({surface:this.preview.surface,
    sides:this.preview.surfaceSides,parts:this.preview.surfaceParts}).includes(ref))||
   (this.presets||[]).some(p=>JSON.stringify(p).includes(ref));
  const autosave=localStorage.getItem('phoenix-builder-clean-v2')||'';
  const usedInHistory=[...(this.history?.undoStack||[]),
   ...(this.history?.redoStack||[])].some(text=>text.includes(ref));
  if(projectUses||autosave.includes(ref)||usedInHistory){
   notify('🔒 Изображение используется в проекте, автосохранении или истории. Удали его с деталей и сохрани проект перед удалением из библиотеки.','warn');
   return;
  }
  if(!confirm('Удалить «'+item.name+'» из библиотеки и памяти устройства?\n'+
   'Старые отдельные проекты могут использовать эту картинку. Сначала сохрани их резервные копии JSON.'))return;
  try{
   const db=await openAssets();
   await new Promise((resolve,reject)=>{
    const tx=db.transaction(['glb','previews'],'readwrite');
    tx.objectStore('glb').delete(id);
    tx.objectStore('previews').delete('tex:v1:'+id);
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error)};
   });
   this.textureFiles=this.textureFiles.filter(t=>t.id!==id);
   this.worldEditor?.releaseTexture?.(id);
   localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
   const cached=this.textureCache.get(id);if(cached){cached.dispose?.();this.textureCache.delete(id)}
   if(this.activeDecalImageId===id){this.activeDecalImageId='';
    $('decalImageStatus').textContent='Граффити не выбрано'}
   if(this.activeTextureId===id)this.activeTextureId='';
   if(this.textureBrush?.imageId===id){this.textureBrush=null;
    localStorage.removeItem(textureBrushKey)}
   if(this.pendingTexture?.imageId===id)this.pendingTexture=null;
   this.renderTextureLibrary();
   notify('🗑 Удалено из библиотеки: '+item.name,'success');
  }catch(err){console.error('Texture delete',err);
   notify('Не удалось удалить изображение: '+(err?.message||err),'error')}
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
  if(!this.surfaceSidePick&&!this.canEditObject())return;
  const obj=this.target();
  if(obj&&style==='none'&&!this.surfaceSidePick){this.changeSurface(true);return}
  const current=this.surfaceFromControls(obj);
  const mapping=style==='custom'&&current.mapping==='auto'&&!this.textureMappingChosen?
   'module':current.mapping;
  const next=SurfaceMaterials.normalize({...current,style,mapping,
   imageId:style==='custom'?(imageId||current.imageId):''});
  if(next.style==='custom'&&!next.imageId)
   return notify('Загрузи свою текстуру кнопкой PNG / JPG / WebP','warn');
  this.activeTextureId=next.imageId||this.activeTextureId;
  this.rememberTextureBrush(next);
  // While touch painting, selecting a material only prepares the brush.
  // Never alter the currently selected module until the user taps a face.
  if(this.surfaceSidePick){
   this.pendingTexture=null;
   this.syncInspector();this.renderTextureLibrary();this.syncQuickTextureFaces();
   $('textureLibraryStatus').textContent='Кисть: стены — сторона, PWB — часть, внешние GLB — целиком.';
   return notify('🎨 Кисть готова — коснись детали','success');
  }
  if(!obj){
   this.pendingTexture={style,imageId};
   this.setMode('build');this.setTool('pick');
   this.syncInspector();this.renderTextureLibrary();
   $('textureLibraryStatus').textContent='Материал выбран. Коснись нужной детали.';
   return notify('🎨 Материал готов — коснись детали, чтобы применить','warn');
  }
  this.pendingTexture=null;
  const scope=this.textureScope(obj);
  if(this.entries.includes(obj))this.recordEdit();
  this.writeSurface(obj,scope,next);
  this.syncInspector();this.renderTextureLibrary();
  $('textureLibraryStatus').textContent='Материал назначен детали '+(this.descriptor(obj.kind)?.name||obj.kind)+
   '. Резервная копия сохраняет изображения для другого устройства.';
  notify('Материал «'+(SurfaceMaterials.labels[style]||style)+'» выбран. Размер рисунка можно настроить справа.','success');
 }
 async importTextureFile(file,options={}){
  if(!file)return false;
  const batch=!!options.batch;
  try{
   if(!/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name))
    throw Error('Нужен PNG, JPG, WebP, BMP или GIF');
   if(!batch)notify('🖼 Подготавливаю текстуру для Android...','neutral');
   $('textureLibraryStatus').textContent='Обработка изображения '+safeName(file.name)+'...';
   const maxEdge=Math.min(4096,this.renderer?.capabilities?.maxTextureSize||4096);
   const processed=await PhoenixFiles.prepareTexture(file,maxEdge,
    {lossless:$('textureImportQuality').value==='lossless'});
   const id='texture:'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
   await putAsset(id,processed.bytes);
   const folder=options.folder==='landscape-tiles'?'landscape-tiles':'my-textures';
   const texture={id,name:safeName(file.name),folder,type:processed.type,
    width:processed.width,height:processed.height,bytes:processed.storedBytes};
   this.textureFiles=[...this.textureFiles,texture];
   localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
   if(!batch){
    this.setTextureTab('textures');this.renderTextureLibrary();
    $('textureImportStatus').textContent='✅ Сохранено: '+texture.name;
    $('textureLibraryStatus').textContent='Сохранено: '+texture.name;
    this.chooseTexture('custom',id);
   }
   return true;
  }catch(err){
   console.error(err);
   if(!batch)notify('Ошибка текстуры: '+(err?.message||err),'error');
   return false;
  }
 }
 async importLandscapeTextures(files){
  const list=Array.from(files||[]);
  if(!list.length)return false;
  let saved=0,firstId='';
  for(let i=0;i<list.length;i++){
   const before=new Set(this.textureFiles.map(item=>item.id));
   if(await this.importTextureFile(list[i],
      {batch:true,folder:'landscape-tiles'})){
    saved++;
    if(!firstId)firstId=this.textureFiles.find(item=>!before.has(item.id))?.id||'';
   }
   if(i%2===1)await new Promise(resolve=>setTimeout(resolve,0));
  }
  this.setTextureTab('textures');
  $('textureCategoryFilter').value='landscape-tiles';
  this.renderTextureLibrary();
  if(firstId)this.worldEditor?.selectTexture(firstId);
  notify('🏞 В папку «Ландшафт» добавлено '+saved+
   ' текстур. Нажми изображение слева и рисуй круглой кистью.',
   saved?'success':'warn');
  return saved>0;
 }
 async importTextureFiles(files){
  const list=Array.from(files||[]);
  if(!list.length)return;
  let ok=0;
  for(let i=0;i<list.length;i++){
   $('textureImportStatus').textContent='🎨 Загрузка текстур '+(i+1)+' / '+list.length;
   if(await this.importTextureFile(list[i],{batch:true}))ok++;
   // Never apply imported materials automatically. Save to the library only.
   if(i%2===1)await new Promise(resolve=>setTimeout(resolve,0));
  }
  this.setTextureTab('textures');
  $('textureCategoryFilter').value='my-textures';
  this.renderTextureLibrary();
  $('textureImportStatus').textContent='✅ Текстуры: '+ok+' / '+list.length+
   '. Выбери нужную картинку для покраски.';
  notify('🎨 Загружено '+ok+' текстур. Ни один модуль не перекрашен автоматически.',
   ok?'success':'warn');
 }
 async textureAsset(id){
  if(this.textureCache.has(id))return this.textureCache.get(id);
  const buf=await getAsset(id);
  if(!buf)throw Error('Файл текстуры больше не найден на этом устройстве');
  const info=this.textureFiles.find(item=>item.id===id);
  const blob=new Blob([buf],{type:info?.type||'image/png'});
  const quality=this.activeRestoreQuality||this.projectLoadQuality;
  const cap=quality==='original'?0:Number(quality)||2048;
  if(cap&&typeof createImageBitmap==='function'&&info?.width&&info?.height&&
   Math.max(info.width,info.height)>cap){
   const ratio=cap/Math.max(info.width,info.height);
   let bitmap;
   try{
    bitmap=await createImageBitmap(blob,{resizeWidth:Math.max(1,Math.round(info.width*ratio)),
     resizeHeight:Math.max(1,Math.round(info.height*ratio)),resizeQuality:'high'});
    const tex=new THREE.Texture(bitmap);
    tex.encoding=THREE.sRGBEncoding;tex.flipY=false;tex.needsUpdate=true;
    this.textureCache.set(id,tex);return tex;
   }catch(err){if(bitmap?.close)bitmap.close();
    console.warn('Texture resize fallback: ',err)}
  }
  const url=URL.createObjectURL(blob);
  try{
   const tex=await new Promise((resolve,reject)=>{
    new THREE.TextureLoader().load(url,resolve,undefined,reject);
   });
   // Some WebViews do not support createImageBitmap resize options.
   if(cap&&tex.image&&Math.max(tex.image.width||0,tex.image.height||0)>cap){
    const ratio=cap/Math.max(tex.image.width,tex.image.height);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(tex.image.width*ratio));
    canvas.height=Math.max(1,Math.round(tex.image.height*ratio));
    canvas.getContext('2d').drawImage(tex.image,0,0,canvas.width,canvas.height);
    tex.image=canvas;tex.needsUpdate=true;
   }
   tex.encoding=THREE.sRGBEncoding;tex.flipY=false;
   this.textureCache.set(id,tex);return tex;
  }finally{URL.revokeObjectURL(url)}
 }
 // Graphical decals are independent meshes, NOT texture substitutions.
 // Keeping them outside this.entries ensures they never modify the original
 // building geometry, collision, wall openings, floor UVs or module library.
 async importDecalImage(file,options={}){
  if(!file)return false;
  const batch=!!options.batch;
  try{
   if(!/\.(png|webp)$/i.test(file.name))
    throw Error('Для граффити выбери PNG или WebP с прозрачностью');
   const cap=Math.min(4096,this.renderer?.capabilities?.maxTextureSize||4096);
   const prepared=await PhoenixFiles.prepareTexture(file,cap,{lossless:true});
   const id='texture:decal:'+Date.now().toString(36)+'-'+
    Math.random().toString(36).slice(2,8);
   await putAsset(id,prepared.bytes);
   this.textureFiles.push({id,name:safeName(file.name),type:prepared.type,
    width:prepared.width,height:prepared.height,bytes:prepared.storedBytes,
    folder:'transparent-graffiti'});
   // UV32: preserve all imported image entries.
   localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
   this.activeDecalImageId=id;
   if(!batch){
    $('decalImageStatus').textContent='✅ '+safeName(file.name)+' (отдельный слой)';
    this.renderTextureLibrary();
    notify('🖼 Граффити сохранено отдельно от обычных текстур','success');
   }
   return true;
  }catch(err){
   if(!batch)notify('Граффити: '+err.message,'error');
   console.warn('Decal import:',err);
   return false;
  }
 }
 async importDecalZIP(file){
  if(!file)return;
  const status=$('decalImageStatus');
  if(!/\.zip$/i.test(file.name)){
   notify('Нужен ZIP-архив с прозрачными PNG / WebP','warn');return;
  }
  let ok=0,skipped=0,total=0;
  try{
   status.textContent='📦 Открываю ZIP с граффити...';
   await new Promise(resolve=>setTimeout(resolve,0));
   const contents=await ZipUtils.extract(file,{
    maxEntries:500,maxTotal:120000000,maxEntry:16000000,
    onProgress:(done,n)=>{
     if(done%10===0)status.textContent='📦 Распаковка ZIP: '+done+' / '+n;
    }
   });
   const names=Object.keys(contents).filter(name=>/\.(png|webp)$/i.test(name));
   total=names.length;
   if(!total)throw Error('В ZIP нет PNG или WebP. Обычные JPG для прозрачного граффити не подходят.');
   for(let i=0;i<total;i++){
    const name=names[i].split('/').pop();
    const type=/\.webp$/i.test(name)?'image/webp':'image/png';
    status.textContent='🖼 Граффити '+(i+1)+' / '+total;
    if(await this.importDecalImage(new File([contents[names[i]]],name,{type}),{batch:true}))ok++;
    else skipped++;
    if(i%2===1)await new Promise(resolve=>setTimeout(resolve,0));
   }
   this.setTextureTab('textures');
   $('textureCategoryFilter').value='transparent-graffiti';
   this.renderTextureLibrary();
   status.textContent='✅ ZIP: '+ok+' граффити добавлено, ошибок: '+skipped+
    '. Рисунки сохранены отдельно, ни одна стена не перекрашена.';
   notify('📦 Загружено '+ok+' PNG/WebP в «Прозрачное граффити»',ok?'success':'warn');
  }catch(err){
   console.error('Decal ZIP import failed',err);
   status.textContent='Ошибка ZIP с граффити: '+(err?.message||err);
   notify(status.textContent,'error');
  }
 }
 async importDecalImages(files){
  const list=Array.from(files||[]);
  if(!list.length)return;
  let ok=0;
  for(let i=0;i<list.length;i++){
   $('decalImageStatus').textContent='🖼 Загрузка граффити '+(i+1)+' / '+list.length;
   if(await this.importDecalImage(list[i],{batch:true}))ok++;
   if(i%2===1)await new Promise(resolve=>setTimeout(resolve,0));
  }
  this.setTextureTab('textures');
  $('textureCategoryFilter').value='transparent-graffiti';
  this.renderTextureLibrary();
  $('decalImageStatus').textContent='✅ Граффити: '+ok+' / '+list.length+
   '. Выбери рисунок в папке слева, затем нажми «Приклеить касанием 3D».';
  notify('🖼 Добавлено '+ok+' прозрачных граффити в отдельную папку.',
   ok?'success':'warn');
 }
 startDecalPlacement(){
  if(!this.activeDecalImageId)
   return notify('Сначала загрузи PNG с прозрачным фоном','warn');
  this.setMode('build');this.setTool('pick');
  this.decalPickMode=true;this.decalMoveId='';this.surfaceSidePick=false;
  this.cameraFocusPick=false;this.openingPickMode=false;
  // Hidden UV33 auto-fit settings must never affect a simple tap-to-paste.
  if(!$('decalExtraPanel').open){
   $('decalFit').value='manual';$('decalWholeRoom').checked=false;
   this.syncDecalSizeMode();
  }
  // Exact user width and height remain fixed during placement.
  $('decalPanel').open=true;
  notify('👆 Коснись поверхности пола, стены или крыши: рисунок ляжет поверх неё','success');
 }
 async placeDecalAt(event){
  if(!this.decalPickMode)return;
  this.decalPickMode=false;
  const moveId=this.decalMoveId;this.decalMoveId='';
  const rect=this.canvas.getBoundingClientRect();
  this.pointer.set((event.clientX-rect.left)/rect.width*2-1,
   -(event.clientY-rect.top)/rect.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  const candidates=this.entries.filter(o=>!o.hidden&&
   ['wall','floor','roof','prop','decor'].includes(o.category));
  const hits=this.ray.intersectObjects(candidates.map(o=>o.root),true);
  let picked=null;
  for(const hit of hits){
   const entry=candidates.find(o=>{
    let node=hit.object;
    while(node){if(node===o.root)return true;node=node.parent}
    return false;
   });
   if(!entry||hit.object.userData?.phoenixLODProxy||
      hit.object.userData?.phoenixInsert||!hit.face?.normal)continue;
   picked={entry,hit};break;
  }
  if(!picked)return notify('Не попала на поверхность пола, стены или крыши','warn');
  const {entry,hit}=picked;
  if(!SceneManager.editingAllowed(entry))
   return notify('Эта деталь защищена. Сними замок перед наклейкой','warn');
  const normal=hit.face.normal.clone().applyMatrix3(
   new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
  // Some imported and rebuilt faces wind backwards; orient to the camera
  // so the actual, visible side receives the +3 mm overlay offset.
  if(normal.dot(this.ray.ray.direction)>0)normal.negate();
  const room=entry.category==='floor'&&$('decalWholeRoom').checked;
  const fit=this.decalFit(entry);
  const rotation=Number($('decalRotation').value)||0;
  const layout=room?this.roomDecalLayout(entry,rotation):null;
  const width=layout?.width||clamp(Number($('decalWidth').value)||2,.01,10000);
  const height=layout?.height||clamp(Number($('decalHeight').value)||1.5,.01,10000);
  // Save local anchor. Moving or rotating the physical floor/roof/wall
  // carries its graffiti with it; the PNG is not nailed to world coords.
  entry.root.updateWorldMatrix(true,true);
  const localPoint=entry.root.worldToLocal(hit.point.clone());
  const localNormal=normal.clone().applyMatrix3(new THREE.Matrix3()
   .getNormalMatrix(entry.root.matrixWorld).invert()).normalize();
  const decal=SurfaceDecals.clean({id:moveId||'d'+Date.now().toString(36)+
    Math.random().toString(36).slice(2,6),imageId:this.activeDecalImageId,
   targetId:entry.id,space:'local',
   position:localPoint.toArray(),normal:localNormal.toArray(),
   width,height,rotation,
   opacity:Number($('decalOpacity').value)||1,room,fitRoom:room,fit});
  if(!decal)return notify('Не удалось подготовить прозрачный слой','error');
  if(moveId){
   const index=this.decals.findIndex(old=>old.id===moveId);
   if(index<0)return notify('Рисунок для перемещения уже не существует','warn');
   this.recordEdit();this.decals[index]=decal;
   await this.refreshDecals();this.syncDecalList(decal.id);
   return notify('✅ Рисунок перемещён в точку касания','success');
  }
  let repeats=[];
  if(fit==='face'||fit==='wall'){
   const targets=new Set((layout?.entries||this.fittedDecal(entry,
    this.worldDecal(decal,entry))?.entries||[entry]).map(x=>x.id));
   repeats=this.decals.filter(old=>{
    if(old.imageId!==decal.imageId||!targets.has(old.targetId))return false;
    const host=this.entries.find(x=>x.id===old.targetId);
    return !!host&&normal.dot(V(...this.worldDecal(old,host).normal))>.98;
   });
  }
  this.recordEdit();
  if(repeats.length){
   decal.id=repeats[0].id;
   this.decals=this.decals.filter(old=>!repeats.includes(old)||old===repeats[0])
    .map(old=>old===repeats[0]?decal:old);
  }else this.decals.push(decal);
  await this.refreshDecals();this.syncDecalList(decal.id);
  notify(repeats.length?'✅ Рисунок на этой стороне обновлён':
   '✅ Новая наклейка нанесена точно по касанию','success');
 }
 decalFit(entry){
  const mode=$('decalFit').value;
  return mode==='wall'&&entry?.category==='wall'?'wall':
   mode==='corner'?'corner':mode==='manual'?undefined:'face';
 }
 syncDecalSizeMode(){
  const mode=$('decalFit').value;
  const fit=!['manual','corner'].includes(mode)&&!$('decalWholeRoom').checked;
  $('decalWidth').disabled=$('decalHeight').disabled=fit;
  $('decalLockAspect').disabled=fit;
 }
 syncDecalAspect(changed='width'){
  if(!$('decalLockAspect').checked||$('decalWidth').disabled)return;
  const meta=this.textureFiles.find(t=>t.id===this.activeDecalImageId);
  if(!meta||!(meta.width>0&&meta.height>0))return;
  if(changed==='height'){
   const h=Number($('decalHeight').value);
   if(Number.isFinite(h)&&h>0)
    $('decalWidth').value=String(Math.round(clamp(h*meta.width/meta.height,.01,10000)*1000)/1000);
  }else{
   const w=Number($('decalWidth').value);
   if(Number.isFinite(w)&&w>0)
    $('decalHeight').value=String(Math.round(clamp(w*meta.height/meta.width,.01,10000)*1000)/1000);
  }
 }
 moveSelectedDecal(){
  const id=$('decalSelect').value;
  const decal=this.decals.find(d=>d.id===id);
  if(!decal)return notify('Сначала выбери наклейку в списке','warn');
  this.activeDecalImageId=decal.imageId;
  this.setMode('build');this.setTool('pick');
  this.decalPickMode=true;this.decalMoveId=id;
  this.surfaceSidePick=false;this.cameraFocusPick=false;this.openingPickMode=false;
  $('decalFit').value='manual';
  $('decalWidth').value=String(decal.width);
  $('decalHeight').value=String(decal.height);
  $('decalRotation').value=String(decal.rotation);
  $('decalOpacity').value=String(decal.opacity);
  this.syncDecalSizeMode();
  notify('👆 Коснись нового места: выбранная наклейка переместится без создания копии','success');
 }
 worldDecal(decal,entry){
  if(decal.space!=='local')return decal;
  entry.root.updateWorldMatrix(true,true);
  const position=entry.root.localToWorld(V(...decal.position)).toArray();
  const normal=V(...decal.normal).applyMatrix3(new THREE.Matrix3()
   .getNormalMatrix(entry.root.matrixWorld)).normalize().toArray();
  const extra=entry.category==='floor'?entry.root.rotation.y*180/Math.PI:0;
  return {...decal,position,normal,rotation:decal.rotation+extra};
 }
 fittedDecal(entry,placed,texture=null){
  if(!placed.fit||placed.fit==='corner')return null;
  const joined=placed.fit==='wall'&&entry.category==='wall';
  const candidates=joined?this.entries.filter(x=>
   x.category==='wall'&&x.storey===entry.storey&&!x.hidden):[entry];
  const image=this.textureFiles.find(t=>t.id===placed.imageId);
  const aspect=(texture?.image?.width||image?.width||1)/
   (texture?.image?.height||image?.height||1);
  return SurfaceDecals.fitFace(entry,candidates,placed.position,placed.normal,
   placed.rotation,aspect,joined);
 }
 syncDecalList(prefer=null){
  const select=$('decalSelect'),chosen=prefer||select.value;
  select.textContent='';
  const empty=document.createElement('option');
  empty.value='';empty.textContent='Выбери наклейку';
  select.append(empty);
  for(const d of this.decals){
   const item=document.createElement('option');
   item.value=d.id;
   const target=this.entries.find(e=>e.id===d.targetId);
   item.textContent=(target?this.sceneDisplayName(target):'Объект удалён')+
    ' · '+d.id;
   select.append(item);
  }
  if(this.decals.some(d=>d.id===chosen))select.value=chosen;
  // Listing a freshly pasted decal must not reset the next PNG's size.
  if(!prefer)this.syncDecalControls();
 }
 syncDecalControls(){
  const d=this.decals.find(x=>x.id===$('decalSelect').value);
  if(!d)return;
  for(const [id,val] of [['decalWidth',d.width],['decalHeight',d.height],
   ['decalRotation',d.rotation],['decalOpacity',d.opacity]])
   $(id).value=String(val);
  $('decalWholeRoom').checked=d.room;
  $('decalFit').value=d.fit||'manual';
  this.syncDecalSizeMode();
  this.activeDecalImageId=d.imageId;
  // Do not alter existing artwork proportions until user explicitly changes width.
  $('decalImageStatus').textContent=this.textureFiles.find(t=>
   t.id===d.imageId)?.name||'Сохранённый PNG';
 }
 updateDecal(){
  const index=this.decals.findIndex(x=>x.id===$('decalSelect').value);
  if(index<0)return notify('Выбери рисунок в списке','warn');
  const previous=this.decals[index];
  const entry=this.entries.find(e=>e.id===previous.targetId);
  const room=entry?.category==='floor'&&$('decalWholeRoom').checked;
  const fit=this.decalFit(entry);
  const rotation=Number($('decalRotation').value)||0;
  const width=clamp(Number($('decalWidth').value)||2,.01,10000);
  const height=clamp(Number($('decalHeight').value)||1.5,.01,10000);
  const fitRoom=room&&(!previous.room||
   previous.fitRoom&&width===previous.width&&height===previous.height);
  const layout=fitRoom?this.roomDecalLayout(entry,rotation):null;
  this.recordEdit();
  this.decals[index]=SurfaceDecals.clean({...previous,
   imageId:this.activeDecalImageId||previous.imageId,
   width:layout?.width||width,height:layout?.height||height,rotation,room,fitRoom,fit,
   opacity:Number($('decalOpacity').value)||1});
  this.syncDecalControls();this.refreshDecals();
  notify('✅ Размер, поворот и область граффити обновлены','success');
 }
 deleteDecal(){
  const index=this.decals.findIndex(x=>x.id===$('decalSelect').value);
  if(index<0)return notify('Выбери рисунок в списке','warn');
  this.recordEdit();this.decals.splice(index,1);
  this.refreshDecals();this.syncDecalList();
  notify('🗑 Удалён только прозрачный рисунок; основание не затронуто','success');
 }
 queueDecalRebuild(){
  if(!this.decals?.length)return;
  clearTimeout(this.decalRebuildTimer);
  this.decalRebuildTimer=setTimeout(()=>this.refreshDecals(),140);
 }
 async refreshDecals(){
  const gen=++this.decalGeneration,pending=[];
  try{
   for(const decal of this.decals){
    const entry=this.entries.find(e=>e.id===decal.targetId);
    if(!entry||entry.hidden)continue;
    let texture;
    try{texture=await this.textureAsset(decal.imageId)}
    catch(err){console.warn('Decal image missing:',err);continue}
    if(gen!==this.decalGeneration)break;
    let placed=this.worldDecal(decal,entry);
    const room=decal.room?this.roomDecalLayout(entry,decal.rotation):null;
    const fit=room?null:this.fittedDecal(entry,placed,texture);
    if(room){
     placed={...decal,position:room.position,normal:[0,1,0],
      width:decal.fitRoom?room.width:decal.width,
      height:decal.fitRoom?room.height:decal.height};
    }else if(fit){
     placed={...placed,position:fit.position,width:fit.width,height:fit.height};
    }
    const freeWall=!room&&!fit&&entry.category==='wall'&&
     (!placed.fit||placed.fit==='corner');
    const geometry=freeWall&&['arc90','arc180'].includes(entry.kind)?
     SurfaceDecals.geometryForArc(placed,entry):
     freeWall?SurfaceDecals.geometryForCorner(placed,entry,
      this.entries.filter(e=>e.category==='wall'&&!e.hidden&&e.storey===entry.storey)):
     SurfaceDecals.geometryFor(placed,room?.entries||fit?.entries||[entry],
      fit?{depthLimit:.035}:undefined);
    if(!geometry)continue;
    const mesh=SurfaceDecals.createMesh(decal,geometry,texture);
    if(mesh)pending.push(mesh);
   }
  }catch(err){
   for(const mesh of pending)SurfaceDecals.dispose(mesh);
   notify('Граффити: '+err.message,'warn');return false;
  }
  if(gen!==this.decalGeneration){
   for(const mesh of pending)SurfaceDecals.dispose(mesh);return false;
  }
  for(const mesh of this.decalMeshes)SurfaceDecals.dispose(mesh);
  this.decalMeshes=pending;
  for(const mesh of pending)this.scene.add(mesh);
  return true;
 }
 textureScope(obj=this.target()){
  const selected=$('textureFaceScope').value;
  return obj&&['wall','floor'].includes(obj.category)&&
   ['front','back'].includes(selected)?selected:'all';
 }
 syncSeamlessScaleUI(){
  const panel=$('seamlessScaleBox');if(!panel)return;
  const enabled=$('textureMapping').value==='seamless';
  panel.hidden=!enabled;
  if(!enabled)return;
  const meter=Number($('textureTileMeters').value)||1;
  $('textureSeamlessSizeText').textContent=meter.toFixed(2).replace('.',',')+' м';
  if(document.activeElement!==$('textureSeamlessSize'))
   $('textureSeamlessSize').value=String(Math.max(.25,Math.min(10,meter)));
 }
 applySurfaceTo(obj){
  if(!obj)return Promise.resolve(false);
  // The placement ghost must never be painted with an opaque material.
  // Texture overrides belong only to committed scene entries.
  if(obj===this.preview){
   this.applyPreviewGhost(obj);
   return Promise.resolve(true);
  }
  const root=obj.root,settings=SurfaceMaterials.normalize(obj.surface);
  const sides=SurfaceMaterials.normalizeSides(obj.surfaceSides);
  const parts=bundledModules.has(obj.kind)?SurfaceMaterials.normalizeParts(obj.surfaceParts):{};
  const requested=[settings,...Object.values(sides),...Object.values(parts)];
  const missing=[...new Set(requested.filter(s=>s.style==='custom'&&s.imageId&&
   !this.textureCache.has(s.imageId)).map(s=>s.imageId))];
  if(missing.length){
   const fingerprint=JSON.stringify({settings,sides,parts});
   return Promise.all(missing.map(id=>this.textureAsset(id))).then(()=>{
    if(obj.root!==root||fingerprint!==JSON.stringify({settings:
     SurfaceMaterials.normalize(obj.surface),
     sides:SurfaceMaterials.normalizeSides(obj.surfaceSides),
     parts:bundledModules.has(obj.kind)?SurfaceMaterials.normalizeParts(obj.surfaceParts):{}}))return false;
    return this.applySurfaceTo(obj);
   }).catch(err=>{notify('Текстура: '+err.message,'warn');return false});
  }
  if(settings.style==='custom'&&!settings.imageId)return Promise.resolve(false);
  const result=SurfaceMaterials.applyFaces(root,settings,sides,this.textureCache,
   {kind:obj.kind,category:obj.category});
  const partResult=result.ok&&bundledModules.has(obj.kind)?
   SurfaceMaterials.applyParts(root,parts,this.textureCache,{kind:obj.kind}):
   {ok:true,parts:0};
  // A successful function call is not a successful brush stroke unless
  // at least one real side received the override material.
  const wantsSide=Object.values(sides).some(material=>material.style!=='none');
  const wantsParts=Object.keys(parts).length>0;
  return Promise.resolve(result.ok&&partResult.ok&&
   (!wantsSide||result.faces>0)&&(!wantsParts||partResult.parts>0));
 }
 roomDecalLayout(entry,rotation){
  const group=this.joinedFloorRegion(entry,true);
  if(!group)return null;
  const [minX,minZ,maxX,maxZ]=group.region;
  const x=maxX-minX,z=maxZ-minZ,radians=rotation*Math.PI/180;
  const c=Math.abs(Math.cos(radians)),s=Math.abs(Math.sin(radians));
  return {entries:group.entries,
   position:[(minX+maxX)/2,new THREE.Box3().setFromObject(entry.root).max.y,(minZ+maxZ)/2],
   width:Math.max(.1,x*c+z*s),height:Math.max(.1,x*s+z*c)};
 }
 joinedFloorRegion(obj,visibleOnly=false){
  // Old SurfacePaint.joinedFloors idea, but as REAL mesh UV:
  // one image across a connected floor group, retained in GLB.
  if(!obj||obj.category!=='floor')return null;
  const all=this.entries.filter(e=>e.category==='floor'&&
   e.storey===obj.storey&&(!visibleOnly||!e.hidden));
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
 appliedSurface(obj){
  const scope=this.textureScope(obj);
  return SurfaceMaterials.normalize(scope==='all'?obj?.surface:
   obj?.surfaceSides?.[scope]||obj?.surface);
 }
 surfaceFromControls(obj){
  const previous=this.textureBrush||this.appliedSurface(obj);
  const fields=Object.fromEntries(Object.entries(textureFields).map(([id,key])=>[key,$(id).value]));
  const joined=fields.mapping==='joined'?this.joinedFloorRegion(obj):null;
  return SurfaceMaterials.normalize({...previous,...fields,region:joined?.region||null,
   applyFrames:$('textureApplyFrames').checked,
   imageId:previous.imageId||this.activeTextureId||''});
 }
 rememberTextureBrush(surface){
  this.textureBrush=SurfaceMaterials.normalize({...surface,region:null});
  try{
   localStorage.setItem(textureBrushKey,JSON.stringify({
    surface:this.textureBrush,mappingChosen:this.textureMappingChosen}));
  }catch(err){console.warn('Texture settings could not be persisted',err)}
 }
 writeSurface(obj,scope,next){
  if(scope==='all'){obj.surface=next;obj.surfaceSides={};obj.surfaceParts={};}
  else{obj.surfaceSides=obj.surfaceSides||{};obj.surfaceSides[scope]=next;}
  this.applySurfaceTo(obj);
 }
 shiftTexture(direction){
  if(!this.canEditObject())return;
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
  if(this.entries.includes(obj))this.recordEdit();
  const scope=this.textureScope(obj);
  this.rememberTextureBrush(next);
  this.writeSurface(obj,scope,next);
  this.syncInspector();
  const label={left:'влево',right:'вправо',up:'вверх',down:'вниз',
   reset:'в центр'}[direction]||'изменена';
  notify('🎨 Текстура '+(direction==='reset'?'возвращена ':'сдвинута ')+
   label+' на '+(obj.category==='floor'?'полу':'стене')+
   '. Положение рисунка сохраняется в проекте','success');
 }
 applySurfaceToAllWalls(){
  if(!this.canEditObject())return;
  const source=this.selected;
  if(this.tool!=='pick'||!source||!['wall','floor'].includes(source.category))
   return notify('Выдели построенную стену или плиту пола','warn');
  const surface=this.surfaceFromControls(source);
  if(surface.style==='custom'&&!surface.imageId)
   return notify('Сначала выбери своё изображение','warn');
  this.recordEdit();
  let count=0;
  const scope=this.textureScope(source);
  const group=(source.category==='floor'&&surface.mapping==='joined'?
   this.joinedFloorRegion(source)?.entries||[source]:
   this.entries.filter(entry=>entry.category===source.category&&
    entry.storey===source.storey)).filter(entry=>SceneManager.editingAllowed(entry));
  for(const target of group){
   this.writeSurface(target,scope,SurfaceMaterials.normalize(surface));count++;
  }
  this.rememberTextureBrush(surface);
  this.syncInspector();this.renderTextureLibrary();
  notify('🎨 Единая настройка рисунка: '+count+
   (source.category==='floor'?' соединённых плит пола':' стен(ы)')+
   '. Материал сохраняется в проекте и GLB','success');
 }
 changeSurface(reset=false){
  if(!this.canEditObject())return;
  const obj=this.target();
  if(!obj)return notify('Выбери деталь','warn');
  const scope=this.textureScope(obj);
  const next=reset?SurfaceMaterials.normalize({style:'none'}):
   this.surfaceFromControls(obj);
  if(next.style==='custom'&&!next.imageId)return notify('Выбери или загрузи картинку слева','warn');
  if(this.entries.includes(obj))this.recordEdit();
  if(!reset)this.rememberTextureBrush(next);
  else if(this.textureBrush)this.rememberTextureBrush({...this.textureBrush,style:'none',imageId:''});
  if(scope!=='all'){
   obj.surfaceSides=obj.surfaceSides||{};
   if(reset)delete obj.surfaceSides[scope];
   else obj.surfaceSides[scope]=next;
   this.applySurfaceTo(obj);
   this.syncInspector();this.renderTextureLibrary();
   return notify(reset?'Покрытие этой стороны сброшено':
    'Покрытие назначено только выбранной стороне','success');
  }
  obj.surface=next;obj.surfaceSides={};obj.surfaceParts={};
  // Rebuild on reset to recover original imported GLB PBR maps.
  if(reset){
   if(obj.kind==='floor')this.rebuildFloor(obj,obj.floorTrim);
   else if(WallOpenings.supported(obj.kind))this.updateGeometry(obj);
   else if(CleanGeometry.isBuiltIn(obj.kind)){
    const root=this.cloneTemplate(obj.kind,obj.thickness,obj.scale,obj.axes);
    const old=obj.root;root.position.copy(old.position);root.rotation.copy(old.rotation);
    root.scale.copy(old.scale);this.scene.add(root);old.removeFromParent();obj.root=root;obj.root.visible=!obj.hidden;
    if(this.outline&&obj===this.selected)this.outline.setFromObject(root);
   }else this.rebuildImported(obj);
  }else this.applySurfaceTo(obj);
  if(obj===this.preview){
   this.applyPreviewGhost(obj);
   this.updatePreview(this.cursor,false);
  }
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
   obj.mirrorX=preset.mirrorX===true;
   obj.sockets=preset.sockets||null;
   obj.meshEdit=CleanMeshEdit.normalize(preset.meshEdit);
   obj.shapeCrop=ShapeCrop.normalize(preset.shapeCrop);
   obj.doorAngle=clamp(Number(preset.doorAngle)||0,-110,110);
   obj.openings=WallOpenings.normalize(preset.openings);
   obj.surface=SurfaceMaterials.normalize(preset.surface);
   obj.surfaceSides=SurfaceMaterials.normalizeSides(preset.surfaceSides);
   obj.surfaceParts=SurfaceMaterials.normalizeParts(preset.surfaceParts);
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
  const container=$('catalogItems');
  const term=$('smartCatalogSearch')?.value||'';
  const folder=this.smartCatalogFolder||'all';
  const pageKey=folder+'\n'+term;
  const previousView=container.dataset.catalogViewKey;
  const drawer=$('libraryModuleDrawer');
  const previousDrawerOffset=drawer.scrollTop;
  if(previousView!==undefined){
   this.catalogScroll.set(previousView,container.scrollTop);
   this.catalogDrawerScroll.set(previousView,$('libraryModuleDrawer').scrollTop);
   for(const details of container.querySelectorAll('.catalogGroup[data-folder]'))
    this.catalogOpenSections.set(previousView+'\n'+details.dataset.folder,details.open);
  }
  container.textContent='';
  if(this.catalogPageKey!==pageKey){
   this.catalogPages.clear();this.catalogPageKey=pageKey;
  }
  $('bundledCatalogStatus').hidden=!bundledModules.size;
  $('bundledCatalogStatus').textContent='Библиотека PWB · '+
   bundledModules.size.toLocaleString('ru')+' моделей офлайн';
  $('smartCategoryFilter').value=folder;
  $('catalogImportsShortcut').hidden=![...this.catalogMeta.values()].some(
   meta=>meta.folder==='misc'&&!bundledModules.has(meta.id));
  const shortcuts={structure:'walls',doors:'doors',frames:'frames',
   roofs:'roofs',imports:'misc'};
  for(const button of document.querySelectorAll('#catalogQuick [data-catalog-group]'))
   button.classList.toggle('active',shortcuts[button.dataset.catalogGroup]===folder);
  // Only catalog metadata is needed until a model is picked or previewed.
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
  for(const [id,meta] of bundledModules)
   models.set(id,{...meta,kind:id,builtin:false});
  for(const [id,meta] of this.catalogMeta)
   models.set(id,{...meta,id,kind:id,builtin:false});
  const entries=[...models.values()];
  const folders=folder==='all'?SmartCatalog.order:[folder];
  for(const category of folders){
   const matching=SmartCatalog.filteredEntries(entries,category,term);
   if(!matching.length)continue;
   const section=document.createElement('details');section.className='catalogGroup';
   const detailsKey=pageKey+'\n'+category;
   section.open=this.catalogOpenSections.has(detailsKey)?
    this.catalogOpenSections.get(detailsKey):
    (folder!=='all'||!!term||this.catalogPages.has(category)||
    ['walls','my-modules'].includes(category));
   section.addEventListener('toggle',()=>{
    if(container.contains(section))this.catalogOpenSections.set(detailsKey,section.open);
   });
   const heading=document.createElement('summary');
   heading.textContent=(SmartCatalog.labels[category]||category)+
    ' · '+matching.length;
   section.append(heading);
   const rows=document.createElement('div');rows.className='catalogRows smartGrid';
   // Bound thumbnail work on tablets and provide access to every sorted row.
   const visibleLimit=folder==='all'&&!term?32:100;
   const lastPage=Math.ceil(matching.length/visibleLimit)-1;
   const page=Math.min(this.catalogPages.get(category)||0,lastPage);
   const first=page*visibleLimit,end=Math.min(first+visibleLimit,matching.length);
   for(const module of matching.slice(first,end)){
    const card=document.createElement('div');card.className='moduleCard';
    const btn=document.createElement('button');btn.type='button';
    btn.className='modulePick';
    btn.dataset.kind=module.kind;
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
     (bundledModules.has(module.kind)?'PWB · ':'GLB · ')+Math.round((module.bytes||0)/1024)+' КБ'+
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
       id:module.kind,name:module.name,path:module.path,bytes:module.bytes,
       source:module.source||'GLB'
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
     // User-managed imports can be removed, but never built-ins / PWB.
     // Model currently placed in the scene or used by a preset is protected.
     const userImport=this.catalogMeta.has(module.kind)&&
      !bundledModules.has(module.kind)&&module.kind.startsWith('glb:');
     if(userImport){
      const remove=document.createElement('button');
      remove.type='button';remove.className='moduleRemoveImport';
      remove.textContent='🗑 Удалить из библиотеки';
      remove.title='Только пользовательские файлы, не модели PWB';
      remove.onclick=async()=>{
       await this.deleteUserImportedModule(module.kind,module.name);
      };
      card.append(remove);
     }
    }
    rows.append(card);
   }
   section.append(rows);
   if(lastPage>0){
    const more=document.createElement('small');more.className='tip';
    more.textContent=(first+1)+'–'+end+' из '+matching.length;
    const controls=document.createElement('div');controls.className='cols2';
    for(const [direction,label] of [[-1,'← Назад'],[1,'Далее →']]){
     const button=document.createElement('button');button.type='button';
     button.textContent=label;button.disabled=page+direction<0||page+direction>lastPage;
     button.onclick=()=>{
      this.catalogPages.set(category,page+direction);
      this.renderCatalog();
      container.querySelector('[data-folder="'+category+'"]')?.scrollIntoView({block:'nearest'});
     };
     controls.append(button);
    }
    section.append(more,controls);
   }
   section.dataset.folder=category;
   container.append(section);
  }
  if(!container.children.length){
   const hint=document.createElement('p');hint.className='tip';
   hint.textContent='Здесь пока нет моделей. Загрузить ZIP или изменить поиск/папку.';
   container.append(hint);
  }
  container.dataset.catalogViewKey=pageKey;
  container.scrollTop=this.catalogScroll.get(pageKey)||0;
  // The actual scroll viewport is the library drawer (not catalogItems).
  // Restore it on *every* render, including changes to same category.
  drawer.scrollTop=previousView===pageKey?previousDrawerOffset:
   (this.catalogDrawerScroll.get(pageKey)||0);
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

 sceneDisplayName(entry){
  return SceneManager.displayName(entry,
   this.descriptor(entry.kind)?.name||entry.kind||'Деталь');
 }
 // Rendering is capped at 140 visible rows to avoid costly Android layouts
 // when a world contains hundreds of walls. All data remains searchable.
 renderSceneManager(){
  const root=$('sceneRows');
  if(!root)return;
  const search=$('sceneSearch')?.value||'';
  const selectedId=this.selected?.id||0;
  const filter=$('sceneFloorFilter')?.value||'all';
  const stamp=[search,filter,this.floor,selectedId,
   [...this.bakeSelection].sort((a,b)=>a-b).join(','),
   ...this.entries.map(e=>[e.id,e.storey,e.label,e.kind,e.hidden?1:0,
    e.locked?1:0].join('/'))].join(';');
  if(this.sceneRowsSignature===stamp)return;
  this.sceneRowsSignature=stamp;
  const result=SceneManager.results(this.entries,{query:search,
   storey:filter,current:this.floor,
   describe:entry=>this.descriptor(entry.kind)?.name||''});
  const total=this.entries.length;
  $('sceneManagerStatus').textContent=result.total+
   ' из '+total+' деталей'+(result.truncated?
    '; показаны первые '+result.limit+'. Уточни поиск.':'');
  root.textContent='';
  let previous=-1;
  for(const entry of result.rows){
   if(entry.storey!==previous){
    previous=entry.storey;
    const title=document.createElement('div');
    title.className='sceneManagerStorey';
    title.textContent='Этаж '+(previous+1);
    root.append(title);
   }
   const row=document.createElement('div');
   row.className='sceneManagerRow';
   row.setAttribute('role','listitem');
   row.classList.toggle('selected',this.selected===entry);
   row.classList.toggle('bakeSelected',this.bakeSelection.has(entry.id));
   row.classList.toggle('locked',entry.locked===true);
   row.classList.toggle('hiddenScene',entry.hidden===true);
   const pick=document.createElement('button');
   pick.type='button';pick.className='sceneManagerPick';
   const name=document.createElement('strong');
   name.textContent=this.sceneDisplayName(entry);
   const caption=document.createElement('small');
   caption.textContent='#'+entry.id+' · '+(entry.roomRole||entry.category)+
    (entry.hidden?' · скрыто':'')+(entry.locked?' · замок':'');
   pick.append(name,caption);
   pick.onclick=()=>this.selectSceneObject(entry.id);
   const eye=document.createElement('button');
   eye.type='button';eye.className='sceneManagerToggle';
   eye.textContent=entry.hidden?'◉':'👁';
   eye.title=entry.hidden?'Показать в 3D':'Скрыть из 3D и игрового экспорта';
   eye.setAttribute('aria-label',eye.title);
   eye.onclick=()=>this.sceneFlag(entry.id,'hidden',!entry.hidden);
   const lock=document.createElement('button');
   lock.type='button';lock.className='sceneManagerToggle';
   lock.textContent=entry.locked?'🔒':'🔓';
   lock.title=entry.locked?'Разблокировать деталь':'Защитить от редактирования';
   lock.setAttribute('aria-label',lock.title);
   lock.onclick=()=>this.sceneFlag(entry.id,'locked',!entry.locked);
   const bakeCheck=document.createElement('input');
   bakeCheck.type='checkbox';bakeCheck.className='bakeModuleCheck';
   bakeCheck.checked=this.bakeSelection.has(entry.id);
   bakeCheck.disabled=entry.locked||entry.hidden||this.bakeBusy;
   bakeCheck.title='Добавить деталь в новый составной модуль';
   bakeCheck.setAttribute('aria-label','Запечь: '+this.sceneDisplayName(entry));
   bakeCheck.onchange=()=>this.toggleBakeSelection(entry.id,bakeCheck.checked);
   row.append(bakeCheck,pick,eye,lock);root.append(row);
  }
  this.updateBakeControls();
  const selected=this.selected;
  $('sceneName').disabled=!selected;
  $('btnSceneRename').disabled=!selected;
  if(document.activeElement!==$('sceneName'))
   $('sceneName').value=selected?.label||'';
 }
 // UI selection for baking is deliberately independent of the current tool,
 // selected scene object, undo history, and editor's active catalog folder.
 toggleBakeSelection(id,checked){
  const obj=this.entries.find(e=>e.id===id);
  if(checked&&(!obj||obj.hidden||obj.locked))return;
  if(checked)this.bakeSelection.add(id);else this.bakeSelection.delete(id);
  this.sceneRowsSignature='';this.renderSceneManager();
 }
 updateBakeControls(){
  const valid=[...this.bakeSelection].map(id=>this.entries.find(e=>e.id===id))
   .filter(e=>e&&!e.hidden&&!e.locked);
  $('bakeStatus').textContent='Выбрано для запекания: '+valid.length+
   (this.bakeSelection.size!==valid.length?' · некоторые детали скрыты/заблокированы':'');
  $('btnBakeModule').disabled=this.bakeBusy||valid.length<2;
  $('btnBakeClear').disabled=this.bakeBusy||!this.bakeSelection.size;
  $('btnBakeAddCurrent').disabled=this.bakeBusy||!this.selected||
   this.selected.hidden||this.selected.locked;
 }
 async bakeSelectedModule(){
  if(this.bakeBusy)return;
  const members=[...this.bakeSelection].map(id=>this.entries.find(e=>e.id===id));
  if(members.length<2||members.some(e=>!e||e.hidden||e.locked))
   return notify('Отметь хотя бы две видимые разблокированные детали','warn');
  const name=SceneManager.cleanName($('bakeName').value||'Моя конструкция');
  if(!name)return notify('Введи название нового модуля','warn');
  const replace=$('bakeReplace').checked;
  // Decals are intentionally separate PNG layers in the original editor.
  // Never silently lose them when replacing the surfaces underneath them.
  if(replace&&this.decals.some(d=>members.some(e=>e.id===d.targetId)))
   return notify('У выбранных деталей есть PNG-граффити. Сними галочку замены: слой рисунков пока нельзя запечь без потери.','warn');
  // A single baked module must contain all selected visible materials, including
  // per-side/part paints, opening geometry, glass alpha, and original UVs.
  this.bakeBusy=true;this.updateBakeControls();
  let id='';let saved=false;
  try{
   notify('🏗 Запекаю '+members.length+' деталей в отдельный GLB...','neutral');
   for(const obj of members){
    if(!await this.applySurfaceTo(obj))
     throw Error('Материал не готов: '+this.sceneDisplayName(obj));
   }
   const bounds=new THREE.Box3();
   for(const obj of members){obj.root.updateMatrixWorld(true);bounds.expandByObject(obj.root)}
   if(bounds.isEmpty())throw Error('Не найдена геометрия деталей');
   const center=bounds.getCenter(new THREE.Vector3());
   const anchor=[center.x,bounds.min.y,center.z];
   const quality=$('bakeTextureQuality').value;
   const blob=await SceneExporter.build({objects:members.map(obj=>({
    mesh:obj.root,data:{id:obj.id,kind:obj.kind,category:obj.category,
     label:obj.label||null,storey:obj.storey}}))},
    {houseOnly:true,keepWorldCoordinates:false,textureQuality:quality});
   const check=await SceneExporter.inspect(blob);
   if(check.meshes<1)throw Error('Пустой GLB: запекание остановлено');
   const metrics=blob.phoenixStats||{};
   const mb=(blob.size/1048576).toFixed(1);
   $('bakeFileInfo').textContent='Готовый GLB: '+mb+' МБ · '+check.images+
    ' изображений · '+check.meshes+' сеток · '+
    check.transparentMaterials+' прозрачных материалов'+
    (metrics.duplicateImages?' · убрано дублей: '+metrics.duplicateImages:'');
   // The final size is now known before writing any files or modifying
   // the original scene. The user can reject a heavy module safely.
   if(!confirm('🧩 '+name+'\n'+members.length+' деталей · '+mb+
    ' МБ · '+check.images+' изображений (без повторов)\n'+
    'Качество: '+quality+'\n'+
    (replace?'Оригиналы будут заменены (Undo доступен).':'Оригиналы останутся на месте.')+
    '\nСохранить конструкцию?')){
    notify('Запекание отменено. Оригиналы не изменены.','neutral');return;
   }
   const buf=await blob.arrayBuffer();
   id='glb:baked:'+Date.now().toString(36)+'-'+
    Math.random().toString(36).slice(2,8);
   this.catalogMeta.set(id,{id,name,folder:'my-modules',category:'prop',
    path:'Мои модули/'+name+'.glb',source:'BAKED',bytes:buf.byteLength});
   await this.cacheModel(id,buf,'prop',name);
   this.saveCatalogMeta();saved=true;
   if(replace){
    const entry=this.createEntry(id,{category:'prop',position:anchor,
     storey:members[0].storey,label:name});
    if(!entry)throw Error('Не удалось создать готовую конструкцию');
    // Scene history is captured just before changing scene, never during bake.
    this.recordEdit();
    const removed=new Set(members);
    this.entries=this.entries.filter(obj=>!removed.has(obj));
    for(const obj of members)obj.root.removeFromParent();
    this.entries.push(entry);this.scene.add(entry.root);this.attachImportedLOD(entry);
    this.selected=entry;this.setTool('pick');
    if(this.outline){this.scene.remove(this.outline);this.outline.geometry.dispose()}
    this.outline=new THREE.BoxHelper(entry.root,0x44ffb8);this.scene.add(this.outline);
    this.gizmo.attach(entry);this.queueDecalRebuild();
   }
   this.bakeSelection.clear();this.sceneRowsSignature='';
   this.renderCatalog();this.syncInspector();this.renderSceneManager();
   notify('✅ '+name+': '+members.length+' деталей → GLB ('+
    Math.round(buf.byteLength/1024)+' КБ), изображений: '+check.images+
    ', дублей убрано: '+(metrics.duplicateImages||0)+'. '+
    (replace?'Заменено на одну конструкцию; Undo возвращает оригиналы.':
     'Исходные детали сохранены; модуль добавлен в «Мои модули».')+
    ' Для переноса на другое устройство сохрани 📁 файл проекта.','success');
  }catch(err){
   console.error('Bake module',err);
   if(id&&!saved){this.catalogMeta.delete(id);this.assets.delete(id);
    this.saveCatalogMeta()}
   notify('Запекание: '+(err?.message||err),'error');
  }finally{this.bakeBusy=false;this.updateBakeControls()}
 }
 // Hidden objects remain in editable backups and undo history, but are
 // excluded from raycast, physics and the game export.
 sceneFlag(id,property,value){
  const obj=this.entries.find(e=>e.id===id);
  if(!obj||!['hidden','locked'].includes(property))return;
  if(obj[property]===value)return;
  this.recordEdit();
  SceneManager.apply(obj,{[property]:value});
  if(property==='hidden')this.queueDecalRebuild();
  if(obj===this.selected&&obj.hidden){
   this.selected=null;
   if(this.outline){this.scene.remove(this.outline);
    this.outline.geometry.dispose();this.outline=null}
  }
  this.gizmo.attach(this.mode==='build'&&this.tool==='pick'&&
   SceneManager.editingAllowed(this.selected)?this.selected:null);
  this.sceneRowsSignature='';this.syncInspector();
  notify((property==='locked'?(value?'🔒 Заблокирована: ':'🔓 Разблокирована: '):
   (value?'👁 Скрыта: ':'👁 Показана: '))+this.sceneDisplayName(obj),'success');
 }
 selectSceneObject(id){
  const obj=this.entries.find(e=>e.id===id);
  if(!obj)return;
  if(obj.hidden)return notify('Объект скрыт. Нажми ◉, чтобы его показать','warn');
  this.setMode('build');
  const keepGizmo=this.tool==='pick'&&this.gizmo.active;
  this.selected=obj;this.setTool('pick');
  if(this.outline){this.scene.remove(this.outline);
   this.outline.geometry.dispose();this.outline=null}
  this.outline=new THREE.BoxHelper(obj.root,obj.locked?0xffc66a:0x44ffb8);
  this.scene.add(this.outline);
  this.gizmo.attach(SceneManager.editingAllowed(obj)?obj:null);
  if(keepGizmo&&SceneManager.editingAllowed(obj))this.gizmo.activate();
  this.syncInspector();
  notify((obj.locked?'🔒 Выделена защищённая деталь: ':'✅ Выделено: ')+
   this.sceneDisplayName(obj),'success');
 }
 renameSceneObject(){
  const obj=this.selected;
  if(!obj)return notify('Выдели деталь в 3D или списке','warn');
  const next=SceneManager.cleanName($('sceneName').value);
  if(!next)return notify('Введи название детали','warn');
  if(next===obj.label)return;
  this.recordEdit();obj.label=next;
  this.sceneRowsSignature='';this.syncInspector();
  notify('✎ Название сохранено: '+next,'success');
 }
 canEditObject(obj=this.target()){
  if(obj&&this.entries.includes(obj)&&!SceneManager.editingAllowed(obj)){
   notify('🔒 Деталь защищена или скрыта. Разблокируй её в списке сцены','warn');
   return false;
  }
  return true;
 }
 // Restore dynamic form-control disabled state after selecting another
 // object. Leave project tools, search, save, history and mode buttons usable.
 syncSceneLockedUI(){
  const locked=this.tool==='pick'&&this.selected?.locked===true;
  const controls=document.querySelectorAll('#inspector input, #inspector select, #inspector button');
  for(const input of controls){
   if(input.closest('#sceneManagerPanel,#roomBuilderPanel,#backupPanel,.editHistoryPanel,.modeTools'))continue;
   if(locked){
    if(input.dataset.sceneLocked!=='1'){
     input.dataset.sceneWasDisabled=input.disabled?'1':'0';
     input.dataset.sceneLocked='1';
    }
    input.disabled=true;
   }else if(input.dataset.sceneLocked==='1'){
    input.disabled=input.dataset.sceneWasDisabled==='1';
    delete input.dataset.sceneLocked;
    delete input.dataset.sceneWasDisabled;
   }
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
    shapeCrop:ShapeCrop.normalize(config.shapeCrop),
    floorTrim:FloorClip.normalize(config.floorTrim),
    manualEdgeCut:config.manualEdgeCut||null,
    autoEdgeCuts:FloorClip.normalizeCuts(config.autoEdgeCuts),
    openings:WallOpenings.normalize(config.openings),
    surface:SurfaceMaterials.normalize(config.surface),
    surfaceSides:SurfaceMaterials.normalizeSides(config.surfaceSides),
    surfaceParts:SurfaceMaterials.normalizeParts(config.surfaceParts),
    groupId:typeof config.groupId==='string'?config.groupId.slice(0,72):'',
    roomRole:['wall','floor','ceiling'].includes(config.roomRole)?config.roomRole:'',
    label:SceneManager.cleanName(config.label),
    locked:config.locked===true,hidden:config.hidden===true,mirrorX:config.mirrorX===true};
  if(WallOpenings.supported(kind)&&obj.openings.length){
   const result=WallOpenings.render(obj.root,kind,obj.openings,
    {thickness:obj.thickness,axes:obj.axes});
   if(!result.ok)throw Error('Проём стены не удалось восстановить: '+result.reason);
  }
  if(kind==='floor'&&(obj.floorTrim.enabled||obj.floorTrim.cuts?.length||obj.floorTrim.contour)){
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
  if(obj.shapeCrop.enabled){
   const crop=ShapeCrop.apply(obj.root,obj.shapeCrop);
   if(!crop.ok)throw Error('Фигурная подрезка: '+crop.reason);
  }
  if(config.position)obj.root.position.fromArray(config.position);
  SceneManager.apply(obj,{hidden:obj.hidden});
  if(!this.restoringProject)this.applySurfaceTo(obj);
  return obj;
 }
 applyTransform(obj){
  const a=obj.axes||defaultSettings().axes;
  obj.root.scale.set((obj.mirrorX?-1:1)*obj.scale*a.x,obj.scale*a.y,obj.scale*a.z);
  obj.rotation=obj.rotation||{x:0,y:obj.rot||0,z:0};
  obj.rotation.y=Number(obj.rot)||0;
  obj.root.rotation.set(Number(obj.rotation.x)||0,obj.rotation.y,
   Number(obj.rotation.z)||0,'XYZ');
  if(obj.kind.startsWith('door')&&ArchitectureKit.has(obj.kind))
   ArchitectureKit.setDoorAngle(obj.root,obj.doorAngle||0);
  obj.root.updateMatrixWorld(true);
 }
 applyPreviewGhost(obj=this.preview){
  if(!obj?.root)return;
  PhoenixPlacementGhost.style(obj.root,THREE);
  // Geometry rebuilds replace the preview root. Rebind its outline as well;
  // otherwise a stale BoxHelper draws a thin line at the old module position.
  if(this.previewOutline?.object&&
     this.previewOutline.object!==obj.root){
   this.previewOutline.removeFromParent();
   this.previewOutline.geometry?.dispose();
   this.previewOutline.material?.dispose();
   this.previewOutline=new THREE.BoxHelper(obj.root,0x4efcff);
   this.previewOutline.material.depthTest=false;
   this.previewOutline.material.depthWrite=false;
   this.scene.add(this.previewOutline);
  }
  if(this.previewOutline)this.previewOutline.renderOrder=960;
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
 selectKind(kind,scale=this.placementScale){
  this.disposePreview();this.selected=null;this.tool='place';this.gizmo.attach(null);
  const type=this.descriptor(kind);
  this.catalogGroup=type?.group||(this.assets.has(kind)?'imports':
   type?.category==='roof'?'roofs':'structure');
  this.preview=this.createEntry(kind,{category:type?.category||categoryOf(kind),scale});
  if(!this.preview){notify('Не удалось открыть модель','error');return}
  if(this.preview.category!=='wall'){
   this.wallChainAnchor=null;this.wallChainPlan=null;this.wallChainManual=false;
  }else{
   // Switching Wall -> Corner -> Arc preserves the last free endpoint.
   this.wallChainManual=false;
  }
  this.scene.add(this.preview.root);
  // Cyan x-ray preview stays distinguishable even when the camera or
  // module is below a large flat terrain tile. Real installed meshes keep
  // their normal opaque/material depth-test behaviour.
  this.previewOutline=new THREE.BoxHelper(this.preview.root,0x4efcff);
  this.previewOutline.material.depthTest=false;
  this.previewOutline.material.depthWrite=false;
  this.previewOutline.renderOrder=960;
  this.scene.add(this.previewOutline);
  this.applyPreviewGhost();
  this.preview.root.visible=true;
  this.lastPlacementKind=kind;
  this.setTool('place');this.syncInspector();
  // Rebuilding the whole gallery on every new placement destroyed the
  // current scroll position (and sometimes collapsed the chosen folder).
  // Update only the active button. Full rendering is still used when the
  // library contents / folder / search actually change.
  const gallery=$('catalogItems');
  if(gallery.childElementCount){
   for(const button of gallery.querySelectorAll('button.modulePick'))
    button.classList.toggle('active',button.dataset.kind===kind);
  }else this.renderCatalog();
  this.updatePreview(this.cursor);
 }
 setTool(tool){
  // Leaving the cut tool to place a module must also leave touch-to-cut mode.
  if(tool==='place')this.openingPickMode=false;
  this.tool=tool;
  // Picking objects is never a transform action: handles require a mode click.
  this.gizmo.deactivate();
  $('btnPick').classList.toggle('active',tool==='pick');
  $('btnPlace').classList.toggle('active',tool==='place');
  if(this.preview)this.preview.root.visible=tool==='place';
  if(this.previewOutline)this.previewOutline.visible=tool==='place';
  this.gizmo.attach(this.mode==='build'&&tool==='pick'&&
   SceneManager.editingAllowed(this.selected)?this.selected:null);
  this.updateGizmoDock();
  notify(tool==='pick'?'Коснись готовой детали, чтобы изменить её':
   'Коснись места на земле для установки детали','neutral');
 }
 target(){return this.tool==='pick'?this.selected:this.preview}
 syncInspector(){
  const obj=this.target();$('currentLabel').textContent=obj?
   SceneManager.displayName(obj,this.descriptor(obj.kind)?.name||obj.kind):
   'Выбери установленную деталь';
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
  read('scaleAll',Math.round((obj?.scale||this.placementScale)*100));
  $('btnMirrorDuplicate').disabled=!SceneManager.editingAllowed(this.selected);
  for(const [key,axis] of [['sizeX','x'],['sizeY','y'],['sizeZ','z']])
   read(key,Math.round(a[axis]*100));
  read('thickness',Math.round((obj?.thickness||.22)*1000)/10);
  $('physicalDimensions').textContent=obj?'Габариты: '+this.sizeText(obj):'Габариты: —';
  $('btnSaveModule').disabled=!obj;
  $('quickRoomTrim').style.display=obj?.kind==='floor'?'block':'none';
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
  const selectedName=obj?this.descriptor(obj.kind)?.name||'':'';
  const importedArch=obj?.kind?.startsWith('glb:')&&
   /арк|про[её]м|дверн.*рам|door.*frame/i.test(selectedName);
  $('prefabDoorPanel').style.display=(obj?.kind?.startsWith('door')&&
   ArchitectureKit.has(obj.kind))||importedArch?'block':'none';
  $('btnCutForPrefabDoor').textContent=importedArch?
   '✂ Подготовить настоящий проход под эту GLB-арку':
   '✂ Подготовить отверстие под размер этой двери';
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
   $('openingShape').value=chosen.shape||'auto';
   $('openingFrameStyle').value=chosen.frameStyle||'classic';
  }
  const scope=this.textureScope(obj);
  const surf=this.textureBrush||this.appliedSurface(obj);
  const category=obj?.category;
  // Preserve the user's explicit front/back/all choice when the inspector updates.
  $('btnPickTextureFace').disabled=!this.entries.some(e=>
   !e.hidden&&SceneManager.editingAllowed(e));
  $('btnPickTextureFace').classList.toggle('active',this.surfaceSidePick);
  $('btnPickTextureFace').textContent=this.surfaceSidePick?
   '👆 Красить только сторону касанием: ВКЛ (отключить)':
   '👆 Красить только сторону касанием: выкл.';
  $('textureFaceStatus').textContent=this.surfaceSidePick?
   'Кисть: обычные стены/пол — одна сторона; 1337 PWB — отдельная деталь модели; внешние GLB — весь объект.':
   'Обычный режим наносит текстуру на весь модуль. Для отдельных сторон включи покраску касанием.';
  for(const [id,key] of Object.entries(textureFields)){
   if($(id).tagName==='SELECT')$(id).value=String(surf[key]);
   else read(id,surf[key]);
  }
  this.syncSeamlessScaleUI();
  $('textureApplyFrames').checked=surf.applyFrames;
  for(const [id,value] of [['textureRoughnessValue',surf.roughness],
   ['textureMetalnessValue',surf.metalness],['textureReliefValue',surf.relief]])
   $(id).textContent=Number(value).toFixed(2);
  $('btnSurfaceAllWalls').disabled=!(this.tool==='pick'&&['wall','floor'].includes(obj?.category));
  $('btnReadSurface').disabled=!obj;
  const mayShiftTexture=!!obj&&['floor','wall'].includes(obj.category);
  $('texturePlacementTarget').textContent=mayShiftTexture?
   (obj.category==='floor'?'Пол: рисунок двигается по поверхности X/Z.':
    'Стена: рисунок двигается по горизонтали и вертикали.')+
   ' Можно использовать шаг 1%, 5%, 10% или 25%.':
   'Выдели пол или стену, чтобы перемещать их текстуру.';
  for(const id of ['textureShiftUp','textureShiftDown','textureShiftLeft',
   'textureShiftRight','textureShiftReset'])$(id).disabled=!mayShiftTexture;
  this.gizmo.attach(this.mode==='build'&&this.tool==='pick'&&
   SceneManager.editingAllowed(this.selected)?this.selected:null);
  this.updateGizmoDock();
  this.updateOpeningInfo();
  this.readSockets();
  this.syncSceneLockedUI();
  this.renderSceneManager();
  this.syncQuickTextureFaces();
 }
 // The video-inspired transform dock is visible only for a placed selection.
 updateGizmoDock(){
  const dock=$('gizmoQuickbar');if(!dock)return;
  const show=this.mode==='build'&&this.tool==='pick'&&this.selected&&
   SceneManager.editingAllowed(this.selected);
  // Selection never closes a panel the builder opened manually.
  // Initial state is still closed, and only the Tools button toggles it.
  this.gizmoQuickSelectionId=this.selected?.id||null;
  dock.hidden=!show;
  const content=$('gizmoQuickContent');
  content.hidden=!show||!this.gizmoQuickOpen;
  $('gizmoQuickToggle').textContent=this.gizmoQuickOpen?
   '🎛 Инструменты ▾':'🎛 Инструменты ▴';
  $('gizmoQuickToggle').setAttribute('aria-expanded',String(this.gizmoQuickOpen));
  const cadPanel=$('gizmoCadSizePanel');
  cadPanel.hidden=!show||!this.gizmoQuickOpen||!this.cadPanelOpen;
  if(!cadPanel.hidden){
   const dimensions=this.physicalSize(this.selected);
   if(dimensions)for(const [id,axis] of [
    ['gizmoWidthMeters','x'],['gizmoHeightMeters','y'],
    ['gizmoDepthMeters','z']]){
    const field=$(id);
    if(document.activeElement!==field)
     field.value=(dimensions[axis]/100).toFixed(2);
   }
  }
  for(const mode of ['move','rotate','scale','universal']){
   const cap=mode[0].toUpperCase()+mode.slice(1);
   for(const id of ['gizmo'+cap,'quickGizmo'+cap])
    $(id)?.classList.toggle('active',this.gizmo.active&&this.gizmo.mode===mode);
  }
  $('quickGizmoCad')?.classList.toggle('active',!!this.cadPanelOpen);
 }
 applyGizmoCadDimensions(){
  if(!this.canEditObject())return;
  const obj=this.selected;
  if(!obj||this.tool!=='pick')return notify('Сначала выдели готовую деталь','warn');
  const dims=this.physicalSize(obj);
  if(!dims)return notify('Размеры детали не определены','warn');
  const target={
   x:Number($('gizmoWidthMeters').value),y:Number($('gizmoHeightMeters').value),
   z:Number($('gizmoDepthMeters').value)
  };
  if(!Object.values(target).every(v=>Number.isFinite(v)&&v>=.05&&v<=100))
   return notify('Укажи размеры в метрах от 0,05 до 100','warn');
  const axes={...obj.axes};let newThickness=obj.thickness;
  for(const axis of ['x','y','z']){
   const old=Math.max(.00001,dims[axis]/100);
   if(obj.kind==='wall'&&axis==='z'){
    if(target.z<.025||target.z>.8)
     return notify('Толщина обычной стены от 2,5 до 80 см','warn');
    newThickness=target.z;continue;
   }
   const next=(axes[axis]||1)*(target[axis]/old);
   if(!Number.isFinite(next)||next<.1||next>10)
    return notify('Размер вне диапазона масштабирования 10–1000%','warn');
   axes[axis]=next;
  }
  this.recordEdit();
  obj.axes=axes;obj.thickness=newThickness;
  this.applyTransform(obj);
  if(WallOpenings.supported(obj.kind))this.updateGeometry(obj);
  else if(obj.kind==='floor')this.rebuildFloor(obj,obj.floorTrim);
  else if(obj.thicknessEditable)this.rebuildImported(obj);
  else this.applySurfaceTo(obj);
  this.queueDecalRebuild();
  if(this.outline)this.outline.setFromObject(obj.root);
  this.syncInspector();this.gizmo.update();
  notify('📐 CAD: размеры изменены. Положение детали осталось прежним','success');
 }
 selectGizmoMode(mode){
  if(this.mode!=='build'||this.tool!=='pick'||!SceneManager.editingAllowed(this.selected)){
   notify('Сначала выдели готовую разблокированную деталь','warn');return;
  }
  if(this.gizmo.active&&this.gizmo.mode===mode){
   this.gizmo.deactivate();this.updateGizmoDock();return;
  }
  this.gizmo.attach(this.selected);
  this.gizmo.setMode(mode);this.gizmo.activate();this.updateGizmoDock();
 }
 focusGizmoView(view='focus'){
  if(!this.selected)return notify('Выдели деталь для выбора вида','warn');
  this.setMode('build');
  const root=this.selected.root;
  root.updateMatrixWorld(true,true);
  const box=new THREE.Box3().setFromObject(root),center=box.getCenter(V());
  if(box.isEmpty())return;
  const size=box.getSize(V()),distance=Math.max(5,size.length()*1.65);
  if(view==='focus'){
   const direction=this.camera.position.clone().sub(this.controls.target).normalize();
   this.camera.position.copy(center).addScaledVector(direction,distance);
  }else{
   const direction=view==='front'?V(0,.10,1):
    view==='side'?V(1,.10,0):V(.04,1,.12);
   this.camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
  }
  this.controls.target.copy(center);
  this.camera.lookAt(center);this.controls.update();this.gizmo.update();
  notify('📐 Камера: '+({focus:'к объекту',front:'спереди',
   side:'сбоку',top:'сверху'})[view]+'. Сам объект не перемещён','success');
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
  // Even if a wall is already selected, tapping its surface must move
  // the opening centre. Otherwise a tap merely reselects the same wall.
  this.openingPickMode=true;
  this.setTool('pick');this.syncInspector();
  $('openingPanel').open=true;
  $('openingPanel').scrollIntoView({block:'nearest',behavior:'auto'});
  if(ready){
   this.updateOpeningInfo();
   notify('✂ Стена выбрана. Можно уточнить центр касанием или задать его вручную','success');
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
  // Each newly selected wall starts at its own true centre. Otherwise the
  // previous wall's offset (e.g. 86.1 cm) leaks into the next window cut.
  if(this.openingTargetId!==wall.id){
   this.openingTargetId=wall.id;
   $('openingX').value='0';
   $('openingPositionPreset').value='center';
  }
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
  const walls=this.entries.filter(e=>e.category==='wall'&&!e.hidden&&WallOpenings.supported(e.kind));
  // Only intersect the actual stone surface. Window glass and inserted
  // door/frame meshes must not steal the touch or alter its centre.
  const targets=[];
  for(const wall of walls)wall.root.traverse(node=>{
   if(!node.isMesh||node.userData?.phoenixInsert)return;
   if(node.userData?.phoenixWallSurface||
     node.name==='structure:wall'||
     (wall.openings?.length===0&&node.parent===wall.root))targets.push(node);
  });
  const hits=this.ray.intersectObjects(targets,false);
  if(!hits.length)return notify('Коснись каменной поверхности стены, а не стекла или двери','warn');
  const hit=hits[0],wall=walls.find(w=>{
   let node=hit.object;
   while(node){if(node===w.root)return true;node=node.parent}
   return false;
  });
  if(!wall)return notify('Не удалось выбрать стену для проёма','warn');
  this.selected=wall;this.openingPickMode=false;
  this.openingTargetId=wall.id;
  if(this.outline){
   this.outline.removeFromParent();this.outline.geometry?.dispose();this.outline=null;
  }
  this.outline=new THREE.BoxHelper(wall.root,0x44ffb8);this.scene.add(this.outline);
  const local=wall.root.worldToLocal(hit.point.clone());
  const at=WallOpenings.pathAtPoint(wall.kind,local,wall.thickness,wall.axes);
  const metric=WallOpenings.pathMetric(wall);
  if(!at||!metric)return notify('Не получилось измерить длину стены','warn');
  const rawDistance=metric.distanceAt(at.s);
  const snap=$('openingSnapCentre')?.checked?
   WallOpenings.snapOpeningDistance(wall,this.entries,rawDistance):null;
  const distance=snap?.distance??rawDistance;
  $('openingX').value=String(Math.round((distance-metric.length/2)*1000)/10);
  $('openingPositionPreset').value=snap?.snapped||'manual';
  $('openingPanel').open=true;
  this.syncInspector();this.updateOpeningInfo();
  $('openingPanel').scrollIntoView({block:'nearest',behavior:'auto'});
  notify(snap?.snapped?
   '🧲 Центр привязан точно: '+(snap.snapped==='center'?'середина стены':
    'стык двух стен')+'. Теперь нажми «Вырезать»':
   '🎯 Точка центра выбрана. Введи размер в см и нажми «Вырезать»','success');
 }
 cutForPrefabDoor(){
  if(!this.canEditObject())return;
  const door=this.selected;
  const label=door?this.descriptor(door.kind)?.name||'':'';
  const builtin=!!(door&&ArchitectureKit.has(door.kind)&&
   door.kind.startsWith('door'));
  const imported=!!(door?.kind?.startsWith('glb:')&&
   /арк|про[её]м|дверн.*рам|door.*frame/i.test(label));
  if(this.tool!=='pick'||!door||(!builtin&&!imported))
   return notify('Выдели установленную дверь или GLB-арку','warn');
  const dimensions=this.physicalSize(door);
  if(!dimensions)return notify('Не удалось измерить размер двери или арки','warn');
  // Imported arch is a decoration and does NOT cut a wall on its own.
  // The fitted opening is a separate real cut in the BUILT-IN wall. Use
  // a slightly narrower clear opening than its full decorative frame.
  const width=imported?Math.max(55,dimensions.x*.80):dimensions.x+1;
  const height=imported?Math.min(250,dimensions.y*.78):dimensions.y+1;
  $('openingType').value='passage';
  $('openingShape').value=imported?
   (/готич|стрельч|gothic/i.test(label)?'gothic':
    /арк|кругл|скругл|round/i.test(label)?'round':'rectangle'):
   door.kind==='doorRound'?'round':
    ['doorGothic','doorRune'].includes(door.kind)?'gothic':'rectangle';
  $('openingSizePreset').value='';
  $('openingWidth').value=String(Math.round(width*10)/10);
  $('openingHeight').value=String(Math.round(height*10)/10);
  $('openingBottom').value='0';
  this.openingPickMode=true;
  this.setTool('pick');this.syncInspector();
  $('openingPanel').open=true;
  $('openingPanel').scrollIntoView({block:'nearest',behavior:'auto'});
  notify('✂ Подготовлен проход '+Math.round(width)+' × '+
   Math.round(height)+' см под '+(imported?'импортированную арку':'дверь')+
   '. Теперь коснись СТЕНЫ за ней и нажми «Вырезать отверстие».'+
   ' Без реального выреза стена продолжает блокировать персонажа.','success');
 }
 openingParts(plan){
  const staged=[];
  for(const [obj,newOpenings] of plan){
   if(!SceneManager.editingAllowed(obj))return {ok:false,
    reason:'Соседняя стена скрыта или заблокирована. Открой замок в списке сцены.'};
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
  this.recordEdit();
  for(const item of plan.staged){
   const old=item.obj.root;
   this.scene.add(item.root);old.removeFromParent();
   item.obj.root=item.root;item.obj.root.visible=!item.obj.hidden;
   item.obj.openings=item.openings;
   this.applySurfaceTo(item.obj);
  }
  if(this.outline&&this.selected)this.outline.setFromObject(this.selected.root);
  this.gizmo.attach(this.mode==='build'&&this.tool==='pick'?this.selected:null);
  this.syncInspector();return true;
 }
 addOpening(){
  if(!this.canEditObject())return;
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
   shape:$('openingShape').value,
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
  // Do not keep intercepting subsequent taps after a successful cut.
  this.openingPickMode=false;
  $('openingSelect').value=split.parts[0].opening.id;
  notify('✂ Вырезан '+(typ==='door'?'дверной':typ==='passage'?'пустой дверной':'оконный')+' проём'+
   (split.joint?' через стык двух стен':' вдоль формы стены')+
   (typ==='passage'?', без рамы и створки':', вставлены '+
    (typ==='door'?'петли и дверные створки':'рама и стекло')),'success');
 }
 restyleOpening(){
  if(!this.canEditObject())return;
  const selected=this.selected;
  if(this.tool!=='pick'||!selected)return notify('Выдели стену с готовым проёмом','warn');
  const id=$('openingSelect').value,opening=selected.openings?.find(o=>o.id===id);
  if(!opening)return notify('Выбери дверной или оконный проём в списке','warn');
  const group=opening.group||opening.id,changes=new Map();
  for(const wall of this.entries){
   if(!WallOpenings.supported(wall.kind))continue;
   if(!wall.openings?.some(o=>(o.group||o.id)===group))continue;
   changes.set(wall,wall.openings.map(o=>(o.group||o.id)===group?
    {...o,shape:$('openingShape').value,
     doorStyle:$('openingDoorStyle').value,
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
  if(!this.canEditObject())return;
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
  if(!this.canEditObject())return;
  const obj=this.selected;if(!obj)return;
  const o=obj.openings?.find(o=>o.id===$('openingSelect').value);
  if(!o||o.type!=='door')return;
  const angle=clamp(Number($('doorSwing').value)||0,-110,110),group=o.group||o.id;
  if(this.entries.some(w=>!SceneManager.editingAllowed(w)&&
   w.openings?.some(entry=>(entry.group||entry.id)===group)))
   return notify('Одна из стен проёма защищена. Сними замок для изменения двери','warn');
  this.recordEdit();
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
  if(!obj||!CleanGeometry.isBuiltIn(obj.kind)||!['wall','corner','arc90','arc180'].includes(obj.kind))return false;
  const old=obj.root,newRoot=this.cloneTemplate(obj.kind,obj.thickness,obj.scale,obj.axes);
  newRoot.position.copy(old.position);newRoot.rotation.copy(old.rotation);newRoot.scale.copy(old.scale);
  this.scene.add(newRoot);old.removeFromParent();
  // The shared ghost material is applied AFTER all geometry changes.
  obj.root=newRoot;obj.root.visible=!obj.hidden;
  if(obj.openings?.length){
   const result=WallOpenings.render(newRoot,obj.kind,obj.openings,
    {thickness:obj.thickness,axes:obj.axes});
   if(!result.ok)throw Error('Не удалось восстановить проёмы: '+result.reason);
  }
  if(obj.shapeCrop?.enabled){
   const crop=ShapeCrop.apply(newRoot,obj.shapeCrop);
   if(!crop.ok){newRoot.removeFromParent();this.scene.add(old);obj.root=old;
    notify('Фигурная подрезка: '+crop.reason,'error');return false}
  }
  this.applySurfaceTo(obj);this.queueDecalRebuild();
  if(this.outline&&obj===this.selected)this.outline.setFromObject(newRoot);
  this.gizmo.attach(this.mode==='build'&&this.tool==='pick'?this.selected:null);
  return true;
 }
 editField(id){
  const obj=this.target();if(!obj)return;
  const value=Number($(id).value);if(!Number.isFinite(value))return;
  if(this.entries.includes(obj))this.recordEdit();
  if(id==='scaleAll'){
   obj.scale=clamp(value/100,.1,10);
   this.placementScale=obj.scale;
   try{localStorage.setItem('phoenix-builder-placement-scale',String(obj.scale))}
   catch(err){console.warn('Scale could not be persisted',err)}
  }
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
  this.queueDecalRebuild();
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
  if(obj.shapeCrop?.enabled){
   const crop=ShapeCrop.apply(fresh,obj.shapeCrop);
   if(!crop.ok){notify('Фигурная подрезка: '+crop.reason,'error');return false}
  }
  const old=obj.root;
  fresh.position.copy(old.position);fresh.rotation.copy(old.rotation);fresh.scale.copy(old.scale);
  // Rebuilt preview material is re-applied at the end, not cloned per face.
  this.scene.add(fresh);old.removeFromParent();
  obj.root=fresh;obj.floorTrim=edit;obj.root.visible=!obj.hidden;
  if(obj===this.preview)this.applyPreviewGhost(obj);
  this.queueDecalRebuild();
  this.applySurfaceTo(obj);
  if(this.outline&&obj===this.selected)this.outline.setFromObject(fresh);
  return true;
 }
 applyFloorSettings(reset=false){
  if(!this.canEditObject())return;
  const obj=this.target();
  if(obj?.kind!=='floor')return notify('Выбери стандартную плиту пола','warn');
  const edit=reset?{...obj.floorTrim,enabled:false}:
   {...obj.floorTrim,contour:null,cuts:[],enabled:true,
   angle:Number($('floorCutAngle').value),offset:Number($('floorCutOffset').value),
   side:$('floorCutSide').value};
  if(obj!==this.preview)this.recordEdit();
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
  if(!this.canEditObject())return;
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
 async trimWholeProject(reset=false){
  if(this.bulkTrimBusy)return notify('Подрезка уже выполняется','warn');
  if(this.entries.some(e=>e.category==='floor'&&!SceneManager.editingAllowed(e)))
   return notify('На этажах есть скрытые/защищённые плиты. Разблокируй их перед массовой подрезкой','warn');
  const floors=this.entries.filter(e=>e.category==='floor').length;
  if(!floors)return notify('В проекте нет плит пола','warn');
  const action=reset?'Снять автоподрезку со всех плит':'Подрезать все плиты по стенам';
  if(!confirm(action+' на всех этажах?\nПлит: '+floors+
   '. Изменения сохранятся в проекте после нажатия «Сохранить».'))return;
  const snapshot=this.entries.slice();
  this.bulkTrimBusy=true;
  $('btnBulkTrim').disabled=$('btnBulkTrimReset').disabled=true;
  try{
   const plan=await BulkFloorTrim.prepareAsync(this.entries,(kind,thickness,scale,axes)=>
    this.cloneTemplate(kind,thickness,scale,axes),reset,(done,total)=>{
     if(done%24===0||done===total)
      notify('✂ Подрезка пола: '+done+' / '+total+' плит...','neutral');
    });
   if(!plan.ok)return notify(plan.reason,'error');
   if(snapshot.length!==this.entries.length||snapshot.some((e,i)=>e!==this.entries[i]))
    return notify('Сцена изменилась во время расчёта. Подрезка не применена; повтори действие','warn');
   if(!plan.staged.length)return notify(reset?
    'Нет плит с автоподрезкой для восстановления':
    'Плитки не пересекают стены — изменения не требуются','warn');
   this.recordEdit();
   BulkFloorTrim.commit(plan,this.scene,this.selected,this.outline);
   this.queueDecalRebuild();
   for(const entry of this.entries)entry.root.visible=!entry.hidden;
   this.syncInspector();
   notify((reset?'Автоподрезка снята: ':'Массовая подрезка выполнена: ')+
    plan.count+' плит, границ: '+plan.cutCount+
    ', закрытых контуров: '+plan.rooms+
    ', без изменений: '+plan.unchanged+
    (plan.openGLB?', GLB с открытым торцом: '+plan.openGLB:'')+
    '. Нажми 💾 Сохранить.','success');
  }catch(err){
   console.error('Bulk trim failed',err);
   notify('Массовая подрезка отменена: '+err.message,'error');
  }finally{
   this.bulkTrimBusy=false;
   $('btnBulkTrim').disabled=$('btnBulkTrimReset').disabled=false;
  }
 }
 applyAutomaticTrim(reset=false){
  if(!this.canEditObject())return;
  const obj=this.target();
  if(!obj||obj.category!=='floor')return notify('Выбери плиту или GLB категории «Пол»','warn');
  const builtin=obj.kind==='floor';
  let cuts=[];
  let contour=null;
  if(!reset&&builtin&&obj.floorTrim?.enabled)
   return notify('У плиты включена ручная подрезка. Сначала отключи её, чтобы не потерять форму','warn');
  if(!reset){
   const fresh=this.cloneTemplate(obj.kind,obj.thickness,obj.scale,obj.axes);
   if(!fresh)return notify('Исходная модель не найдена','error');
   const bounds=CleanGeometry.localBounds(fresh);
   const result=builtin?
    RoomFloorTrim.resolve(obj,this.entries.filter(e=>e!==obj),bounds):
    EdgeAutoTrim.resolve(obj,this.entries.filter(e=>e!==obj),bounds);
   if(!result.ok)return notify(result.reason,'warn');
   contour=result.contour||null;
   cuts=result.cuts||[];
  }
  if(builtin){
   if(obj!==this.preview)this.recordEdit();
   if(!this.rebuildFloor(obj,{...obj.floorTrim,
    enabled:reset?!!obj.floorTrim?.enabled:false,cuts,contour}))return;
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
   (builtin?'Плита подрезана точно по внутреннему контуру замкнутой комнаты':
   'Подрезка выполнена по '+cuts.length+' границам стен')+
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
  if(obj.shapeCrop?.enabled){
   const crop=ShapeCrop.apply(template,obj.shapeCrop);
   if(!crop.ok){notify('Фигурная подрезка: '+crop.reason,'error');return false}
   editResult={...editResult,shapeCrop:crop};
  }
  // Rebuilt GLB stays a cyan ghost rather than a semi-opaque copy of its PBR material.
  this.scene.add(template);old.removeFromParent();
  obj.root=template;obj.meshEdit=requested;obj.root.visible=!obj.hidden;
  this.applySurfaceTo(obj);this.queueDecalRebuild();
  obj.capResult=editResult;
  if(obj!==this.preview)this.attachImportedLOD(obj);
  obj.thicknessEditable=!CleanMeshEdit.active(requested)&&
   !!CleanGeometry.thicknessInfo(obj);
  if(this.outline&&obj===this.selected)this.outline.setFromObject(obj.root);
  return true;
 }
 // Rebuild a built-in non-wall/non-floor module from the untouched template.
 rebuildShapeBuiltin(obj){
  const fresh=this.cloneTemplate(obj.kind,obj.thickness,obj.scale,obj.axes);
  if(!fresh)return false;
  const cropped=ShapeCrop.apply(fresh,obj.shapeCrop);
  if(!cropped.ok){notify('Фигурная подрезка: '+cropped.reason,'error');return false}
  const old=obj.root;
  fresh.position.copy(old.position);fresh.rotation.copy(old.rotation);fresh.scale.copy(old.scale);
  this.scene.add(fresh);old.removeFromParent();obj.root=fresh;
  obj.root.visible=!obj.hidden;
  if(ArchitectureKit.has(obj.kind))ArchitectureKit.setDoorAngle(obj.root,obj.doorAngle||0);
  this.applySurfaceTo(obj);this.queueDecalRebuild();
  if(this.outline&&obj===this.selected)this.outline.setFromObject(fresh);
  this.gizmo.attach(this.mode==='build'&&this.tool==='pick'?this.selected:null);
  return true;
 }
 // UV38: pin the part being CUT. Touching a tower must not change the roof.
 shapeTarget(){
  const pinned=this.entries.find(o=>o.id===this.shapeTargetId);
  return pinned||this.target();
 }
 lockShapeTouch(){
  if(this.shapeTouchSaved===null){
   this.shapeTouchSaved={enabled:this.controls.enabled,
    touchAction:this.canvas.style.touchAction};
  }
  this.controls.enabled=false;
  this.canvas.style.touchAction='none';
  this.pointerStart=null;
 }
 unlockShapeTouch(){
  if(this.shapeTouchSaved!==null){
   this.controls.enabled=this.shapeTouchSaved.enabled;
   this.canvas.style.touchAction=this.shapeTouchSaved.touchAction;
   this.shapeTouchSaved=null;
  }
 }
 cancelShapeTouch(){
  if(this.shapeDragPointer!==null&&this.canvas.hasPointerCapture?.(this.shapeDragPointer))
   this.canvas.releasePointerCapture(this.shapeDragPointer);
  this.shapeDragPointer=null;
  this.shapePlaceMode=false;this.shapeSourceMode=false;
  this.unlockShapeTouch();
  $('btnShapePlace').classList.remove('active');
  $('btnShapeChooseObject').classList.remove('active');
 }
 // Shapes are editable, non-destructive until explicitly applied.
 // Existing shapeCrop JSON continues to use target-local coordinates.
 shapeScale(obj){
  obj.root.updateMatrixWorld(true);
  return {x:Math.max(.001,Math.abs(obj.root.scale.x)),
   z:Math.max(.001,Math.abs(obj.root.scale.z))};
 }
 shapeConfig(){
  const obj=this.shapeTarget();if(!obj)return null;
  const scale=this.shapeScale(obj);
  return ShapeCrop.normalize({enabled:true,shape:$('shapeCutType').value,
   mode:$('shapeCutMode').value,
   width:Number($('shapeCutWidth').value)/scale.x,
   depth:Number($('shapeCutDepth').value)/scale.z,
   centerX:Number($('shapeCutX').value)/scale.x,
   centerZ:Number($('shapeCutZ').value)/scale.z,
   angle:Number($('shapeCutAngle').value)});
 }
 shapeControlsFromTarget(){
  const obj=this.shapeTarget(),e=ShapeCrop.normalize(obj?.shapeCrop);
  $('shapeToolInfo').textContent=obj?'Цель выреза: '+this.sceneDisplayName(obj)+' (закреплена)':
   'Сначала выбери деталь инструментом «Выделить».';
  const scale=obj?this.shapeScale(obj):{x:1,z:1};
  $('shapeCutType').value=e.shape||'circle';$('shapeCutMode').value=e.mode||'remove';
  $('shapeCutWidth').value=Number(((e.width??2)*scale.x).toFixed(3));
  $('shapeCutDepth').value=Number(((e.depth??2)*scale.z).toFixed(3));
  $('shapeCutX').value=Number(((e.centerX??0)*scale.x).toFixed(3));
  $('shapeCutZ').value=Number(((e.centerZ??0)*scale.z).toFixed(3));
  $('shapeCutAngle').value=e.angle??0;
  this.updateShapePreview();
 }
 setShapeMode(mode){
  this.shapeMode=mode==='object'?'object':'manual';
  this.cancelShapeTouch();
  $('shapeModeManual').classList.toggle('active',this.shapeMode==='manual');
  $('shapeModeObject').classList.toggle('active',this.shapeMode==='object');
  $('shapeManualControls').hidden=this.shapeMode!=='manual';
  $('shapeObjectControls').hidden=this.shapeMode!=='object';
  $('btnShapePlace').classList.remove('active');
  $('btnShapeChooseObject').classList.remove('active');
  this.updateShapePreview();
 }
 clearShapePreview(){
  if(!this.shapePreview)return;
  this.shapePreview.removeFromParent();
  this.shapePreview.traverse(node=>{
   node.geometry?.dispose();
   if(node.material){
    const mats=Array.isArray(node.material)?node.material:[node.material];
    mats.forEach(mat=>mat.dispose());
   }
  });
  this.shapePreview=null;this.shapePreviewTargetId=null;
 }
 shapeLocalBounds(obj){
  const root=obj.root;root.updateWorldMatrix(true,true);
  const inv=root.matrixWorld.clone().invert(),bounds=new THREE.Box3();
  root.traverse(node=>{
   if(!node.isMesh||!node.geometry?.attributes?.position||node.userData?.phoenixLODProxy)return;
   if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
   bounds.union(node.geometry.boundingBox.clone().applyMatrix4(
    inv.clone().multiply(node.matrixWorld)));
  });
  return bounds.isEmpty()?null:bounds;
 }
 updateShapePreview(){
  this.clearShapePreview();
  if($('shapeToolPanel').hidden)return;
  const obj=this.shapeTarget();if(!obj||!this.entries.includes(obj)||obj.hidden)return;
  const cfg=this.shapeConfig(),bounds=this.shapeLocalBounds(obj);
  if(!cfg||!bounds)return;
  const points=ShapeCrop.polygon(cfg),y=bounds.max.y+
   .045/Math.max(.01,Math.abs(obj.root.scale.y));
  if(points.length<3)return;
  // Ghost geometry lives OUTSIDE target.root: never included when ShapeCrop
  // clones the original mesh and never saved/exported as a physical object.
  const shape=new THREE.Shape();shape.moveTo(points[0].x,points[0].z);
  for(let i=1;i<points.length;i++)shape.lineTo(points[i].x,points[i].z);
  shape.closePath();
  const group=new THREE.Group();group.name='shape-preview-not-exported';
  // On pitched roofs the old flat disc floated ABOVE the sloping shingles.
  // Trace the ring vertically onto the actual roof without touching geometry.
  // Restrict raycast projection to the built-in procedural roofs; high-poly
  // imported GLBs may otherwise stall mobile WebGL while dragging.
  const roof=obj.category==='roof'&&CleanGeometry.isBuiltIn(obj.kind),outlinePoints=[];
  if(roof){
   obj.root.updateWorldMatrix(true,true);
   const normal=new THREE.Vector3(0,-1,0).transformDirection(obj.root.matrixWorld);
   const caster=new THREE.Raycaster();
   for(const p of points){
    const origin=obj.root.localToWorld(new THREE.Vector3(p.x,bounds.max.y+2,p.z));
    caster.set(origin,normal);
    const top=caster.intersectObject(obj.root,true).find(h=>
     h.object.visible&&!h.object.userData?.phoenixLODProxy&&!h.object.userData?.phoenixInsert);
    const localY=top?obj.root.worldToLocal(top.point.clone()).y+.035:y;
    outlinePoints.push(new THREE.Vector3(p.x,localY,p.z));
   }
  }else{
   const fillGeo=new THREE.ShapeGeometry(shape);
   fillGeo.rotateX(Math.PI/2);fillGeo.translate(0,y,0);
   const fill=new THREE.Mesh(fillGeo,new THREE.MeshBasicMaterial({
    color:cfg.mode==='remove'?0x26cafa:0xffd254,
    transparent:true,opacity:.22,side:THREE.DoubleSide,
    depthTest:false,depthWrite:false}));fill.renderOrder=990;
   group.add(fill);
   for(const p of points)outlinePoints.push(new THREE.Vector3(p.x,y+.006,p.z));
  }
  const lineGeo=new THREE.BufferGeometry().setFromPoints(outlinePoints);
  const line=new THREE.LineLoop(lineGeo,new THREE.LineBasicMaterial({
   color:cfg.mode==='remove'?0x00eeff:0xffcc37,
   depthTest:false,transparent:true}));line.renderOrder=991;
  group.add(line);group.matrixAutoUpdate=false;
  obj.root.updateWorldMatrix(true,true);group.matrix.copy(obj.root.matrixWorld);
  this.scene.add(group);this.shapePreview=group;this.shapePreviewTargetId=obj.id;
 }
 showShapePanel(){
  const panel=$('shapeToolPanel'),open=panel.hidden;
  panel.hidden=!open;$('btnShapeToolTop').classList.toggle('active',open);
  if(!open){this.cancelShapeTouch();this.shapeTargetId=null;
   this.clearShapePreview();return}
  this.shapeTargetId=this.target()?.id??null;
  this.shapeControlsFromTarget();this.setShapeMode(this.shapeMode);
 }
 shapePickCentreStart(){
  if(this.shapePlaceMode){this.cancelShapeTouch();return}
  const obj=this.shapeTarget();if(!obj||!this.entries.includes(obj))
   return notify('Выдели деталь, которую нужно подрезать','warn');
  if(!this.canEditObject(obj))return;
  this.setMode('build');this.setTool('pick');
  this.shapeTargetId=obj.id;
  this.cancelShapeTouch();this.shapePlaceMode=true;
  this.lockShapeTouch();
  $('btnShapePlace').classList.add('active');
  notify('👆 Коснись детали и передвинь контур пальцем. Крыша останется на месте.','success');
 }
 shapePointerLocal(event,obj){
  const r=this.canvas.getBoundingClientRect();
  this.pointer.set((event.clientX-r.left)/r.width*2-1,
   -(event.clientY-r.top)/r.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  const hits=this.ray.intersectObject(obj.root,true).filter(
   h=>!h.object.userData?.phoenixLODProxy&&!h.object.userData?.phoenixInsert);
  if(hits.length)return obj.root.worldToLocal(hits[0].point.clone());
  // A hole or sloping roof may not have a triangle exactly under the finger.
  // Project to a horizontal plane over the module instead of losing the touch.
  const bounds=this.shapeLocalBounds(obj);if(!bounds)return null;
  const localY=(bounds.max.y+bounds.min.y)*.5;
  const worldY=obj.root.localToWorld(new THREE.Vector3(0,localY,0)).y;
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-worldY);
  const world=new THREE.Vector3();
  if(!this.ray.ray.intersectPlane(plane,world))return null;
  return obj.root.worldToLocal(world);
 }
 updateShapeByPointer(event){
  const obj=this.shapeTarget();if(!obj)return false;
  const local=this.shapePointerLocal(event,obj);if(!local)return false;
  const scale=this.shapeScale(obj);
  $('shapeCutX').value=Number((local.x*scale.x).toFixed(3));
  $('shapeCutZ').value=Number((local.z*scale.z).toFixed(3));
  this.updateShapePreview();return true;
 }
 shapeSourcePickStart(){
  if(this.shapeSourceMode){this.cancelShapeTouch();return}
  const obj=this.shapeTarget();if(!obj||!this.entries.includes(obj))
   return notify('Сначала выдели крышу или другую деталь для подрезки','warn');
  if(!this.canEditObject(obj))return;
  this.setMode('build');this.setTool('pick');
  this.shapeTargetId=obj.id;
  this.cancelShapeTouch();this.shapeSourceMode=true;
  this.lockShapeTouch();
  $('btnShapeChooseObject').classList.add('active');
  notify('🎯 Теперь коснись башни или другого объекта. Цель подрезки останется выбранной.','success');
 }
 shapeSourceAt(event){
  const target=this.shapeTarget();if(!target){this.cancelShapeTouch();return}
  const r=this.canvas.getBoundingClientRect();
  this.pointer.set((event.clientX-r.left)/r.width*2-1,
   -(event.clientY-r.top)/r.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  const other=this.entries.filter(e=>e!==target&&!e.hidden);
  const hits=this.ray.intersectObjects(other.map(e=>e.root),true);
  let source=null;
  for(const h of hits){
   if(h.object.userData?.phoenixLODProxy||h.object.userData?.phoenixInsert)continue;
   source=other.find(e=>{let n=h.object;
    while(n){if(n===e.root)return true;n=n.parent}return false});
   if(source)break;
  }
  if(!source)return notify('Не удалось выбрать объект. Коснись башни ещё раз или нажми кнопку для отмены','warn');
  const worldBox=new THREE.Box3().setFromObject(source.root);
  if(worldBox.isEmpty())return notify('У объекта не найден размер','warn');
  target.root.updateWorldMatrix(true,true);
  const localBox=new THREE.Box3();
  for(const x of [worldBox.min.x,worldBox.max.x])
   for(const y of [worldBox.min.y,worldBox.max.y])
    for(const z of [worldBox.min.z,worldBox.max.z])
     localBox.expandByPoint(target.root.worldToLocal(new THREE.Vector3(x,y,z)));
  // Input is labelled CENTIMETRES. Previous UV37 incorrectly used metres.
  const scale=this.shapeScale(target),margin=Math.max(0,Math.min(1,
   (Number($('shapeCutMargin').value)||0)/100));
  const w=(localBox.max.x-localBox.min.x)*scale.x+margin*2;
  const d=(localBox.max.z-localBox.min.z)*scale.z+margin*2;
  $('shapeCutWidth').value=Number(Math.max(.15,w).toFixed(3));
  $('shapeCutDepth').value=Number(Math.max(.15,d).toFixed(3));
  $('shapeCutX').value=Number(((localBox.min.x+localBox.max.x)*.5*scale.x).toFixed(3));
  $('shapeCutZ').value=Number(((localBox.min.z+localBox.max.z)*.5*scale.z).toFixed(3));
  $('shapeCutMode').value='remove';
  this.cancelShapeTouch();
  // Selection stays on the original roof; source is a measuring guide only.
  this.updateShapePreview();
  notify('✅ Контур установлен по габаритам: '+this.sceneDisplayName(source)+
   '. Проверь форму и нажми «Применить вырез».','success');
 }
 applyShapeCut(reset=false){
  const obj=this.shapeTarget();if(!obj||!this.entries.includes(obj))
   return notify('Сначала выдели установленный модуль','warn');
  if(!this.canEditObject(obj))return;
  const previous=ShapeCrop.normalize(obj.shapeCrop);
  const next=reset?ShapeCrop.normalize(null):this.shapeConfig();
  if(next?.enabled&&next.shape==='star'&&next.mode==='remove')
   return notify('Отверстие звездой пока не поддерживается — выбери круг, прямоугольник или шестиугольник','warn');
  this.recordEdit();obj.shapeCrop=next;
  let ok=false;
  if(obj.kind==='floor')ok=this.rebuildFloor(obj,obj.floorTrim);
  else if(CleanGeometry.isBuiltIn(obj.kind)){
   if(['wall','corner','arc90','arc180'].includes(obj.kind)){
    ok=this.updateGeometry(obj)===true;
   }else ok=this.rebuildShapeBuiltin(obj);
  }else ok=this.rebuildImported(obj,obj.meshEdit);
  if(!ok){obj.shapeCrop=previous;this.updateShapePreview();return}
  this.applyTransform(obj);this.syncInspector();this.queueDecalRebuild();
  this.cancelShapeTouch();
  this.updateShapePreview();
  notify(reset?'✅ Исходная форма модуля восстановлена':
   '✂ Фигурная подрезка применена. Срез сохраняется в JSON и GLB.','success');
 }
 applyMeshSettings(reset=false){
  if(!this.canEditObject())return;
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
  if(!this.canEditObject())return;
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
  if(!this.canEditObject())return;
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
 clearSockets(){
  if(!this.canEditObject())return;const obj=this.target();if(!obj)return;obj.sockets=null;this.syncInspector();
  notify('Возврат к автоматическому распознаванию прямой стены','neutral')}
 rayPoint(event,planeY=this.floor*2.6){
  const r=this.canvas.getBoundingClientRect();
  this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  const plane=new THREE.Plane(V(0,1,0),-planeY);
  const hit=V();return this.ray.ray.intersectPlane(plane,hit)?hit:null;
 }
 nudgeSelected(dx,dz,dy=0){
  if(!this.canEditObject())return;
  const obj=this.selected;
  if(!obj||this.tool!=='pick')return notify('Нажми «Выделить» и выбери готовую деталь','warn');
  this.recordEdit();
  const step=PrecisionPlacement.step($('moveStep').value,.001);
  obj.root.position.x=PrecisionPlacement.nudge(obj.root.position.x,dx,step);
  obj.root.position.y=PrecisionPlacement.nudge(obj.root.position.y,dy,step);
  obj.root.position.z=PrecisionPlacement.nudge(obj.root.position.z,dz,step);
  obj.root.updateMatrixWorld(true);
  this.queueDecalRebuild();
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
  // Just selecting a part must never move it by dragging its body.
  if(!this.gizmo.active||this.gizmo.mode!=='move')return;
  if(!SceneManager.editingAllowed(this.selected)||this.surfaceSidePick||this.cameraFocusPick||this.openingPickMode||
   this.decalPickMode||this.tool!=='pick'||!this.selected||e.button!==0||e.isPrimary===false)return;
  const rect=this.canvas.getBoundingClientRect();
  this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  if(!this.ray.intersectObject(this.selected.root,true).length)return;
  const hit=this.rayPoint(e,this.selected.root.position.y);
  if(!hit)return;
  this.dragMove={pointerId:e.pointerId,x:e.clientX,y:e.clientY,
   hit,base:this.selected.root.position.clone(),moved:false,
   historyBefore:this.project()};
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
   this.recordEdit(drag.historyBefore);
   this.queueDecalRebuild();
   if(this.selected?.surface?.style!=='none')this.applySurfaceTo(this.selected);
   notify('Деталь перемещена по X/Z: '+this.sizeText(this.selected),'success');
  }
  // The Move tool remains armed until the user presses Move again.
  this.updateGizmoDock();
  e.preventDefault();e.stopImmediatePropagation();
 }
 // Mounted decorations live on real wall faces, never imaginary wall sockets.
 wallHit(ray){
  const walls=this.entries.filter(e=>e.category==='wall'&&!e.hidden);
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
  if(this.floor===0&&this.worldEditor?.hasElevations()){
   this.worldEditor.terrainRoot.updateMatrixWorld(true);
   const hits=this.ray.intersectObjects(
    [...this.worldEditor.sculptPatches.values()],false);
   if(hits.length)return hits[0].point.clone();
  }
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
  this.updatePreview(this.cursor,true,ray);
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
 setBuildFloor(level){
  const next=clamp(level,0,49),rise=(next-this.floor)*2.6;
  this.floor=next;
  if(this.cursor)this.cursor.y=next*2.6;
  if(rise&&this.mode!=='character'&&this.camera&&this.controls){
   this.camera.position.y+=rise;
   this.controls.target.y+=rise;
   this.controls.update();
  }
  if(Number.isFinite(this.preview?.manualPlacementY))this.preview.manualPlacementY+=rise;
  $('levelLabel').textContent=next+1;
 }
 stepBuildFloor(delta){
  this.setBuildFloor(this.floor+delta);
  if(this.mode==='build')this.updatePreview(this.cursor);
  else this.aimPlacement();
  this.renderSceneManager();
 }
 // UV42: wall continuation uses physical wall sockets, not the nominal 2m size.
 // Trace wall centre-lines to detect overlap without banning normal end joints.
 wallChainTrace(kind,ends){
  if(!ends||ends.length!==2)return [];
  const a=ends[0].point,b=ends[1].point;
  if(kind==='corner'){
   const d0=ends[0].out,d1=ends[1].out;
   const cross=d0.x*d1.z-d0.z*d1.x;
   if(Math.abs(cross)>.1){
    const dx=b.x-a.x,dz=b.z-a.z;
    const t=(dx*d1.z-dz*d1.x)/cross;
    const bend=V(a.x+d0.x*t,a.y,a.z+d0.z*t);
    if(bend.distanceTo(a)<20&&bend.distanceTo(b)<20)return [a,bend,b];
   }
  }
  if(kind==='arc90'||kind==='arc180'){
   const n0=V(-ends[0].out.z,0,ends[0].out.x);
   const n1=V(-ends[1].out.z,0,ends[1].out.x);
   const cross=n0.x*n1.z-n0.z*n1.x;
   let center;
   if(Math.abs(cross)>.05){
    const dx=b.x-a.x,dz=b.z-a.z;
    const t=(dx*n1.z-dz*n1.x)/cross;
    center=V(a.x+t*n0.x,a.y,a.z+t*n0.z);
   }else if(kind==='arc180')center=a.clone().add(b).multiplyScalar(.5);
   if(center){
    const r=a.distanceTo(center),r2=b.distanceTo(center);
    if(r>.2&&r<120&&Math.abs(r-r2)<Math.max(.18,.08*r)){
     const first=Math.atan2(a.z-center.z,a.x-center.x);
     const second=Math.atan2(b.z-center.z,b.x-center.x);
     const ccw=V(-Math.sin(first),0,Math.cos(first));
     const direction=ccw.dot(ends[0].out.clone().negate())>=0?1:-1;
     const positive=(second-first+Math.PI*4)%(Math.PI*2);
     const delta=direction>0?positive:(Math.PI*2-positive)%(Math.PI*2);
     if(delta>.05&&delta<=Math.PI+.2){
      const parts=Math.max(8,Math.ceil(delta/(Math.PI/24)));
      return Array.from({length:parts+1},(_,i)=>V(
       center.x+r*Math.cos(first+direction*delta*i/parts),a.y,
       center.z+r*Math.sin(first+direction*delta*i/parts)));
     }
    }
   }
  }
  return [a,b];
 }
 wallChainClashes(preview,position,yaw,localSockets){
  const src=localSockets||CleanGeometry.sockets(preview.kind,preview.root,
   preview.sockets,preview.category);
  if(src.length!==2)return false;
  const scale=preview.root.scale;
  const hypothetical=src.map(socket=>({
   point:position.clone().add(CleanGeometry.rotate(V(
    socket.point.x*scale.x,socket.point.y*scale.y,socket.point.z*scale.z),yaw)),
   out:CleanGeometry.rotate(V(socket.out.x,socket.out.y||0,socket.out.z),yaw)
    .setY(0).normalize()
  }));
  const path=this.wallChainTrace(preview.kind,hypothetical);
  const aWidth=(Number(preview.thickness)||.22)*Math.max(.5,Math.abs(scale.z));
  const area=points=>({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
   minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))});
  const aBox=area(path);
  const seg=(a,b)=>({a,b,dx:b.x-a.x,dz:b.z-a.z,len:Math.hypot(b.x-a.x,b.z-a.z)});
  const cross=(x,z,y,w)=>x*w-z*y;
  for(const other of this.entries){
   if(other.hidden||other.category!=='wall'||other.storey!==this.floor)continue;
   // Cheap conservative broad phase for built-in modules. Never skip an
   // imported GLB by guessed dimensions: its true size may be anything.
   const localReach={wall:1.3,corner:2.7,arc90:2.7,arc180:2.7}[other.kind];
   if(localReach!==undefined){
    const extent=localReach*Math.max(Math.abs(other.root.scale.x),
     Math.abs(other.root.scale.z))+.6;
    const center=other.root.position;
    if(aBox.maxX+extent<center.x||aBox.minX-extent>center.x||
     aBox.maxZ+extent<center.z||aBox.minZ-extent>center.z)continue;
   }
   const sockets=CleanGeometry.worldSockets(other);
   if(sockets.length!==2)continue;
   const trace=this.wallChainTrace(other.kind,sockets);
   const bBox=area(trace),bWidth=(Number(other.thickness)||.22)*
    Math.max(.5,Math.abs(other.root.scale.z));
   const gap=Math.max(.065,(aWidth+bWidth)*.5-.035);
   if(aBox.maxX+gap<bBox.minX||bBox.maxX+gap<aBox.minX||
    aBox.maxZ+gap<bBox.minZ||bBox.maxZ+gap<aBox.minZ)continue;
   for(let i=0;i<path.length-1;i++)for(let j=0;j<trace.length-1;j++){
    const a=seg(path[i],path[i+1]),b=seg(trace[j],trace[j+1]);
    if(a.len<1e-5||b.len<1e-5)continue;
    const ux=a.dx/a.len,uz=a.dz/a.len,vx=b.dx/b.len,vz=b.dz/b.len;
    const parallel=Math.abs(ux*vx+uz*vz);
    if(parallel>.97){
     // True collinear overlap, with a tolerance for touching at an end.
     const lateral=Math.max(Math.abs(cross(b.a.x-a.a.x,b.a.z-a.a.z,ux,uz)),
      Math.abs(cross(b.b.x-a.a.x,b.b.z-a.a.z,ux,uz)));
     if(lateral>=gap)continue;
     const t0=(b.a.x-a.a.x)*ux+(b.a.z-a.a.z)*uz;
     const t1=(b.b.x-a.a.x)*ux+(b.b.z-a.a.z)*uz;
     const overlap=Math.min(a.len,Math.max(t0,t1))-Math.max(0,Math.min(t0,t1));
     if(overlap>Math.max(.11,Math.min(a.len,b.len)*.18))return true;
    }else{
     // Two centre-lines crossing in the MIDDLE of both complete walls.
     // Normal L / T joints at a free end must remain legal.
     const denom=cross(a.dx,a.dz,b.dx,b.dz);
     if(Math.abs(denom)<1e-6)continue;
     const rx=b.a.x-a.a.x,rz=b.a.z-a.a.z;
     const t=cross(rx,rz,b.dx,b.dz)/denom;
     const u=cross(rx,rz,a.dx,a.dz)/denom;
     if(t<=0||t>=1||u<=0||u>=1)continue;
     const travelledA=path.slice(0,i).reduce((n,p,k)=>n+p.distanceTo(path[k+1]),0)+t*a.len;
     const travelledB=trace.slice(0,j).reduce((n,p,k)=>n+p.distanceTo(trace[k+1]),0)+u*b.len;
     const lengthA=path.slice(0,-1).reduce((n,p,k)=>n+p.distanceTo(path[k+1]),0);
     const lengthB=trace.slice(0,-1).reduce((n,p,k)=>n+p.distanceTo(trace[k+1]),0);
     if(Math.min(travelledA,lengthA-travelledA,travelledB,lengthB-travelledB)>.23)
      return true;
    }
   }
  }
  return false;
 }
 wallChainCandidates(preview){
  if(!this.wallChainAnchor||!this.magnet||preview?.category!=='wall')return [];
  const link=this.wallChainAnchor;
  const prev=this.entries.find(e=>e.id===link.id&&e.category==='wall'&&
   e.storey===this.floor&&!e.hidden);
  if(!prev)return [];
  const target=CleanGeometry.worldSockets(prev);
  const sources=CleanGeometry.sockets(preview.kind,preview.root,
   preview.sockets,preview.category);
  if(target.length!==2||sources.length!==2)return [];
  const scale=preview.root.scale;
  const theta=v=>Math.atan2(-v.z,v.x);
  const candidates=[];
  for(let to=0;to<2;to++)for(let from=0;from<2;from++){
   const src=sources[from],tgt=target[to];
   if(src.out.lengthSq()<.1||tgt.out.lengthSq()<.1)continue;
   const outgoing=src.out.clone();
   if(src.boundary)outgoing.divide(scale);else outgoing.multiply(scale);
   outgoing.setY(0).normalize();
   const yaw=theta(tgt.out.clone().negate())-theta(outgoing);
   const local=V(src.point.x*scale.x,src.point.y*scale.y,src.point.z*scale.z);
   const position=tgt.point.clone().sub(CleanGeometry.rotate(local,yaw));
   if(this.wallChainClashes(preview,position,yaw,sources))continue;
   candidates.push({position,rotation:yaw,from,to,target:prev.id,
    joint:tgt.point.clone(),wallChain:true});
  }
  return candidates;
 }
 nextWallChainPlacement(preview,cursor=null,manual=false){
  const candidates=this.wallChainCandidates(preview);
  if(!candidates.length)return null;
  const link=this.wallChainAnchor;
  if(!manual){
   const to=link.exitIndex,from=to===1?0:1;
   return candidates.find(p=>p.to===to&&p.from===from)||
    candidates.find(p=>p.to===to)||null;
  }
  if(!cursor)return null;
  let best=null;
  for(const candidate of candidates){
   // The builder touches the JOINT, not the centre of a 12-metre wall.
   const distance=Math.hypot(candidate.joint.x-cursor.x,candidate.joint.z-cursor.z);
   const score=distance+(candidate.to!==link.exitIndex?.06:0)+
    (candidate.from!==(candidate.to===1?0:1)?.04:0);
   if(!best||score<best.score)best={candidate,score,distance};
  }
  // A distant tap begins a new chain through the unchanged UV38 magnet.
  return best&&best.distance<=1.15?best.candidate:null;
 }
 updatePreview(cursor,snapAllowed=true,ray=null){
  const obj=this.preview;if(!obj||this.tool!=='place')return;
  const pos=cursor||V();
  obj.root.position.set(
   PrecisionPlacement.coordinate(pos.x,this.gridSnap,this.gridStep),
   obj.manualPlacementY??this.floor*2.6,
   PrecisionPlacement.coordinate(pos.z,this.gridSnap,this.gridStep));
  // The wall ghost follows the last free end unless the user explicitly
  // touched another location; never interfere with floor/roof/decor previews.
  const wasWallChainBlocked=this.wallChainBlocked;
  this.wallChainBlocked=false;this.wallChainPlan=null;
  if(this.magnet&&snapAllowed&&obj.category==='wall'&&this.wallChainAnchor){
   const plan=this.nextWallChainPlacement(obj,pos,this.wallChainManual);
   if(plan){
    obj.root.position.copy(plan.position);obj.root.rotation.y=plan.rotation;
    obj._snapRotation=plan.rotation;obj.storey=this.floor;
    obj.root.updateMatrixWorld(true);
    this.previewStatus=plan;this.wallChainPlan=plan;
    this.syncInspector();return;
   }
   // If every automatic continuation is blocked, do not silently fall back
   // to a wall on top of an existing one. A deliberate touch restores UV38's
   // free placement so the user can start the next chain anywhere.
   if(!this.wallChainManual){
    const anchor=this.entries.find(e=>e.id===this.wallChainAnchor.id&&!e.hidden);
    if(anchor&&CleanGeometry.worldSockets(anchor).length===2&&
     CleanGeometry.sockets(obj.kind,obj.root,obj.sockets,obj.category).length===2){
     this.wallChainBlocked=true;this.previewStatus=null;
     obj.root.updateMatrixWorld(true);this.syncInspector();
     if(!wasWallChainBlocked)
      notify('🔴 Свободный стык занят. Коснись другой стороны стены или нового места','warn');
     return;
    }
   }
   // Manual tap at a new location returns to the unchanged UV38 solver.
  }
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
   snap=CleanGeometry.stackWall(obj,this.entries,pos,this.floor,ray)||
    (obj.category==='floor'?CleanGeometry.floorOnWall(obj,this.entries,pos,this.floor):null)||
    CleanGeometry.solveSnap(obj,this.entries,pos,this.floor,obj.rot);
  if(snap){
   obj.root.position.copy(snap.position);
   obj.root.rotation.y=snap.rotation;
   obj._snapRotation=snap.rotation;this.previewStatus=snap;
   const target=this.entries.find(e=>e.id===snap.target);
   const mismatch=target?.category==='wall'&&obj.category==='wall'&&
    !snap.boundary&&!snap.stack&&Math.abs(target.thickness-obj.thickness)>.015;
   const name=this.descriptor(target?.kind)?.name||target?.kind||'модулем';
   const message=snap.stack?'🟢 Магнит: совмещено по вертикали — '+name:
    snap.wallOnFloor?'🟢 Магнит: стена вдоль кромки пола':
    snap.floorOnWall?'🟢 Магнит: пол развёрнут по стене и прижат к внутренней грани':
    snap.boundary?'🟢 Магнит: привязка по контуру — '+name:
    mismatch?'🟡 Торцы совпали, но толщина деталей отличается':
     '🟢 Магнит: точное соединение с '+name;
   notify(message,mismatch?'warn':'success');
  }else{
   this.previewStatus=null;obj._snapRotation=null;
   notify(this.magnet?'🟡 Свободная установка — торец не найден':'🟡 Магнит отключён','warn');
  }
  obj.root.updateMatrixWorld(true);
  // Check for two coplanar floor tiles before they become permanent geometry.
  // Keep the regular edge magnet as the first choice; repair only collisions.
  obj._floorOverlapBlocked=false;
  if(obj.category==='floor'&&this.magnet&&snapAllowed){
   const fix=CleanGeometry.preventFloorOverlap(obj,this.entries,pos,this.floor);
   if(fix?.blocked){
    obj._floorOverlapBlocked=true;
    this.previewStatus=null;
    notify('🔴 Пол перекрывается: выбери свободный край плитки или отключи магнит для ручного размещения','warn');
   }else if(fix){
    obj.root.position.copy(fix.position);obj.root.rotation.y=fix.rotation;
    obj._snapRotation=fix.rotation;this.previewStatus=fix;
    notify('🟢 Плитка поставлена вплотную к соседней — без перекрытия','success');
   }
  }
  // In a 5 km world, Y=0 is not necessarily the floor under the cursor.
  // For unsnapped ground-floor modules, seat the physical lowest vertex
  // on the heightfield; snapped walls keep the magnet's precise Y.
  if(!snap&&this.floor===0&&obj.manualPlacementY===undefined&&
     obj.category!=='decor'&&obj.category!=='roof'&&this.worldEditor){
   const height=this.worldEditor.heightAt(obj.root.position.x,obj.root.position.z);
   PhoenixPlacementGhost.align(obj.root,height,THREE);
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
   // Undo/Redo must restore scene data, not the user's active catalog/tool.
   const change=direction==='undo'?
    this.history.undo(this.project(),doc=>this.restore(doc,{preserveUI:true})):
    this.history.redo(this.project(),doc=>this.restore(doc,{preserveUI:true}));
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
  this.queueDecalRebuild();
  this.selected=staged[0];this.setTool('pick');
  if(this.outline){this.scene.remove(this.outline);this.outline.geometry.dispose();}
  this.outline=new THREE.BoxHelper(this.selected.root,0x44ffb8);
  this.scene.add(this.outline);this.gizmo.attach(SceneManager.editingAllowed(this.selected)?this.selected:null);
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
   this.setBuildFloor(this.floor+1);
   this.renderSceneManager();
  }catch(err){notify('Копия этажа: '+err.message,'error')}
 }
 async exportGameManifest(){
  if(!this.entries.some(e=>!e.hidden))return notify('Все детали скрыты — нечего экспортировать','warn');
  try{
   const manifest=BuildingWorkflow.gameManifest(this.project());
   const blob=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'});
   await PhoenixFiles.saveBlob(blob,'PhoenixBuilder_GameScene.json','application/json');
   notify('🎮 JSON экспортирован: отдельно выгрузи GLB. В игре создай коллайдеры по метаданным','success');
  }catch(err){notify('Игровой экспорт: '+err.message,'error')}
 }
 place(){
  if(!this.preview)return;
  if(this.wallChainBlocked&&this.preview.category==='wall')
   return notify('🔴 Свободный стык занят. Укажи другое место для новой стены','warn');
  if(this.preview.category==='decor'&&!this.preview._hasWallTarget)return notify('Коснись стены для настенного декора','warn');
  if(this.magnet&&this.preview.category==='floor'){
   // Also check right at the commit boundary, not just during preview.
   const check=CleanGeometry.preventFloorOverlap(this.preview,this.entries,
    this.preview.root.position,this.floor);
   if(check?.blocked)return notify('🔴 Здесь уже есть плитка пола. Выбери свободное место','warn');
   if(check){
    this.preview.root.position.copy(check.position);
    this.preview.root.rotation.y=check.rotation;
    this.preview._snapRotation=check.rotation;
   }
  }
  // Only auto-generated wall-chain ghosts get an additional collision veto.
  // Deliberate manual placement and the original floor solver are untouched.
  if(this.wallChainPlan?.wallChain&&this.preview.category==='wall'&&
   this.wallChainClashes(this.preview,this.preview.root.position,
    this.preview.root.rotation.y))
   return notify('🔴 Следующая стена перекрывает построенную. Смести подсветку или выбери другой торец','warn');
  const source=this.preview;
  const data={category:source.category,storey:this.floor,scale:source.scale,
   axes:cloneJSON(source.axes),thickness:source.thickness,
   mirrorX:source.mirrorX,
   rot:source._snapRotation??source.rot,
   rotation:{x:source.root.rotation.x,y:source._snapRotation??source.root.rotation.y,
    z:source.root.rotation.z},
   sockets:source.sockets?cloneJSON(source.sockets):null,
   doorAngle:source.doorAngle||0,
   meshEdit:CleanMeshEdit.normalize(source.meshEdit),shapeCrop:ShapeCrop.normalize(source.shapeCrop),floorTrim:FloorClip.normalize(source.floorTrim),
   openings:WallOpenings.normalize(source.openings),surface:SurfaceMaterials.normalize(source.surface),
   surfaceSides:SurfaceMaterials.normalizeSides(source.surfaceSides),
   surfaceParts:SurfaceMaterials.normalizeParts(source.surfaceParts),
    manualEdgeCut:source.manualEdgeCut||null,autoEdgeCuts:FloorClip.normalizeCuts(source.autoEdgeCuts),
   position:source.root.position.toArray()};
  const entry=this.createEntry(source.kind,data);
  if(!entry){notify('Не удалось разместить модуль','error');return}
  // Every newly placed wall becomes the next continuation anchor.
  // The incoming endpoint stays attached; the unused one is the next exit.
  const wallChain=this.magnet&&source.category==='wall';
  let wallExit=1;
  if(wallChain){
   const ends=CleanGeometry.worldSockets(entry);
   const used=this.wallChainPlan?.from??this.previewStatus?.from;
   if(ends.length===2&&Number.isInteger(used)&&used>=0&&used<2)
    wallExit=1-used;
  }
  this.recordEdit();
  this.scene.add(entry.root);this.entries.push(entry);
  this.attachImportedLOD(entry);this.queueDecalRebuild();
  this.wallChainAnchor=wallChain?{id:entry.id,exitIndex:wallExit}:null;
  this.wallChainPlan=null;this.wallChainManual=false;
  this.selectKind(source.kind,source.scale);
  this.preview.root.position.fromArray(data.position);
  this.preview.scale=data.scale;this.preview.axes=data.axes;this.preview.thickness=data.thickness;
  this.preview.mirrorX=data.mirrorX;
  this.preview.meshEdit=CleanMeshEdit.normalize(data.meshEdit);
  this.preview.shapeCrop=ShapeCrop.normalize(data.shapeCrop);
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
  // Hit is a physical triangle/primitive, not a guessed module orientation.
  const options=this.entries.filter(obj=>!obj.hidden);
  const hits=this.ray.intersectObjects(options.map(obj=>obj.root),true);
  for(const hit of hits){
   if(hit.object.userData?.phoenixLODProxy||hit.object.userData?.phoenixInsert||
      hit.object.name?.includes('door:leaf'))continue;
   const obj=options.find(candidate=>{
    let parent=hit.object;
    while(parent){if(parent===candidate.root)return true;parent=parent.parent}
    return false;
   });
   if(!obj)continue;
   if(!SceneManager.editingAllowed(obj))
    return notify('Эта деталь заблокирована. Сначала сними замок','warn');
   const bundled=bundledModules.has(obj.kind);
   const imported=!CleanGeometry.isBuiltIn(obj.kind)&&!bundled;
   const part=bundled?SurfaceMaterials.hitPart(obj.root,hit):null;
   if(bundled&&!part){
    return notify('Коснись непрозрачной детали модели: стекло не перекрашиваем','warn');
   }
   const side=!bundled&&!imported?
    SurfaceMaterials.faceFromHit(hit,obj.root,obj.category,obj.kind):null;
   const whole=imported||(!bundled&&!['wall','floor'].includes(obj.category));
   if(!bundled&&!whole&&!side)
    return notify('Коснись видимой грани: сторона, торец или кромка','warn');
   const next=this.surfaceFromControls(obj);
   if(next.style==='custom'&&!next.imageId)
    return notify('Выбери PNG, JPG или WebP для кисти','warn');
   this.pendingTexture=null;
   this.pick(event);
   if(this.selected!==obj)return notify('Не удалось выбрать деталь','warn');
   this.recordEdit();
   if(bundled){
    obj.surfaceParts=obj.surfaceParts||{};
    if(next.style==='none')delete obj.surfaceParts[part.key];
    else obj.surfaceParts[part.key]=SurfaceMaterials.normalize(next);
   }else if(whole){
    obj.surface=SurfaceMaterials.normalize(next);
    obj.surfaceSides={};
   }else{
    obj.surfaceSides=obj.surfaceSides||{};
    if(next.style==='none')delete obj.surfaceSides[side];
    else obj.surfaceSides[side]=SurfaceMaterials.normalize(next);
   }
   this.rememberTextureBrush(next);
   this.applySurfaceTo(obj).then(ok=>{
    if(!ok)return notify('Не удалось нанести текстуру; исходная модель не изменена','error');
    notify(bundled?'✅ Покрашена часть «'+part.name+'». Прозрачное стекло не тронуто.':
     whole?'✅ Внешняя GLB-модель окрашена целиком.':
     !['front','back'].includes(side)?
      '✅ Окрашена торцевая или горизонтальная кромка. Другие грани сохранены.':
      '✅ Окрашена одна сторона. Другая сторона сохранена.','success');
   }).catch(err=>notify('Ошибка материала: '+err.message,'error'));
   this.syncInspector();this.renderTextureLibrary();this.syncQuickTextureFaces();
   return;
  }
  notify('Коснись видимой поверхности модуля','warn');
 }
 pick(event){
  const r=this.canvas.getBoundingClientRect();
  this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
  const hits=this.ray.intersectObjects(this.entries.filter(e=>!e.hidden).map(e=>e.root),true);
  this.selected=null;
  for(const hit of hits){
   this.selected=this.entries.find(e=>{if(e.hidden)return false;
    let c=hit.object;while(c){if(c===e.root)return true;c=c.parent}return false});
   if(this.selected)break;
  }
  if(this.outline){this.scene.remove(this.outline);this.outline.geometry.dispose();this.outline=null}
  if(this.selected){
   this.outline=new THREE.BoxHelper(this.selected.root,
    this.selected.locked?0xffc66a:0x44ffb8);this.scene.add(this.outline);
   notify('Выбрана деталь: '+this.sceneDisplayName(this.selected),'success');
  }else notify('Коснись строительной детали, чтобы выделить её');
  const wasActive=this.gizmo.active;
  this.gizmo.attach(SceneManager.editingAllowed(this.selected)?this.selected:null);
  if(wasActive&&SceneManager.editingAllowed(this.selected))this.gizmo.activate();
  this.syncInspector();
  if(!$('shapeToolPanel').hidden){
   this.shapeTargetId=this.selected?.id??null;
   this.shapeControlsFromTarget();
  }
  if(this.selected&&this.pendingTexture&&this.canEditObject(this.selected)){
   const pending=this.pendingTexture;this.pendingTexture=null;
   this.chooseTexture(pending.style,pending.imageId);
  }
 }
 duplicate(mirror=false){
  const obj=this.selected;if(!obj)return notify('Сначала выдели деталь','warn');
  if(!this.canEditObject(obj))return;
  const data=this.encode(obj);delete data.id;
  delete data.groupId;delete data.roomRole;data.locked=false;data.hidden=false;
  data.label=data.label?data.label+' — копия':'';
  if(mirror)data.mirrorX=!data.mirrorX;
  else data.position[0]+=1.5;
  const clone=this.createEntry(obj.kind,data);if(!clone)return;
  if(mirror){
   const originalBox=new THREE.Box3().setFromObject(obj.root);
   const cloneBox=new THREE.Box3().setFromObject(clone.root);
   clone.root.position.x+=Math.max(.1,originalBox.max.x-cloneBox.min.x+.15);
   clone.root.updateMatrixWorld(true);
  }
  this.recordEdit();
  this.entries.push(clone);this.scene.add(clone.root);this.selected=clone;
  this.attachImportedLOD(clone);this.setTool('pick');this.queueDecalRebuild();
  if(this.outline){this.scene.remove(this.outline);this.outline.geometry.dispose()}
  this.outline=new THREE.BoxHelper(clone.root,0x44ffb8);this.scene.add(this.outline);
  this.gizmo.attach(clone);
  this.syncInspector();notify(mirror?'Создана зеркальная копия':'Создана копия детали','success');
 }
 delete(){
  if(!this.canEditObject())return;
  if(!this.selected)return notify('Сначала выдели деталь','warn');
  this.recordEdit();
  const idx=this.entries.indexOf(this.selected);
  if(idx>=0)this.entries.splice(idx,1);
  this.selected.root.removeFromParent();this.selected=null;
  this.queueDecalRebuild();
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
   ...(obj.mirrorX?{mirrorX:true}:{}),
   doorAngle:obj.doorAngle||0,
   meshEdit:CleanMeshEdit.normalize(obj.meshEdit),shapeCrop:ShapeCrop.normalize(obj.shapeCrop),floorTrim:FloorClip.normalize(obj.floorTrim),
   manualEdgeCut:obj.manualEdgeCut||null,autoEdgeCuts:FloorClip.normalizeCuts(obj.autoEdgeCuts),
   openings:WallOpenings.normalize(obj.openings),surface:SurfaceMaterials.normalize(obj.surface),
   surfaceSides:SurfaceMaterials.normalizeSides(obj.surfaceSides),
   surfaceParts:SurfaceMaterials.normalizeParts(obj.surfaceParts),
   groupId:obj.groupId||'',roomRole:obj.roomRole||'',
   label:SceneManager.cleanName(obj.label),locked:obj.locked===true,
   hidden:obj.hidden===true,
   sizeCm:this.physicalSize(obj)};
 }
 project(){
   const bundledInScene=[...new Set(this.entries.map(obj=>obj.kind))]
    .filter(id=>bundledModules.has(id)&&!this.catalogMeta.has(id))
    .map(id=>bundledModules.get(id));
  return {version:2,app:'Phoenix Builder Clean',
   heights:[],objects:this.entries.map(obj=>{
    const item=this.encode(obj);item.rot=obj.root.rotation.y;return item;
   }),floor:this.floor,nextId:this.nextId,
    phoenixGame:this.prefabEditor?.serialize()||null,
    avatar:this.avatarAssetId?{
     assetId:this.avatarAssetId,fileName:this.avatarFileName||'Player.glb',
     heightCm:this.avatarHeightCm,attackClip:this.avatarAttackClip||''
    }:null,
    worldCanvas:this.worldEditor?.serialize()||null,
    decals:SurfaceDecals.normalize(this.decals),
    textureLibrary:this.textureFiles.map(t=>({
     id:t.id,name:t.name,type:t.type,width:t.width,height:t.height,
     bytes:t.bytes,folder:t.folder||'my-textures',path:t.path||''
    })),
     catalogLibrary:[...this.catalogMeta.values()].concat(bundledInScene).map(m=>({
     id:m.id,name:m.name,category:m.category,folder:m.folder,
     path:m.path||'',source:m.source||'ZIP',bytes:m.bytes||0
    })),created:new Date().toISOString()};
 }
 async exportGLB(){
  if(!this.entries.some(o=>!o.hidden))return notify('Все детали скрыты. Открой хотя бы одну для GLB','warn');
  try{
   notify('📦 Подготавливаю GLB со стенами, проёмами, крышами и текстурами...','neutral');
   // Ensure IndexedDB images are loaded and actually assigned to meshes
   // before generating the GLB's embedded baseColorTexture images.
   for(const obj of this.entries.filter(e=>!e.hidden)){
    const updated=await this.applySurfaceTo(obj);
    if(!updated)throw Error('Не удалось подготовить материалы для '+obj.kind);
   }
   // Export overlays separately from original walls and floors; each PNG
   // retains real alpha and the building's base maps stay untouched.
   await this.refreshDecals();
   const scene={objects:[...this.entries.filter(obj=>!obj.hidden).map(obj=>({mesh:obj.root,data:{
    id:obj.id,kind:obj.kind,category:obj.category,storey:obj.storey,
    groupId:obj.groupId||null,roomRole:obj.roomRole||null,
    label:obj.label||null,
    suggestedCollider:['wall','floor','roof'].includes(obj.category)||
     obj.kind==='stairsStraight'||obj.kind.startsWith('glb:baked:')||
     bundledModules.has(obj.kind)?'static-mesh':'manual'
   }})),...this.decalMeshes.map((mesh,i)=>({mesh,data:{
    id:-i-1,kind:'decal',category:'decor',storey:0,label:mesh.name,
    suggestedCollider:'none'}}))]};
   const quality=$('exportTextureQuality').value;
   const blob=await SceneExporter.build(scene,{houseOnly:true,
    keepWorldCoordinates:true,textureQuality:quality});
   const check=await SceneExporter.inspect(blob);
   if(check.meshes<1)throw Error('Экспортируемый GLB пуст');
   const metrics=blob.phoenixStats||{};
   $('exportGlbInfo').textContent='Проверено: '+check.meshes+' сеток · '+
    check.images+' текстур · '+check.transparentMaterials+
    ' прозрачных материалов · '+(blob.size/1048576).toFixed(1)+' МБ'+
    (metrics.duplicateImages?' · дублей убрано: '+metrics.duplicateImages:'');
   await PhoenixFiles.saveBlob(blob,'PhoenixBuilder_Scene.glb','model/gltf-binary');
   notify('📦 Игровой GLB проверен: '+check.meshes+' сеток, '+
    check.images+' изображений, '+(blob.size/1048576).toFixed(1)+
    ' МБ. Выбери место сохранения.','success');
  }catch(err){console.error('GLB export',err);
   notify('Ошибка GLB: '+(err?.message||err),'error')}
 }
 async exportBackup(){
  if(!this.entries.length&&!this.textureFiles.length&&
     !this.prefabEditor?.hasContent()&&!this.avatarAssetId)
   return notify('В проекте ещё нет модулей, текстур или игровых объектов','warn');
  try{
   notify('📁 Собираю редактируемый проект вместе с изображениями и GLB...','neutral');
    const installed=[...this.assets.keys(),...this.catalogMeta.keys()]
     .filter(id=>!bundledModules.has(id));
    const usedMobs=this.prefabEditor?.registry.list()
     .map(p=>p.assetId).filter(Boolean)||[];
    await PhoenixFiles.savePortableProject(this.project(),this.textureFiles,
     [...new Set([...this.entries.map(o=>o.kind),...installed,
      ...usedMobs,...(this.avatarAssetId?[this.avatarAssetId]:[])])],
    id=>getAsset(id),'PhoenixBuilder_Project.phoenix.json');
   notify('📁 Резервная копия готова: выбери папку. Внутри текстуры и импортированные модели','success');
  }catch(err){console.error('Project backup',err);
   notify('Ошибка резервной копии: '+(err?.message||err),'error')}
 }
 loadSettingsInit(){
  const panel=$('projectLoadSettingsPanel'),toggle=$('btnProjectLoadSettings');
  $('projectLoadMode').value=this.projectLoadMode;
  $('projectLoadQuality').value=this.projectLoadQuality;
  toggle.onclick=()=>{panel.hidden=!panel.hidden;
   toggle.setAttribute('aria-expanded',String(!panel.hidden))};
  $('btnProjectLoadSettingsClose').onclick=()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false')};
  $('projectLoadMode').onchange=e=>{
   this.projectLoadMode=e.target.value;
   localStorage.setItem('phoenix-builder-project-load-mode-v1',this.projectLoadMode)};
  $('projectLoadQuality').onchange=e=>{
   this.projectLoadQuality=e.target.value;
   localStorage.setItem('phoenix-builder-project-load-quality-v1',this.projectLoadQuality)};
  $('projectLoadPause').onclick=()=>{
   this.projectLoadPaused=!this.projectLoadPaused;
   $('projectLoadPause').textContent=this.projectLoadPaused?'▶ Продолжить':'⏸ Пауза';
   if(this.projectLoadPaused)this.projectLoadProgressUpdate('Текстуры приостановлены',null)
  };
 }
 projectLoadProgressUpdate(message,value){
  const panel=$('projectLoadProgress');panel.hidden=false;
  $('projectLoadProgressText').textContent=message;
  if(value!==null&&value!==undefined)
   $('projectLoadProgressBar').value=Math.min(100,Math.max(0,value));
 }
 async projectLoadYield(generation){
  await new Promise(resolve=>setTimeout(resolve,20));
  if(generation!==this.projectLoadGeneration)throw Error('Загрузка отменена новым проектом');
  while(this.projectLoadPaused){
   await new Promise(resolve=>setTimeout(resolve,110));
   if(generation!==this.projectLoadGeneration)throw Error('Загрузка отменена новым проектом');
  }
 }
 async restoreForOpen(doc){
  // Scene geometry first, texture GPU uploads second. No saved data changes.
  const generation=++this.projectLoadGeneration;
  const careful=this.projectLoadMode==='careful';
  this.activeRestoreQuality=this.projectLoadQuality;
  this.projectLoadPaused=false;
  $('projectLoadPause').textContent='⏸ Пауза';
  this.projectLoadRunning=true;
  try{
   this.projectLoadProgressUpdate('🏠 Восстанавливаю геометрию дома…',5);
   await this.restore(doc,{deferTextures:careful,yieldGeometry:careful,
    onGeometryProgress:(done,total)=>this.projectLoadProgressUpdate(
     '🏠 Геометрия: '+done+' из '+total,Math.round(5+20*done/Math.max(1,total)))});
   if(!careful){
    this.projectLoadProgressUpdate('🚀 Материалы загружаются обычным способом',85);
    await new Promise(resolve=>setTimeout(resolve,50));return;
   }
   // Reset old GPU texture cache only AFTER previous geometry is detached.
   for(const tex of this.textureCache.values())tex.dispose?.();
   this.textureCache.clear();
   const ordered=ProjectLoadStages.ordered(this.entries);
   let failures=0;
   for(let i=0;i<ordered.length;i++){
    await this.projectLoadYield(generation);
    const {entry,group}=ordered[i];
    this.projectLoadProgressUpdate('🎨 '+ProjectLoadStages.names[group]+
     ' · '+(i+1)+' / '+ordered.length,Math.round(25+72*(i+1)/Math.max(1,ordered.length)));
    try{if(!await this.applySurfaceTo(entry))failures++}
    catch(err){console.warn('Texture restore failed:',entry.kind,err);failures++}
    // Every completed item gets its own frame: no simultaneous floor uploads.
    await this.projectLoadYield(generation);
   }
   await this.refreshDecals();this.syncDecalList();
   this.projectLoadProgressUpdate(failures?'Готово · материалов с ошибками: '+failures:
    '✅ Дом и текстуры загружены',100);
   await new Promise(resolve=>setTimeout(resolve,1000));
  }finally{
   if(generation===this.projectLoadGeneration){
    this.activeRestoreQuality=null;this.projectLoadRunning=false;
    this.projectLoadPaused=false;$('projectLoadProgress').hidden=true;
   }
  }
 }
 async importBackup(file){
  if(!file)return;
  if(this.projectLoadRunning){notify('Сначала дождись завершения предыдущей загрузки','warn');return}
  try{
   notify('🏠 Проверяю файл проекта: '+safeName(file.name||'дом')+'...','neutral');
   const parsed=await ProjectOpen.read(file);
   const incoming=parsed.project;
   // This is an explicit destructive scene replacement: never do it silently.
   if(!confirm('🏠 Загрузить проект из «'+safeName(file.name||'файла')+'»?\n'+
     incoming.objects.length+' деталей. ТЕКУЩАЯ СЦЕНА будет заменена.\n'+
     'Перед продолжением рекомендуется экспортировать её резервную копию.')){
    notify('Открытие отменено. Текущий дом сохранён.','neutral');return;
   }
   if(parsed.type==='backup'){
    notify('📁 Восстанавливаю проект, GLB и текстуры...','neutral');
    const doc=parsed.doc;
    const careful=this.projectLoadMode==='careful';
    const result=await PhoenixFiles.unpackProject(doc,(id,data)=>putAsset(id,data),{
     careful,onProgress:(done,total)=>this.projectLoadProgressUpdate(
      '📁 Ресурсы проекта: '+done+' из '+total,Math.round(done/Math.max(1,total)*8))});
    // Assets are now on disk; invalidate stale in-memory maps before restore.
    for(const item of doc.assets){
     if(item.id.startsWith('glb:'))this.assets.delete(item.id);
     if(item.id.startsWith('texture:'))this.textureCache.delete(item.id);
    }
    this.textureFiles=[...this.textureFiles.filter(t=>!
     result.textures.some(x=>x.id===t.id)),
     ...result.textures.map(t=>({
      ...t,...doc.project.textureLibrary?.find(meta=>meta.id===t.id)
     }))];
    localStorage.setItem('phoenix-builder-v2-textures',JSON.stringify(this.textureFiles));
    await this.restoreForOpen(result.project);
   }else{
    // Plain editable project does not embed asset bytes. If any GLB is missing,
    // restore() raises before it replaces the existing scene.
    await this.restoreForOpen(incoming);
   }
   this.history.clear();this.updateHistoryButtons();
   this.renderTextureLibrary();this.renderCatalog();
   this.save();
   notify('✅ Проект открыт: '+this.entries.length+
    ' деталей, '+this.textureFiles.length+' текстур. Можно продолжить строительство.','success');
  }catch(err){console.error('Import project',err);
   $('projectLoadProgress').hidden=true;
   notify('Ошибка открытия проекта: '+(err?.message||err),'error')}
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
   await this.restoreForOpen(JSON.parse(json));
   this.history.clear();this.updateHistoryButtons();
   notify('Проект загружен из сохранения','success');
  }catch(err){notify('Ошибка загрузки: '+err.message,'error')}
 }
 async restore(doc,options={}){
  const preserveUI=!!options.preserveUI;
  const previousUI=preserveUI?{
   tool:this.tool,kind:this.preview?.kind||this.lastPlacementKind,
   selectedId:this.selected?.id,
   folder:this.smartCatalogFolder,group:this.catalogGroup,
   search:$('smartCatalogSearch')?.value||'',
   pages:new Map(this.catalogPages||[])
  }:null;
  if(doc?.version!==2||!Array.isArray(doc.objects))throw Error('Нужен проект Phoenix Builder 2.0');
  // Never carry a wall-chain anchor into another loaded/undo project.
  this.wallChainAnchor=null;this.wallChainPlan=null;this.wallChainManual=false;
  const staged=[];
  const oldRestoring=this.restoringProject;
  if(options.deferTextures)this.restoringProject=true;
  try{
  for(let index=0;index<doc.objects.length;index++){
   const item=doc.objects[index];
   if(!CleanGeometry.isBuiltIn(item.kind)&&!await this.ensureTemplate(item.kind,item.category||'wall'))
    throw Error('Не найден импортированный GLB: '+item.kind);
   const e=this.createEntry(item.kind,item);
   if(!e)throw Error('Невозможно загрузить модуль: '+item.kind);
   e.rot=Number(item.rotation?.y??item.rot)||0;
   e.rotation={x:Number(item.rotation?.x)||0,y:e.rot,
    z:Number(item.rotation?.z)||0};
   this.applyTransform(e);staged.push(e);
   if(options.yieldGeometry&&index%3===2){
    options.onGeometryProgress?.(index+1,doc.objects.length);
    await new Promise(resolve=>setTimeout(resolve,16));
   }
  }
  options.onGeometryProgress?.(doc.objects.length,doc.objects.length);
  }finally{this.restoringProject=oldRestoring}
  // Preserve texture library metadata alongside each internal save. Image
  // bytes remain in IndexedDB; portable backup embeds them for transfer.
  if(Array.isArray(doc.textureLibrary)){
   const records=doc.textureLibrary.filter(t=>t&&typeof t.id==='string'&&
    t.id.startsWith('texture:')&&typeof t.name==='string');
   this.textureFiles=[...this.textureFiles.filter(t=>!
    records.some(record=>record.id===t.id)),...records];
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
      source:meta.source==='PWB'?'PWB':meta.source==='BAKED'?'BAKED':'ZIP',bytes:Number(meta.bytes)||0
    });
    const loaded=this.assets.get(meta.id);
    if(loaded){loaded.name=safeName(meta.name);
     loaded.folder=meta.folder;loaded.category=SmartCatalog.category(meta.folder)}
   }
   this.saveCatalogMeta();
  }
  // All-or-nothing restore: keep current scene if a GLB was lost.
  for(const obj of this.entries)obj.root.removeFromParent();
  this.entries=staged;for(const e of staged){this.scene.add(e.root);this.attachImportedLOD(e)}
  this.bakeSelection=new Set([...this.bakeSelection].filter(id=>staged.some(e=>e.id===id)));
  this.sceneRowsSignature='';
  // Optional v2 extension: old saved projects without decals load unchanged.
  this.decals=SurfaceDecals.normalize(doc.decals);
  if(!options.deferTextures)await this.refreshDecals();
  this.syncDecalList();
  this.setBuildFloor(Number.isInteger(doc.floor)?doc.floor:0);
  this.nextId=Math.max(1,...this.entries.map(e=>e.id+1),doc.nextId||1);
  if(previousUI){
   // Preserve the current selection when the object still exists.
   this.selected=this.entries.find(e=>e.id===previousUI.selectedId)||null;
   this.smartCatalogFolder=previousUI.folder;
   this.catalogGroup=previousUI.group;
   if($('smartCatalogSearch'))$('smartCatalogSearch').value=previousUI.search;
   this.catalogPages=previousUI.pages;
   if(previousUI.kind){
    // Existing preview was not part of the saved scene: recreate it.
    this.selectKind(previousUI.kind);
   }else{this.disposePreview();this.renderCatalog()}
   this.catalogGroup=previousUI.group;
   if(previousUI.tool==='pick'){
    this.selected=this.entries.find(e=>e.id===previousUI.selectedId)||null;
    this.setTool('pick');
   }else this.setTool(previousUI.tool==='place'?'place':'pick');
   this.syncInspector();
  }else{
   this.selected=null;this.setTool('place');this.selectKind('wall');
  }
  // Optional extension: old UV44 JSON files have no phoenixGame key.
  // Load game data only after the building geometry has been restored.
  if(this.prefabEditor){
   try{await this.prefabEditor.loadFromProject(doc.phoenixGame||null)}
   catch(err){
    console.warn('Game data ignored during project restore',err);
    await this.prefabEditor.loadFromProject(null);
    notify('Дом открыт, но игровые объекты в JSON повреждены: '+err.message,'warn');
   }
  }
  try{await this.restoreAvatarFromProject(doc.avatar||null)}
  catch(err){
   console.warn('Avatar GLB recovery failed:',err);
   this.setDefaultAvatar();
   notify('⚠ Персонаж не восстановлен: '+err.message,'warn');
  }
  // World and brush edits use the SAME Builder project history as
  // construction; legacy UV44 JSON stays on its original 128m canvas.
  this.worldEditor?.loadFromProject(doc.worldCanvas||null,{preserveUI});
  // Skill layout is optional; old UV44 JSON projects keep device preferences.
  this.skillEditor?.loadFromProject(doc.phoenixGame?.hudLayout||null);
  if(this.skillDefinitionEditor){
   try{this.skillDefinitionEditor.loadFromProject(doc.phoenixGame?.skills||null)}
   catch(err){
    console.warn('Invalid per-character skills in project',err);
    this.skillDefinitionEditor.loadFromProject(null);
    notify('Навыки из проекта повреждены; строительство не изменено.','warn');
   }
  }
 }
 playAttackAnimation(){
  // Existing imported avatar clips only: no retargeter and no new mixer.
  if(!this.avatarMixer||!this.avatarClips.length)return false;
  const clip=this.avatarClips.find(c=>c.name===this.avatarAttackClip)||
   this.avatarClips.find(c=>/attack|strike|melee|удар|атак/i.test(c.name));
  if(!clip)return false;
  const action=this.avatarActions[clip.name];if(!action)return false;
  for(const other of Object.values(this.avatarActions))
   if(other!==action&&other.isRunning())other.fadeOut(.12);
  action.reset();
  action.clampWhenFinished=true;
  action.setLoop(THREE.LoopOnce,1);
  action.fadeIn(.12).play();
  this.avatarState='attack';
  this.avatarAttackUntil=performance.now()+
   Math.max(350,Math.min(1000,(clip.duration||.6)*1000));
  return true;
 }
 playDeathAnimation(){
  // Existing GLB avatar only; no retargeting or second AnimationMixer.
  if(!this.avatarMixer||!this.avatarClips.length)return false;
  const clip=this.avatarClips.find(c=>/death|die|dead|смерт|гибел/i.test(c.name));
  if(!clip){this.avatarMixer.stopAllAction();this.avatarState='death';return false;}
  const action=this.avatarActions[clip.name];if(!action)return false;
  for(const other of Object.values(this.avatarActions))
   if(other!==action&&other.isRunning())other.fadeOut(.1);
  action.reset();action.clampWhenFinished=true;
  action.setLoop(THREE.LoopOnce,1);
  action.fadeIn(.1).play();
  this.avatarState='death';this.avatarAttackUntil=Infinity;
  return true;
 }
 setAvatarAnimation(moving){
  if(this.playBridge?.active&&this.prefabEditor?.combat?.isPlayerDead())return;
  if(this.playBridge?.active&&this.avatarAttackUntil>performance.now()){
   // One-shot ATTACK may finish before its display timer. If its action is
   // already stopped, immediately restore locomotion instead of leaving
   // the avatar without any skinned pose until the joystick is released.
   const clip=this.avatarClips.find(c=>c.name===this.avatarAttackClip)||
    this.avatarClips.find(c=>/attack|strike|melee|удар|атак/i.test(c.name));
   const attack=clip&&this.avatarActions[clip.name];
   if(attack?.isRunning()&&(attack.getEffectiveWeight?.()??1)>.0001)return;
  }
  if(!this.avatarMixer||!this.avatarClips.length)return;
  const result=PhoenixAvatarMotion.reconcile(
   this.avatarClips,this.avatarActions,this.avatarState,!!moving,THREE,.18);
  if(result.updated){
   this.avatarState=result.state;
   if(result.recovered){
    // Scan soles on the next animated frame after a recovered T-pose.
    // Never re-fit or rescale the imported GLB during movement.
    this.avatarGroundTimer=.22;
   }
  }
 }
 updatePlayer(dt){
  if(this.avatarMixer)this.avatarMixer.update(dt);
  if(this.avatarMixer&&this.avatarFitGroup&&this.avatarRoot&&this.player.visible){
   // Expensive skinned-vertex scan at 5Hz at most on Android; interpolate
   // foot placement every frame. Never recompute AvatarFit.scale here.
   this.avatarGroundTimer+=dt;
   if(this.avatarGroundTimer>=.22){
    this.avatarGroundTimer=0;
    this.refreshAvatarFeet(false);
   }
   AvatarFit.ground(this.avatarFitGroup,this.avatarGroundY,dt);
  }
  if(this.mode!=='character'&&this.mode!=='drone')return;
  if(this.playBridge?.active&&this.prefabEditor?.combat?.isPlayerDead())return;
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
    this.collisionSolver.move(previous,step,this.entries,entry=>{
     const name=this.descriptor(entry.kind)?.name||entry.label||entry.kind||'';
     return entry.kind==='stairsStraight'||
      this.descriptor(entry.kind)?.folder==='bridges'||
      /лестниц|ступен|stair|steps|ladder|мостик|пандус/i.test(name);
    }).displacement:step;
   this.player.position.add(movement);
   if(movement.lengthSq()>.0000001)
    this.player.rotation.y=Math.atan2(movement.x,movement.z);
   this.controls.target.add(movement);this.camera.position.add(movement);
   this.setAvatarAnimation(movement.lengthSq()>.0000001);
  }
  if(this.tool==='place'&&!this.playBridge?.active)this.aimPlacement();
 }
 bind(){
  $('modeBuild').onclick=()=>{this.setTextureTab('parts');this.setMode('build')};
  $('modeCharacter').onclick=()=>this.setMode('character');
  $('btnResetCharacterView').onclick=()=>this.resetCharacterView();
  $('btnGroundAvatar').onclick=()=>this.placeAvatarOnGround();
  $('modeDrone').onclick=()=>this.setMode('drone');
  $('optimizationQuality').onchange=()=>this.updateOptimizer();
  $('optimizationLOD').onchange=()=>this.updateOptimizer();
  $('optimizationAutoResolution').onchange=()=>this.updateAutoResolution();
  $('btnPerfReport').onclick=()=>this.exportPerformanceReport();
  $('tabParts').onclick=()=>this.setTextureTab('parts');
  $('tabCharacter').onclick=()=>this.setTextureTab('character');
  for(const button of document.querySelectorAll('#catalogQuick [data-catalog-group]'))
   button.onclick=()=>{
    this.catalogGroup=button.dataset.catalogGroup;
    this.smartCatalogFolder={structure:'walls',doors:'doors',frames:'frames',
     roofs:'roofs',imports:'misc'}[this.catalogGroup]||'all';
    localStorage.setItem('phoenix-builder-catalog-folder-v2',this.smartCatalogFolder);
    this.renderCatalog();
   };
  $('smartCategoryFilter').onchange=e=>{
   this.smartCatalogFolder=e.target.value;
   localStorage.setItem('phoenix-builder-catalog-folder-v2',this.smartCatalogFolder);
   this.renderCatalog();
  };
  $('smartCatalogSearch').oninput=()=>this.renderCatalog();
  const uploadFold=$('moduleQuickImportFold');
  uploadFold.open=localStorage.getItem('phoenix-builder-upload-fold-v1')==='open';
  uploadFold.addEventListener('toggle',()=>localStorage.setItem(
   'phoenix-builder-upload-fold-v1',uploadFold.open?'open':'closed'));
  $('textureCategoryFilter').onchange=()=>this.renderTextureLibrary();
  $('textureSearch').oninput=()=>this.renderTextureLibrary();
  // Always-on upload buttons. Native Android file chooser is deliberately
  // unfiltered; check real format after selection rather than greying files.
  this.loadSettingsInit();
  $('btnDirectModuleZip').onclick=()=>$('importZip').click();
  $('btnDirectProjectLoad').onclick=()=>$('importProjectBackup').click();
  $('btnDirectSaveProject').onclick=()=>this.exportBackup();
  $('btnZipFromMore').onclick=()=>$('importZip').click();
  $('btnDirectModuleFile').onclick=()=>$('importUniversalModel').click();
  $('importUniversalModel').onchange=e=>{
   const file=e.target.files?.[0];e.target.value='';
   if(!file)return;
   const ext=ModelFormats.ext(file.name);
   if(ext==='glb')this.importGLB(file);
   else if(ModelFormats.accepts(file.name))this.importOtherModel(file);
   else notify('Нужна модель GLB, glTF, FBX, OBJ, VOX, STL или PLY','warn');
  };
  $('btnDirectImage').onclick=()=>$('importTexture').click();
  $('btnDirectLandscapeImage').onclick=()=>$('importLandscapeTexture').click();
  $('btnDirectDecals').onclick=()=>$('decalImageInput').click();
  $('btnDirectTextureZip').onclick=()=>$('importTextureZIP').click();
  $('btnDirectDecalZip').onclick=()=>$('importDecalZIP').click();
  $('importZip').onchange=e=>{
   const file=e.target.files?.[0];e.target.value='';
   this.importZIP(file);
  };
  $('tabTextures').onclick=()=>this.setTextureTab('textures');
  $('faceQuickAll').onclick=()=>this.quickTextureFace('all');
  $('faceQuickPick').onclick=()=>$('btnPickTextureFace').click();
  $('faceQuickSettings').onclick=()=>this.openTextureSettings();
  $('importTextureZIP').onchange=e=>{
   const file=e.target.files?.[0];e.target.value='';
   this.importZIP(file,'textures');
  };
  $('importDecalZIP').onchange=e=>{
   const file=e.target.files?.[0];e.target.value='';
   this.importDecalZIP(file);
  };
  $('btnQuickImportGLB').onclick=()=>{
   this.setTextureTab('parts');
   $('catalogImport').open=true;
   $('catalogImport').scrollIntoView({block:'nearest',behavior:'auto'});
   notify('📥 Выбери папку и формат модели: GLB, FBX, OBJ, VOX, STL или PLY','neutral');
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
  $('avatarHeight').onchange=()=>{if(this.avatarAssetId)this.save()};
  $('avatarAttackClip').onchange=e=>{
   const name=e.target.value;
   this.avatarAttackClip=this.avatarClips.some(c=>c.name===name)?name:'';
   if(this.avatarAssetId)this.save();
  };
  $('enableCollisions').onchange=e=>{
   this.collisionsEnabled=e.target.checked;
   localStorage.setItem('phoenix-builder-collisions',this.collisionsEnabled?'on':'off');
   notify(this.collisionsEnabled?'🛡 Коллизии включены (проверяются реальные проёмы)':
    'Коллизии персонажа выключены','success');
  };
  $('importTexture').onchange=e=>{const files=Array.from(e.target.files||[]);e.target.value='';this.importTextureFiles(files)};
  $('importLandscapeTexture').onchange=e=>{
   const files=Array.from(e.target.files||[]);e.target.value='';
   this.importLandscapeTextures(files);
  };
  $('textureFaceScope').onchange=()=>{
   // Load that side's saved settings into the editor WITHOUT applying paint.
   // The manual touch-paint checkbox is never modified here.
   const obj=this.target();
   if(obj){
    const side=this.appliedSurface(obj);
    this.rememberTextureBrush(side);
    this.activeTextureId=side.imageId||'';
   }
   this.syncInspector();this.renderTextureLibrary();this.syncQuickTextureFaces();
  };
  $('btnPickTextureFace').onclick=()=>{
   if(this.surfaceSidePick){
    this.surfaceSidePick=false;this.syncInspector();this.syncQuickTextureFaces();
    return notify('Покраска касанием отключена. Теперь материал наносится на весь модуль.','neutral');
   }
   // Even the brush button in the right inspector enters the texture tab.
   this.setTextureTab('textures');
   $('textureFaceScope').value='all';
   this.syncInspector();this.syncQuickTextureFaces();
   notify('👆 Кисть включена. Выбери текстуру, коснись нужной стороны стены или пола','success');
  };
  $('btnApplyTexture').onclick=()=>{this.surfaceSidePick=false;this.changeSurface()};
  $('btnClearTexture').onclick=()=>{this.surfaceSidePick=false;this.changeSurface(true)};
  $('btnSurfaceAllWalls').onclick=()=>this.applySurfaceToAllWalls();
  $('btnReadSurface').onclick=()=>{
   this.textureBrush=null;this.textureMappingChosen=false;this.pendingTexture=null;
   this.activeTextureId=this.appliedSurface(this.target()).imageId;
   localStorage.removeItem(textureBrushKey);
   this.syncInspector();this.renderTextureLibrary();
  };
  $('btnWorldSeamless').onclick=()=>{
   $('textureMapping').value='seamless';
   $('textureMapping').dispatchEvent(new Event('change',{bubbles:true}));
   $('textureInspector').open=true;
   notify('🌍 Режим «Бесшовно по миру» выбран. Примени одну текстуру к соседним плитам.','success');
  };
  for(const id of [...Object.keys(textureFields),'textureApplyFrames'])
   $(id).onchange=()=>{
    if(id==='textureMapping')this.textureMappingChosen=true;
    if(id==='textureStyle'&&$('textureStyle').value==='custom'&&
      $('textureMapping').value==='auto'&&!this.textureMappingChosen)
     $('textureMapping').value='module';
    this.rememberTextureBrush(this.surfaceFromControls(this.target()));
    this.syncSeamlessScaleUI();
   };
  $('textureSeamlessSize').oninput=e=>{
   $('textureTileMeters').value=Number(e.target.value).toFixed(2);
   this.syncSeamlessScaleUI();
  };
  $('textureSeamlessSize').onchange=()=>
   this.rememberTextureBrush(this.surfaceFromControls(this.target()));
  $('btnDecalImage').onclick=()=>$('decalImageInput').click();
  $('btnDecalZIP').onclick=()=>$('importDecalZIP').click();
  $('btnOpenDecalLibrary').onclick=()=>{
   this.setTextureTab('textures');
   $('textureCategoryFilter').value='transparent-graffiti';
   this.renderTextureLibrary();
  };
  $('decalImageInput').onchange=e=>{
   const files=Array.from(e.target.files||[]);e.target.value='';
   this.importDecalImages(files);
  };
  $('btnPlaceDecal').onclick=()=>this.startDecalPlacement();
  $('decalFit').onchange=$('decalWholeRoom').onchange=()=>this.syncDecalSizeMode();
  $('decalWidth').onchange=() => this.syncDecalAspect('width');
  $('decalHeight').onchange=() => this.syncDecalAspect('height');
  $('decalLockAspect').onchange=() => this.syncDecalAspect('width');
  this.syncDecalSizeMode();
  $('btnMoveDecal').onclick=()=>this.moveSelectedDecal();
  $('decalSelect').onchange=()=>this.syncDecalControls();
  $('btnUpdateDecal').onclick=()=>this.updateDecal();
  $('btnDeleteDecal').onclick=()=>this.deleteDecal();
  for(const [id,direction] of [
   ['textureShiftUp','up'],['textureShiftDown','down'],
   ['textureShiftLeft','left'],['textureShiftRight','right'],
   ['textureShiftReset','reset']])
   $(id).onclick=()=>this.shiftTexture(direction);
  for(const id of ['textureRoughness','textureMetalness','textureRelief'])
   $(id).oninput=e=>$(id+'Value').textContent=Number(e.target.value).toFixed(2);
  $('btnOpeningTool').onclick=()=>this.startOpeningTool();
  $('btnQuickOpening').onclick=()=>this.startOpeningTool();
  $('btnShapeToolTop').onclick=()=>this.showShapePanel();
  $('btnShapeClose').onclick=()=>this.showShapePanel();
  $('btnShapeApply').onclick=()=>this.applyShapeCut();
  $('btnShapeReset').onclick=()=>this.applyShapeCut(true);
  $('shapeModeManual').onclick=()=>this.setShapeMode('manual');
  $('shapeModeObject').onclick=()=>this.setShapeMode('object');
  $('btnShapePlace').onclick=()=>this.shapePickCentreStart();
  $('btnShapeChooseObject').onclick=()=>this.shapeSourcePickStart();
  for(const id of ['shapeCutType','shapeCutMode','shapeCutWidth','shapeCutDepth',
   'shapeCutX','shapeCutZ','shapeCutAngle'])
   $(id).addEventListener('input',()=>this.updateShapePreview());
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
  for(const mode of ['move','rotate','scale','universal']){
   const cap=mode[0].toUpperCase()+mode.slice(1);
   $('gizmo'+cap).onclick=()=>this.selectGizmoMode(mode);
   $('quickGizmo'+cap).onclick=()=>this.selectGizmoMode(mode);
  }
  $('gizmoQuickToggle').onclick=()=>{
   this.gizmoQuickOpen=!this.gizmoQuickOpen;this.updateGizmoDock();
  };
  $('quickGizmoCad').onclick=()=>{
   this.cadPanelOpen=!this.cadPanelOpen;
   this.gizmo.toggleCad(true);this.updateGizmoDock();
  };
  $('btnGizmoApplyDimensions').onclick=()=>this.applyGizmoCadDimensions();
  $('quickGizmoFocus').onclick=()=>this.focusGizmoView();
  $('quickViewFront').onclick=()=>this.focusGizmoView('front');
  $('quickViewSide').onclick=()=>this.focusGizmoView('side');
  $('quickViewTop').onclick=()=>this.focusGizmoView('top');
  $('btnHideUi').onclick=()=>document.body.classList.toggle('uiHidden');
  $('sceneSearch').oninput=()=>{this.sceneRowsSignature='';this.renderSceneManager()};
  $('sceneFloorFilter').onchange=()=>{
   this.sceneRowsSignature='';this.renderSceneManager();
  };
  $('btnSceneRename').onclick=()=>this.renameSceneObject();
  $('sceneName').addEventListener('keydown',e=>{
   if(e.key==='Enter'){e.preventDefault();this.renameSceneObject();}
  });
  $('btnSave').onclick=()=>this.save();
  $('btnLoad').onclick=()=>this.load();
  $('btnExportGLB').onclick=()=>this.exportGLB();
  $('btnExportGameManifest').onclick=()=>this.exportGameManifest();
  $('btnBuildRoom').onclick=()=>this.createRoom();
  $('btnCopyRoom').onclick=()=>this.copySelectedRoom();
  $('btnCopyStorey').onclick=()=>this.copyCurrentStorey();
  $('btnUndo').onclick=()=>this.historyAction('undo');
  $('btnRedo').onclick=()=>this.historyAction('redo');
  this.updateHistoryButtons();
  $('btnBackupProject').onclick=()=>this.exportBackup();
  $('btnQuickProjectJson').onclick=()=>this.exportBackup();
  $('btnImportBackup').onclick=()=>$('importProjectBackup').click();
  $('importProjectBackup').onchange=e=>{
   this.importBackup(e.target.files?.[0]);
   e.target.value='';
  };
  $('btnPick').onclick=()=>{this.setTextureTab('parts');this.setTool('pick');this.syncInspector()};
  $('btnPlace').onclick=()=>{this.setTextureTab('parts');this.selected=null;this.setTool('place');this.syncInspector()};
  $('btnConfirm').onclick=()=>{
   if(this.libraryTab==='textures')this.setTextureTab('parts');
   if(this.mode!=='build')this.aimPlacement();
   this.place();
  };
  $('btnCancel').onclick=()=>{
   if(this.surfaceSidePick)this.setTextureTab('parts');
   this.setTool('pick');this.syncInspector();
  };
  $('btnLevelDown').onclick=()=>this.stepBuildFloor(-1);
  $('btnLevelUp').onclick=()=>this.stepBuildFloor(1);
  $('magnet').onchange=e=>{
   this.magnet=e.target.checked;
   if(!this.magnet){this.wallChainAnchor=null;this.wallChainPlan=null;}
   this.updatePreview(this.cursor);
  };
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
  $('btnBakeAddCurrent').onclick=()=>{
   if(this.selected)this.toggleBakeSelection(this.selected.id,true);
  };
  $('btnBakeClear').onclick=()=>{
   this.bakeSelection.clear();this.sceneRowsSignature='';this.renderSceneManager();
  };
  $('btnBakeModule').onclick=()=>this.bakeSelectedModule();
  $('btnBakeBackup').onclick=()=>this.exportBackup();
  $('btnSaveModule').onclick=()=>this.saveModulePreset();
  $('btnApplyFloorCut').onclick=()=>this.applyFloorSettings();
  $('btnResetFloorCut').onclick=()=>this.applyFloorSettings(true);
  $('btnQuickRoomTrim').onclick=()=>this.applyAutomaticTrim();
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
  $('importOtherModel').onchange=e=>{
   this.importOtherModel(e.target.files?.[0]);e.target.value='';
  };
  $('importAvatar').onchange=e=>{this.importAvatar(e.target.files?.[0]);e.target.value=''};
  for(const id of ['scaleAll','sizeX','sizeY','sizeZ','thickness','posX','posY','posZ','rotX','rotY','rotZ'])
   $(id).onchange=()=>this.editField(id);
  $('btnRotate').onclick=()=>{
   const obj=this.target();if(!obj)return;
   obj.rot+=Math.PI/2;this.applyTransform(obj);
   this.queueDecalRebuild();
   this.updatePreview(this.cursor);this.syncInspector();
  };
  $('btnDuplicate').onclick=()=>this.duplicate();
  $('btnMirrorDuplicate').onclick=$('quickMirrorDuplicate').onclick=()=>this.duplicate(true);
  $('btnDelete').onclick=()=>this.delete();
  $('btnSetSockets').onclick=()=>this.setSockets();
  $('btnClearSockets').onclick=()=>this.clearSockets();
  this.canvas.addEventListener('pointerdown',e=>{
   if(this.playBridge?.active)return;
   if(e.isPrimary===false||(!this.shapePlaceMode&&!this.shapeSourceMode))return;
   // Consume before OrbitControls, regular selection, Gizmo and drag handlers.
   this.shapeConsumedPointer=e.pointerId;
   this.pointerStart=null;
   if(this.shapeSourceMode){
    this.shapeSourceAt(e);
   }else{
    this.shapeDragPointer=e.pointerId;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.updateShapeByPointer(e);
   }
   e.preventDefault();e.stopImmediatePropagation();
  },true);
  this.canvas.addEventListener('pointermove',e=>{
   if(this.playBridge?.active)return;
   if(this.shapeDragPointer!==e.pointerId)return;
   this.updateShapeByPointer(e);
   e.preventDefault();e.stopImmediatePropagation();
  },true);
  for(const type of ['pointerup','pointercancel'])
   this.canvas.addEventListener(type,e=>{
    if(this.playBridge?.active)return;
    if(this.shapeConsumedPointer!==e.pointerId&&this.shapeDragPointer!==e.pointerId)return;
    if(this.shapeDragPointer===e.pointerId){
     if(type==='pointerup')this.updateShapeByPointer(e);
     this.cancelShapeTouch();
     if(type==='pointerup')notify('✅ Контур поставлен. Проверь размер и нажми «Применить вырез».','success');
    }
    this.shapeConsumedPointer=null;
    this.pointerStart=null;
    e.preventDefault();e.stopImmediatePropagation();
   },true);
  this.canvas.addEventListener('pointerdown',e=>{
   if(this.playBridge?.active)return;
   if(!SceneManager.editingAllowed(this.selected)||this.surfaceSidePick||this.cameraFocusPick||this.openingPickMode||this.decalPickMode||this.tool!=='pick'||!this.selected||!this.gizmo.start(e))return;
   this.gizmoBefore=this.project();
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
    if(this.gizmoBefore)this.recordEdit(this.gizmoBefore);
    this.queueDecalRebuild();
    if(this.selected){
     this.selected.root.updateMatrixWorld(true);
     if(this.selected.surface?.style!=='none')this.applySurfaceTo(this.selected);
    }
    this.syncInspector();
    notify('Гизмо: изменение выполнено, параметры сохраняются в проекте','success');
   }
   this.gizmoBefore=null;
   // Do not deactivate after pointerup: the user owns the tool's on/off state.
   this.updateGizmoDock();
   e.preventDefault();e.stopImmediatePropagation();
  };
  for(const type of ['pointerup','pointercancel'])
   this.canvas.addEventListener(type,finishGizmo,true);
  this.canvas.addEventListener('pointerdown',e=>{if(!this.playBridge?.active)this.beginObjectDrag(e)},true);
  this.canvas.addEventListener('pointermove',e=>{if(!this.playBridge?.active)this.continueObjectDrag(e)},true);
  for(const type of ['pointerup','pointercancel'])
   this.canvas.addEventListener(type,e=>{if(!this.playBridge?.active)this.finishObjectDrag(e)},true);
  this.canvas.addEventListener('pointerdown',e=>{
   if(this.playBridge?.active)return;
   // A second finger must not generate a click/placement at the end of pan.
   if(e.isPrimary===false){this.pointerStart=null;return}
   this.pointerStart={pointerId:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now()};
  });
  this.canvas.addEventListener('pointerup',e=>{
   if(this.playBridge?.active)return;
   const start=this.pointerStart;
   if(!start||e.pointerId!==start.pointerId||e.isPrimary===false)return;
   this.pointerStart=null;
   if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)return;
   if(this.prefabEditor?.pendingPlace||this.prefabEditor?.pendingWaypointId){
    this.prefabEditor.placeFromEvent(e);return;
   }
   if(this.shapeSourceMode){this.shapeSourceAt(e);return}
   if(this.decalPickMode){this.placeDecalAt(e);return}
   if(this.surfaceSidePick&&this.libraryTab==='textures'){
    this.pickTextureFace(e);return;
   }
   if(this.cameraFocusPick){this.setCameraFocusAt(e);return}
   if(this.tool==='pick'){
    if(this.openingPickMode)this.pickOpeningCentre(e);
    else this.pick(e);
    return;
   }
   const point=this.locatePointer(e);
   if(point)this.cursor.copy(point);
   if(this.preview?.category==='wall')this.wallChainManual=true;
   this.updatePreview(this.cursor,true,this.ray);
  });
  this.canvas.addEventListener('pointercancel',()=>{this.pointerStart=null});
  this.canvas.addEventListener('pointermove',e=>{
   if(this.playBridge?.active||this.prefabEditor?.pendingPlace)return;
   if(e.buttons||this.cameraFocusPick||this.tool!=='place')return;
   const point=this.floor===0&&this.worldEditor?.hasElevations()?
    this.worldEditor.pointerTerrain(e):this.rayPoint(e);
   if(!point&&!this.floor)return;
   if(point)this.cursor.copy(point);
   if(this.preview?.category==='wall')this.wallChainManual=true;
   this.updatePreview(this.cursor,true,this.ray);
  });
  window.addEventListener('keydown',e=>{
   if(this.playBridge?.handleKeyDown(e))return;
   const tag=document.activeElement?.tagName;
   if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
   if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='z'){
    e.preventDefault();this.historyAction(e.shiftKey?'redo':'undo');return;
   }
   if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='y'){
    e.preventDefault();this.historyAction('redo');return;
   }
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
