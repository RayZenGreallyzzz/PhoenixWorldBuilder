const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
global.FloorClip=require(path.join(base,'js/floor-clip.js'));
global.MeshCaps=require(path.join(base,'js/mesh-caps.js'));
global.CleanMeshEdit=require(path.join(base,'js/clean-mesh-edit.js'));
global.CleanGeometry=require(path.join(base,'js/clean-geometry.js'));
global.EdgeAutoTrim=require(path.join(base,'js/edge-auto-trim.js'));
const Bulk=require(path.join(base,'js/bulk-floor-trim.js'));
const round=v=>Math.round(v*1000)/1000;
const sources=new Map(),scene=new THREE.Scene(),entries=[];
sources.set('floor',CleanGeometry.create('floor'));
sources.set('wall',CleanGeometry.create('wall'));
const glbSource=new THREE.Group();
glbSource.add(new THREE.Mesh(new THREE.BoxGeometry(2,.18,2),new THREE.MeshStandardMaterial()));
sources.set('glb:tile',glbSource);
function create(kind){
 const source=sources.get(kind);
 if(!source)return null;
 return kind==='floor'?CleanGeometry.create('floor'):source.clone(true);
}
function add(id,kind,category,pos,storey=0){
 const root=create(kind);root.position.set(...pos);scene.add(root);
 const e={id,kind,category,root,storey,scale:1,axes:{x:1,y:1,z:1},thickness:.22};
 entries.push(e);return e;
}
const wall0=add(1,'wall','wall',[0,0,0]);
const wall1=add(2,'wall','wall',[0,2.6,0],1);
const tile0=add(10,'floor','floor',[0,0,.5]);
const far=add(11,'floor','floor',[7,0,7]);
const tile1=add(12,'floor','floor',[0,2.6,.5],1);
const imported=add(13,'glb:tile','floor',[0,0,.5]);
tile0.floorTrim={enabled:true,angle:0,offset:.8,side:'less'};
const original=tile0.root;
const rawBefore=Array.from(sources.get('glb:tile').children[0].geometry.attributes.position.array);
function clone(kind){
 if(kind==='wall')return CleanGeometry.create('wall');
 return create(kind);
}
const plan=Bulk.prepare(entries,clone);
assert(plan.ok,'A multi-floor auto-plan succeeds: '+plan.reason);
assert.equal(plan.count,3,'Two builtin slabs on different storeys plus one imported floor are cut');
assert.equal(plan.unchanged,1,'Distant interior floor remains untouched');
assert.equal(plan.openGLB,0,'Imported sealed GLB floors get sealed caps');
assert.strictEqual(tile0.root,original,'Planning must not edit the live model before committing');
assert.strictEqual(far.root.parent,scene,'Unchanged floor stays in scene');
assert.deepEqual(Array.from(sources.get('glb:tile').children[0].geometry.attributes.position.array),
 rawBefore,'Auto plan does not mutate original imported GLB source data');
assert(Bulk.commit(plan,scene),'Atomic commit succeeds');
assert.notStrictEqual(tile0.root,original,'Changed floor gets new geometry');
assert.equal(original.parent,null,'Old root removed cleanly');
assert(tile0.floorTrim.enabled&&tile0.floorTrim.cuts.length,'Manual trim and new wall cuts coexist');
assert(imported.capResult&&imported.capResult.capTriangles>0&&!imported.capResult.openCut,
 'Imported GLB cut faces are sealed');
const first=CleanGeometry.localBounds(tile0.root);
const firstZ=round(first.min.z);
const planAgain=Bulk.prepare(entries,clone);
assert(planAgain.ok&&planAgain.count===3,'Second automatic pass recomputes from source');
assert(Bulk.commit(planAgain,scene));
const second=CleanGeometry.localBounds(tile0.root);
assert.equal(round(second.min.z),firstZ,'Auto cut is idempotent and does not drift on rerun');
const reset=Bulk.prepare(entries,clone,true);
assert(reset.ok&&reset.count===3,'Restore prepares all automatically cut floors');
assert(Bulk.commit(reset,scene));
assert.equal(tile0.floorTrim.cuts?.length||0,0,'Built-in auto cuts cleared');
assert.equal(imported.autoEdgeCuts.length,0,'Imported GLB auto cuts cleared');
assert.equal(tile0.floorTrim.enabled,true,'Built-in manual cut survives bulk reset');
const restored=CleanGeometry.localBounds(imported.root);
assert(Math.abs(restored.max.z-1)<.001&&Math.abs(restored.min.z+1)<.001,
 'Imported tile restores full original depth after bulk reset');
assert.equal(Bulk.prepare(entries,clone,true).count,0,'Second restore is a no-op');
const originals=entries.map(e=>e.root);
const failed=Bulk.prepare(entries,(kind)=>kind==='glb:tile'?null:clone(kind));
assert.equal(failed.ok,false,'Missing GLB blocks entire multi-floor plan');
assert.deepEqual(entries.map(e=>e.root),originals,'Failed plan preserves all live objects');
assert.equal(Bulk.commit(failed,scene),false,'Cannot commit a failed bulk plan');
assert.equal(Bulk.prepare(Array.from({length:Bulk.LIMIT+1},(_,id)=>({id,category:'floor'})),clone).ok,false,
 'Reject huge projects before expensive geometry allocation');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
for(const id of ['btnBulkTrim','btnBulkTrimReset'])
 assert(html.includes('id="'+id+'"'),'Missing button '+id);
for(const snippet of ['BulkFloorTrim.prepare','BulkFloorTrim.commit','trimWholeProject(reset=false)',
 "this.trimWholeProject(true)"])assert(app.includes(snippet),'Missing application wiring: '+snippet);
assert(html.indexOf('js/bulk-floor-trim.js')<html.indexOf('js/clean-app.js'),
 'Bulk engine must load before clean editor');
console.log('Bulk floor trimming: multi-storey, sealed imported GLB, commit/reset/idempotence/failure OK');
