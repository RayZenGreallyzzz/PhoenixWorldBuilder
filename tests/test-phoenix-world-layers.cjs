'use strict';
const assert=require('node:assert/strict');
const Layers=require('../app/src/main/assets/engine/core/phoenix-world-layers.js');
const Core=require('../app/src/main/assets/engine/core/phoenix-core.js');
const Prefabs=require('../app/src/main/assets/engine/core/phoenix-prefabs.js');
const Inventory=require('../app/src/main/assets/engine/core/phoenix-inventory.js');
const Skills=require('../app/src/main/assets/engine/core/phoenix-skills.js');
const Files=require('../app/src/main/assets/js/phoenix-files.js');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
const registry=new Prefabs.PhoenixPrefabCatalog();
const wolf=registry.create({name:'Волк',type:'mob',faction:'enemy',
 assetId:'glb:mob:wolf',ai:{mode:'patrol',waypoints:[[1,0,2],[5,0,8]]}});
const merchant=registry.create({name:'Торговец',type:'npc',faction:'neutral',
 assetId:'glb:mob:merchant'});
registry.create({name:'Не размещённый босс',type:'boss',
 assetId:'glb:mob:unplaced'});
const world=new Core.PhoenixWorld();
const wolfId=world.createEntity('wolf-instance');
world.setComponent(wolfId,'prefab',{id:wolf});
world.setComponent(wolfId,'transform',{position:[11,0,17],yaw:2.2});
world.setComponent(wolfId,'character',{nickname:'Волк-1',level:6,
 ai:{waypoints:[[11,0,17],[13,0,17]]}});
const shopId=world.createEntity('merchant-instance');
world.setComponent(shopId,'prefab',{id:merchant});
world.setComponent(shopId,'transform',{position:[-9,0,3],yaw:0.4});
const inventory=new Inventory.Store();
inventory.add(wolf,{name:'Серьга волка',kind:'accessory',slot:'amulet',
 stats:{hp:3}});
inventory.add('player',{name:'Меч героя',kind:'weapon',slot:'weapon',
 assetId:'glb:item:hero-sword',stats:{damage:14}});
inventory.add(merchant,{name:'Товар',kind:'material',
 assetId:'glb:item:store',stats:{damage:0}});
const skills=new Skills.Catalog();
const skill={name:'Удар',icon:'⚔',type:'damage',
 basePower:16,growth:4,level:1,maxLevel:5,
 manaCost:4,cooldown:2,range:3,animation:'Attack'};
skills.set(wolf,'slot3',skill);
skills.set('player','slot3',{...skill,name:'Меч героя'});
const project={version:2,app:'Phoenix Builder Clean',floor:0,nextId:2,
 objects:[{id:1,kind:'glb:scene:oak',category:'prop',
  position:[22,0,7],rotation:{x:0,y:0,z:0},scale:1,
  surface:{color:'#ffffff'}}],
 avatar:{assetId:'glb:avatar:hero',fileName:'Hero.glb'},
 worldCanvas:{width:100,depth:120,tiles:[{row:1,col:2,style:'grass'}],
  heights:[{x:10,z:8,y:12}],paintMasks:{},textureLibrary:[]},
 decals:[{id:'dec-1',imageId:'texture:oak'}],
 textureLibrary:[{id:'texture:oak',name:'Tree',type:'image/png'}],
 catalogLibrary:[
  {id:'glb:scene:oak',name:'Oak',folder:'outdoor'},
  {id:'glb:mob:wolf',name:'Wolf',folder:'misc',role:'mob'},
  {id:'glb:mob:merchant',name:'Merchant',folder:'misc',role:'mob'},
  {id:'glb:avatar:hero',name:'Hero',folder:'misc',role:'mob'}
 ],
 phoenixGame:{version:1,world:world.serialize(),catalog:registry.serialize(),
  skills:skills.serialize(),inventory:inventory.serialize(),
  minimap:{version:1,shape:'circle',range:160},
  playerProgression:{level:6},playerCombat:{damage:21},hudLayout:{layout:'normal'},
  playerAttackEffect:'spark'}};
const initial=JSON.parse(JSON.stringify(project));
const map=Layers.mapProject(project);
assert.equal(map.project.layer.format,Layers.MAP);
assert.equal(map.project.phoenixGame,null,'Map cannot contain hero/mob definitions');
assert.equal(map.project.avatar,null,'Map cannot contain player avatar');
assert.equal(map.project.objects.length,1);
assert.deepEqual(map.project.worldCanvas,project.worldCanvas);
assert.deepEqual(map.project.decals,project.decals);
assert.deepEqual(map.project.textureLibrary,project.textureLibrary);
assert.deepEqual(map.models,['glb:scene:oak'],'No mob or hero GLBs in map resources');
assert.deepEqual(map.project.catalogLibrary.map(m=>m.id),['glb:scene:oak']);
assert.deepEqual(map.project.mapSettings,{version:1,shape:'circle',range:160});
Layers.validateMap(map.project);
assert.equal(JSON.stringify(project),JSON.stringify(initial),'Export does not delete or change anything in Builder');
const things=Layers.entitiesProject(project);
assert.equal(things.project.layer.format,Layers.ENTITIES);
assert.equal(things.project.objects.length,0,'Creature pack has no buildings');
assert.equal(things.project.worldCanvas,null,'Creature pack has no terrain');
assert.equal(things.project.avatar,null,'Creature pack has no player avatar');
assert.equal(things.stats.entities,2);
assert.equal(things.stats.prefabs,2,'Unplaced template excluded from placed NPC set');
assert.equal(JSON.stringify(things.project.phoenixGame.world),JSON.stringify(project.phoenixGame.world));
assert.deepEqual(things.project.phoenixGame.catalog.prefabs.map(m=>m.id),[wolf,merchant]);
assert.equal(things.project.phoenixGame.skills.characters.length,1,
 'Player skills must not leak into creature layer');
assert.equal(things.project.phoenixGame.skills.characters[0].id,wolf);
assert(things.project.phoenixGame.inventory.characters.every(row=>row.id!=='player'),
 'Player inventory must never leak into NPC pack');
assert(!things.models.includes('glb:avatar:hero'));
assert(!things.models.includes('glb:scene:oak'));
assert(things.models.includes('glb:mob:wolf'));
assert(things.models.includes('glb:mob:merchant'));
assert(things.models.includes('glb:item:store'));
assert.equal(things.project.layer.key,map.project.layer.key);
Layers.validateEntities(things.project);
const merged=Layers.combineEntities(map.project,things.project);
assert.equal(merged.differentWorld,false);
assert.equal(merged.outside,0);
assert.equal(merged.placed,2);
assert.deepEqual(merged.project.objects,map.project.objects);
assert.deepEqual(merged.project.worldCanvas,map.project.worldCanvas);
assert.equal(JSON.stringify(merged.project.phoenixGame.world),JSON.stringify(project.phoenixGame.world));
assert.deepEqual(merged.project.phoenixGame.minimap,null,
 'Unpopulated destination map should not gain old creature map UI');
const mapWithPlayer=JSON.parse(JSON.stringify(map.project));
mapWithPlayer.avatar={assetId:'glb:avatar:other',fileName:'NewHero.glb'};
mapWithPlayer.phoenixGame={version:1,catalog:new Prefabs.PhoenixPrefabCatalog().serialize(),
 world:new Core.PhoenixWorld().serialize(),skills:{version:1,characters:[
  ...skills.serialize().characters.filter(row=>row.id==='player')]},
 inventory:{version:1,characters:inventory.serialize().characters.filter(row=>row.id==='player')},
 minimap:{shape:'square',range:60},playerCombat:{damage:99},
 playerProgression:{level:75}};
const mergedPlayer=Layers.combineEntities(mapWithPlayer,things.project).project;
assert.deepEqual(mergedPlayer.avatar,mapWithPlayer.avatar);
assert.deepEqual(mergedPlayer.phoenixGame.playerCombat,{damage:99});
assert.deepEqual(mergedPlayer.phoenixGame.playerProgression,{level:75});
assert.deepEqual(mergedPlayer.phoenixGame.minimap,{shape:'square',range:60});
assert.equal(mergedPlayer.phoenixGame.skills.characters.length,2);
assert.equal(mergedPlayer.phoenixGame.inventory.characters.length,3);
assert.deepEqual(mapWithPlayer.worldCanvas,mergedPlayer.worldCanvas);
const otherMap=JSON.parse(JSON.stringify(mapWithPlayer));
otherMap.worldCanvas.width=15;
const other=Layers.combineEntities(otherMap,things.project);
assert.equal(other.differentWorld,true);
assert.equal(other.outside,2,'Out-of-bounds spawn coordinates must be reported');
assert.throws(()=>Layers.validateMap(things.project),/карты/);
assert.throws(()=>Layers.validateEntities(map.project),/расстановки/);
const broken=JSON.parse(JSON.stringify(things.project));
broken.phoenixGame.world.entities[0].components.prefab.id='prefab-999';
assert.throws(()=>Layers.validateEntities(broken),/шаблона/);
const bytes=new Map([
 ['glb:scene:oak',Uint8Array.from([0x67,0x6c,0x54,0x46,1,2,3,4]).buffer],
 ['texture:oak',Uint8Array.from([1,2,3]).buffer],
 ['glb:mob:wolf',Uint8Array.from([4,5,6,7]).buffer],
 ['glb:mob:merchant',Uint8Array.from([8,9,10]).buffer],
 ['glb:item:store',Uint8Array.from([11,12,13]).buffer]
]);
(async()=>{
 const mapPack=await Files.packageProject(map.project,
  project.textureLibrary,map.models,id=>bytes.get(id));
 const creaturePack=await Files.packageProject(things.project,[],
  things.models,id=>bytes.get(id));
 assert.deepEqual(mapPack.assets.map(a=>a.id).sort(),
  ['glb:scene:oak','texture:oak'],'Map package carries environment only');
 assert.deepEqual(creaturePack.assets.map(a=>a.id).sort(),
  ['glb:item:store','glb:mob:merchant','glb:mob:wolf'],
  'Creature package carries only NPC/mob GLBs and equipment');
 const imported=new Map();
 const parsed=await Files.unpackProject(creaturePack,(id,data)=>imported.set(id,data));
 Layers.validateEntities(parsed.project);
 assert.deepEqual([...new Uint8Array(imported.get('glb:mob:wolf'))],
  [...new Uint8Array(bytes.get('glb:mob:wolf'))]);
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
 const ui=fs.readFileSync(path.join(base,'engine/builder/phoenix-world-layers-editor.js'),'utf8');
 for(const id of ['btnPhoenixWorldLayers','phoenixWorldLayersPanel',
  'btnExportMapLayer','btnImportMapLayer','btnExportEntityLayer',
  'btnImportEntityLayer','phoenixImportMapLayerFile',
  'phoenixImportEntityLayerFile']){
  assert(html.includes('id="'+id+'"'),'Missing world-layer control: '+id);
 }
 assert(app.includes('new PhoenixWorldLayersEditor(this,'));
 assert(ui.includes('PhoenixFiles.savePortableProject(made.project'),
  'Both layers must embed models into portable JSON');
 assert(ui.includes('this.b.prefabEditor.loadFromProject('));
 assert(ui.includes('this.b.markProjectDirty?.()'),
  'Imported layer changes must require explicit top-level Save');
 assert(!ui.includes('this.b.save()'),
  'Layer imports must not auto-save or overwrite entire project');
 assert.equal(JSON.stringify(project),JSON.stringify(initial));
 console.log('PASS: separate portable map/buildings/terrain and NPC placement JSON; independent GLB bytes, no hero leakage, exact coordinates, safe merges');
})().catch(error=>{console.error(error);process.exitCode=1});
