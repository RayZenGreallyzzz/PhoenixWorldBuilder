const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.BuildCore=require(path.join(dir,'build-core.js'));
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
const lower=w.instantiate('floor',{id:1,pos:[0,0,0],rot:0,scale:1,category:'foundation',storey:0});
const lowerTop=top(lower);
close(w.floorDatumAt(0,0,'wall').height,lowerTop,'Wall datum uses actual slab top');
assert.equal(w.floorDatumAt(0,0,'wall').source,'foundation');

// Floor selector is metadata/navigation only. It must not change physical Y.
assert.equal(w.setFloorLevel(9),9);
close(w.floorDatumAt(0,0,'wall').height,lowerTop,'Changing project layer does not move support plane');
assert.equal(w.setStoreyHeight(5.7),5.7);
close(w.floorDatumAt(0,0,'wall').height,lowerTop,'Changing legacy storey height does not move support plane');

// With magnet disabled the fallback is terrain, not N * storeyHeight.
w.smartSnap=false;
close(w.floorDatumAt(20,20,'wall').height,0,'Magnet off uses ground/contact plane');
w.assetCache.set('glb:pivot-wall',(()=>{
 const g=new THREE.Group(),m=new THREE.Mesh(new THREE.BoxGeometry(2,3.15,.22),new THREE.MeshStandardMaterial());
 m.position.y=1.575;g.add(m);return g;
})());
w.setPlacement('glb:pivot-wall','wall');
const manual=w.solvePlacement(new THREE.Vector3(20,0,20));
assert(!manual.snapped,'Free fallback remains unsnapped');
close(manual.position.y+BuildSnap.attrBounds(w.ghost).min.y,0,
 'Imported wall lowest mesh point stays on actual ground, not selected layer');

// Legacy layer controls may remain for organization, but placement code is geometry-first.
const html=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
assert.equal((html.match(/class="floorQuick"/g)||[]).length,6,'Layer quick buttons still available for project organization');
const worldSource=fs.readFileSync(path.join(dir,'world.js'),'utf8');
const placementBlock=worldSource.slice(worldSource.indexOf(' placementHeight('),worldSource.indexOf(' changeFloor(',worldSource.indexOf(' placementHeight(')));
assert(!/storeyHeight|floorLevel/.test(placementBlock),'placementHeight must not use nominal floor math');
console.log('Layer selector preserved as metadata; geometry, not floor number, controls placement height OK');
