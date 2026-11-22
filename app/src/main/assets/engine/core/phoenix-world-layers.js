/* Phoenix Engine: separate portable authored map and creature placement layers.
 * Keep the existing Builder v2 file envelope so Android's streaming SAF writer
 * and the GLB/texture import path can be reused without a second file format.
 * This module is deterministic, DOM-free and never modifies input projects.
 */
(function(root,factory){
 'use strict';const result=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=result;
 if(root)root.PhoenixWorldLayers=result;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1,MAP='phoenix-world-map',ENTITIES='phoenix-world-entities';
 const deep=x=>JSON.parse(JSON.stringify(x));
 const Core=(typeof globalThis!=='undefined'&&globalThis.PhoenixCore)||
  (typeof require==='function'?require('./phoenix-core.js'):null);
 const Prefabs=(typeof globalThis!=='undefined'&&globalThis.PhoenixPrefabs)||
  (typeof require==='function'?require('./phoenix-prefabs.js'):null);
 const Skills=(typeof globalThis!=='undefined'&&globalThis.PhoenixSkills)||
  (typeof require==='function'?require('./phoenix-skills.js'):null);
 const Inventory=(typeof globalThis!=='undefined'&&globalThis.PhoenixInventory)||
  (typeof require==='function'?require('./phoenix-inventory.js'):null);
 const emptyWorld=()=>new Core.PhoenixWorld().serialize();
 const emptyCatalog=()=>new Prefabs.PhoenixPrefabCatalog().serialize();
 function checkProject(project){
  if(!project||project.version!==2||!Array.isArray(project.objects))
   throw new TypeError('Нужен проект Phoenix Builder 2.0');
  return project;
 }
 function extent(project){
  const area=project?.worldCanvas||{};
  const width=Number(area.width)||128,depth=Number(area.depth)||128;
  if(!Number.isFinite(width)||!Number.isFinite(depth)||
     width<1||depth<1||width>5000||depth>5000)
   throw new TypeError('Некорректный размер игрового мира');
  return {width,depth};
 }
 function worldKey(project){
  const bounds=extent(project),objects=Array.isArray(project.objects)?
   project.objects:[];
  // Same layout produces the same key without including mob or player data.
  const basis=JSON.stringify({bounds,
   objects:objects.map(o=>[o.kind,o.position,o.rotation||o.rot,o.scale]),
   worldCanvas:project.worldCanvas||null});
  let hash=2166136261;
  for(let i=0;i<basis.length;i++)hash=Math.imul(hash^basis.charCodeAt(i),16777619);
  return 'world-'+(hash>>>0).toString(16).padStart(8,'0');
 }
 function mapProject(raw){
  const project=deep(checkProject(raw));
  const kinds=new Set(project.objects.map(o=>o.kind));
  const models=[...kinds].filter(id=>typeof id==='string'&&id.startsWith('glb:'));
  const settings=project.phoenixGame?.minimap||null;
  project.phoenixGame=null;project.avatar=null;
  project.catalogLibrary=(project.catalogLibrary||[]).filter(row=>
   kinds.has(row?.id));
  project.layer={format:MAP,version:VERSION,key:worldKey(project),
   bounds:extent(project)};
  project.mapSettings=settings;
  return {project,models,stats:{objects:project.objects.length}};
 }
 function entitiesProject(raw){
  const project=checkProject(raw),g=project.phoenixGame||{};
  if(!g.world||!g.catalog)throw new TypeError(
   'В проекте ещё нет слоя существ (можно сохранить пустую расстановку после создания шаблонов)');
  const world=new Core.PhoenixWorld();world.load(g.world);
  const registry=new Prefabs.PhoenixPrefabCatalog();registry.load(g.catalog);
  const ids=new Set();
  for(const id of world.entityIds()){
   const p=world.getComponent(id,'prefab');
   if(!p||!registry.get(p.id))throw new TypeError('Размещённый моб без шаблона');
   ids.add(p.id);
  }
  const catalog={version:1,nextId:g.catalog.nextId,
   prefabs:g.catalog.prefabs.filter(p=>ids.has(p.id))};
  const skills={version:1,characters:(g.skills?.characters||[])
   .filter(row=>ids.has(row.id))};
  const inventory={version:1,characters:(g.inventory?.characters||[])
   .filter(row=>ids.has(row.id))};
  const assets=[...new Set(catalog.prefabs.map(p=>p.assetId)
   .filter(id=>typeof id==='string'&&id.startsWith('glb:')))];
  const itemAssets=inventory.characters.flatMap(row=>(row.items||[])
   .map(item=>item.assetId).filter(id=>typeof id==='string'&&id.startsWith('glb:')));
  for(const id of itemAssets)if(!assets.includes(id))assets.push(id);
  const result={version:2,app:'Phoenix Builder Creatures',
   objects:[],avatar:null,worldCanvas:null,textureLibrary:[],
   catalogLibrary:(project.catalogLibrary||[]).filter(row=>
    assets.includes(row?.id)),
   phoenixGame:{version:1,catalog,world:deep(g.world),
    skills,inventory},
   layer:{format:ENTITIES,version:VERSION,key:worldKey(project),
    bounds:extent(project)}};
  validateEntities(result);
  return {project:result,models:assets,stats:{
   entities:world.entityIds().length,prefabs:catalog.prefabs.length}};
 }
 function validateMap(raw){
  const p=checkProject(raw);
  if(p.layer?.format!==MAP||p.layer.version!==VERSION||
     typeof p.layer.key!=='string'||p.avatar!==null||
     p.phoenixGame!==null)
   throw new TypeError('Это не файл чистой карты Phoenix');
  if(!Array.isArray(p.catalogLibrary)||!p.layer.bounds)
   throw new TypeError('Повреждены данные карты');
  extent(p);
  return p;
 }
 function validateEntities(raw){
  const p=checkProject(raw);
  if(p.layer?.format!==ENTITIES||p.layer.version!==VERSION||
     typeof p.layer.key!=='string'||p.objects.length!==0||
     p.avatar!==null||p.worldCanvas!==null)
   throw new TypeError('Это не файл расстановки существ Phoenix');
  const game=p.phoenixGame;
  if(!game||game.version!==1||!game.catalog||!game.world)
   throw new TypeError('Неверные игровые данные в файле существ');
  const registry=new Prefabs.PhoenixPrefabCatalog();
  registry.load(game.catalog);
  const world=new Core.PhoenixWorld();world.load(game.world);
  if(world.entityIds().length>80)
   throw new TypeError('Превышен лимит размещённых существ (80)');
  const bounds=p.layer.bounds;
  if(!bounds||!Number.isFinite(bounds.width)||!Number.isFinite(bounds.depth))
   throw new TypeError('Повреждены размеры карты существ');
  for(const id of world.entityIds()){
   const link=world.getComponent(id,'prefab'),tr=world.getComponent(id,'transform');
   if(!link||!registry.get(link.id)||!Array.isArray(tr?.position)||
      tr.position.length!==3||
      !tr.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000))
    throw new TypeError('Некорректная точка появления: '+id);
  }
  if(game.inventory){
   const bag=new Inventory.Store();bag.load(game.inventory);
   if(bag.charactersList().some(id=>!registry.get(id)))
    throw new TypeError('В файле существ найден чужой инвентарь');
  }
  if(game.skills){
   const skills=new Skills.Catalog();skills.load(game.skills);
   if(skills.characters().some(id=>!registry.get(id)))
    throw new TypeError('В файле существ найдены чужие навыки');
  }
  return {project:p,count:world.entityIds().length,bounds};
 }
 function combineEntities(current,raw){
  const base=deep(checkProject(current));
  const entity=validateEntities(raw).project;
  const old=base.phoenixGame||{};
  // Place NPCs on the current map, leaving the authored map, avatar, player
  // RPG profile, player skills, HUD and minimap settings untouched.
  const currentSkills=(old.skills?.characters||[])
   .filter(row=>row.id==='player');
  const currentBag=(old.inventory?.characters||[])
   .filter(row=>row.id==='player');
  const incoming=entity.phoenixGame;
  base.phoenixGame={
   version:1,catalog:deep(incoming.catalog),world:deep(incoming.world),
   inventory:{version:1,characters:[...currentBag,...deep(incoming.inventory?.characters||[])]},
   skills:{version:1,characters:[...currentSkills,...deep(incoming.skills?.characters||[])]},
   minimap:old.minimap||null,hudLayout:old.hudLayout||null,
   playerProgression:old.playerProgression||null,
   playerCombat:old.playerCombat||null,
   playerAttackEffect:old.playerAttackEffect||'impact'
  };
  // Guard against invalid locations in an unrelated target map.
  const bounds=extent(base),world=new Core.PhoenixWorld();
  world.load(incoming.world);
  const outside=world.entityIds().filter(id=>{
   const tr=world.getComponent(id,'transform');
   return Math.abs(tr.position[0])>bounds.width/2||
    Math.abs(tr.position[2])>bounds.depth/2;
  }).length;
  return {project:base,outside,
   differentWorld:entity.layer.key!==worldKey(current),
   placed:world.entityIds().length};
 }
 return Object.freeze({VERSION,MAP,ENTITIES,worldKey,extent,mapProject,
  entitiesProject,validateMap,validateEntities,combineEntities});
});
