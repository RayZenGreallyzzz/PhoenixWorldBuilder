const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const dir=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.RoundedModules=require(path.join(dir,'rounded-modules.js'));
global.BuildSnap=require(path.join(dir,'build-snap.js'));
global.BuildJoin=require(path.join(dir,'build-join.js'));
global.BuildCurves=require(path.join(dir,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(dir,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const theta=v=>Math.atan2(-v.z,v.x);
const rotate=(v,yaw)=>new THREE.Vector3(v.x*Math.cos(yaw)+v.z*Math.sin(yaw),0,-v.x*Math.sin(yaw)+v.z*Math.cos(yaw));
function world(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),nextId:1,
  ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',placement:null,
  placementCategory:null,placementRotation:0,placementScale:1,smartSnap:true,joinMode:'auto',
  autoThickness:false,edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,
  floorLevel:0,storeyHeight:2.6,snap:2,currentPaint:'#ffffff',yaw:0,placementSurfacePaint:{},
  lastSnapResult:null});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=kind=>['arc90','arc180','wall'].includes(kind)?'wall':
  kind==='arcFloor90'?'foundation':kind==='arcCeiling90'?'ceiling':'prop';
 return w;
}
const expectedPosition=(point,out,slot,scale,box)=>{
 const yaw=theta(out.clone().negate())-theta(slot.out);
 const pivot=point.clone().sub(rotate(slot.point,yaw).multiplyScalar(scale));
 const center=new THREE.Vector3((box.min.x+box.max.x)/2,0,(box.min.z+box.max.z)/2);
 return pivot.clone().add(rotate(center,yaw).multiplyScalar(scale));
};
for(const kind of ['arc90','arc180']){
 const w=world(),builtin=w.makeBuiltin(kind);
 assert(builtin,'Starter '+kind+' must be constructible');
 assert.equal(builtin.children.length,1);
 assert.equal(builtin.children[0].material.color.getHexString(),'ffffff','New starter stays white');
 assert.equal(builtin.userData.pwbModuleSockets.length,2);
 const socket=BuildCurves.localSockets(builtin,kind);
 assert.equal(socket.length,2,'Physical arc sockets are present');
 const base=w.instantiate('wall',{id:1,pos:[0,0,0],rot:0,scale:1,category:'wall',storey:0});
 const src=BuildJoin.wallInfo(w,base);
 const target={point:src.c,out:src.dir};
 const goal=expectedPosition(target.point,target.out,socket[0],1,BuildSnap.attrBounds(builtin));
 w.setPlacement(kind,'wall');
 const solved=w.solvePlacement(goal);
 assert(solved.curveJoin&&solved.wallEnd,'Straight-to-'+kind+' must snap to a real tangent socket');
 const placed=w.placeAt(goal);assert(placed,'Arc must be placed');
 const ends=BuildCurves.sourceSockets(BuildJoin.wallInfo(w,placed));
 const connected=ends.find(x=>near(x.point,target.point)<.002);
 assert(connected,'Arc and wall endpoints touch without a gap: '+kind);
 assert(connected.out.dot(target.out)<-.99,'Arc tangent continues straight wall '+kind);
 const free=ends.find(x=>x!==connected);
 const fresh=world();
 const copied=fresh.instantiate(kind,{id:2,pos:placed.data.pos,rot:placed.data.rot,scale:1,category:'wall',storey:0});
 fresh.setPlacement('wall','wall');
 const endBox=BuildSnap.attrBounds(fresh.makeBuiltin('wall'));
 const start={point:new THREE.Vector3(-1,0,0),out:new THREE.Vector3(-1,0,0)};
 const endGoal=expectedPosition(free.point,free.out,start,1,endBox);
 const downstream=fresh.solvePlacement(endGoal);
 assert(downstream.curveJoin,'Straight wall must snap after '+kind);
 const wall=fresh.placeAt(endGoal);
 assert(wall,'Straight wall is placeable after curve '+kind);
 const match=BuildCurves.sourceSockets(BuildJoin.wallInfo(fresh,wall)).find(x=>near(x.point,free.point)<.002);
 assert(match&&match.out.dot(free.out)<-.99,'Straight wall and curved cap align');
}
for(const kind of ['arcFloor90','arcCeiling90']){
 const w=world(),root=w.makeBuiltin(kind);
 assert(root&&root.children[0].geometry.attributes.position.count>60,'Round slab triangulated '+kind);
 assert.equal(root.children[0].material.color.getHexString(),'ffffff','White starter slab '+kind);
 assert.equal(w.makeBuiltin(kind).children[0].material.color.getHexString(),'ffffff',
  'Every starter instance is pristine, independent of prior edits');
}
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
for(const kind of ['arc90','arc180','arcFloor90','arcCeiling90'])
 assert(app.includes("['"+kind+"'"),'Starter catalogue includes '+kind);
assert(html.indexOf('rounded-modules.js')<html.indexOf('world.js'),'Rounded module generator loads before WorldBuilder');
assert(html.includes('id="assetSort"'),'Sortable catalogue controls available');
assert(app.includes('items.splice(0,items.length,...start,...imported)'),
 'White permanent starting modules remain pinned before imported model sort');
assert(app.includes("catalogMode='emblems';catalogPage=0")&&app.includes("document.body.classList.add('catalogOpen')"),
 'Imported image is visible in Images library');
console.log('White quarter/half circle sockets, wall-to-arc-to-wall joins, rounded slabs, pinned catalogue and visible image imports OK');
