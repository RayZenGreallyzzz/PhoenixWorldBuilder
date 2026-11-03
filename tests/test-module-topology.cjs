const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(base,'three.min.js'));
global.BuildSnap=require(path.join(base,'build-snap.js'));
global.ModuleTopology=require(path.join(base,'module-topology.js'));
global.BuildCore=require(path.join(base,'build-core.js'));
global.BuildJoin=require(path.join(base,'build-join.js'));
global.BuildCurves=require(path.join(base,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(base,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(base,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const near=(actual,expected,why)=>assert(Math.abs(actual-expected)<.002,why+': '+actual+' ≠ '+expected);
const eq3=(a,b,label)=>a.forEach((n,i)=>near(n,b[i],label+'['+i+']'));
function setup(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
  nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',
  placement:null,placementCategory:null,placementRotation:0,placementScale:1,
  placementAxes:{x:1,y:1,z:1},smartSnap:true,joinMode:'auto',autoThickness:true,
  edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,storeyHeight:2.6,
  floorLevel:0,snap:2,currentPaint:'#fff',placementSurfacePaint:{},lastSnapResult:null});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};
 w.onSnapChanged=()=>{};w.onAimTargetChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=id=>id==='wall'?'wall':id==='floor'?'foundation':'prop';
 return w;
}
const w=setup();
const wall=w.instantiate('wall',{id:1,pos:[3,0,-4],rot:30,scale:1,
 category:'wall',storey:0});
let md=wall.data.moduleTopology;
assert(md&&md.version===1&&md.role==='wall');
eq3(md.sizeMeters,[2,2.6,.22],'Metric wall size');
eq3(md.sockets.L.point,[-1,0,0],'Left wall end');
eq3(md.sockets.R.point,[1,0,0],'Right wall end');
eq3(md.sockets.T.point,[0,2.6,0],'Physical wall top');
assert(ModuleTopology.valid(md,'wall'));
assert(!ModuleTopology.valid(md,'foundation'),'A manually changed role invalidates old descriptor');
// Structural sockets are stable in local metres and transform with scaling
// and world rotation, including offset-origin imported GLBs.
const left=ModuleTopology.pointOf(wall.mesh,md,'L');
const right=ModuleTopology.pointOf(wall.mesh,md,'R');
near(left.distanceTo(right),2,'Rotated sockets remain 2 metres apart');
const cached=ModuleTopology.boxOf(wall);
assert(cached&&cached.min.y===0);
let traversals=0;
const orig=BuildSnap.attrBounds;
BuildSnap.attrBounds=(...args)=>{traversals++;return orig(...args)};
try{
 const first=BuildJoin.wallInfo(w,wall);
 const second=BuildJoin.wallInfo(w,wall);
 assert(first&&second,'Straight wall retains join geometry');
 near(first.a.distanceTo(first.c),2,'Straight wall socket span');
 assert.equal(traversals,0,'Cached walls no longer traverse dense vertex buffers during aim');
}finally{BuildSnap.attrBounds=orig}
const slab=w.instantiate('floor',{id:2,pos:[0,0,0],rot:0,scale:1,
 category:'foundation',storey:0});
assert.equal(slab.data.moduleTopology.role,'foundation');
assert.equal(Object.keys(slab.data.moduleTopology.perimeter).length,4,
 'Four accurate floor side segments are recorded independently from texture');
const saved=JSON.parse(JSON.stringify(wall.data));
const reloaded=w.instantiate('wall',{...saved,id:3,pos:[8,1,2],rot:90});
assert(ModuleTopology.valid(reloaded.data.moduleTopology,'wall'));
eq3(reloaded.data.moduleTopology.sizeMeters,[2,2.6,.22],'Same wall role restores its dimensions');
// Old projects missing descriptors must be upgraded transparently on load.
const old=w.instantiate('wall',{id:4,pos:[0,0,9],rot:0,scale:1,category:'wall'});
assert(ModuleTopology.valid(old.data.moduleTopology,'wall'),'Legacy project auto-upgraded');
// Changing visual mesh geometry or category triggers re-measurement, so
// sockets cannot stay stale after a shape modification.
const source=new THREE.Group();
const shifted=new THREE.Mesh(new THREE.BoxGeometry(3,3,.3),new THREE.MeshStandardMaterial());
shifted.position.set(1.3,1.5,-.5);source.add(shifted);
w.assetCache.set('glb:offset-wall',source);
const imported=w.instantiate('glb:offset-wall',{id:5,pos:[1,0,0],rot:0,scale:1,category:'wall'});
eq3(imported.data.moduleTopology.sizeMeters,[3,3,.3],'Imported metric bounds');
const l=ModuleTopology.pointOf(imported.mesh,imported.data.moduleTopology,'L');
const r=ModuleTopology.pointOf(imported.mesh,imported.data.moduleTopology,'R');
near(l.distanceTo(r),3,'Offset-pivot wall sockets');
const previous=imported.data.moduleTopology;
const assignedFloor=w.instantiate('glb:offset-wall',{id:6,pos:[0,0,0],rot:0,scale:1,
 category:'foundation',moduleTopology:previous});
assert(ModuleTopology.valid(assignedFloor.data.moduleTopology,'foundation'));
assert.notEqual(assignedFloor.data.moduleTopology,previous,
 'Manually chosen floor role is never overwritten by stale wall metadata');
assert.equal(assignedFloor.mesh.userData.pwbAutoFlattened,true);
// Topology is in the serialized object data, not in an unpersisted cache.
assert(JSON.stringify(w.objects.map(e=>e.data)).includes('"moduleTopology"'));
const html=fs.readFileSync(path.join(base,'../index.html'),'utf8');
assert(html.indexOf('js/module-topology.js')<html.indexOf('js/world.js'),
 'Structure metadata loaded before world logic');
console.log('Structural role, L/R/T/B sockets, lazy wall joining, imported floor, legacy projects and persisted metadata PASS');
