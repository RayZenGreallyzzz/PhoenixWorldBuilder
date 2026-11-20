/* Phoenix Prefab Editor 0.1 — visual mobs/NPCs without game code.
 * Uses Builder's already-imported GLB cache and its single render loop.
 * Never inserts game entities into Builder's construction entries.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixPrefabEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class PhoenixPrefabEditor{
  constructor(builder){
   if(!builder?.playBridge||!window.PhoenixCore||!window.PhoenixPrefabs)
    throw Error('Phoenix Core, prefabs and PLAY bridge are required');
   this.b=builder;this.registry=new PhoenixPrefabs.PhoenixPrefabCatalog();
   this.world=builder.playBridge.gameWorld;
   this.layer=new THREE.Group();this.layer.name='phoenix:game-objects';
   builder.scene.add(this.layer);
   this.rendered=new Map();this.selectedId='';this.pendingPlace='';
   this.playing=false;this.loadGeneration=0;this.previewBefore=null;
   this.panel=document.getElementById('phoenixPrefabPanel');
   if(!this.panel)throw Error('Prefab Editor UI is missing');
   this.bind();this.refreshModels();this.refresh();
  }
  el(id){return document.getElementById(id);}
  status(message){
   const el=this.el('phoenixPrefabStatus');if(el)el.textContent=message;
  }
  option(value,label){
   const o=document.createElement('option');o.value=value;o.textContent=label;return o;
  }
  open(){
   if(this.b.playBridge.active)return;
   this.refreshModels();this.panel.hidden=false;
  }
  close(){this.panel.hidden=true;this.cancelPlacement();}
  toggle(){this.panel.hidden?this.open():this.close();}
  bind(){
   this.el('btnPhoenixPrefabs').addEventListener('click',()=>this.toggle());
   this.el('btnPrefabClose').addEventListener('click',()=>this.close());
   this.el('btnPrefabNew').addEventListener('click',()=>this.newDraft());
   this.el('btnPrefabSave').addEventListener('click',()=>this.saveDraft());
   this.el('btnPrefabDelete').addEventListener('click',()=>this.deletePrefab());
   this.el('btnPrefabPlace').addEventListener('click',()=>this.beginPlacement());
   this.el('btnPrefabCancelPlace').addEventListener('click',()=>this.cancelPlacement());
   this.el('btnPrefabRemoveEntity').addEventListener('click',()=>this.removeSelectedEntity());
   this.el('phoenixPrefabSaved').addEventListener('change',e=>this.selectPrefab(e.target.value));
   this.el('phoenixPrefabAsset').addEventListener('change',()=>this.refreshClips());
   this.el('btnPrefabImportGlb').addEventListener('click',()=>this.el('importUniversalModel').click());
  }
  refreshModels(selectId){
   const select=this.el('phoenixPrefabAsset'),wanted=selectId===undefined?select.value:selectId;
   const names=new Map();
   for(const [id,item] of this.b.catalogMeta||[])
    if(id.startsWith('glb:'))names.set(id,item.name||id);
   for(const [id,item] of this.b.assets||[])
    if(id.startsWith('glb:'))names.set(id,item.name||id);
   for(const entry of this.b.entries||[])
    if(entry.kind?.startsWith('glb:')&&!names.has(entry.kind))
     names.set(entry.kind,this.b.descriptor(entry.kind)?.name||entry.kind);
   select.replaceChildren(this.option('','Простая капсула (без GLB)'));
   for(const [id,name] of names)select.appendChild(this.option(id,name));
   if(wanted&&!names.has(wanted))select.appendChild(
    this.option(wanted,'⚠ GLB пока отсутствует: '+wanted));
   select.value=wanted||'';
   if(select.value!==(wanted||''))select.value='';
   this.refreshClips(false);
  }
  async refreshClips(load=true){
   const id=this.el('phoenixPrefabAsset').value,listing=this.el('phoenixPrefabClipList');
   const serial=++this.clipGeneration;
   if(id&&load&&!this.b.assets.has(id)){
    try{await this.b.ensureTemplate(id,'prop')}
    catch(error){this.status('GLB не удалось загрузить: '+error.message)}
   }
   if(serial!==this.clipGeneration)return;
   const clips=(id&&this.b.assets.get(id)?.animations)||[];
   listing.replaceChildren();
   for(const clip of clips)listing.appendChild(this.option(clip.name,clip.name));
   this.el('phoenixPrefabClips').textContent=id?
    clips.length?'Анимаций в GLB: '+clips.map(c=>c.name).slice(0,12).join(', '):
    'Анимации пока не найдены. Можно оставить поля пустыми.':
    'Заглушка без анимаций. Выбери готовый анимированный GLB.';
  }
  newDraft(){
   this.selectedId='';
   this.el('phoenixPrefabName').value='Новый моб';
   this.el('phoenixPrefabType').value='mob';
   this.el('phoenixPrefabFaction').value='enemy';
   this.el('phoenixPrefabAsset').value='';
   this.el('phoenixPrefabHP').value='100';
   this.el('phoenixPrefabDamage').value='10';
   this.el('phoenixPrefabSpeed').value='2';
   for(const a of ['Idle','Walk','Attack'])this.el('phoenixPrefab'+a).value='';
   this.el('phoenixPrefabSaved').value='';
   this.refreshClips(false);this.status('Создай шаблон и поставь его на сцену.');
  }
  collect(){
   return {
    name:this.el('phoenixPrefabName').value,
    type:this.el('phoenixPrefabType').value,
    faction:this.el('phoenixPrefabFaction').value,
    assetId:this.el('phoenixPrefabAsset').value,
    stats:{hp:Number(this.el('phoenixPrefabHP').value),
     damage:Number(this.el('phoenixPrefabDamage').value),
     speed:Number(this.el('phoenixPrefabSpeed').value)},
    animations:{idle:this.el('phoenixPrefabIdle').value.trim(),
     walk:this.el('phoenixPrefabWalk').value.trim(),
     attack:this.el('phoenixPrefabAttack').value.trim()}
   };
  }
  selectPrefab(id){
   const p=this.registry.get(id);if(!p){this.newDraft();return;}
   this.selectedId=id;
   this.el('phoenixPrefabName').value=p.name;
   this.el('phoenixPrefabType').value=p.type;
   this.el('phoenixPrefabFaction').value=p.faction;
   this.refreshModels(p.assetId);
   this.el('phoenixPrefabHP').value=String(p.stats.hp);
   this.el('phoenixPrefabDamage').value=String(p.stats.damage);
   this.el('phoenixPrefabSpeed').value=String(p.stats.speed);
   for(const a of ['idle','walk','attack'])
    this.el('phoenixPrefab'+a[0].toUpperCase()+a.slice(1)).value=p.animations[a]||'';
   this.el('phoenixPrefabSaved').value=id;
   this.refreshClips();
  }
  refresh(){
   const selected=this.el('phoenixPrefabSaved');selected.replaceChildren(
    this.option('','— Новый шаблон —'));
   for(const p of this.registry.list())selected.appendChild(
    this.option(p.id,(p.type==='npc'?'🧑 ':'🐺 ')+p.name));
   selected.value=this.selectedId||'';
   const placed=this.el('phoenixPrefabEntities'),previous=placed.value;
   placed.replaceChildren(this.option('','— Выбери моба на сцене —'));
   for(const id of this.world.entityIds()){
    const prefab=this.world.getComponent(id,'prefab'),tr=this.world.getComponent(id,'transform');
    if(!prefab||!tr)continue;
    const p=this.registry.get(prefab.id);
    placed.appendChild(this.option(id,(p?.name||prefab.id)+' · '+
     tr.position.map(n=>Number(n).toFixed(1)).join(', ')));
   }
   placed.value=[...placed.options].some(o=>o.value===previous)?previous:'';
   this.el('phoenixPrefabCounts').textContent=
    'Шаблонов: '+this.registry.list().length+' · На сцене: '+(placed.options.length-1);
  }
  saveDraft(){
   if(this.b.playBridge.active)return;
   try{
    const value=this.collect();
    if(this.selectedId)this.registry.update(this.selectedId,value);
    else this.selectedId=this.registry.create(value);
    this.refresh();this.b.save();
    this.status('✅ Шаблон сохранён. Изменения применяются к новым экземплярам.');
   }catch(err){this.status('Ошибка шаблона: '+err.message)}
  }
  deletePrefab(){
   if(!this.selectedId)return this.status('Выбери шаблон для удаления.');
   const used=this.world.entityIds().some(id=>
    this.world.getComponent(id,'prefab')?.id===this.selectedId);
   if(used)return this.status('Сначала удали экземпляры этого шаблона со сцены.');
   this.registry.remove(this.selectedId);this.newDraft();this.refresh();this.b.save();
   this.status('Шаблон удалён.');
  }
  beginPlacement(){
   if(this.b.playBridge.active)return this.status('Размещать мобов можно в EDIT.');
   const p=this.registry.get(this.selectedId);
   if(!p)return this.status('Сначала сохрани или выбери шаблон.');
   if(this.b.projectLoadRunning||this.b.restoringProject)
    return this.status('Заверши загрузку проекта.');
   this.cancelPlacement();
   this.b.setMode('build');this.b.setTool('place');
   this.previewBefore={
    root:this.b.preview?.root||null,
    outline:this.b.previewOutline||null,
    visible:this.b.preview?.root?.visible,
    outlineVisible:this.b.previewOutline?.visible
   };
   this.pendingPlace=p.id;
   if(this.previewBefore.root)this.previewBefore.root.visible=false;
   if(this.previewBefore.outline)this.previewBefore.outline.visible=false;
   this.panel.hidden=true;
   this.status('Коснись пола или земли на сцене, чтобы поставить '+p.name+'.');
   const status=this.el('status');if(status)status.textContent=
    '👆 Поставь '+p.name+' касанием пола · 🧬 Prefabs — отмена';
  }
  cancelPlacement(){
   if(!this.pendingPlace)return;
   this.pendingPlace='';
   const old=this.previewBefore;this.previewBefore=null;
   if(old?.root&&this.b.preview?.root===old.root)
    old.root.visible=old.visible;
   if(old?.outline&&this.b.previewOutline===old.outline)
    old.outline.visible=old.outlineVisible;
  }
  findPoint(event){
   const r=this.b.canvas.getBoundingClientRect();
   if(!r.width||!r.height)return null;
   const pointer=new THREE.Vector2((event.clientX-r.left)/r.width*2-1,
    -(event.clientY-r.top)/r.height*2+1);
   const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.b.camera);
   const floors=this.b.entries.filter(e=>e.category==='floor'&&!e.hidden)
    .map(e=>e.root);
   const hits=ray.intersectObjects(floors,true);
   for(const hit of hits){
    if(!hit.face)continue;
    const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if(normal.y>.55)return hit.point.clone();
   }
   const ground=ray.intersectObject(this.b.ground,false);
   return ground.length?ground[0].point.clone().setY(0):null;
  }
  placeholder(){
   const group=new THREE.Group();
   group.name='phoenix:placeholder';
   const body=new THREE.Mesh(new THREE.CapsuleGeometry(.28,.95,3,6),
    new THREE.MeshStandardMaterial({color:0xde8134,roughness:1}));
   body.position.y=1.03;group.add(body);return group;
  }
  async meshFor(assetId,allowMissing=false){
   if(!assetId)return {root:this.placeholder(),missing:false,clips:[]};
   try{
    const ok=await this.b.ensureTemplate(assetId,'prop');
    if(!ok)throw Error('Нет файла модели '+assetId);
    const root=this.b.cloneTemplate(assetId);
    if(!root)throw Error('Не удалось клонировать '+assetId);
    return {root,missing:false,clips:this.b.assets.get(assetId)?.animations||[]};
   }catch(err){
    if(!allowMissing)throw err;
    console.warn('Phoenix missing asset, using marker:',assetId,err);
    return {root:this.placeholder(),missing:true,clips:[]};
   }
  }
  attach(id,render,transform){
   render.root.name='phoenix:'+id;
   render.root.userData.phoenixEntityId=id;
   render.root.position.fromArray(transform.position);
   render.root.rotation.y=transform.yaw||0;
   this.layer.add(render.root);this.rendered.set(id,render);
   if(this.playing)this.playIdle(id,render);
  }
  playIdle(id,render){
   if(!render.clips?.length)return;
   const prefabId=this.world.getComponent(id,'prefab')?.id;
   const template=this.registry.get(prefabId);
   const clips=render.clips;
   const clip=clips.find(c=>c.name===template?.animations?.idle)||
    clips.find(c=>/idle|stand|rest|покой/i.test(c.name))||clips[0];
   if(!clip)return;
   render.mixer=new THREE.AnimationMixer(render.root);
   render.mixer.clipAction(clip).play();
  }
  setPlaying(yes){
   this.playing=!!yes;
   for(const [id,render] of this.rendered){
    if(render.mixer){render.mixer.stopAllAction();render.mixer.uncacheRoot(render.root);render.mixer=null}
    if(this.playing)this.playIdle(id,render);
   }
  }
  update(dt){
   if(!this.playing)return;
   for(const render of this.rendered.values())render.mixer?.update(dt);
  }
  async createEntity(prefabId,position){
   const p=this.registry.get(prefabId);
   if(!p)throw Error('Шаблон не найден');
   if(this.world.entityIds().length>=80)throw Error('На сцене уже 80 игровых объектов');
   if(!Array.isArray(position)||position.length!==3||
      !position.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000))
    throw Error('Некорректная позиция');
   const render=await this.meshFor(p.assetId);
   let id;
   try{
    id=this.world.createEntity(p.name);
    this.world.setComponent(id,'prefab',{id:p.id});
    this.world.setComponent(id,'transform',{position:position.slice(),yaw:0});
    this.world.setComponent(id,'stats',p.stats);
    this.world.setComponent(id,'character',{type:p.type,faction:p.faction,
     assetId:p.assetId,animations:p.animations});
    this.attach(id,render,{position,yaw:0});
   }catch(err){
    render.root.removeFromParent();
    if(id)this.world.removeEntity(id);
    throw err;
   }
   this.refresh();this.b.save();return id;
  }
  async placeFromEvent(event){
   if(!this.pendingPlace||this.b.playBridge.active)return false;
   const id=this.pendingPlace;
   const hit=this.findPoint(event);
   if(!hit){this.status('Не найден пол или земля. Попробуй другой участок.');return true;}
   // One tap places one mob. Await async GLB loads outside the input handler.
   this.cancelPlacement();
   try{
    await this.createEntity(id,[hit.x,hit.y,hit.z]);
    this.status('✅ Моб установлен. Нажми ▶ PLAY для просмотра анимации Idle.');
   }catch(err){this.status('Не удалось установить моба: '+err.message)}
   return true;
  }
  removeRender(id){
   const render=this.rendered.get(id);if(!render)return;
   if(render.mixer){render.mixer.stopAllAction();render.mixer.uncacheRoot(render.root)}
   render.root.removeFromParent();this.rendered.delete(id);
   // Geometry/materials may be shared with Builder's GLB cache: never dispose them here.
  }
  removeSelectedEntity(){
   if(this.b.playBridge.active)return;
   const id=this.el('phoenixPrefabEntities').value;
   if(!this.world.hasEntity(id))return this.status('Выбери моба из списка.');
   this.removeRender(id);this.world.removeEntity(id);
   this.refresh();this.b.save();this.status('Экземпляр убран со сцены.');
  }
  serialize(){
   return {version:1,catalog:this.registry.serialize(),world:this.world.serialize()};
  }
  async loadFromProject(doc){
   this.cancelPlacement();
   let registry=new PhoenixPrefabs.PhoenixPrefabCatalog();
   let world=new PhoenixCore.PhoenixWorld();
   if(doc!==null&&doc!==undefined){
    if(!doc||doc.version!==1)throw Error('Неподдерживаемые игровые данные');
    registry.load(doc.catalog);
    world.load(doc.world);
    if(world.entityIds().length>80)throw Error('Превышен лимит игровых объектов');
    for(const id of world.entityIds()){
     const p=world.getComponent(id,'prefab'),tr=world.getComponent(id,'transform');
     if(!p||!registry.get(p.id)||!tr||
        !Array.isArray(tr.position)||tr.position.length!==3||
        !tr.position.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000))
      throw Error('Некорректный игровой объект '+id);
    }
   }
   const token=++this.loadGeneration;
   for(const id of [...this.rendered.keys()])this.removeRender(id);
   this.registry=registry;this.world=world;this.b.playBridge.gameWorld=world;
   this.selectedId='';this.refreshModels();this.newDraft();this.refresh();
   let missing=0;
   for(const id of world.entityIds()){
    if(token!==this.loadGeneration)return;
    const p=world.getComponent(id,'prefab');
    const prefab=registry.get(p.id),tr=world.getComponent(id,'transform');
    const render=await this.meshFor(prefab.assetId,true);
    if(token!==this.loadGeneration)return;
    if(render.missing)missing++;
    this.attach(id,render,tr);
    // Yield to WebView between instances; do not stall camera/project loading.
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   this.refresh();
   if(missing)this.status('⚠ Не найдены GLB для '+missing+' игровых объектов; показаны заглушки.');
   else this.status('Игровых объектов восстановлено: '+world.entityIds().length);
  }
 }
 return PhoenixPrefabEditor;
});
