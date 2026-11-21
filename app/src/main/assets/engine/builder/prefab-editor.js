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
 const Features=(typeof globalThis!=='undefined'&&globalThis.PhoenixMobFeatures)||
  (typeof require==='function'?require('../core/phoenix-mob-features.js'):null);
 const Path=(typeof globalThis!=='undefined'&&globalThis.PhoenixPatrolPath)||
  (typeof require==='function'?require('../core/phoenix-patrol-path.js'):null);
 class PhoenixPrefabEditor{
  constructor(builder){
   if(!builder?.playBridge||!window.PhoenixCore||!window.PhoenixPrefabs||!window.PhoenixAI||!window.PhoenixAnimations)
    throw Error('Phoenix Core, prefabs and PLAY bridge are required');
   this.b=builder;this.registry=new PhoenixPrefabs.PhoenixPrefabCatalog();
   this.world=builder.playBridge.gameWorld;
   this.layer=new THREE.Group();this.layer.name='phoenix:game-objects';
   builder.scene.add(this.layer);
   this.rendered=new Map();this.selectedId='';this.pendingPlace='';
   this.playing=false;this.loadGeneration=0;this.clipGeneration=0;this.previewBefore=null;
   this.aiCursor=0;this.collider=null;this.pendingWaypointId='';
   this.routeDraft=null;
   this.respawner=new Features.Respawner();this.aiTime=0;
   this.previewAttackTime=0;this.previewAttackEntity='';
   this.routeHelper=new THREE.Group();this.routeHelper.name='phoenix:edit:route';
   builder.scene.add(this.routeHelper);
   this.combat=new PhoenixCombat.Session({damage:25,range:2.7,cooldown:.65});
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
   this.b.skillEditor?.close();this.b.skillDefinitionEditor?.close();
   // Opening the character editor deactivates any previously selected wall.
   if(this.b.tool==='place')this.b.setTool('pick');
   this.refreshModels();this.panel.hidden=false;
   this.drawRoute(this.selectedEntity());
  }
  close(){this.cancelRouteDrawing();this.panel.hidden=true;this.routeHelper.visible=false;this.cancelPlacement();}
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
   // Dedicated NPC import. Never route through the construction importer input.
   this.el('btnPrefabImportGlb').addEventListener('click',()=>this.el('phoenixMobImportModel').click());
   this.el('phoenixMobImportModel').addEventListener('change',async event=>{
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    if(!/\.glb$/i.test(file.name)){
     this.status('Для мобов нужен анимированный GLB. Выбери файл .glb.');
     return;
    }
    const button=this.el('btnPrefabImportGlb');
    if(button)button.disabled=true;
    try{
     const id=await this.b.importGLB(file,{forMob:true});
     if(!id)this.status('Ошибка импорта GLB. Проверь файл.');
    }catch(error){
     this.status('Не удалось загрузить моба: '+(error?.message||error));
    }finally{if(button)button.disabled=false}
   });
   const on=(id,type,fn)=>this.el(id)?.addEventListener(type,fn);
   on('phoenixPrefabEntities','change',()=>this.selectEntity());
   on('btnPrefabApplyTransform','click',()=>this.applyEntityTransform());
   on('btnPrefabSnapGround','click',()=>this.snapEntityToGround());
   on('btnPrefabApplyNickname','click',()=>this.applyEntityNickname());
   on('btnPrefabApplyPreset','click',()=>this.applyEntityPreset());
   on('phoenixEntityAI','change',()=>this.applyEntityAI());
   on('phoenixEntityEngagement','change',()=>this.applyEntityAI());
   on('phoenixEntityAggroRadius','change',()=>this.applyEntityAI());
   on('btnPrefabWaypointAdd','click',()=>this.addWaypoint());
   on('btnPrefabWaypointTap','click',()=>this.beginWaypointPlacement());
   on('btnPrefabWaypointRemove','click',()=>this.removeWaypoint());
   on('phoenixEntityWaypoints','change',()=>this.selectWaypoint());
   on('btnPhoenixRouteDraw','click',()=>this.startRouteDrawing('draw'));
   on('btnPhoenixRouteStops','click',()=>this.startRouteDrawing('stops'));
   on('btnPhoenixRouteDrawTool','click',()=>this.setRouteTool('draw'));
   on('btnPhoenixRouteStopTool','click',()=>this.setRouteTool('stop'));
   on('btnPhoenixRouteSave','click',()=>this.saveRouteDrawing());
   on('btnPhoenixRouteCancel','click',()=>this.cancelRouteDrawing());
   on('btnPhoenixRouteClear','click',()=>this.clearRouteDrawing());
   // Capture before Builder's own click/drag gestures; a route is never a wall.
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
    this.b.canvas?.addEventListener(type,e=>this.routePointer(type,e),true);
   on('btnPrefabPreviewAttack','click',()=>this.previewAttack());
   on('phoenixPrefabAttackClip','change',e=>{
    const field=this.el('phoenixPrefabAttack');
    if(field)field.value=e.target.value;
   });
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
   // Assets used only by placed NPCs may not be present in Builder's
   // construction catalog. Keep their GLB selectors after project reload.
   for(const prefab of this.registry.list())
    if(prefab.assetId&&!names.has(prefab.assetId))
     names.set(prefab.assetId,prefab.name+' · '+prefab.assetId);
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
   const attackSelect=this.el('phoenixPrefabAttackClip');
   if(attackSelect){
    const chosen=this.el('phoenixPrefabAttack')?.value||'';
    attackSelect.replaceChildren(this.option('','Автоматически по имени клипа'));
    for(const clip of clips)attackSelect.appendChild(this.option(clip.name,clip.name));
    attackSelect.value=clips.some(c=>c.name===chosen)?chosen:'';
   }
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
   if(this.el('phoenixPrefabNameColor'))this.el('phoenixPrefabNameColor').value='#ffffff';
   if(this.el('phoenixPrefabEngagement'))this.el('phoenixPrefabEngagement').value='auto';
   this.el('phoenixPrefabAsset').value='';
   this.el('phoenixPrefabHP').value='100';
   this.el('phoenixPrefabDamage').value='10';
   this.el('phoenixPrefabSpeed').value='2';
   this.el('phoenixPrefabLevel').value='1';
   this.el('phoenixPrefabDefense').value='0';
   this.el('phoenixPrefabRespawnEnabled').checked=false;
   this.el('phoenixPrefabRespawnDelay').value='30';
   this.el('phoenixPrefabAttackEffect').value='impact';
   for(const a of ['Idle','Walk','Run','Attack','Hit','Death','Cast'])
    this.el('phoenixPrefab'+a).value='';
   this.el('phoenixPrefabAI').value='idle';
   this.el('phoenixPrefabPatrolRadius').value='3';
   this.el('phoenixPrefabAggroRadius').value='7';
   this.el('phoenixPrefabAttackRange').value='1.25';
   this.el('phoenixPrefabCooldown').value='1.8';
   this.el('phoenixPrefabSaved').value='';
   this.refreshClips(false);this.status('Создай шаблон и поставь его на сцену.');
  }
  collect(){
   return {
    name:this.el('phoenixPrefabName').value,
    type:this.el('phoenixPrefabType').value,
    faction:this.el('phoenixPrefabFaction').value,
    nameColor:this.el('phoenixPrefabNameColor')?.value||'#ffffff',
    assetId:this.el('phoenixPrefabAsset').value,
    stats:{hp:Number(this.el('phoenixPrefabHP').value),
     damage:Number(this.el('phoenixPrefabDamage').value),
     speed:Number(this.el('phoenixPrefabSpeed').value),
     level:Number(this.el('phoenixPrefabLevel').value),
     defense:Number(this.el('phoenixPrefabDefense').value)},
    respawn:{enabled:this.el('phoenixPrefabRespawnEnabled').checked,
     delay:Number(this.el('phoenixPrefabRespawnDelay').value)},
    attackEffect:this.el('phoenixPrefabAttackEffect').value,
    animations:Object.fromEntries(
     ['idle','walk','run','attack','hit','death','cast'].map(name=>[
      name,this.el('phoenixPrefab'+name[0].toUpperCase()+name.slice(1)).value.trim()
     ])),
    ai:{mode:this.el('phoenixPrefabAI').value,
     engagement:this.el('phoenixPrefabEngagement')?.value||'auto',
     patrolRadius:Number(this.el('phoenixPrefabPatrolRadius').value),
     aggroRadius:Number(this.el('phoenixPrefabAggroRadius').value),
     attackRange:Number(this.el('phoenixPrefabAttackRange').value),
     attackCooldown:Number(this.el('phoenixPrefabCooldown').value)}
   };
  }
  selectPrefab(id){
   const p=this.registry.get(id);if(!p){this.newDraft();return;}
   this.selectedId=id;
   this.el('phoenixPrefabName').value=p.name;
   this.el('phoenixPrefabType').value=p.type;
   this.el('phoenixPrefabFaction').value=p.faction;
   if(this.el('phoenixPrefabNameColor'))this.el('phoenixPrefabNameColor').value=p.nameColor||'#ffffff';
   if(this.el('phoenixPrefabEngagement'))this.el('phoenixPrefabEngagement').value=p.ai?.engagement||'auto';
   this.refreshModels(p.assetId);
   this.el('phoenixPrefabHP').value=String(p.stats.hp);
   this.el('phoenixPrefabDamage').value=String(p.stats.damage);
   this.el('phoenixPrefabSpeed').value=String(p.stats.speed);
   this.el('phoenixPrefabLevel').value=String(p.stats.level??1);
   this.el('phoenixPrefabDefense').value=String(p.stats.defense??0);
   this.el('phoenixPrefabRespawnEnabled').checked=!!p.respawn?.enabled;
   this.el('phoenixPrefabRespawnDelay').value=String(p.respawn?.delay??30);
   this.el('phoenixPrefabAttackEffect').value=p.attackEffect||'impact';
   for(const a of ['idle','walk','run','attack','hit','death','cast'])
    this.el('phoenixPrefab'+a[0].toUpperCase()+a.slice(1)).value=p.animations[a]||'';
   this.el('phoenixPrefabAI').value=p.ai?.mode||'idle';
   this.el('phoenixPrefabPatrolRadius').value=String(p.ai?.patrolRadius??3);
   this.el('phoenixPrefabAggroRadius').value=String(p.ai?.aggroRadius??7);
   this.el('phoenixPrefabAttackRange').value=String(p.ai?.attackRange??1.25);
   this.el('phoenixPrefabCooldown').value=String(p.ai?.attackCooldown??1.8);
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
    placed.appendChild(this.option(id,(
     this.world.getComponent(id,'character')?.nickname||p?.name||prefab.id)+' · '+
     tr.position.map(n=>Number(n).toFixed(1)).join(', ')));
   }
   placed.value=[...placed.options].some(o=>o.value===previous)?previous:'';
   this.selectEntity(placed.value);
   this.el('phoenixPrefabCounts').textContent=
    'Шаблонов: '+this.registry.list().length+' · На сцене: '+(placed.options.length-1);
  }
  saveDraft(){
   if(this.b.playBridge.active)return;
   try{
    const value=this.collect();
    if(this.selectedId)this.registry.update(this.selectedId,value);
    else this.selectedId=this.registry.create(value);
    this.refresh();this.b.skillDefinitionEditor?.refreshCharacters();this.b.markProjectDirty?.();
    this.status('✅ Шаблон применён к редактору. Для записи проекта нажми верхнюю 💾 Сохранить.');
   }catch(err){this.status('Ошибка шаблона: '+err.message)}
  }
  deletePrefab(){
   if(!this.selectedId)return this.status('Выбери шаблон для удаления.');
   const used=this.world.entityIds().some(id=>
    this.world.getComponent(id,'prefab')?.id===this.selectedId);
   if(used)return this.status('Сначала удали экземпляры этого шаблона со сцены.');
   this.b.skillDefinitionEditor?.catalog.removeCharacter(this.selectedId);
   this.registry.remove(this.selectedId);this.newDraft();this.refresh();
   this.b.skillDefinitionEditor?.refreshCharacters();this.b.markProjectDirty?.();
   this.status('Шаблон удалён. Для записи проекта нажми верхнюю 💾 Сохранить.');
  }
  beginPlacement(){
   if(this.b.playBridge.active)return this.status('Размещать мобов можно в EDIT.');
   const p=this.registry.get(this.selectedId);
   if(!p)return this.status('Сначала сохрани или выбери шаблон.');
   if(this.b.projectLoadRunning||this.b.restoringProject)
    return this.status('Заверши загрузку проекта.');
   this.cancelPlacement();
   this.b.setMode('build');this.b.setTool('pick');
   // Game placement uses its own touch handler, never a construction ghost.
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
   if(!this.pendingPlace&&!this.pendingWaypointId)return;
   this.pendingPlace='';this.pendingWaypointId='';
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
   // Since 1.4 the large shared ground mesh is hidden and elevations
   // are drawn with independent terrain patches. Check those before Y=0.
   if(this.b.worldEditor?.sculptPatches?.size){
    const roots=[...this.b.worldEditor.sculptPatches.values()];
    const painted=ray.intersectObjects(roots,false);
    if(painted.length)return painted[0].point.clone();
   }
   const ground=ray.intersectObject(this.b.ground,false);
   if(ground.length)return ground[0].point.clone().setY(0);
   const point=new THREE.Vector3();
   const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
   return ray.ray.intersectPlane(plane,point)?point:null;
  }
  placeholder(){
   const group=new THREE.Group();
   group.name='phoenix:placeholder';
   // Share the primitive GPU buffers between all placeholders on Android.
   this.placeholderGeometry=this.placeholderGeometry||
    new THREE.CapsuleGeometry(.28,.95,3,6);
   this.placeholderMaterial=this.placeholderMaterial||
    new THREE.MeshStandardMaterial({color:0xde8134,roughness:1});
   const body=new THREE.Mesh(this.placeholderGeometry,this.placeholderMaterial);
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
   // The GLB origin is often at the hips instead of the soles. Keep the
   // gameplay root (AI/collision/saved coordinates) independent of GLB
   // animation, and ground only its visual child, without modifying bones.
   const visual=render.root;
   const mover=new THREE.Group();
   const anchor=new THREE.Group();
   mover.name='phoenix:'+id;
   mover.userData.phoenixEntityId=id;
   anchor.name='phoenix:feet-anchor';
   mover.add(anchor);anchor.add(visual);
   render.root=mover;render.visual=visual;render.anchor=anchor;
   render.groundElapsed=0;render.groundTarget=0;
   mover.position.fromArray(transform.position);
   mover.rotation.y=transform.yaw||0;
   render.accum=0;
   render.aiState=PhoenixAI.initial(transform.position);
   this.layer.add(mover);this.rendered.set(id,render);
   // Use actual skin-deformed vertices, not Box3 bind-pose bounding boxes.
   // This fixes characters spawning knee/waist deep in the ground.
   this.groundVisual(render,0,true);
   if(this.playing){
    this.startAnimation(id,render);
    this.groundVisual(render,0,true);
   }
  }
  groundVisual(render,dt=0,instant=false){
   if(!render.visual||!render.anchor)return;
   render.groundElapsed=(render.groundElapsed||0)+
    (Number.isFinite(dt)?Math.max(0,Math.min(dt,.25)):0);
   // Sampling deformed skinned vertices every frame is too costly on Android.
   // A small sampled pose every ~0.35s is enough; interpolate each frame.
   if(instant||render.groundElapsed>=.35){
    render.groundElapsed=0;
    try{
     if(typeof AvatarFit!=='undefined'&&AvatarFit?.measure){
      const bounds=AvatarFit.measure(render.visual,render.anchor,1500);
      if(Number.isFinite(bounds.min.y)&&Math.abs(bounds.min.y)<=10000)
       render.groundTarget=-bounds.min.y*render.anchor.scale.y;
     }else{
      const box=new THREE.Box3().setFromObject(render.visual);
      if(!box.isEmpty()){
       const base=render.anchor.getWorldPosition(new THREE.Vector3()).y;
       // Approximate in world coordinates when AvatarFit is not available.
       render.groundTarget=render.anchor.position.y+(base-box.min.y);
      }
     }
    }catch(error){
     // Broken meshes must not interrupt AI or combat on Android.
     if(!render.groundErrorReported){
      console.warn('Phoenix mob grounding fallback:',error);
      render.groundErrorReported=true;
     }
    }
   }
   if(Number.isFinite(render.groundTarget)){
    const dy=render.groundTarget-render.anchor.position.y;
    if(instant)render.anchor.position.y=render.groundTarget;
    else if(Math.abs(dy)>.0001)
     render.anchor.position.y+=dy*
      (1-Math.exp(-10*Math.max(0,Math.min(.12,dt))));
   }
  }
  startAnimation(id,render){
   const prefabId=this.world.getComponent(id,'prefab')?.id;
   const p=this.registry.get(prefabId);
   // Mixer must drive the imported GLB, NEVER the AI's mover transform.
   // Otherwise an Attack root-motion track may sink the entire NPC.
   render.animation=new PhoenixAnimations.Controller(render.visual||render.root,
    render.clips||[],p?.animations||{},THREE);
   render.animation.setState('idle');
  }
  setPlaying(yes){
   if(yes)this.cancelPlacement();
   this.previewAttackTime=0;this.previewAttackEntity='';
   this.playing=!!yes;this.respawner.clear();this.aiTime=0;
   this.routeHelper.visible=!this.playing&& !this.panel.hidden;
   for(const [id,render] of this.rendered){
    render.animation?.stop();render.animation=null;
    const saved=this.world.getComponent(id,'transform');
    if(saved){
     render.root.position.fromArray(saved.position);
     render.root.rotation.y=saved.yaw||0;
     render.aiState=PhoenixAI.initial(saved.position);
    }
    render.accum=0;render.hitHold=0;
    render.skillRuntime=this.playing&&this.b.skillDefinitionEditor?.catalog?
     new PhoenixSkills.Runtime(this.b.skillDefinitionEditor.catalog,
      this.world.getComponent(id,'prefab')?.id||'player',100):null;
    render.hiddenDead=false;render.root.visible=true;
    render.root.userData.phoenixDead=false;
    if(this.playing)this.startAnimation(id,render);
    this.groundVisual(render,0,true);
   }
   if(this.playing){
    const hero=this.b.playBridge?.playerCombat;
    if(hero){
     this.combat.damage=hero.damage;
     this.combat.range=hero.range;
     this.combat.cooldown=hero.cooldown;
     this.combat.playerMaxHp=hero.hp;
    }
   }
   this.combat.reset(this.playing?[...this.rendered.keys()].map(id=>{
    const stats=this.world.getComponent(id,'stats')||{hp:100};
    const char=this.world.getComponent(id,'character')||{};
    const name=this.registry.get(this.world.getComponent(id,'prefab')?.id)?.name||id;
    return {id,maxHp:stats.hp,faction:char.faction||'enemy',
     name:char.nickname||name};
   }):[]);
   if(this.playing&&!this.collider&&typeof CharacterCollision!=='undefined')
    this.collider=new CharacterCollision.Solver({radius:.27,height:1.6});
   if(this.collider&&this.b.worldEditor)
    this.collider.groundY=(x,z)=>this.b.worldEditor.heightAt(x,z);
  }
  faceMob(render,point,dt){
   const yaw=Features.face(render.root.position,point);
   if(yaw!==null)render.facingYaw=yaw;
   if(Number.isFinite(render.facingYaw))
    render.root.rotation.y=Features.turn(render.root.rotation.y,
     render.facingYaw,dt,8);
  }
  reappear(id){
   const render=this.rendered.get(id);
   if(!render||!this.combat.respawnMob(id))return false;
   const initial=this.world.getComponent(id,'transform');
   if(initial){
    render.root.position.fromArray(initial.position);
    render.root.rotation.y=initial.yaw||0;
   }
   render.aiState=PhoenixAI.initial(render.root.position.toArray());
   render.animation?.stop();render.animation=null;
   render.accum=0;render.hitHold=0;render.deadElapsed=0;
   render.root.userData.phoenixDead=false;
   render.hiddenDead=false;render.root.visible=true;render.facingYaw=null;
   render.skillRuntime=this.b.skillDefinitionEditor?.catalog?
    new PhoenixSkills.Runtime(this.b.skillDefinitionEditor.catalog,
     this.world.getComponent(id,'prefab')?.id||'player',100):null;
   this.startAnimation(id,render);
   this.groundVisual(render,0,true);
   this.b.playBridge?.refreshMobCard?.();
   return true;
  }
  tryNpcSkill(id,render,p,player,distance,allowAttack=true){
   const runtime=render.skillRuntime;
   if(!runtime||!p)return false;
   for(const slot of Object.keys(runtime.skills)){
    const def=runtime.skills[slot];
    if(!def||runtime.ready.get(slot)>this.aiTime||
       runtime.mp<def.manaCost)continue;
    // Raycast collisions only for abilities that can actually cast now;
    // skip expensive wall checks on all other Android frames.
    const healing=def.type==='heal';
    const hp=this.combat.get(id);
    const allowed=healing?(hp&&!hp.dead&&hp.hp<hp.maxHp):
     ((this.world.getComponent(id,'character')?.faction||p.faction)==='enemy'&&allowAttack&&
      !this.combat.isPlayerDead()&&
      distance<=def.range&&this.canStrike(render.root.position,player,distance));
    if(!allowed)continue;
    const used=runtime.cast(slot,this.aiTime,()=>true);
    if(!used.ok)continue;
    const result=healing?this.combat.healMob(id,used.power):
     this.combat.damagePlayer(id,used.power);
    if(!result?.ok)continue;
    if(!healing)this.b.playBridge?.onPlayerHit(result,
     this.world.getComponent(id,'character')?.nickname||p.name);
    render.animation?.setState('cast',.15);
    render.hitHold=Math.max(render.hitHold||0,.4);
    this.faceMob(render,player,.06);
    this.b.playBridge?.effects?.spawn(def.effect,
     healing?render.root.position:player,def.type);
    return true;
   }
   return false;
  }
  update(dt){
   if(!Number.isFinite(dt)||dt<=0)return;
   if(!this.playing){
    if(this.previewAttackTime>0){
     const render=this.rendered.get(this.previewAttackEntity);
     render?.animation?.update(dt);
     if(render)this.groundVisual(render,dt);
     this.previewAttackTime=Math.max(0,this.previewAttackTime-dt);
     if(this.previewAttackTime===0&&render){
      render.animation?.stop();render.animation=null;
      this.groundVisual(render,0,true);
     }
    }
    return;
   }
   this.aiTime+=Math.min(.1,dt);
   for(const id of this.respawner.tick(Math.min(.5,dt)))this.reappear(id);
   const player=this.b.player.position;
   for(const [id,render] of this.rendered){
    if(this.combat.isDead(id)){
     render.deadElapsed=(render.deadElapsed||0)+dt;
     if(render.deadElapsed>1.5){render.root.visible=false;render.hiddenDead=true;}
     else render.animation?.update(dt);
     continue;
    }
    render.animation?.update(dt);
    // Fix animated root/bone vertical drift without changing NPC position.
    this.groundVisual(render,dt);
    if(render.hitHold>0){
     this.faceMob(render,player,dt);
     render.hitHold=Math.max(0,render.hitHold-dt);
     if(render.hitHold===0)render.animation?.setState('idle');
     continue;
    }
    render.accum=Math.min(.35,(render.accum||0)+Math.min(dt,.05));
    if(Number.isFinite(render.facingYaw))
     render.root.rotation.y=Features.turn(render.root.rotation.y,
      render.facingYaw,dt,8);
   }
   const entities=[...this.rendered.entries()];
   if(!entities.length)return;
   if(this.combat.isPlayerDead()){
    for(const [id,render] of entities){
     if(!this.combat.isDead(id))render.animation?.setState('idle');
    }
    return;
   }
   const max=Math.min(entities.length,10);
   for(let step=0;step<max;step++){
    const [id,render]=entities[(this.aiCursor+step)%entities.length];
    if(this.combat.isDead(id)||render.hitHold>0)continue;
    const p=this.registry.get(this.world.getComponent(id,'prefab')?.id);
    const configuredAI=this.world.getComponent(id,'character')?.ai||p?.ai;
    // Idle is a movement choice, not a reason to disable explicitly aggressive
    // or provoked defensive attacks.
    const reactWhileIdle=configuredAI?.engagement==='aggressive'||
     (configuredAI?.engagement==='defensive'&&(render.aiState?.provoked||0)>0);
    if(!p||(configuredAI?.mode==='idle'&&!reactWhileIdle))continue;
    if(render.accum<.001)continue;
    // Each mobile frame advances at most 50ms. Never teleport by a 120–350ms
    // AI backlog; the old behaviour caused visible start-stop mob movement.
    const dtStep=Math.min(.05,render.accum);render.accum=0;
    if(Math.hypot(render.root.position.x-player.x,
     render.root.position.z-player.z)>35){
     render.animation?.setState('idle');continue;
    }
    const ownAI=this.world.getComponent(id,'character')?.ai||p.ai;
    const duration=render.animation?.resolve('attack')?.duration||.5;
    const behavior={...ownAI,
     attackDuration:Math.max(.15,Math.min(8,duration))};
    const decision=PhoenixAI.tick(render.aiState,render.root.position.toArray(),
     player.toArray(),behavior,p.stats,dtStep,
     this.world.getComponent(id,'character')?.faction||p.faction);
    render.aiState=decision.state;
    if(Math.hypot(decision.move[0],decision.move[2])>.0001){
     const before=render.root.position.clone();
     const delta=new THREE.Vector3(...decision.move);
     if(this.collider&&this.b.collisionsEnabled&&
        (this.b.entries.length||this.b.worldEditor?.hasElevations())){
      const result=this.collider.move(before,delta,this.b.entries);
      render.root.position.copy(result.position);
      if(result.blocked&&result.displacement.lengthSq()<.00001)
       decision.animation='idle';
     }else render.root.position.add(delta);
    }
    if(decision.yaw!==null)render.facingYaw=decision.yaw;
    if(decision.animation==='attack')this.faceMob(render,player,dtStep);
    else if(Number.isFinite(render.facingYaw))
     render.root.rotation.y=Features.turn(render.root.rotation.y,
      render.facingYaw,dtStep,8);
    if(decision.routeClip){
     const clip='route:'+decision.routeClip;
     if(render.animation?.state!==clip)
      render.animation?.playClip(decision.routeClip,
       {state:clip,once:false,fade:.15});
    }else render.animation?.setState(decision.animation);
    if(this.tryNpcSkill(id,render,p,player,
      Math.hypot(render.root.position.x-player.x,
       render.root.position.z-player.z),decision.engaged))continue;
    // Only the AI's cooled-down attack intent can damage the player.
    // Check actual Builder wall triangles before applying any HP change.
    if(decision.attack&&(this.world.getComponent(id,'character')?.faction||p.faction)==='enemy'&&
       !this.combat.isPlayerDead()&&
       this.canStrike(render.root.position,player,
        Math.hypot(render.root.position.x-player.x,
         render.root.position.z-player.z))){
     const hit=this.combat.damagePlayer(id,p.stats.damage);
     if(hit.ok){
      this.b.playBridge?.onPlayerHit(hit,
       this.world.getComponent(id,'character')?.nickname||p.name);
      this.b.playBridge?.effects?.spawn(
       {preset:p.attackEffect||'impact'},player);
     }
    }
   }
   this.aiCursor=(this.aiCursor+max)%entities.length;
  }
  canStrike(player,target,distance){
   // Check real wall triangles so attacks do not pass through doors/walls.
   // This only runs on a press, never in the continuous frame loop.
   if(!this.collider||!this.b.entries?.length)return true;
   const blockers=this.b.entries.filter(e=>e.category==='wall'&&!e.hidden);
   if(!blockers.length)return true;
   const begin=player.clone().add(new THREE.Vector3(0,1,0));
   const end=target.clone().add(new THREE.Vector3(0,1,0));
   const vector=end.clone().sub(begin),length=vector.length();
   if(length<.25)return true;
   const meshes=this.collider.meshes(blockers,player,distance+1.0);
   if(!meshes.length)return true;
   return !this.collider.hits(new THREE.Ray(begin,vector.normalize()),
    meshes,0,Math.max(0,length-.25)).length;
  }
  mobProfile(id){
   if(!id||!this.world.hasEntity(id))return null;
   const prefabId=this.world.getComponent(id,'prefab')?.id;
   const prefab=this.registry.get(prefabId);
   if(!prefab)return null;
   const stats=this.combat.get(id);
   const nickname=this.world.getComponent(id,'character')?.nickname||'';
   const skills=this.b.skillDefinitionEditor?.catalog?.entries(prefabId)||{};
   const instanceStats=this.world.getComponent(id,'stats')||{};
   const authored={...prefab,stats:{...prefab.stats,...instanceStats}};
   return {...Features.profile(authored,stats,skills,nickname),
    faction:this.world.getComponent(id,'character')?.faction||prefab.faction,
    nameColor:this.world.getComponent(id,'character')?.nameColor||prefab.nameColor||'#ffffff',
    id,prefabId,respawn:Features.respawn(prefab.respawn),
    respawnLeft:this.respawner.remaining(id)};
  }
  pickMobAt(event){
   if(!this.playing||!event||!this.b.canvas||!this.b.ray)return null;
   const rect=this.b.canvas.getBoundingClientRect();
   if(!rect.width||!rect.height)return null;
   const point={x:(event.clientX-rect.left)/rect.width*2-1,
    y:-(event.clientY-rect.top)/rect.height*2+1};
   this.b.ray.setFromCamera(point,this.b.camera);
   const ray=this.b.ray.ray;
   let best=null,nearest=Infinity;
   for(const [id,render] of this.rendered){
    if(!render.root.visible||this.combat.isDead(id))continue;
    render.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(render.visual||render.root);
    if(bounds.isEmpty())continue;
    // Tiny models still get a usable tap target on a phone.
    bounds.expandByScalar(.15);
    const impact=ray.intersectBox(bounds,new THREE.Vector3());
    if(!impact)continue;
    const distance=ray.origin.distanceTo(impact);
    if(distance<nearest){nearest=distance;best=id}
   }
   return best;
  }
  findEnemy(range,{forward=false}={}){
   if(!this.playing||this.combat.isPlayerDead())return null;
   const origin=this.b.player.position;
   const facing=new THREE.Vector3();
   if(forward){
    this.b.camera.getWorldDirection(facing);facing.y=0;
    if(facing.lengthSq()<.01)return null;
    facing.normalize();
   }
   const selectedId=!forward&&this.b.playBridge?.selectedMobId;
   const selected=selectedId&&this.rendered.get(selectedId);
   if(selected){
    const mob=this.combat.get(selectedId),pos=selected.root.position;
    const dist=Math.hypot(pos.x-origin.x,pos.z-origin.z);
    if(mob&&!mob.dead&&mob.faction==='enemy'&&dist<=range&&
       Math.abs(pos.y-origin.y)<=1.8&&this.canStrike(origin,pos,dist))
     return {id:selectedId,distance:dist,position:pos.clone()};
   }
   let best=null,nearest=Infinity;
   for(const [id,render] of this.rendered){
    const mob=this.combat.get(id);
    if(!mob||mob.dead||mob.faction!=='enemy')continue;
    const target=render.root.position;
    const dx=target.x-origin.x,dz=target.z-origin.z;
    const d=Math.hypot(dx,dz);
    if(d>range||d>=nearest||Math.abs(target.y-origin.y)>1.8)continue;
    if(forward){
     const depth=dx*facing.x+dz*facing.z;
     const spread=Math.abs(dx*facing.z-dz*facing.x);
     if(depth<=0||spread>Math.max(.85,depth*.10))continue;
    }
    if(!this.canStrike(origin,target,d))continue;
    best={id,distance:d,position:target.clone()};nearest=d;
   }
   return best;
  }
  animateHit(id,result){
   if(!result?.ok)return result;
   const render=this.rendered.get(id);
   if(!render)return result;
   if(result.killed){
    render.hitHold=Infinity;
    render.deadElapsed=0;
    render.root.userData.phoenixDead=true;
    const prefab=this.registry.get(this.world.getComponent(id,'prefab')?.id);
    this.respawner.mark(id,prefab?.respawn);
    render.animation?.setState('death',.1);
   }else{
    // A non-aggressive, defensive mob retaliates only after an actual hit.
    render.aiState=PhoenixAI.provoke(render.aiState||
     PhoenixAI.initial(render.root.position.toArray()),12);
    render.hitHold=.45;
    this.faceMob(render,this.b.player.position,.15);
    render.animation?.setState('hit',.1);
   }
   return result;
  }
  damageEnemy(id,amount){
   if(!this.playing)return {ok:false,reason:'edit'};
   const prefab=this.registry.get(this.world.getComponent(id,'prefab')?.id);
   const defense=Math.max(0,prefab?.stats?.defense||0);
   const reduced=Math.max(0,Math.round(amount*100/(100+defense)));
   return this.animateHit(id,this.combat.damageMob(id,reduced));
  }
  attackNearest(now,preferredId=''){
   if(!this.playing)return {ok:false,reason:'edit'};
   const player=this.b.player.position;
   const targets=[];
   const selected=preferredId&&this.rendered.get(preferredId);
   const selectedMob=preferredId&&this.combat.get(preferredId);
   const selectedDistance=selected?
    player.distanceTo(selected.root.position):Infinity;
   if(selected&&selectedMob?.faction==='enemy'&&!selectedMob.dead&&
      selectedDistance<=this.combat.range){
    targets.push({id:preferredId,position:selected.root.position.toArray()});
   }else{
    for(const [id,render] of this.rendered)
     targets.push({id,position:render.root.position.toArray()});
   }
   const result=this.combat.attack(player.toArray(),targets,now,
    (item,distance)=>this.canStrike(player,
     new THREE.Vector3(...item.position),distance));
   if(!result.ok)return result;
   return this.animateHit(result.id,result);
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
     assetId:p.assetId,animations:p.animations,ai:p.ai,
     nameColor:p.nameColor||'#ffffff',nickname:''});
    this.attach(id,render,{position,yaw:0});
   }catch(err){
    render.root.removeFromParent();
    if(id)this.world.removeEntity(id);
    throw err;
   }
   this.refresh();
   this.el('phoenixPrefabEntities').value=id;
   this.selectEntity(id);
   this.b.markProjectDirty?.();return id;
  }
  async placeFromEvent(event){
   if((!this.pendingPlace&&!this.pendingWaypointId)||this.b.playBridge.active)return false;
   const pointEntity=this.pendingWaypointId;
   const id=this.pendingPlace;
   const hit=this.findPoint(event);
   if(pointEntity){
    if(!hit){this.status('Выбери точку земли для маршрута');return true;}
    this.cancelPlacement();
    this.addWaypointToEntity(pointEntity,[hit.x,hit.y,hit.z]);
    this.panel.hidden=false;this.routeHelper.visible=true;
    return true;
   }
   if(!hit){this.status('Не найден пол или земля. Попробуй другой участок.');return true;}
   // One tap places one mob. Await async GLB loads outside the input handler.
   this.cancelPlacement();
   try{
    const elevation=this.b.worldEditor?.heightAt(hit.x,hit.z);
    await this.createEntity(id,[hit.x,Number.isFinite(elevation)?
     Math.max(elevation,hit.y):hit.y,hit.z]);
    this.status('✅ Моб установлен. Нажми ▶ PLAY для просмотра анимации Idle.');
   }catch(err){this.status('Не удалось установить моба: '+err.message)}
   return true;
  }
  selectedEntity(){
   const id=this.el('phoenixPrefabEntities')?.value||'';
   return this.world.hasEntity(id)?id:'';
  }
  selectEntity(id=this.selectedEntity()){
   const tr=id&&this.world.getComponent(id,'transform');
   const c=id&&this.world.getComponent(id,'character');
   for(const [key,index] of [['phoenixEntityX',0],['phoenixEntityY',1],['phoenixEntityZ',2]]){
    if(this.el(key))this.el(key).value=tr?String(tr.position[index]):'0';
   }
   if(this.el('phoenixEntityYaw'))
    this.el('phoenixEntityYaw').value=tr?String(Number(((tr.yaw||0)*180/Math.PI).toFixed(1))):'0';
   if(this.el('phoenixEntityNickname'))
    this.el('phoenixEntityNickname').value=c?.nickname||'';
   const prefab=id?this.registry.get(this.world.getComponent(id,'prefab')?.id):null;
   if(this.el('phoenixEntityNameColor'))
    this.el('phoenixEntityNameColor').value=c?.nameColor||prefab?.nameColor||'#ffffff';
   if(this.el('phoenixEntityEngagement'))
    this.el('phoenixEntityEngagement').value=c?.ai?.engagement||prefab?.ai?.engagement||'auto';
   if(this.el('phoenixEntityAggroRadius'))
    this.el('phoenixEntityAggroRadius').value=String(c?.ai?.aggroRadius??prefab?.ai?.aggroRadius??7);
   if(this.el('phoenixEntityAI'))
    this.el('phoenixEntityAI').value=c?.ai?.mode||'idle';
   const list=this.el('phoenixEntityWaypoints');
   if(list){
    list.replaceChildren();
    for(const [index,p] of (c?.ai?.waypoints||[]).entries()){
     const stop=(c?.ai?.stops||[]).find(s=>s.index===index);
     list.appendChild(this.option(String(index),
      (index+1)+'. '+p.map(n=>Number(n).toFixed(2)).join(' / ')+
      (stop?' ⏸ '+stop.seconds+'с '+stop.animation:'')));
    }
   }
   this.drawRoute(id);
  }
  editEntity(id,operation){
   if(this.b.playBridge.active)return this.status('Редактируй мобов в EDIT'),false;
   if(!id||!this.world.hasEntity(id))return this.status('Выбери моба на сцене'),false;
   const transform=this.world.getComponent(id,'transform');
   const character=this.world.getComponent(id,'character');
   try{
    const updated=operation({transform,character});
    if(!updated)return false;
    this.b.recordEdit?.();
    if(updated.transform)this.world.setComponent(id,'transform',updated.transform);
    if(updated.character)this.world.setComponent(id,'character',updated.character);
    const render=this.rendered.get(id),tr=updated.transform||transform;
    if(render){
     render.root.position.fromArray(tr.position);
     render.root.rotation.y=tr.yaw||0;
     render.aiState=PhoenixAI.initial(tr.position);
     this.groundVisual(render,0,true);
    }
    this.refresh();this.el('phoenixPrefabEntities').value=id;this.selectEntity(id);
    this.b.markProjectDirty?.();
    return true;
   }catch(error){this.status('Не удалось изменить моба: '+error.message);return false;}
  }
  applyEntityNickname(){
   const id=this.selectedEntity();
   if(!id)return this.status('Сначала выбери размещённого моба');
   const nickname=this.el('phoenixEntityNickname')?.value?.trim()||'';
   const nameColor=this.el('phoenixEntityNameColor')?.value||'#ffffff';
   if([...nickname].length>80)return this.status('Ник слишком длинный (макс. 80)');
   if(!/^#[0-9a-fA-F]{6}$/.test(nameColor))return this.status('Некорректный цвет имени');
   const ok=this.editEntity(id,({character})=>({
    character:{...character,nickname,nameColor}
   }));
   if(ok)this.status('✅ Имя и выбранный цвет сохранены. В PLAY ник виден постоянно.');
   return ok;
  }
  applyEntityPreset(){
   const id=this.selectedEntity(),preset=this.el('phoenixEntityPreset')?.value;
   if(!id)return this.status('Сначала выбери моба на сцене'),false;
   const presets={
    'white-defensive':{nameColor:'#ffffff',engagement:'defensive',mode:'patrol',faction:'enemy'},
    'red-aggressive':{nameColor:'#ff4444',engagement:'aggressive',mode:'patrol-aggro',faction:'enemy'},
    'green-friendly':{nameColor:'#55ff88',engagement:'passive',mode:'patrol',faction:'ally'},
    'yellow-guard':{nameColor:'#ffd65c',engagement:'defensive',mode:'guard',faction:'enemy'}
   };
   const selected=presets[preset];
   if(!selected)return this.status('Выбери готовый шаблон поведения'),false;
   const ok=this.editEntity(id,({character})=>({character:{...character,
    nameColor:selected.nameColor,faction:selected.faction,
    ai:{...character.ai,engagement:selected.engagement,mode:selected.mode}}
   }));
   if(ok)this.status('✅ Шаблон применён. Цвет и поведение теперь можно менять отдельно.');
   return ok;
  }
  applyEntityTransform(){
   const id=this.selectedEntity();if(!id)return this.status('Выбери моба на сцене');
   const position=['phoenixEntityX','phoenixEntityY','phoenixEntityZ']
    .map(name=>Number(this.el(name)?.value));
   const yaw=Number(this.el('phoenixEntityYaw')?.value);
   if(position.some(v=>!Number.isFinite(v)||Math.abs(v)>100000)||
      !Number.isFinite(yaw)||Math.abs(yaw)>360)
    return this.status('Позиция и поворот должны быть конечными числами');
   const ok=this.editEntity(id,({transform})=>({
    transform:{...transform,position,yaw:yaw*Math.PI/180}
   }));
   if(ok)this.status('✅ Координаты и поворот моба сохранены');
   return ok;
  }
  snapEntityToGround(){
   const id=this.selectedEntity();if(!id)return this.status('Выбери моба на сцене');
   const tr=this.world.getComponent(id,'transform');
   const position=[...tr.position];
   position[1]=this.b.worldEditor?.heightAt(position[0],position[2])??0;
   const ok=this.editEntity(id,({transform})=>({
    transform:{...transform,position}
   }));
   if(ok)this.status('✅ Моб поставлен на высоту ландшафта');
   return ok;
  }
  applyEntityAI(){
   const id=this.selectedEntity(),mode=this.el('phoenixEntityAI')?.value;
   const engagement=this.el('phoenixEntityEngagement')?.value||'auto';
   const original=this.world.getComponent(id,'character')?.ai?.aggroRadius??7;
   const aggroRadius=this.el('phoenixEntityAggroRadius')?
    Number(this.el('phoenixEntityAggroRadius').value):original;
   if(!id||!PhoenixAI.BEHAVIORS.includes(mode)||
      !PhoenixAI.ENGAGEMENTS.includes(engagement)||
      !Number.isFinite(aggroRadius)||aggroRadius<0||aggroRadius>50)return false;
   const ok=this.editEntity(id,({character})=>({
    character:{...character,ai:{...character.ai,mode,engagement,aggroRadius}}
   }));
   if(ok)this.status('🤖 Маршрут: '+mode+' · реакция: '+engagement);
   return ok;
  }
  addWaypointToEntity(id,position){
   if(!Array.isArray(position)||position.length!==3||
      position.some(v=>!Number.isFinite(v)||Math.abs(v)>100000))
    return this.status('Некорректная точка маршрута'),false;
   const ok=this.editEntity(id,({character})=>{
    const ai=PhoenixAI.normalize(character.ai);
    if(ai.waypoints.length>=Path.MAX_POINTS)throw Error('Максимум '+Path.MAX_POINTS+' точек на маршрут');
    return {character:{...character,ai:{...ai,waypoints:[...ai.waypoints,position]}}};
   });
   if(ok)this.status('🧭 Точка маршрута добавлена');
   return ok;
  }
  addWaypoint(){
   const position=['phoenixWaypointX','phoenixWaypointY','phoenixWaypointZ']
    .map(name=>Number(this.el(name)?.value));
   return this.addWaypointToEntity(this.selectedEntity(),position);
  }
  selectWaypoint(){
   const id=this.selectedEntity(),index=Number(this.el('phoenixEntityWaypoints')?.value);
   const p=this.world.getComponent(id,'character')?.ai?.waypoints?.[index];
   if(!p)return;
   for(const [name,i] of [['phoenixWaypointX',0],['phoenixWaypointY',1],['phoenixWaypointZ',2]])
    this.el(name).value=String(p[i]);
  }
  removeWaypoint(){
   const id=this.selectedEntity();
   const index=Number(this.el('phoenixEntityWaypoints')?.value);
   return this.editEntity(id,({character})=>{
    const ai=PhoenixAI.normalize(character.ai);
    if(!Number.isInteger(index)||index<0||index>=ai.waypoints.length)return null;
    ai.waypoints.splice(index,1);
    ai.stops=ai.stops.filter(s=>s.index!==index).map(s=>({
     ...s,index:s.index>index?s.index-1:s.index}));
    return {character:{...character,ai}};
   });
  }
  beginWaypointPlacement(){
   const id=this.selectedEntity();
   if(!id)return this.status('Выбери моба для редактирования маршрута');
   if(this.b.playBridge.active)return;
   this.cancelPlacement();this.b.setMode('build');this.b.setTool('pick');
   // Tap-to-waypoint needs no wall placement preview.
   this.previewBefore={root:this.b.preview?.root||null,
    outline:this.b.previewOutline||null,
    visible:this.b.preview?.root?.visible,
    outlineVisible:this.b.previewOutline?.visible};
   if(this.previewBefore.root)this.previewBefore.root.visible=false;
   if(this.previewBefore.outline)this.previewBefore.outline.visible=false;
   this.pendingWaypointId=id;this.panel.hidden=true;
   this.status('👆 Коснись сцены для новой точки маршрута');
  }
  drawRoute(id){
   for(const child of [...this.routeHelper.children]){
    child.geometry?.dispose();child.material?.dispose();
    this.routeHelper.remove(child);
   }
   const tr=id&&this.world.getComponent(id,'transform');
   const draft=this.routeDraft?.id===id?this.routeDraft:null;
   const ai=id&&this.world.getComponent(id,'character')?.ai||{};
   const points=draft?(draft.mode==='draw'?Path.fromStroke(draft.raw):draft.points):
    (ai.waypoints||[]);
   const stops=draft?Path.stopsFromMarkers(points,draft.markers):(ai.stops||[]);
   this.routeHelper.visible=!!tr&&!this.playing&&(!this.panel.hidden||!!draft);
   if(!tr||!points.length)return;
   // One open polyline; PLAY closes the loop from last waypoint to first.
   const coords=[tr.position,...points];
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords.flat(),3));
   const mesh=new THREE.Line(geometry,new THREE.LineBasicMaterial({
    color:draft?0xffd166:0x41ffbd,depthTest:false,transparent:true,opacity:.95}));
   mesh.renderOrder=850;this.routeHelper.add(mesh);
   for(const stop of stops){
    const p=points[stop.index];if(!p)continue;
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.32,8,6),
     new THREE.MeshBasicMaterial({color:0xffa442,depthTest:false}));
    dot.position.set(p[0],p[1]+.55,p[2]);
    dot.renderOrder=860;this.routeHelper.add(dot);
   }
  }
  previewAttack(){
   if(this.playing)return false;
   const id=this.selectedEntity(),render=this.rendered.get(id);
   if(!render)return this.status('Выбери моба на сцене'),false;
   const p=this.registry.get(this.world.getComponent(id,'prefab')?.id);
   const selectedTemplate=this.selectedId===this.world.getComponent(id,'prefab')?.id;
   const chosen=selectedTemplate?this.el('phoenixPrefabAttack')?.value?.trim():'';
   const bindings={...(p?.animations||{}),
    ...(chosen?{attack:chosen}:{})};
   const controller=new PhoenixAnimations.Controller(render.visual||render.root,
    render.clips||[],bindings,THREE);
   const clip=controller.resolve('attack');
   if(!clip){
    this.status('⚠ GLB не содержит распознанной Attack. Впиши точное название клипа Attack в шаблоне.');
    return false;
   }
   render.animation?.stop();render.animation=controller;
   controller.setState('attack',0);
   this.previewAttackTime=Math.max(.2,Math.min(8,clip.duration||.6));
   this.previewAttackEntity=id;
   this.status('▶ Проверяю атаку: '+clip.name+' ('+this.previewAttackTime.toFixed(2)+' сек)');
   return true;
  }
  removeRender(id){
   const render=this.rendered.get(id);if(!render)return;
   render.animation?.stop();
   render.root.removeFromParent();this.rendered.delete(id);
   // Geometry/materials are shared with Builder's GLB cache; do not dispose.
  }
  removeSelectedEntity(){
   if(this.b.playBridge.active)return;
   const id=this.el('phoenixPrefabEntities').value;
   if(!this.world.hasEntity(id))return this.status('Выбери моба из списка.');
   this.removeRender(id);this.world.removeEntity(id);
   this.refresh();this.b.markProjectDirty?.();this.status('Моб убран со сцены. Для записи проекта нажми верхнюю 💾 Сохранить.');
  }
  hasContent(){return this.registry.list().length>0||this.world.entityIds().length>0||
   !!this.b.skillDefinitionEditor?.catalog.characters().length;}
  serialize(){
   return {version:1,catalog:this.registry.serialize(),world:this.world.serialize(),
    hudLayout:this.b.skillEditor?.serialize()||null,
     playerAttackEffect:this.b.playBridge?.playerAttackEffect||'impact',
     playerCombat:this.b.playBridge?.playerCombat||null,
    skills:this.b.skillDefinitionEditor?.serialize()||null};
  }
  async loadFromProject(doc){
   this.cancelRouteDrawing();this.cancelPlacement();
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
   // Old projects without a hero profile keep the original melee defaults.
   try{
    const Profiles=(typeof globalThis!=='undefined'&&globalThis.PhoenixPlayerCombat)||
     (typeof require==='function'?require('../core/phoenix-player-combat.js'):null);
    this.b.playBridge.playerCombat=Profiles.normalize(doc?.playerCombat);
   }catch(error){
    console.warn('Invalid player combat profile ignored:',error);
    this.b.playBridge.playerCombat={
     mode:'melee',hp:100,damage:25,range:2.7,cooldown:.65,
     magazineSize:12,reserveCapacity:48,reloadDuration:1.4};
   }
   this.b.playBridge.showPlayerCombatForm?.();
   const fx=doc?.playerAttackEffect;
   this.b.playBridge.playerAttackEffect=
    typeof PhoenixVFX!=='undefined'&&PhoenixVFX.PRESETS.includes(fx)?fx:'impact';
   const fxInput=this.el('phoenixPlayerAttackEffect');
   if(fxInput)fxInput.value=this.b.playBridge.playerAttackEffect;
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
