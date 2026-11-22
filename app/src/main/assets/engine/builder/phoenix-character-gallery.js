/* Phoenix Engine Character Gallery + Inventory UI.
 * One source of truth: PhoenixPrefabs registry, Skill Catalog, RPG profiles,
 * PhoenixInventory. Preview is a separate miniature (never moves the real
 * character on Builder's shared construction canvas).
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixCharacterGallery=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class Gallery{
  constructor(builder,doc){
   if(!builder||!globalThis.PhoenixInventory)throw Error('Gallery requires inventory core');
   this.b=builder;this.doc=doc||document;
   this.inventory=new PhoenixInventory.Store();
   this.panel=this.el('phoenixGalleryPanel');
   if(!this.panel)throw Error('Character gallery panel not found');
   this.selection='player';this.modelToken=0;
   this.preview=null;this.previewRoot=null;this.mixer=null;this.rotation=0;
   this.turnSpeed=.31;this.zoom=1;this.lastX=null;
   this.previewFit=null;
   this.models=new Map();
   this.bind();
  }
  el(id){return this.doc.getElementById(id)}
  node(tag,cls,text){
   const el=this.doc.createElement(tag);if(cls)el.className=cls;
   if(text!==undefined)el.textContent=String(text);
   return el;
  }
  option(value,title){
   const o=this.node('option');o.value=value;o.textContent=title;return o;
  }
  setInfo(value){const el=this.el('phoenixGalleryInfo');if(el)el.textContent=value;}
  bind(){
   this.el('btnPhoenixGallery')?.addEventListener('click',()=>this.toggle());
   this.el('btnGalleryClose')?.addEventListener('click',()=>this.close());
   this.el('btnGalleryRefresh')?.addEventListener('click',()=>{
    this.renderModelSearch();this.refresh();
   });
   this.el('phoenixGalleryModelSearch')?.addEventListener('input',()=>this.renderModelSearch());
   this.el('phoenixGalleryModelSelect')?.addEventListener('change',()=>{
    const id=this.el('phoenixGalleryModelSelect')?.value;
    const name=this.models.get(id);
    if(id&&name)this.el('phoenixGalleryCreateName').value=name.slice(0,80);
   });
   this.el('btnGalleryCreate')?.addEventListener('click',()=>this.createCharacter());
   this.el('btnGallerySkills')?.addEventListener('click',()=>this.openSkillEditor());
   this.el('btnGalleryProgression')?.addEventListener('click',()=>this.openProgression());
   this.el('btnGalleryPrefab')?.addEventListener('click',()=>this.openPrefab());
   this.el('btnGalleryViewHero')?.addEventListener('click',()=>this.showModel(this.selection));
   this.el('btnGalleryZoomOut')?.addEventListener('click',()=>this.setPreviewZoom(this.zoom/1.2));
   this.el('btnGalleryZoomIn')?.addEventListener('click',()=>this.setPreviewZoom(this.zoom*1.2));
   this.el('btnGalleryFit')?.addEventListener('click',()=>this.fitPreview());
   this.el('btnGalleryAddItem')?.addEventListener('click',()=>this.addItem());
   this.el('btnPhoenixPlayInventory')?.addEventListener('click',()=>{
    this.open('player');
   });
   const canvas=this.el('phoenixGalleryCanvas');
   canvas?.addEventListener('pointerdown',e=>{
    this.lastX=e.clientX;canvas.setPointerCapture?.(e.pointerId);
   });
   canvas?.addEventListener('pointermove',e=>{
    if(this.lastX===null)return;
    this.rotation+=(e.clientX-this.lastX)*.014;this.lastX=e.clientX;
   });
   for(const event of ['pointerup','pointercancel','lostpointercapture'])
    canvas?.addEventListener(event,()=>{this.lastX=null});
  }
  renderModelSearch(){
   const select=this.el('phoenixGalleryModelSelect');if(!select)return;
   const chosen=select.value,query=(this.el('phoenixGalleryModelSearch')?.value||'')
    .trim().toLocaleLowerCase();
   const models=new Map();
   for(const [id,meta] of this.b.catalogMeta||[])
    if(id.startsWith('glb:'))models.set(id,String(meta?.name||id));
   for(const [id,asset] of this.b.assets||[])
    if(id.startsWith('glb:'))models.set(id,String(asset?.name||models.get(id)||id));
   for(const p of this.b.prefabEditor?.registry.list()||[])
    if(p.assetId&&!models.has(p.assetId))models.set(p.assetId,p.name);
   if(this.b.avatarAssetId&&!models.has(this.b.avatarAssetId))
    models.set(this.b.avatarAssetId,this.b.avatarFileName||'Герой');
   this.models=models;
   select.replaceChildren(this.option('','— Выбери загруженный GLB —'));
   let shown=0;
   for(const [id,name] of models){
    if(query&&!((name+' '+id).toLocaleLowerCase().includes(query)))continue;
    select.appendChild(this.option(id,name+' · '+id));
    if(++shown>=100)break;
   }
   if(models.has(chosen)&&[...select.options].some(o=>o.value===chosen))
    select.value=chosen;
   this.setInfo('🔎 '+shown+' моделей в списке'+
    (models.size>shown?' · уточни поиск по названию GLB':''));
  }
  createCharacter(){
   if(this.b.playBridge?.active)return false;
   const assetId=this.el('phoenixGalleryModelSelect')?.value||'';
   const name=this.el('phoenixGalleryCreateName')?.value?.trim()||'';
   const type=this.el('phoenixGalleryCreateType')?.value||'hero';
   if(!assetId||!this.models.has(assetId)){
    this.setInfo('⚠ Сначала найди и выбери GLB из библиотеки');return false;
   }
   try{
    const faction=type==='hero'?'ally':type==='npc'?'neutral':'enemy';
    const id=this.b.prefabEditor.registry.create({name,type,faction,assetId});
    this.b.prefabEditor.refresh?.();
    this.b.skillDefinitionEditor?.refreshCharacters?.();
    this.b.progressionEditor?.refreshTargets?.();
    this.b.markProjectDirty?.();
    this.select(id);
    this.el('phoenixGalleryCreate').open=false;
    this.setInfo('✅ '+name+' добавлен в галерею. Можно задать навыки, уровни и инвентарь. Нажми верхнюю 💾 Сохранить.');
    return id;
   }catch(error){this.setInfo('⚠ '+error.message);return false}
  }
  listCharacters(){
   const list=[{id:'player',name:this.b.avatarFileName||'Мой герой',
    type:'hero',faction:'ally',assetId:this.b.avatarAssetId||''}];
   for(const p of this.b.prefabEditor?.registry.list()||[])
    list.push({id:p.id,name:p.name,type:p.type,faction:p.faction,
     assetId:p.assetId||''});
   return list;
  }
  find(id){
   if(id==='player')return {id:'player',name:this.b.avatarFileName||'Мой герой',
    type:'hero',assetId:this.b.avatarAssetId||'',faction:'ally',
    stats:this.b.progressionEditor?.playerStats?.()||null};
   return this.b.prefabEditor?.registry.get(id)||null;
  }
  open(id=this.selection){
   this.b.skillEditor?.close?.();this.b.skillDefinitionEditor?.close?.();
   this.b.progressionEditor?.close?.();
   this.b.prefabEditor?.close?.();this.b.worldEditor?.close?.();
   this.panel.hidden=false;this.renderModelSearch();
   this.select(this.find(id)?id:'player');
   this.el('btnGalleryAddItem').disabled=!!this.b.playBridge?.active;
   this.el('phoenixGalleryItemEditor').hidden=!!this.b.playBridge?.active;
   this.el('phoenixGalleryEditingTools').hidden=!!this.b.playBridge?.active;
   this.el('phoenixGalleryCreate').hidden=!!this.b.playBridge?.active;
   return true;
  }
  close(){
   this.panel.hidden=true;this.modelToken++;
   this.mixer?.stopAllAction?.();this.mixer=null;this.previewRoot=null;
   this.previewFit=null;this.zoom=1;
   if(this.preview?.subject)this.preview.subject.clear();
   return true;
  }
  toggle(){return this.panel.hidden?this.open():this.close()}
  refresh(){
   const list=this.el('phoenixGalleryGrid');
   if(!list)return false;
   list.replaceChildren();
   const labels={hero:'🧍',mob:'🐺',npc:'🧑',boss:'👹'};
   for(const row of this.listCharacters()){
    const btn=this.node('button','phoenixGalleryCell');
    btn.type='button';btn.dataset.character=row.id;
    if(row.id===this.selection)btn.classList.add('selected');
    btn.appendChild(this.node('span','phoenixGalleryCellAvatar',labels[row.type]||'🧬'));
    btn.appendChild(this.node('strong','',row.name));
    btn.appendChild(this.node('small','',row.assetId?'🎞 GLB':'◻ Без GLB'));
    btn.addEventListener('click',()=>this.select(row.id));
    list.appendChild(btn);
   }
   this.renderDetails();
   return true;
  }
  select(id){
   if(!this.find(id))id='player';
   this.selection=id;this.refresh();
   if(!this.panel.hidden)this.showModel(id);
   return id;
  }
  renderDetails(){
   const p=this.find(this.selection);
   if(!p)return;
   const type={hero:'Герой',mob:'Моб',npc:'NPC',boss:'Босс'}[p.type]||'Персонаж';
   const title=this.el('phoenixGalleryName');
   if(title)title.textContent=p.name+' · '+type;
   const stats=this.selection==='player'?
    this.b.progressionEditor?.playerStats?.()||null:
    this.b.prefabEditor?.calculatedStats?.('',p)||p.stats;
   const statEl=this.el('phoenixGalleryStats');
   if(statEl)statEl.textContent=stats?
    '🌟 Ур. '+(stats.level||1)+' · ❤️ '+Math.round(stats.hp||0)+
    ' · ⚔ '+Math.round(stats.damage||0)+' · 🛡 '+Math.round(stats.defense||0)+
    ' · 🏃 '+Number(stats.speed||0).toFixed(1):
    'Характеристики героя можно задать в 📈 УРОВНИ';
   const abilities=this.b.skillDefinitionEditor?.catalog.entries(this.selection)||{};
   const skillEl=this.el('phoenixGallerySkills');if(skillEl){
    skillEl.replaceChildren();
    for(const [slot,def] of Object.entries(abilities))
     skillEl.appendChild(this.node('div','phoenixGallerySkill',
      (def.icon||'✨')+' '+def.name+' ['+slot+']'+
      ' · ур. '+def.level+' · 🎞 '+(def.animation||'cast')));
    if(!Object.keys(abilities).length)skillEl.appendChild(
     this.node('small','', 'Навыки пока не назначены'));
   }
   this.renderItems();
  }
  renderItems(){
   const bag=this.inventory.state(this.selection);
   const list=this.el('phoenixGalleryItems');if(!list)return;
   list.replaceChildren();
   const equipped=new Set(Object.values(bag.equipped));
   for(const item of bag.items){
    const row=this.node('div','phoenixGalleryItemRow');
    const label=this.node('div','phoenixGalleryItemName',
     (equipped.has(item.id)?'✅ ':'🎒 ')+item.name+
     (item.slot?' · '+item.slot:'')+
     ' ⚔'+item.stats.damage+' 🛡'+item.stats.defense);
    row.appendChild(label);
    if(item.assetId){
     const view=this.node('button','','👁');
     view.title='Осмотреть GLB предмета';
     view.addEventListener('click',()=>this.showItem(item));
     row.appendChild(view);
    }
    if(!this.b.playBridge?.active){
     if(item.slot){
      const equip=this.node('button','',equipped.has(item.id)?'Снять':'Надеть');
      equip.addEventListener('click',()=>{
       if(equipped.has(item.id))this.inventory.unequip(this.selection,item.slot);
       else this.inventory.equip(this.selection,item.id);
       this.b.markProjectDirty?.();this.renderItems();
      });
      row.appendChild(equip);
     }
     const del=this.node('button','','✕');
     del.addEventListener('click',()=>{
      this.inventory.remove(this.selection,item.id);
      this.b.markProjectDirty?.();this.renderItems();
     });row.appendChild(del);
    }
    list.appendChild(row);
   }
   if(!bag.items.length)list.appendChild(this.node('small','','Инвентарь пуст.'));
   const bonus=this.inventory.bonuses(this.selection),el=this.el('phoenixGalleryGearStats');
   if(el)el.textContent='Экипировка: ⚔ +'+bonus.damage+' · 🛡 +'+
    bonus.defense+' · ❤️ +'+bonus.hp+' · 🔵 +'+bonus.mp+
    ' · 🔮 +'+bonus.magicPower;
  }
  addItem(){
   if(this.b.playBridge?.active)return false;
   try{
    const get=id=>this.el('phoenixGalleryItem'+id)?.value||'';
    const item={name:get('Name').trim(),kind:get('Kind'),
     slot:get('Slot'),assetId:get('Glb'),
     stats:{damage:Number(get('Damage')||0),defense:Number(get('Defense')||0),
      hp:Number(get('Hp')||0),mp:Number(get('Mp')||0),
      magicPower:Number(get('MagicPower')||0),
      magicDefense:Number(get('MagicDefense')||0),
      speed:Number(get('Speed')||0)}};
    this.inventory.add(this.selection,item);
    this.b.markProjectDirty?.();this.renderItems();
    this.setInfo('✅ Предмет добавлен для '+this.find(this.selection)?.name+
     '. Нажми верхнюю 💾 Сохранить проект.');
    this.el('phoenixGalleryItemName').value='';
    return true;
   }catch(error){this.setInfo('⚠ '+error.message);return false}
  }
  openSkillEditor(){
   if(this.b.playBridge?.active)return false;
   const ed=this.b.skillDefinitionEditor;
   this.close();ed?.open?.();
   const select=ed?.el('skillDefCharacter');
   if(select){select.value=this.selection;ed.loadForm()}
   return true;
  }
  openProgression(){
   if(this.b.playBridge?.active)return false;
   const ed=this.b.progressionEditor;
   this.close();ed?.open?.();
   const target=ed?.el('progressionTarget');
   if(target){target.value=this.selection;ed.loadTarget()}
   return true;
  }
  openPrefab(){
   if(this.b.playBridge?.active||this.selection==='player')return false;
   const ed=this.b.prefabEditor;this.close();
   ed?.open?.();ed?.selectPrefab?.(this.selection);return true;
  }
  createPreview(){
   if(this.preview)return this.preview;
   const T=globalThis.THREE;
   const canvas=this.el('phoenixGalleryCanvas');
   if(!T||!canvas)return null;
   const scene=new T.Scene();scene.background=new T.Color('#142c3e');
   const camera=new T.PerspectiveCamera(36,1.2,.1,100);
   camera.position.set(0,1.5,5.4);camera.lookAt(0,1,0);
   scene.add(new T.HemisphereLight(0xc5e8ff,0x25462e,1.4));
   const light=new T.DirectionalLight(0xffffff,1.55);
   light.position.set(3,6,4);scene.add(light);
   const pedestal=new T.Mesh(new T.CylinderGeometry(1.22,1.35,.25,32),
    new T.MeshStandardMaterial({color:0x425d67,metalness:.55,roughness:.35}));
   pedestal.position.y=-.15;scene.add(pedestal);
   const rim=new T.Mesh(new T.TorusGeometry(1.16,.055,6,40),
    new T.MeshStandardMaterial({color:0x54e9cb,emissive:0x1d6459}));
   rim.rotation.x=Math.PI/2;rim.position.y=.018;scene.add(rim);
   const subject=new T.Group();scene.add(subject);
   let renderer;
   try{
    renderer=new T.WebGLRenderer({canvas,alpha:false,antialias:true,
     powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(1.5,globalThis.devicePixelRatio||1));
    const w=Math.max(220,Math.round(canvas.clientWidth||260));
    const h=Math.max(180,Math.round(canvas.clientHeight||220));
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
   }catch(error){console.warn('3D gallery unavailable',error);return null}
   this.preview={scene,camera,renderer,subject};return this.preview;
  }
  // Zoom affects ONLY the independent pedestal camera, not model scale,
  // authored GLB transform or real Builder player.
  setPreviewZoom(next){
   if(!Number.isFinite(next)||!this.preview)return false;
   this.zoom=Math.max(.5,Math.min(2.5,next));
   this.placePreviewCamera();
   return true;
  }
  fitPreview(){
   if(!this.preview)return false;
   this.zoom=1;this.placePreviewCamera();
   return true;
  }
  placePreviewCamera(){
   const fit=this.previewFit,camera=this.preview?.camera;
   if(!fit||!camera)return false;
   const distance=fit.distance/this.zoom;
   camera.position.set(distance*.16,fit.targetY+distance*.11,distance*.98);
   camera.lookAt(0,fit.targetY,0);
   camera.updateProjectionMatrix();
   return true;
  }
  computePreviewFit(width,height,aspect=1){
   // Perspective framing with generous margins for capes, horns, shields
   // and the animated idle pose. Width and height are normalized GLB bounds.
   const halfFov=36*Math.PI/360;
   const hFov=Math.atan(Math.tan(halfFov)*Math.max(.5,aspect));
   return {targetY:height*.47,
    distance:Math.max(3.8,
     (height+.65)/(2*Math.tan(halfFov)*.73),
     (width+.3)/(2*Math.tan(hFov)*.72))};
  }
  placeholder(){
   const T=globalThis.THREE;
   const group=new T.Group();
   const mat=new T.MeshStandardMaterial({color:0x7f91a7});
   // Three.js r140 has no guaranteed CapsuleGeometry in the offline APK.
   const torso=new T.Mesh(new T.CylinderGeometry(.33,.43,1.2,12),mat);
   torso.position.y=.8;group.add(torso);
   const head=new T.Mesh(new T.SphereGeometry(.35,12,8),mat);
   head.position.y=1.64;group.add(head);
   return group;
  }
  async showItem(item){
   this.setInfo('🔍 Осмотр предмета '+item.name);
   await this.showAsset(item.assetId,[],item.name);
  }
  async showModel(id){
   const p=this.find(id);if(!p)return false;
   this.setInfo('🎞 '+p.name+' · миниатюра на поворотном постаменте');
   return this.showAsset(p.assetId,id==='player'?
    this.b.avatarClips||[]:[],p.name,id==='player');
  }
  async showAsset(assetId,avatarClips=[],name='',isPlayer=false){
   const token=++this.modelToken;const preview=this.createPreview();
   if(!preview)return false;
   let model=null,clips=avatarClips;
   try{
    const T=globalThis.THREE;
    if(isPlayer&&this.b.avatarRoot){
     model=T.SkeletonUtils?.clone?
      T.SkeletonUtils.clone(this.b.avatarRoot):this.b.avatarRoot.clone(true);
    }else if(assetId){
     if(!this.b.assets?.has(assetId))
      await this.b.ensureTemplate(assetId,'prop');
     if(token!==this.modelToken||this.panel.hidden)return false;
     model=this.b.cloneTemplate(assetId);
     clips=this.b.assets?.get(assetId)?.animations||[];
    }
   }catch(error){console.warn('Gallery model:',name,error);
    this.setInfo('⚠ GLB не удалось загрузить: '+error.message);}
   if(token!==this.modelToken||this.panel.hidden)return false;
   this.mixer?.stopAllAction?.();this.mixer=null;preview.subject.clear();
   const T=globalThis.THREE;
   if(!model){model=this.placeholder();clips=[]}
   const bounds=new T.Box3().setFromObject(model);
   const size=bounds.getSize(new T.Vector3());
   const height=Number.isFinite(size.y)&&size.y>.005?size.y:1.7;
   const width=Math.max(size.x||0,size.z||0,.1);
   const scale=Math.min(2.5/height,1.85/width,3);
   const center=bounds.getCenter(new T.Vector3());
   model.scale.multiplyScalar(scale);
   model.position.x-=center.x*scale;
   model.position.z-=center.z*scale;
   model.position.y-=bounds.min.y*scale;
   preview.subject.add(model);this.previewRoot=model;
   this.zoom=1;
   const shownHeight=height*scale;
   const shownWidth=width*scale;
   this.previewFit=this.computePreviewFit(shownWidth,shownHeight,
    preview.camera.aspect||1);
   this.placePreviewCamera();
   if(clips.length){
    this.mixer=new T.AnimationMixer(model);
    const selected=clips.find(c=>/idle|stand|rest|покой/i.test(c.name))||clips[0];
    try{this.mixer.clipAction(selected).play()}
    catch(error){console.warn('Gallery idle animation',error)}
   }
   this.rotation=0;
   return true;
  }
  update(dt){
   if(this.panel.hidden||!this.preview||!Number.isFinite(dt))return;
   this.rotation+=Math.max(0,Math.min(dt,.08))*this.turnSpeed;
   this.preview.subject.rotation.y=this.rotation;
   this.mixer?.update?.(Math.max(0,Math.min(dt,.08)));
   this.preview.renderer.render(this.preview.scene,this.preview.camera);
  }
  loadFromProject(raw){
   try{this.inventory.load(raw||null)}
   catch(error){
    console.warn('Invalid inventory data',error);this.inventory.load(null);
    this.setInfo('⚠ Инвентарь из проекта повреждён и не загружен.');
   }
   this.selection='player';this.refresh();
  }
  serialize(){return this.inventory.serialize();}
 }
 return Gallery;
});
