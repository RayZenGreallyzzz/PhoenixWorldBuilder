const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.BuildSnap=require(path.join(dir,'build-snap.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const close=(a,b,label)=>assert(Math.abs(a-b)<.025,label+': '+a+' != '+b);
const w=Object.create(WorldBuilder.prototype);
Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
 nextId:1,ghost:null,selected:null,moveTarget:null,mode:'build',placement:null,
 placementCategory:null,placementRotation:0,placementScale:1,smartSnap:true,
 joinMode:'auto',autoThickness:true,edgeShift:0,placementLift:0,
 cornerOffsetX:0,cornerOffsetZ:0,storeyHeight:2.6,floorLevel:0,
 snap:2,currentPaint:'#ffffff',lastSnapResult:null});
w.heightAt=()=>0;w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
w.categoryForKind=kind=>({floor:'foundation',wall:'wall',ceiling:'ceiling'})[kind]||'wall';
w.highlight={setFromObject(){},visible:false};
w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
const top=entry=>new THREE.Box3().setFromObject(entry.mesh).max.y;
const position=(x=0,z=0)=>new THREE.Vector3(x,0,z);
const lower=w.instantiate('floor',{id:1,pos:[0,0,0],rot:0,scale:1,category:'foundation',storey:0});
const lowerTop=top(lower);
close(w.floorDatumAt(0,0,'wall').height,lowerTop,'First floor wall uses slab top');
assert.equal(w.floorDatumAt(0,0,'wall').source,'floor');
const lowerWall=w.instantiate('wall',{id:2,pos:[0,lowerTop,0],rot:0,scale:1,category:'wall',storey:0});
const wallTop=top(lowerWall);
assert.equal(w.setFloorLevel(2),2);
close(w.floorDatumAt(0,0,'foundation').height,wallTop,'Next slab rests on previous wall top');
assert.equal(w.floorDatumAt(0,0,'foundation').source,'wall');
const upper=w.instantiate('floor',{id:3,pos:[0,wallTop,0],rot:0,scale:1,category:'foundation',storey:1});
const upperTop=top(upper);
close(w.floorDatumAt(0,0,'wall').height,upperTop,'Second floor walls rest on second floor slab');
close(w.floorDatumAt(0,0,'foundation').height,wallTop,'Existing upper slab is never used as its own support');
const upperWall=w.instantiate('wall',{id:4,pos:[0,upperTop,0],rot:0,scale:1,category:'wall',storey:1});
assert.equal(w.setFloorLevel(3),3);
close(w.floorDatumAt(0,0,'foundation').height,top(upperWall),'Third floor slab uses previous wall top');
w.smartSnap=false;
close(w.floorDatumAt(0,0,'wall').height,5.2,'Magnet off retains configured height');

const custom=new THREE.Group();
custom.add(new THREE.Mesh(new THREE.BoxGeometry(2,2.6,.22),new THREE.MeshStandardMaterial()));
w.assetCache.set('glb:pivot-wall',custom);
w.setPlacement('glb:pivot-wall','wall');
const manual=w.solvePlacement(position(20,20));
assert(!manual.snapped,'With magnets off, imported wall uses fixed level');
close(manual.position.y+BuildSnap.attrBounds(w.ghost).min.y,5.2,
 'Imported GLB centre origin must place lowest mesh point at chosen floor height');

const html=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
assert.equal((html.match(/class="floorQuick"/g)||[]).length,6,'Three quick level buttons in both editor modes');
for(const id of ['floorDatumInfo','gameFloorDatumInfo'])assert(html.includes('id="'+id+'"'),id);
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
assert(app.includes('switchToFloor(Number(button.dataset.quickFloor))'),'Quick buttons must be wired');
console.log('Quick 1/2/3 floors, measured slab/wall support, pivot-offset GLB and manual fallback OK');
