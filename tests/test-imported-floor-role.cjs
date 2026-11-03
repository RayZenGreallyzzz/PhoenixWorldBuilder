const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.BuildCore=require(path.join(dir,'build-core.js'));
global.BuildSnap=require(path.join(dir,'build-snap.js'));
global.BuildJoin=require(path.join(dir,'build-join.js'));
global.BuildCurves=require(path.join(dir,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(dir,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const near=(a,b,t=.008)=>assert(Math.abs(a-b)<t,a+' vs '+b);
function world(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
  nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',
  placement:null,placementCategory:null,placementRotation:0,placementScale:1,
  placementAxes:{x:1,y:1,z:1},smartSnap:true,joinMode:'auto',autoThickness:false,
  edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,storeyHeight:2.6,
  floorLevel:0,snap:2,currentPaint:'#fff',placementSurfacePaint:{},lastSnapResult:null,
  gameSnapChoice:'auto',gameSnapTargetId:null,gameSnapResolvedChoice:null,
  gameSnapSocketName:null,gameSnapStackT:null,_gameAimSignature:'none',yaw:0});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};
 w.onSnapChanged=()=>{};w.onAimTargetChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=kind=>kind==='glb:stone'||kind==='glb:flat'?'foundation':'prop';
 return w;
}
const upright=new THREE.Group();
upright.name='каменная плитка напол';
const panel=new THREE.Mesh(new THREE.BoxGeometry(2,2.6,.17),
 new THREE.MeshStandardMaterial({color:0xcccccc}));
panel.position.set(0,1.3,0);upright.add(panel);
const originalBounds=BuildSnap.attrBounds(upright),w=world();
w.assetCache.set('glb:stone',upright);
w.setPlacement('glb:stone','foundation');
assert.equal(w.placementCategory,'foundation');
assert(w.ghost.userData.pwbAutoFlattened,'Upright imported slab must be rotated by role');
let b=BuildSnap.attrBounds(w.ghost);
near(b.max.y-b.min.y,.17,'Flat floor must have 17 cm Y thickness');
near(b.max.z-b.min.z,2.6,'Vertical panel height becomes floor depth');
assert.equal(w.gameAimOptions({}),null,'Floor never aims at wall end sockets');
let p=new THREE.Vector3(3,0,0);
const installed=w.placeAt(p);
assert(installed&&installed.data.category==='foundation','Installed imported slab has real floor category');
b=new THREE.Box3().setFromObject(installed.mesh);
near(b.max.y-b.min.y,.17,'Installed floor lies flat');
const keptPos=installed.mesh.position.toArray();
const source=BuildSnap.attrBounds(upright);
near(source.max.y-source.min.y,2.6,'Source GLB is not modified');
w.setPlacement('glb:stone','wall');
assert(!w.ghost.userData.pwbAutoFlattened,'Changing role to wall restores original orientation');
b=BuildSnap.attrBounds(w.ghost);
near(b.max.y-b.min.y,2.6,'Wall remains upright');
assert.equal(w.placementCategory,'wall');
w.setPlacement('glb:stone','foundation');
assert(w.ghost.userData.pwbAutoFlattened,'Switching back to floor immediately recreates flat ghost');
const restored=w.instantiate('glb:stone',{id:333,pos:keptPos,rot:0,
 scale:1,category:'foundation',storey:0});
b=new THREE.Box3().setFromObject(restored.mesh);
near(b.max.y-b.min.y,.17,'Saved project floor restores flat without reimport');
const horizontal=new THREE.Group();
horizontal.add(new THREE.Mesh(new THREE.BoxGeometry(2,.17,2),
 new THREE.MeshStandardMaterial()));
const flat=WorldBuilder.orientImportedForRole(horizontal,'foundation');
assert.equal(flat,horizontal,'Already flat floor is not rotated');
const yz=new THREE.Group();
yz.add(new THREE.Mesh(new THREE.BoxGeometry(.18,2.6,2),new THREE.MeshStandardMaterial()));
b=BuildSnap.attrBounds(WorldBuilder.orientImportedForRole(yz,'foundation'));
near(b.max.y-b.min.y,.18,'YZ upright slab flattens along X thickness too');
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
assert(app.includes('w.setPlacement(id,type);w.select(null);refreshConstructionUI();refreshAimSnapUI()'),
 'Editing live imported category rebuilds the ghost immediately');
assert(app.includes("selector.addEventListener(eventName,event=>event.stopPropagation())"),
 'Category dropdown click must not accidentally select the old catalogue card');
assert(app.includes("aimPanel.classList.toggle('hidden',!activeMode)"),
 'Floor hides irrelevant wall socket controls');
console.log('Imported upright GLB assigned floor lies flat, wall stays upright, category persists to instance/restored project; aim and selector roles OK');