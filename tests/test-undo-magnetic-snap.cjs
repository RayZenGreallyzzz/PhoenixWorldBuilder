const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(base,'three.min.js'));
global.BuildSnap=require(path.join(base,'build-snap.js'));
global.BuildJoin=require(path.join(base,'build-join.js'));
global.BuildCurves=require(path.join(base,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(base,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(base,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
function createWorld(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
  nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,
  mode:'playbuild',placement:null,placementCategory:null,placementRotation:0,
  placementScale:1,smartSnap:true,joinMode:'auto',autoThickness:true,
  edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,
  floorLevel:0,storeyHeight:2.6,snap:2,currentPaint:'#aaaaaa',
  placementSurfacePaint:{},placementDecals:[],undo:[],yaw:0,lastSnapResult:null});
 w.player=new THREE.Group();w.player.position.set(0,.85,5.25);w.scene.add(w.player);
 w.terrain=new THREE.Mesh(new THREE.PlaneGeometry(128,128,64,64),
  new THREE.MeshStandardMaterial());
 w.terrain.geometry.setAttribute('color',
  new THREE.BufferAttribute(new Float32Array(65*65*3),3));
 w.heightAt=()=>0;w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=kind=>({floor:'foundation',wall:'wall'})[kind]||'prop';
 return w;
}
const close=(a,b)=>Math.abs(a-b)<1e-4;
(async()=>{
 const w=createWorld();
 w.instantiate('floor',{id:1,pos:[0,0,0],rot:0,scale:1,category:'foundation',storey:0});
 w.setPlacement('floor','foundation');
 for(const x of [-.6,-.2,.2,.6]){
  const solved=w.solvePlacement(new THREE.Vector3(x,0,1.25));
  assert(solved.slab,'Floor snap must find existing slab');
  assert(close(solved.position.x,0),'Floor should share a modular X centre, not cursor-offset X: '+x);
  assert(close(solved.position.z,2),'Floor should share a full-length Z edge: '+x);
 }
 const added=w.placeAt(new THREE.Vector3(.55,0,1.25));
 assert(added&&w.objects.length===2,'Second slab placed');
 assert(close(added.mesh.position.x,0)&&close(added.mesh.position.z,2));
 const undone=await w.undoLast();
 assert.equal(undone,true);
 assert.equal(w.objects.length,1,'Undo removes slab');
 assert(w.lastSnapResult&&w.lastSnapResult.valid!==false,
  'Preview must be recalculated immediately after undo');
 assert(close(w.ghost.position.x,0)&&close(w.ghost.position.z,2),
  'Undo must refresh preview to current modular socket');
 const again=w.placeAt(new THREE.Vector3(-.55,0,1.25));
 assert(again&&close(again.mesh.position.x,0)&&close(again.mesh.position.z,2),
  'Rebuilding after undo must be identical regardless of cursor drift');
 const walls=createWorld();
 walls.instantiate('wall',{id:3,pos:[0,0,0],rot:0,scale:1,category:'wall',storey:0});
 walls.setPlacement('wall','wall');
 walls.ghost.position.set(1,0,0);walls.ghost.rotation.y=0;
 const halfOverlap=BuildPlacementValidator.validate(walls,{
  position:walls.ghost.position.clone(),rotation:0,snapped:true,wallEnd:true,
  reference:3,category:'wall'
 },walls.ghost);
 assert.equal(halfOverlap.valid,false,'Half-overlapping reference wall must be rejected');
 walls.ghost.position.set(2,0,0);
 const flush=BuildPlacementValidator.validate(walls,{
  position:walls.ghost.position.clone(),rotation:0,snapped:true,wallEnd:true,
  reference:3,category:'wall'
 },walls.ghost);
 assert.equal(flush.valid,true,'Correct end-to-end wall remains allowed');
 console.log('Undo magnetic preview, full-module floor seams, half-overlap wall rejection OK');
})().catch(error=>{console.error(error);process.exitCode=1});
