const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const d=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(d,'three.min.js'));
global.RoundedModules=require(path.join(d,'rounded-modules.js'));
global.BuildCore=require(path.join(d,'build-core.js'));
global.BuildSnap=require(path.join(d,'build-snap.js'));
global.BuildJoin=require(path.join(d,'build-join.js'));
global.BuildCurves=require(path.join(d,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(d,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(d,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const w=Object.create(WorldBuilder.prototype);
Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),nextId:1,
 ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',
 placement:null,placementCategory:null,placementRotation:0,placementScale:1,
 placementAxes:{x:1,y:1,z:1},smartSnap:true,joinMode:'auto',autoThickness:false,
 edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,floorLevel:0,
 storeyHeight:2.6,snap:2,currentPaint:'#fff',yaw:0,placementSurfacePaint:{},
 lastSnapResult:null});
w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};
w.onSnapChanged=()=>{};w.highlight={setFromObject(){},visible:false};
w.categoryForKind=kind=>kind==='arcFloor90'||kind==='glb:cutout'?'foundation':'prop';
// An 8x8m floor with four 2x2m concave corner cutouts. This is the
// end-to-end regression missing from previous single-edge tests.
const outline=[[-4,-2],[-2,-2],[-2,-4],[2,-4],[2,-2],[4,-2],
 [4,2],[2,2],[2,4],[-2,4],[-2,2],[-4,2]];
const sh=new THREE.Shape();outline.forEach(([x,z],i)=>i?sh.lineTo(x,z):sh.moveTo(x,z));
sh.closePath();
const geom=new THREE.ExtrudeGeometry(sh,{depth:.17,bevelEnabled:false});
geom.rotateX(-Math.PI/2);
const base=new THREE.Group();
base.add(new THREE.Mesh(geom,new THREE.MeshStandardMaterial()));
w.assetCache.set('glb:cutout',base);
w.instantiate('glb:cutout',{id:100,pos:[0,0,0],rot:0,scale:1,
 category:'foundation',storey:0});
const corners=[[3,3],[3,-3],[-3,3],[-3,-3]];
const installed=[];
for(let i=0;i<corners.length;i++){
 const [x,z]=corners[i];w.setPlacement('arcFloor90','foundation');
 const target=new THREE.Vector3(x,.17,z);
 const solved=w.solvePlacement(target);
 assert(solved.snapped&&solved.physicalCornerClosure&&solved.joinedEdges===2,
  'Corner '+(i+1)+' must join both exposed real edges; got '+JSON.stringify({
   x:solved.position?.x,z:solved.position?.z,snapped:solved.snapped,
   twoEdges:solved.physicalCornerClosure,reference:solved.reference
  }));
 const before=w.applyGhostPlacement(target);
 assert(before?.valid,'Corner '+(i+1)+' preview must be valid: '+before?.reason);
 const put=w.placeAt(target);
 assert(put,'Corner '+(i+1)+' must install');
 for(const prior of installed)assert(
   Math.hypot(prior.mesh.position.x-put.mesh.position.x,
    prior.mesh.position.z-put.mesh.position.z)>1,
   'Corner '+(i+1)+' reuses occupied position');
 const bounds=new THREE.Box3().setFromObject(put.mesh);
 assert(Math.abs(bounds.max.y-.17)<.002,'Upper faces flush on corner '+(i+1));
 installed.push(put);
}
assert.equal(installed.length,4,'All four corners installed, not just three');
console.log('All four curved floor corners: dual-edge closure, no duplicate, flush top OK');