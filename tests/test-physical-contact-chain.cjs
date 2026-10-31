const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.BuildCore=require(path.join(dir,'build-core.js'));
global.BuildSnap=require(path.join(dir,'build-snap.js'));
global.BuildJoin=require(path.join(dir,'build-join.js'));
global.BuildCurves=require(path.join(dir,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(dir,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const close=(a,b,label)=>assert(Math.abs(a-b)<.025,label+': '+a+' != '+b);
function world(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
  nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',
  placement:null,placementCategory:null,placementRotation:0,placementScale:1,smartSnap:true,
  joinMode:'auto',autoThickness:true,edgeShift:0,placementLift:0,centerOverhead:false,
  cornerOffsetX:0,cornerOffsetZ:0,storeyHeight:5.9,floorLevel:7,snap:2,
  currentPaint:'#fff',placementSurfacePaint:{},lastSnapResult:null,yaw:0});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=id=>id.includes('floor')?'foundation':id.includes('ceil')?'ceiling':
  id.includes('roof')?'roof':id.includes('wall')?'wall':'prop';
 return w;
}
function moduleBox(width,height,depth){
 const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),
  new THREE.MeshStandardMaterial());
 mesh.position.y=height/2;root.add(mesh);return root;
}
const w=world();
w.assetCache.set('glb:floor37',moduleBox(4,.37,4));
w.assetCache.set('glb:wall347',moduleBox(2,3.47,.22));
w.assetCache.set('glb:ceil31',moduleBox(4,.31,4));
w.assetCache.set('glb:wall195',moduleBox(2,1.95,.22));
w.assetCache.set('glb:roof22',moduleBox(4,.22,4));

// Ground slab is 37 cm thick.
const floor=w.instantiate('glb:floor37',{id:1,pos:[0,0,0],rot:0,scale:1,category:'foundation',storey:99});
const floorBox=new THREE.Box3().setFromObject(floor.mesh),floorTop=floorBox.max.y;
close(floorTop,.37,'37cm floor top');

// Wall height is 3.47m. Its bottom must touch the floor top despite floorLevel=7/storeyHeight=5.9.
w.setPlacement('glb:wall347','wall');
let solved=w.solvePlacement(new THREE.Vector3(2,floorTop,0));
assert(solved.snapped,'Arbitrary-height wall snaps to physical floor edge');
let wall=w.placeAt(new THREE.Vector3(2,floorTop,0));assert(wall);
let box=new THREE.Box3().setFromObject(wall.mesh);
close(box.min.y,floorTop,'Wall bottom touches floor top');
close(box.max.y,floorTop+3.47,'Wall preserves its own 3.47m height');

// 31cm ceiling underside touches the real wall top.
const wallTop=box.max.y;
w.setPlacement('glb:ceil31','ceiling');
solved=w.solvePlacement(new THREE.Vector3(1,wallTop,0));
assert(solved.snapped&&solved.overhead,'Ceiling snaps from physical wall top');
const ceiling=w.placeAt(new THREE.Vector3(1,wallTop,0));assert(ceiling);
box=new THREE.Box3().setFromObject(ceiling.mesh);
close(box.min.y,wallTop,'Ceiling underside touches wall top');
close(box.max.y,wallTop+.31,'Ceiling thickness contributes to next contact');
const ceilingTop=box.max.y;

// Change the legacy layer and nominal height to absurd values: geometry must not move.
w.floorLevel=23;w.storeyHeight=1.8;
w.setPlacement('glb:wall195','wall');
solved=w.solvePlacement(new THREE.Vector3(1.9,ceilingTop,0));
assert(solved.snapped,'Next wall snaps to ceiling physical top');
const upper=w.placeAt(new THREE.Vector3(1.9,ceilingTop,0));assert(upper);
box=new THREE.Box3().setFromObject(upper.mesh);
close(box.min.y,ceilingTop,'Upper wall ignores layer/storeyHeight and touches ceiling');
close(box.max.y,ceilingTop+1.95,'Upper wall preserves its own 1.95m height');

// Roof underside touches the actual upper wall top.
const upperTop=box.max.y;
w.setPlacement('glb:roof22','roof');
solved=w.solvePlacement(new THREE.Vector3(1,upperTop,0));
assert(solved.snapped&&solved.overhead,'Roof uses real support top');
const roof=w.placeAt(new THREE.Vector3(1,upperTop,0));assert(roof);
box=new THREE.Box3().setFromObject(roof.mesh);
close(box.min.y,upperTop,'Roof underside touches upper wall top');

// Free placement does not jump to floorLevel * storeyHeight.
w.smartSnap=false;w.setJoinMode('free');w.setPlacement('glb:wall195','wall');
solved=w.solvePlacement(new THREE.Vector3(20,0,20));
close(solved.position.y,0,'Free wall pivot is based on actual ground/contact, not nominal floor');

assert.equal(BuildCore.contactPivotY(0,.37,1),.37);
assert.equal(BuildCore.contactPivotY(-.2,4,2),4.4);
console.log('Physical contact chain: 0.37 floor + 3.47 wall + 0.31 ceiling + 1.95 wall + roof, no storey math OK');
