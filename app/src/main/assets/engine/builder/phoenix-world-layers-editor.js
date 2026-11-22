/* Android UI for portable world layers. No automatic project saves.
 * Export is read-only: an author never needs to delete mobs to publish a map.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixWorldLayersEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class Editor{
  constructor(builder,services={},doc){
   this.b=builder;this.doc=doc||document;this.io=services;
   this.panel=this.el('phoenixWorldLayersPanel');this.working=false;
   this.bind();
  }
  el(id){return this.doc.getElementById(id)}
  info(message){
   const e=this.el('phoenixWorldLayersStatus');if(e)e.textContent=message;
  }
  bind(){
   const listen=(id,event,fn)=>this.el(id)?.addEventListener(event,fn);
   listen('btnPhoenixWorldLayers','click',()=>this.toggle());
   listen('btnWorldLayersClose','click',()=>this.close());
   listen('btnExportMapLayer','click',()=>this.exportMap());
   listen('btnExportEntityLayer','click',()=>this.exportEntities());
   listen('btnImportMapLayer','click',()=>this.el('phoenixImportMapLayerFile')?.click());
   listen('btnImportEntityLayer','click',()=>this.el('phoenixImportEntityLayerFile')?.click());
   listen('phoenixImportMapLayerFile','change',e=>this.importMap(e.target));
   listen('phoenixImportEntityLayerFile','change',e=>this.importEntities(e.target));
  }
  open(){
   if(this.b.playBridge?.active||this.working)return false;
   for(const id of ['prefabEditor','skillDefinitionEditor','worldEditor',
    'progressionEditor','galleryEditor','minimapEditor','networkEditor'])
    this.b[id]?.close?.();
   this.panel.hidden=false;return true;
  }
  close(){if(this.panel)this.panel.hidden=true;return true}
  toggle(){return this.panel?.hidden?this.open():this.close()}
  blocked(){
   if(this.b.playBridge?.active){this.info('⚠ Выйди из PLAY перед экспортом.');return true}
   if(this.b.projectLoadRunning||this.working){
    this.info('⚠ Идёт операция с файлами.');return true;
   }
   return false;
  }
  async exportMap(){
   if(this.blocked())return false;this.working=true;
   try{
    const L=PhoenixWorldLayers;
    const made=L.mapProject(this.b.project());
    // All authored terrain textures are retained; only static building GLBs
    // go in the map. Mob/NPC and avatar GLBs are never included as resources.
    const result=await PhoenixFiles.savePortableProject(made.project,
     this.b.textureFiles,made.models,this.io.readAsset,
     'Phoenix_World_Map.phoenix.json');
    this.info('✅ Карта экспортирована: '+made.stats.objects+
     ' объектов. Мобы, NPC и персонаж не удалялись с холста.'+
     ' В файл включены ресурсы карты и рельеф.');
    return result;
   }catch(error){this.info('⚠ Экспорт карты: '+error.message);return false}
   finally{this.working=false}
  }
  async exportEntities(){
   if(this.blocked())return false;this.working=true;
   try{
    const made=PhoenixWorldLayers.entitiesProject(this.b.project());
    const result=await PhoenixFiles.savePortableProject(made.project,[],
     made.models,this.io.readAsset,'Phoenix_World_Entities.phoenix.json');
    this.info('✅ Расстановка экспортирована: '+made.stats.entities+
     ' существ, '+made.stats.prefabs+
     ' шаблонов, включая координаты, патрули, навыки и нужные GLB.'+
     ' Дома, холст, горы и главный герой в файл не входят.');
    return result;
   }catch(error){this.info('⚠ Экспорт существ: '+error.message);return false}
   finally{this.working=false}
  }
  async loadFile(input,mode){
   const file=input?.files?.[0];
   if(input)input.value='';
   if(!file||this.blocked())return null;
   const parsed=await ProjectOpen.read(file);
   if(parsed.type!=='backup')
    throw Error('Нужен переносимый .phoenix.json с вложенными моделями и текстурами');
   if(mode==='map')PhoenixWorldLayers.validateMap(parsed.project);
   else PhoenixWorldLayers.validateEntities(parsed.project);
   return parsed;
  }
  async unpack(parsed,protectMapAssets=false){
   const protectedIds=new Set(protectMapAssets?
    this.b.entries.map(e=>e.kind).filter(id=>id?.startsWith('glb:')):[]);
   const unpacked=await PhoenixFiles.unpackProject(parsed.doc,async(id,data)=>{
    // Reused model IDs may exist in both maps and creature packs. Never
    // overwrite a GLB used by a house/tree with different NPC bytes.
    if(protectedIds.has(id)){
     const previous=await this.io.readAsset(id);
     if(previous){
      const a=new Uint8Array(previous),b=new Uint8Array(data);
      if(a.length!==b.length||a.some((v,i)=>v!==b[i]))
       throw Error('Конфликт GLB ID «'+id+
        '»: модель используется картой. Сначала переименуй импортируемую модель.');
      return;
     }
    }
    await this.io.writeAsset(id,data);
   },{careful:this.b.projectLoadMode==='careful'});
   for(const row of parsed.doc.assets||[]){
    if(row.id.startsWith('glb:'))this.b.assets?.delete(row.id);
    if(row.id.startsWith('texture:'))this.b.textureCache?.delete(row.id);
   }
   return unpacked;
  }
  async importMap(input){
   let parsed;
   try{parsed=await this.loadFile(input,'map')}
   catch(error){this.info('⚠ Импорт карты: '+error.message);return false}
   if(!parsed)return false;
   const items=parsed.project.objects.length;
   const confirmText='🗺 Загрузить карту из файла?\n'+
    items+' строительных объектов, ландшафт и материалы.\n'+
    'ТЕКУЩАЯ КАРТА И РАССТАНОВКА СУЩЕСТВ будут заменены.\n'+
    'Экспортируй их перед заменой!';
   if(!this.io.confirm(confirmText))return false;
   this.working=true;
   try{
    const result=await this.unpack(parsed,false);
    // Keep the same texture metadata restore path as the usual project
    // backup. This import deliberately DOES NOT write permanent app saves.
    const incoming=result.textures;
    this.b.textureFiles=[...this.b.textureFiles.filter(row=>
     !incoming.some(item=>item.id===row.id)),...incoming.map(item=>({
      ...item,...parsed.project.textureLibrary?.find(m=>m.id===item.id)
    }))];
    if(typeof localStorage!=='undefined')localStorage.setItem(
     'phoenix-builder-v2-textures',JSON.stringify(this.b.textureFiles));
    await this.b.restoreForOpen(parsed.project);
    this.b.minimapEditor?.loadFromProject?.(parsed.project.mapSettings||null);
    this.b.history?.clear?.();this.b.updateHistoryButtons?.();
    this.b.renderTextureLibrary?.();this.b.renderCatalog?.();
    this.b.markProjectDirty?.();
    this.info('✅ Карта загружена: '+items+' объектов. Мир пуст — можно расставить существ или импортировать файл расстановки. Нажми верхнюю 💾 Сохранить.');
    return true;
   }catch(error){console.error('World map import',error);
    this.info('⚠ Импорт карты: '+error.message);return false}
   finally{this.working=false}
  }
  async importEntities(input){
   let parsed;
   try{parsed=await this.loadFile(input,'entities')}
   catch(error){this.info('⚠ Импорт расстановки: '+error.message);return false}
   if(!parsed)return false;
   let merged;
   try{merged=PhoenixWorldLayers.combineEntities(this.b.project(),parsed.project)}
   catch(error){this.info('⚠ Расстановка повреждена: '+error.message);return false}
   const message='🐺 Загрузить '+merged.placed+' размещённых существ?\n'+
    'ТЕКУЩИЕ МОБЫ/NPC и их шаблоны будут заменены.\n'+
    'Холст, дома, рельеф и главный герой НЕ изменятся.\n'+
    (merged.differentWorld?'⚠ Файл создан на другой версии карты: проверь координаты!\n':'')+
    (merged.outside?'⚠ За пределами текущего холста: '+merged.outside+'.\n':'')+
    'Перед продолжением можно экспортировать старую расстановку.';
   if(!this.io.confirm(message))return false;
   this.working=true;
   const backup=this.b.project().phoenixGame;
   try{
    await this.unpack(parsed,true);
    await this.b.prefabEditor.loadFromProject(merged.project.phoenixGame);
    this.b.skillDefinitionEditor?.loadFromProject?.(merged.project.phoenixGame.skills);
    // Portably imported GLBs must be discoverable when the author edits the
    // newly imported NPC; don't touch the architectural building catalog.
    for(const model of parsed.project.catalogLibrary||[]){
     if(!model?.id?.startsWith('glb:')||!model.name)continue;
     const folder=typeof SmartCatalog!=='undefined'&&
      SmartCatalog.labels[model.folder]?model.folder:'misc';
     if(!this.b.catalogMeta.has(model.id))
      this.b.catalogMeta.set(model.id,{...model,folder,
       category:typeof SmartCatalog==='undefined'?'prop':SmartCatalog.category(folder)});
    }
    this.b.saveCatalogMeta?.();this.b.renderCatalog?.();
    this.b.markProjectDirty?.();
    this.info('✅ Расставлено существ: '+merged.placed+
     '. Дома и рельеф не изменились. Проверь точки и нажми верхнюю 💾 Сохранить.');
    return true;
   }catch(error){
    console.error('Creature layer import',error);
    try{
     await this.b.prefabEditor.loadFromProject(backup);
     this.b.skillDefinitionEditor?.loadFromProject?.(backup?.skills||null);
    }catch(restoreError){console.error('Failed to recover previous creature layer',restoreError)}
    this.info('⚠ Не удалось загрузить существ: '+error.message);return false;
   }finally{this.working=false}
  }
 }
 return Editor;
});
