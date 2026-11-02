const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const d=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(d,'three.min.js'));
global.BuildCore=require(path.join(d,'build-core.js'));
global.BuildSnap=require(path.join(d,'build-snap.js'));
global.BuildJoin=require(path.join(d,'build-join.js'));
global.BuildCurves=require(path.join(d,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(d,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(d,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
function fresh(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
  nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',
  placement:null,placementCategory:null,placementRotation:0,placementScale:1,
  placementAxes:{x:1,y:1,z:1},smartSnap:true,joinMode:'auto',autoThickness:true,
  edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,storeyHeight:2.6,
  floorLevel:0,snap:2,currentPaint:'#fff',placementSurfacePaint:{},lastSnapResult:null,yaw:0});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};
 w.onSnapChanged=()=>{};w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=kind=>kind==='floor'?'foundation':'wall';
 return w;
}
const close=(a,b,info,t=.004)=>assert(Math.abs(a-b)<t,info+': '+a+' vs '+b);
function projection(root,normal){
 const b=BuildSnap.attrBounds(root);root.updateWorldMatrix(true);
 const p=new THREE.Vector3(),v=[];
 for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])
  for(const z of [b.min.z,b.max.z])v.push(
   p.set(x,y,z).applyMatrix4(root.matrixWorld).dot(normal));
 return Math.max(...v);
}
for(const axis of ['x','z'])for(const sign of [-1,1]){
 const w=fresh(),floor=w.instantiate('floor',{id:100,pos:[0,0,0],
  rot:0,scale:1,category:'foundation',storey:0});
 const floorBox=new THREE.Box3().setFromObject(floor.mesh);
 w.setPlacement('wall','wall');
 const point=new THREE.Vector3(axis==='x'?sign*1.07:0,
  floorBox.max.y,axis==='z'?sign*1.07:0);
 const hit=w.applyGhostPlacement(point);
 assert(hit.snapped&&hit.edge&&hit.valid!==false,
  'Wall must magnet to '+axis+sign+': '+hit.reason);
 const wallBox=new THREE.Box3().setFromObject(w.ghost);
 const face=sign>0?wallBox.max[axis]:wallBox.min[axis];
 const floorFace=sign>0?floorBox.max[axis]:floorBox.min[axis];
 close(face,floorFace,'Outer wall face flush with floor edge '+axis+sign);
 close(wallBox.min.y,floorBox.max.y,'Wall sits ON the floor '+axis+sign);
 const put=w.placeAt(point);
 assert(put,'Wall installs on floor '+axis+sign);
 close(sign>0?new THREE.Box3().setFromObject(put.mesh).max[axis]:
  new THREE.Box3().setFromObject(put.mesh).min[axis],floorFace,
  'Saved wall outer face remains flush '+axis+sign);
}
// Recalculate from physical thickness when the user scales only wall depth.
{
 const w=fresh(),floor=w.instantiate('floor',{id:200,pos:[0,0,0],
  rot:0,scale:1,category:'foundation',storey:0});
 const floorBox=new THREE.Box3().setFromObject(floor.mesh);
 w.setPlacement('wall','wall');
 w.placementAxes.z=1.8;w.applyAxisScale(w.ghost,1,w.placementAxes);
 const hit=w.applyGhostPlacement(new THREE.Vector3(0,floorBox.max.y,1.07));
 assert(hit.snapped,'Thick wall must snap');
 close(new THREE.Box3().setFromObject(w.ghost).max.z,floorBox.max.z,
  '39.6 cm thick wall exterior is still flush');
}
// Rotated and offset-pivot GLB walls must align the physical outer face.
{
 const w=fresh(),floor=w.instantiate('floor',{id:300,pos:[6,1,-3],
  rot:34,scale:1.5,category:'foundation',storey:0});
 const b=BuildSnap.attrBounds(floor.mesh);
 floor.mesh.updateWorldMatrix(true);
 const center=floor.mesh.localToWorld(new THREE.Vector3(b.max.x,b.max.y,0));
 const outward=new THREE.Vector3(1,0,0).transformDirection(floor.mesh.matrixWorld).setY(0).normalize();
 const custom=new THREE.Group(),mesh=new THREE.Mesh(
  new THREE.BoxGeometry(2,2.6,.3),new THREE.MeshStandardMaterial());
 mesh.position.set(.32,1.3,.4);custom.add(mesh);
 w.assetCache.set('glb:offset-wall',custom);
 w.setPlacement('glb:offset-wall','wall');
 const point=center.clone().addScaledVector(outward,.1);
 const solved=w.applyGhostPlacement(point);
 assert(solved.snapped&&solved.edge&&solved.valid!==false,
  'Rotated imported floor must support custom wall: '+solved.reason);
 close(projection(w.ghost,outward),center.dot(outward),
  'Rotated floor + offset-pivot wall exterior flush',.006);
}
console.log('Outer wall faces flush to all four floor edges, adjusted thickness and rotated offset-pivot GLB OK');