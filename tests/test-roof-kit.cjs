const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const dir=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.RoundedModules=require(path.join(dir,'rounded-modules.js'));
global.RoofModules=require(path.join(dir,'roof-modules.js'));
global.BuildSnap=require(path.join(dir,'build-snap.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const w=Object.create(WorldBuilder.prototype);
Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
 nextId:1,selected:null,placement:null,placementCategory:null,placementScale:1,moveTarget:null});
w.onChanged=()=>{};w.onSelected=()=>{};w.highlight={setFromObject(){},visible:false};
const existing=new Set(['floor','ceiling','wall','corner','arc90','arc180']);
for(const id of existing)assert(w.makeBuiltin(id),'Original starter must remain '+id);
for(let pitch=1;pitch<=6;pitch++){
 const kind='roof'+pitch,template=w.makeBuiltin(kind);
 assert(template,'Missing roof with '+pitch+' pitched faces');
 assert.equal(template.children.length,pitch,'Slope count is physically '+pitch);
 assert.equal(template.userData.pwbSlopeCount,pitch);
 const bounds=new THREE.Box3().setFromObject(template);
 assert(bounds.max.y>bounds.min.y+.4,'Roof must have a true slope');
 assert(bounds.max.y<=1.1,'Roof heights remain compatible with modular world');
 template.traverse(x=>{if(!x.isMesh)return;
  assert.equal(x.material.color.getHexString(),'ffffff','Every roof kit must be plain white');
  assert(x.geometry.attributes.uv?.count>0,'Roof has UVs for imported texture');
  assert(x.geometry.attributes.normal.count>0,'Roof has calculated normals');
  assert(!x.geometry.boundingBox.isEmpty(),'Every roof part has bounds');
 });
 const independent=w.makeBuiltin(kind);
 template.children[0].material.color.set('#ff0000');
 assert.equal(independent.children[0].material.color.getHexString(),'ffffff',
  'Built-in white prototype cannot be recoloured by editing another instance');
 const instance=w.instantiate(kind,{id:pitch,pos:[(pitch-1)*4,0,0],rot:0,scale:1,category:'roof',storey:0});
 assert.equal(instance.mesh.children.length,pitch,'Roof piece survives placing in scene');
 assert.equal(instance.data.kind,undefined,'Scene stores roof kind at entry level, not hardcoded geometry');
 assert.equal(instance.kind,kind);
}
for(const kind of ['roofSlope','roofRidge','roofValley','roofHip','roofEave',
 'roofInnerCorner','roofOuterCorner','roofGable','roofFlat']){
 const template=w.makeBuiltin(kind);
 assert(template?.children.length>0,'Missing separate roof part '+kind);
 template.traverse(x=>{if(x.isMesh)assert.equal(x.material.color.getHexString(),'ffffff')});
}
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
assert(html.indexOf('roof-modules.js')<html.indexOf('world.js'),'Roof prototypes must load before world');
for(let n=1;n<=6;n++)assert(app.includes("['roof"+n+"'"),'Roof #'+n+' in starter catalogue');
for(const kind of ['roofSlope','roofRidge','roofValley','roofHip','roofEave',
 'roofInnerCorner','roofOuterCorner','roofFlat'])
 assert(app.includes("['"+kind+"'"),'Roof part '+kind+' present in catalogue');
console.log('6 solid white pitched roofs (1-6 slopes), 9 assembly parts, reusable independent geometries and scene placement OK');
