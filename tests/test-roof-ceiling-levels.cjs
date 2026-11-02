const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(root,'three.min.js'));
global.BuildCore=require(path.join(root,'build-core.js'));
global.BuildSnap=require(path.join(root,'build-snap.js'));
global.BuildJoin=require(path.join(root,'build-join.js'));
global.BuildCurves=require(path.join(root,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(root,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(root,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const close=(a,b,msg)=>assert(Math.abs(a-b)<.025,msg+': '+a+' != '+b);
const w=Object.create(WorldBuilder.prototype);
Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),nextId:1,
 ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',placement:null,
 placementCategory:null,placementRotation:0,placementScale:1,smartSnap:true,joinMode:'auto',
 autoThickness:true,edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,
 centerOverhead:false,storeyHeight:3.2,lastSnapResult:null,floorLevel:0,snap:2,
 currentPaint:'#ada08b',yaw:0,placementSurfacePaint:{}});
w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSnapChanged=()=>{};w.onSelected=()=>{};
w.highlight={setFromObject(){},visible:false};
w.categoryForKind=id=>id==='glb:floor'?'foundation':['floor','wall','roof','ceiling','stairs'].includes(id)?id==='floor'?'foundation':id:'prop';

// Non-standard raised/rotated GLB deck: 34cm source thickness, scaled 1.4x.
const deck=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(6,.34,4),new THREE.MeshBasicMaterial());
mesh.position.set(.7,.17,-.3);deck.add(mesh);deck.position.set(4,1.5,-3);deck.rotation.y=.54;deck.scale.setScalar(1.4);w.scene.add(deck);
w.objects.push({kind:'glb:floor',data:{id:88,pos:deck.position.toArray(),rot:31,scale:1.4,category:'foundation',storey:91},mesh:deck});
const b=BuildSnap.attrBounds(deck);deck.updateMatrixWorld(true);
const edge=deck.localToWorld(new THREE.Vector3(b.max.x+.1,b.max.y,(b.min.z+b.max.z)/2));
const center=deck.localToWorld(new THREE.Vector3((b.min.x+b.max.x)/2,b.max.y,(b.min.z+b.max.z)/2));
const deckTop=center.y;w.player.position.set(edge.x,deckTop+.85,edge.z);

// Scaled wall keeps its own real height and starts exactly on deck top.
w.setPlacementScale(1.38);w.setPlacement('wall','wall');
const wall=w.placeAt(edge);assert(wall);close(new THREE.Box3().setFromObject(wall.mesh).min.y,deckTop,'wall rests on raised deck');
const wallTop=new THREE.Box3().setFromObject(wall.mesh).max.y;

// Ceiling underside touches actual wall top.
w.setPlacementScale(1);w.setPlacement('ceiling','ceiling');
let solved=w.solvePlacement(new THREE.Vector3(center.x,deckTop,center.z));
assert(solved.snapped&&solved.overhead,'Ceiling must snap overhead');
close(solved.targetHeight,wallTop,'Ceiling target is real transformed wall top');
const ceiling=w.placeAt(new THREE.Vector3(center.x,deckTop,center.z));
const ceilingBox=new THREE.Box3().setFromObject(ceiling.mesh);
close(ceilingBox.min.y,wallTop,'Ceiling underside touches wall top');
const ceilingTop=ceilingBox.max.y;

// Roof uses highest physical surface.
w.setPlacement('roof','roof');solved=w.solvePlacement(new THREE.Vector3(center.x,ceilingTop,center.z));
assert(solved.snapped&&solved.overhead,'Roof snaps to physical support');
close(solved.targetHeight,ceilingTop,'Roof sits on existing ceiling top');
const roof=w.placeAt(new THREE.Vector3(center.x,ceilingTop,center.z));
close(new THREE.Box3().setFromObject(roof.mesh).min.y,ceilingTop,'Roof lowest edge meets ceiling top');

// A project layer number and nominal height must not affect later placement.
w.setFloorLevel(6);w.setStoreyHeight(4.1);
w.setPlacement('floor','foundation');
const nextFloorPoint=new THREE.Vector3(center.x,ceilingTop,center.z);
solved=w.solvePlacement(nextFloorPoint);
assert(solved.snapped&&solved.stackedOnSlab,'Floor attaches to ceiling top, not to a lower floor edge');
assert.equal(solved.reference,ceiling.data.id,'Ceiling directly under the cursor is the structural support');
const expectedUpperCentre=new THREE.Box3().setFromObject(ceiling.mesh).getCenter(new THREE.Vector3());
const newBounds=BuildSnap.attrBounds(w.ghost);
const incomingCentre=solved.position.clone().add(
 new THREE.Vector3((newBounds.min.x+newBounds.max.x)/2,0,(newBounds.min.z+newBounds.max.z)/2));
close(incomingCentre.x,expectedUpperCentre.x,'New floor aligned over ceiling X');
close(incomingCentre.z,expectedUpperCentre.z,'New floor aligned over ceiling Z');
const topFloor=w.placeAt(nextFloorPoint);
const topFloorTop=new THREE.Box3().setFromObject(topFloor.mesh).max.y;
close(new THREE.Box3().setFromObject(topFloor.mesh).min.y,ceilingTop,'Next floor bottom touches ceiling top');

// Test a real position on the NEW upper slab, not a distant edge of the
// ground-floor deck which is outside this smaller ceiling/floor footprint.
w.setPlacement('wall','wall');
const upperBounds=BuildSnap.attrBounds(topFloor.mesh);
topFloor.mesh.updateMatrixWorld(true);
const upperPoint=new THREE.Vector3(upperBounds.max.x-.2,upperBounds.max.y,
 (upperBounds.min.z+upperBounds.max.z)/2).applyMatrix4(topFloor.mesh.matrixWorld);
let upperSolved=w.solvePlacement(upperPoint);
assert(upperSolved.snapped,'Upper wall must find its actual new floor support');
close(upperSolved.position.y,topFloorTop,'Upper wall base uses the upper floor plane');
const upperWall=w.placeAt(upperPoint);assert(upperWall);
const upperWallBox=new THREE.Box3().setFromObject(upperWall.mesh);
close(upperWallBox.min.y,topFloorTop,'Upper wall touches new floor top');

w.setPlacement('roof','roof');
solved=w.solvePlacement(new THREE.Vector3(center.x,upperWallBox.max.y,center.z));
close(solved.targetHeight,upperWallBox.max.y,'Roof uses upper wall top, not selected layer × 4.1m');

// Free fallback never invents a storey height.
w.smartSnap=false;w.setJoinMode('free');w.setPlacement('roof','roof');
const free=w.solvePlacement(new THREE.Vector3(30,1.25,30));assert(!free.snapped);
close(free.position.y+BuildSnap.attrBounds(w.ghost).min.y,1.25,'Free roof preserves explicitly requested height, not selected floor number');

const worldText=fs.readFileSync(path.join(root,'world.js'),'utf8');
const placementBlock=worldText.slice(worldText.indexOf(' placementHeight('),worldText.indexOf(' changeFloor(',worldText.indexOf(' placementHeight(')));
assert(!/storeyHeight|floorLevel/.test(placementBlock),'Nominal storey math must not re-enter placementHeight');
console.log('Raised GLB deck, scaled wall, ceiling, floor, upper wall and roof all touch physical surfaces; layer height ignored OK');
