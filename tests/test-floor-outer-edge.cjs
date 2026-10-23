const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const d=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(d,'three.min.js'));
global.BuildSnap=require(path.join(d,'build-snap.js'));
global.BuildJoin=require(path.join(d,'build-join.js'));
global.BuildCurves=require(path.join(d,'build-curves.js'));
global.BuildOuterEdge=require(path.join(d,'build-outer-edge.js'));
global.BuildPlacementValidator=require(path.join(d,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(d,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function fresh(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
 nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,
 mode:'playbuild',placement:null,placementCategory:null,placementRotation:0,
 placementScale:1,placementAxes:{x:1,y:1,z:1},smartSnap:true,joinMode:'auto',
 autoThickness:true,edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,
 floorLevel:0,storeyHeight:2.6,snap:2,currentPaint:'#ffffff',
 placementSurfacePaint:{},placementDecals:[],lastSnapResult:null});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};
 w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=k=>k==='floor'?'foundation':k==='corner'?'corner':'wall';
 return w;
}
const close=(value,target,detail,tol=.026)=>assert(Math.abs(value-target)<tol,
 detail+': got '+value+' expected '+target);
function floor(w,id=1,pos=[0,0,0],rot=0,storey=0){
 return w.instantiate('floor',{id,pos,rot,scale:1,category:'foundation',storey});
}
function worldBoxIn(root,reference){
 root.updateWorldMatrix(true,true);reference.updateWorldMatrix(true,true);
 const inverse=reference.matrixWorld.clone().invert(),out=new THREE.Box3().makeEmpty();
 root.traverse(o=>{
  if(!o.isMesh||!o.geometry?.attributes?.position)return;
  if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
  const b=o.geometry.boundingBox,m=o.matrixWorld;
  for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])
   for(const z of [b.min.z,b.max.z])
    out.expandByPoint(V(x,y,z).applyMatrix4(m).applyMatrix4(inverse));
 });
 return out;
}
function probeSide(w,f,side,turn,kind='wall'){
 w.setPlacement(kind,kind==='corner'?'corner':'wall');
 w.placementRotation=turn;
 const where=side==='east'?V(1.08,.17,0):side==='west'?V(-1.08,.17,0):
  side==='north'?V(0,.17,-1.08):V(0,.17,1.08);
 const p=where.applyMatrix4(f.mesh.matrixWorld);
 const solved=w.solvePlacement(p);
 assert(solved?.snapped&&solved.floorOuterEdge,
  'Wall must snap to outer floor edge on '+side+' at turn '+turn);
 w.applyGhostPlacement(p);
 const b=worldBoxIn(w.ghost,f.mesh);
 if(side==='east')close(b.max.x,1,'East exterior face '+turn);
 if(side==='west')close(b.min.x,-1,'West exterior face '+turn);
 if(side==='north')close(b.min.z,-1,'North exterior face '+turn);
 if(side==='south')close(b.max.z,1,'South exterior face '+turn);
 close(b.min.y,.165,'Wall bottom rests on floor '+side);
 return solved;
}
for(const floorRotation of [0,37,90]){
 for(const side of ['north','east','south','west']){
  for(const turn of [0,90,180,270]){
   const w=fresh(),f=floor(w,1,[4,.6,-5],floorRotation,0);
   probeSide(w,f,side,turn);
  }
 }
}
// Existing first-side walls must not override the floor outside edge on a new side.
{
 const w=fresh(),f=floor(w);
 w.instantiate('wall',{id:10,pos:[0,.165,-.89],rot:0,scale:1,
  category:'wall',storey:0});
 const result=probeSide(w,f,'east',270);
 assert.equal(result.reference,1,'Floor is chosen over nearby wall endpoint');
}
// Adjacent tiles share an INTERNAL edge that must never attract outside walls.
{
 const w=fresh();floor(w,1,[0,0,0]);const right=floor(w,2,[2,0,0]);
 probeSide(w,right,'east',90);
 const clicked=V(1.03,.17,0);
 w.setPlacement('wall','wall');
 const result=w.solvePlacement(clicked);
 if(result?.floorOuterEdge){
  w.applyGhostPlacement(clicked);
  const b=worldBoxIn(w.ghost,right.mesh);
  assert(Math.abs(b.min.x+1)>.03&&Math.abs(b.max.x+1)>.03,
   'Shared seam x=1 must not be treated as outside perimeter');
 }
}
// Offset GLB pivot is corrected by the physical bounds, not guessed origin.
{
 const w=fresh(),f=floor(w);
 const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2.6,.22),
  new THREE.MeshBasicMaterial());
 mesh.position.set(3,1.3,.45);root.add(mesh);w.assetCache.set('glb:offset-wall',root);
 probeSide(w,f,'west',270,'glb:offset-wall');
}
// Upper floors use their own real slab, not the lower floor or nominal height.
{
 const w=fresh();floor(w,1,[0,0,0],0,0);
 const upper=floor(w,2,[0,2.6,0],0,1);w.floorLevel=1;
 probeSide(w,upper,'south',180);
}
// Four L corners must sit with both exterior faces on their tile edges.
for(const side of ['nw','ne','sw','se']){
 const w=fresh(),f=floor(w);
 w.setPlacement('corner','corner');
 const x=side.endsWith('e')?1:-1,z=side.startsWith('n')?-1:1;
 const p=V(x*.96,.165,z*.96);
 const sol=w.solvePlacement(p);
 assert(sol?.floorOuterCorner,'Corner must snap outside on '+side);
 w.applyGhostPlacement(p);
 const b=worldBoxIn(w.ghost,f.mesh);
 close(x>0?b.max.x:b.min.x,x,'Corner X outside '+side);
 close(z>0?b.max.z:b.min.z,z,'Corner Z outside '+side);
}
const html=fs.readFileSync(path.join(d,'../index.html'),'utf8');
assert(html.includes('js/build-outer-edge.js'),'Offline exterior magnet script included');
console.log('Exterior wall faces remain flush on all four sides at 0/90/180/270 degrees, rotated tile floors, noncentral GLBs, upper floors and L corners');
