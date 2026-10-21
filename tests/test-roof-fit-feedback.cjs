const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(root,'three.min.js'));
global.BuildSnap=require(path.join(root,'build-snap.js'));
global.BuildJoin=require(path.join(root,'build-join.js'));
global.BuildCurves=require(path.join(root,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(root,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(root,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const close=(a,b,l)=>assert(Math.abs(a-b)<.035,l+': '+a+' / '+b);
function create(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),nextId:1,
  ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'build',
  placement:null,placementCategory:null,placementRotation:0,placementScale:1,
  placementAxes:{x:1,y:1,z:1},smartSnap:true,joinMode:'auto',autoThickness:true,
  edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,storeyHeight:2.6,
  floorLevel:0,snap:2,currentPaint:'#ffffff',placementSurfacePaint:{},undo:[],
  lastSnapResult:null,centerOverhead:false});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.onChanged=()=>{};w.onSnapChanged=()=>{};w.onSelected=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=kind=>({floor:'foundation',wall:'wall',corner:'corner',roof:'roof',ceiling:'ceiling'})[kind]||'prop';
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));
 geo.setAttribute('color',new THREE.Float32BufferAttribute([1,1,1],3));w.terrain={geometry:geo};
 return w;
}
const yTop=e=>new THREE.Box3().setFromObject(e.mesh).max.y;
const w=create();
w.instantiate('wall',{id:1,pos:[-4,0,0],rot:0,scale:1,category:'wall',storey:0});
w.instantiate('wall',{id:2,pos:[4,0,0],rot:0,scale:1,category:'wall',storey:0});
const roofModel=new THREE.Group();
roofModel.add(new THREE.Mesh(new THREE.BoxGeometry(10,.3,6),new THREE.MeshStandardMaterial()));
w.assetCache.set('glb:large-roof',roofModel);
w.categoryForKind=kind=>kind==='glb:large-roof'?'roof':
 ({floor:'foundation',wall:'wall',roof:'roof'})[kind]||'prop';
w.setPlacement('glb:large-roof','roof');
let solved=w.solvePlacement(new THREE.Vector3(0,0,0));
assert(solved.overhead&&solved.snapped,'Large roof should find walls ±4m from pointer, not require a wall within 1.5m');
close(solved.position.y+BuildSnap.attrBounds(w.ghost).min.y,2.6,'Roof underside exactly at wall top');
assert(solved.supportCount>=2,'Roof should recognize both supporting walls');
w.centerOverhead=true;
solved=w.solvePlacement(new THREE.Vector3(.5,0,0));
close(solved.position.x,0,'Center roof over the supporting walls, not one module');
let installed=w.placeAt(new THREE.Vector3(0,0,0));
assert(installed,'Roof can be placed using valid green magnetic preview');
w.setPlacement('wall','wall');
w.setDimensionFactor('x',1.5);w.setDimensionFactor('y',1.3);w.setDimensionFactor('z',.6);
const sizeBefore=new THREE.Box3().setFromObject(w.ghost).getSize(new THREE.Vector3());
close(sizeBefore.x,3,'Width changes along X while preserving other model geometry');
close(sizeBefore.y,3.38,'Wall height changes along Y');
close(sizeBefore.z,.132,'Wall thickness changes along Z');
w.smartSnap=false;
const free=w.applyGhostPlacement(new THREE.Vector3(14,0,0));
assert.equal(free.valid,true);
assert.equal(free.snapped,false);
assert(w.lastSnapResult.manual||free.manual,'Unsnapped model is labelled manual, not a green magnetic connection');
installed=w.placeAt(new THREE.Vector3(14,0,0));
assert(installed,'Anisotropic wall remains placeable');
assert.deepEqual(installed.data.dimensionScale,{x:1.5,y:1.3,z:.6});
close(installed.mesh.scale.x,1.5,'Saved width');
close(installed.mesh.scale.y,1.3,'Saved height');
close(installed.mesh.scale.z,.6,'Saved thickness');
const copy=w.instantiate('wall',{...installed.data,id:99});
close(copy.mesh.scale.z,.6,'Dimension multipliers remain after scene re-instantiation');
const oldThickness=copy.mesh.scale.z;
w.setDimensionFactor('y',1.8,copy);
close(copy.mesh.scale.y,1.8,'Selected-object height can be fitted independently');
close(copy.mesh.scale.z,oldThickness,'Selected height adjustment must not alter thickness');
const scene=w.snapshot(),saved=scene.objects.find(e=>e.id===99);
assert(saved.dimensionScale.y===1.8,'Customized dimensions persist in JSON');
const freeWorld=create();freeWorld.joinMode='free';
const first=freeWorld.instantiate('wall',{id:1,pos:[0,0,0],rot:0,scale:1,category:'wall',storey:0});
freeWorld.setPlacement('wall','wall');
let check=freeWorld.applyGhostPlacement(new THREE.Vector3(0,0,0));
assert.equal(check.valid,true,'Free placement can deliberately intersect');
assert.equal(check.conflict,true,'Severe free-mode wall overlap turns preview red');
check=freeWorld.applyGhostPlacement(new THREE.Vector3(10,0,0));
assert.equal(check.conflict,undefined,'Non-overlapping free model stays amber');
freeWorld.moveTarget=first;
const v=BuildPlacementValidator.validate(freeWorld,{valid:true,snapped:true,category:'wall'},first.mesh);
assert(v.valid,'Existing wall itself is excluded from move validation when applicable');
const html=fs.readFileSync(path.join(root,'../index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
for(const name of ['dimEditorX','dimEditorY','dimEditorZ','dimGameX','dimGameY','dimGameZ',
 'btnDimsEditorReset','btnDimsGameReset'])assert(html.includes('id="'+name+'"'),'UI missing '+name);
assert(app.includes("w.setDimensionFactor(axis,n/100,selected)"),'Axis controls must not scale textures');
assert(app.includes("result.snapped&&!adjusted"),'Only truly snapped unadjusted placements are green');
console.log('Roof supports far away, nonuniform dimensions, save/restore and red/amber/green preview diagnostics OK');
