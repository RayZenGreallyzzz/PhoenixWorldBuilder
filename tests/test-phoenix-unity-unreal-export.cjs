'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../app/src/main/assets');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'js/clean-app.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'engine/builder/phoenix-world-layers-editor.js'),'utf8');
const map=require('../app/src/main/assets/engine/core/phoenix-world-layers.js');
globalThis.PhoenixWorldLayers=map;
const files=[];
globalThis.PhoenixFiles={
 savePortableProject:async(project,textures,models,readAsset,filename)=>{
  files.push({name:filename,project:JSON.parse(JSON.stringify(project)),
   textures,models});return {name:filename};
 }};
const Editor=require('../app/src/main/assets/engine/builder/phoenix-world-layers-editor.js');
assert(html.includes('id="btnExportExternalWorld"'),'External export button missing');
assert(ui.includes('this.b.exportGLB()'),'External export must use actual static GLB geometry');
assert(ui.includes('await this.exportMap()'),'External export must include reusable world and heightfield');
assert(app.includes("return true;")&&app.includes("return false;"),
 'GLB export must report save success/failure to external exporter');
const elements=new Map();
const doc={getElementById(id){
 if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',
  listeners:{},addEventListener(name,fn){this.listeners[name]=fn}});
 return elements.get(id);
}};
const original={version:2,objects:[{id:1,kind:'glb:tree',category:'prop',
 position:[11,0,-2],rotation:{x:0,y:.3,z:0},scale:1}],
 avatar:{assetId:'glb:avatar:hero'},phoenixGame:null,
 worldCanvas:{version:1,width:100,depth:100,tileSize:50,
 heights:[[10,10,25]],tiles:[{col:0,row:0,style:'grass'}],paintMasks:[]},
 textureLibrary:[],catalogLibrary:[]};
const before=JSON.stringify(original);
const calls=[];
const b={entries:[{hidden:false,kind:'glb:tree'}],
 playBridge:{active:false},projectLoadRunning:false,
 project(){return original},textureFiles:[],
 async exportGLB(){calls.push('geometry');return true}};
const ed=new Editor(b,{readAsset:async()=>null},doc);
(async()=>{
 const ok=await ed.exportExternalWorld();
 assert(ok);
 assert.deepEqual(calls,['geometry']);
 assert.equal(files.length,1);
 assert.equal(files[0].name,'Phoenix_World_Map.phoenix.json');
 assert.equal(files[0].project.layer.format,map.MAP);
 assert.equal(files[0].project.phoenixGame,null);
 assert.equal(files[0].project.avatar,null);
 assert.deepEqual(files[0].project.worldCanvas.heights,[[10,10,25]]);
 assert.equal(JSON.stringify(original),before,'Read-only export cannot alter Builder world');
 files.length=0;calls.length=0;
 b.entries=[];const empty=await ed.exportExternalWorld();
 assert(empty);assert.deepEqual(calls,[]);
 assert.equal(files.length,1,'Terrain-only map should work without GLB');
 files.length=0;calls.length=0;
 b.entries=[{hidden:false}];b.exportGLB=async()=>{calls.push('geometry');return false};
 assert.equal(await ed.exportExternalWorld(),false,'Canceling GLB must stop external export');
 assert.equal(files.length,0);
 b.playBridge.active=true;
 assert.equal(await ed.exportExternalWorld(),false,'Cannot export during PLAY');
 console.log('PASS: Unity/Unreal two-stage export uses real GLB + map heightfield, excludes actors, preserves project and catches failures');
})().catch(e=>{console.error(e);process.exitCode=1});
