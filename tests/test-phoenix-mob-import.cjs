'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const editor=fs.readFileSync(path.join(base,'engine/builder/prefab-editor.js'),'utf8');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const begin=app.indexOf(' async importGLB(file,options={}){');
const end=app.indexOf(' async importOtherModel(file){',begin);
assert(begin>=0&&end>begin,'GLB importer missing');
assert(html.includes('id="phoenixMobImportModel"'),'NPC editor needs dedicated GLB picker');
assert(editor.includes("this.el('phoenixMobImportModel').addEventListener('change'"),
 'Mob import must use its own file picker');
assert(editor.includes('this.b.importGLB(file,{forMob:true})'),
 'Mob import must request a model, not a building module');
assert(!editor.includes("this.el('importUniversalModel').click()"),
 'Mob UI must not invoke building import');
const imports=[],selected=[],catalogRenders=[],refs=[],messages=[],statuses=[],storage=[];
const inputs={importCategory:{value:'wall'},optimizationStats:{textContent:'GLB parsed'}};
const $=id=>inputs[id]||{value:'auto'};
const SmartCatalog={
 classify:()=>({folder:'misc'}),
 category:f=>f==='walls'?'wall':'prop',
 labels:{misc:'Разное',walls:'Стены'}
};
const safeName=s=>String(s);
const notify=(m)=>messages.push(m);
const localStorage={setItem:(k,v)=>storage.push([k,v])};
const Harness=new Function('$','SmartCatalog','safeName','notify','localStorage',
 'return class Harness {'+app.slice(begin,end)+'}')(
 $,SmartCatalog,safeName,notify,localStorage);
const builder=new Harness();
builder.catalogMeta=new Map();builder.assets=new Map();
builder.smartCatalogFolder='walls';builder.tool='pick';
builder.prefabEditor={refreshModels:(id)=>refs.push(id),status:s=>statuses.push(s)};
builder.cacheModel=async(id,data,category)=>{
 imports.push({id,category,size:data.byteLength});
 builder.assets.set(id,{role:builder.catalogMeta.get(id).role||''});
};
builder.saveCatalogMeta=()=>{};
builder.renderCatalog=()=>catalogRenders.push(true);
builder.selectKind=(id)=>{selected.push(id);builder.tool='place'};
(async()=>{
 const monster={name:'monster.glb',arrayBuffer:async()=>new ArrayBuffer(4)};
 const id=await builder.importGLB(monster,{forMob:true});
 assert(id?.startsWith('glb:'),'NPC import must return GLB asset ID');
 assert.equal(builder.catalogMeta.get(id).role,'mob');
 assert.equal(builder.catalogMeta.get(id).category,'prop');
 assert.equal(imports.length,1);
 assert.equal(selected.length,0,'NPC import must not select a building preview');
 assert.equal(catalogRenders.length,0,'NPC import must not rebuild construction catalog');
 assert.equal(builder.tool,'pick','NPC import must not enable building place mode');
 assert.equal(builder.smartCatalogFolder,'walls','Do not switch building library folder');
 assert.deepEqual(refs,[id],'Imported GLB should be selected in NPC model dropdown');
 assert(statuses[0].includes('Сохранить шаблон'));
 assert.equal(storage.length,0,'NPC import must not rewrite building gallery preferences');
 const wall={name:'wall.glb',arrayBuffer:async()=>new ArrayBuffer(2)};
 const wallId=await builder.importGLB(wall);
 assert.equal(builder.catalogMeta.get(wallId).role,undefined);
 assert.equal(builder.catalogMeta.get(wallId).category,'wall');
 assert.deepEqual(selected,[wallId],'Construction imports must still select the module');
 assert.equal(builder.tool,'place');
 assert.equal(builder.smartCatalogFolder,'walls');
 assert.equal(catalogRenders.length,1);
 assert.equal(imports.length,2);
 assert.equal(messages.length,2);
 console.log('PASS: monster imports target NPC picker only; construction imports retain existing behavior');
})().catch(e=>{console.error(e);process.exitCode=1});
