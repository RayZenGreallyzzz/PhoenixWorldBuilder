const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(src,'three.min.js'));
global.BuildSnap=require(path.join(src,'build-snap.js'));
global.BuildJoin=require(path.join(src,'build-join.js'));
global.BuildCurves=require(path.join(src,'build-curves.js'));
global.BuildOuterEdge=require(path.join(src,'build-outer-edge.js'));
global.BuildPlacementValidator=require(path.join(src,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(src,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
assert.equal(typeof BuildSnap.geometrySignature,'function','Snap bounds expose the geometry revision required for cache invalidation');
const corner=new THREE.Group();
const armX=new THREE.Mesh(new THREE.BoxGeometry(2,2.6,.2),new THREE.MeshStandardMaterial());
armX.position.set(-1,1.3,0);
const armZ=new THREE.Mesh(new THREE.BoxGeometry(.2,2.6,2),new THREE.MeshStandardMaterial());
armZ.position.set(0,1.3,-1);
corner.add(armX,armZ);
let arms=BuildJoin.cornerArms(corner,'corner','corner');
assert.equal(arms.length,2,'Recognize orthogonal physical corner end caps');
const prev=arms.find(a=>a.name==='corner-x').tip.x;
armX.geometry.scale(1.3,1,1);
arms=BuildJoin.cornerArms(corner,'corner','corner');
assert.equal(arms.length,2);
assert.notEqual(arms.find(a=>a.name==='corner-x').tip.x,prev,'Edited corner must refresh sockets');
function world(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
  nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,
  mode:'playbuild',placement:null,placementCategory:null,placementRotation:0,
  placementScale:1,placementAxes:{x:1,y:1,z:1},smartSnap:true,joinMode:'auto',
  autoThickness:true,edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,
  floorLevel:0,storeyHeight:2.6,snap:2,currentPaint:'#ffffff',
  placementSurfacePaint:{},placementDecals:[],lastSnapResult:null});
 w.player=new THREE.Group();w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};
 w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=k=>k==='floor'?'foundation':k==='corner'?'corner':'wall';
 return w;
}
const w=world();
w.instantiate('floor',{id:1,pos:[0,0,0],rot:0,scale:1,category:'foundation',storey:0});
w.setPlacement('wall','wall');
const solved=w.solvePlacement(new THREE.Vector3(.95,.18,0));
assert(solved.floorOuterEdge,'Floor exterior alignment must still take priority over wall-end snap');
console.log('Chinese snap patch: physical sockets, cache refresh, floor outer edge OK');
