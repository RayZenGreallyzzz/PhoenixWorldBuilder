const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const d=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(d,'three.min.js'));
global.BuildSnap=require(path.join(d,'build-snap.js'));
global.BuildJoin=require(path.join(d,'build-join.js'));
global.BuildCurves=require(path.join(d,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(d,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(d,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const theta=v=>Math.atan2(-v.z,v.x);
const rotate=(v,r)=>new THREE.Vector3(v.x*Math.cos(r)+v.z*Math.sin(r),0,-v.x*Math.sin(r)+v.z*Math.cos(r));
const arcKind='glb:arcs/arc_r2_60deg.glb';
function arc(){
 const verts=[],N=12,R=2,half=Math.PI/6;
 for(let i=0;i<=N;i++)for(const radius of [R-.11,R+.11]){
  const t=-half+i/N*(2*half);
  verts.push(radius*Math.sin(t),0,radius*Math.cos(t)-R*.86);
  verts.push(radius*Math.sin(t),2.6,radius*Math.cos(t)-R*.86);
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
 const root=new THREE.Group();root.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial()));
 return root;
}
function setup(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),nextId:1,
  ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',placement:null,
  placementCategory:null,placementRotation:0,placementScale:1,placementAxes:{x:1,y:1,z:1},
  smartSnap:true,joinMode:'auto',autoThickness:false,edgeShift:0,placementLift:0,
  cornerOffsetX:0,cornerOffsetZ:0,floorLevel:0,storeyHeight:2.6,snap:2,
  currentPaint:'#fff',placementSurfacePaint:{},placementDecals:[],lastSnapResult:null});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=k=>k===arcKind||k==='wall'?'wall':k==='corner'?'corner':'prop';
 w.assetCache.set(arcKind,arc());
 return w;
}
function axes(w,x,z){
 w.placementAxes={x,y:1,z};
 w.applyAxisScale(w.ghost,w.placementScale,w.placementAxes);
}
function socketGoal(target,slot,dim,box){
 const cap=new THREE.Vector3(slot.out.x/dim.x,0,slot.out.z/dim.z).normalize();
 const yaw=theta(target.out.clone().negate())-theta(cap);
 const scaled=new THREE.Vector3(slot.point.x*dim.x,slot.point.y,slot.point.z*dim.z);
 const pivot=target.point.clone().sub(rotate(scaled,yaw));
 const center=new THREE.Vector3(((box.min.x+box.max.x)/2)*dim.x,0,
  ((box.min.z+box.max.z)/2)*dim.z);
 return pivot.add(rotate(center,yaw));
}
const eps=.025;
// Incoming curved GLB scaled X/Z must match real cap and tangent of straight wall.
{
 const w=setup();
 const wall=w.instantiate('wall',{id:1,pos:[0,0,0],rot:0,scale:1,category:'wall',storey:0});
 const info=BuildJoin.wallInfo(w,wall),target={point:info.c,out:info.dir};
 w.setPlacement(arcKind,'wall');axes(w,2,.65);
 const model=w.assetCache.get(arcKind),slot=BuildCurves.localSockets(model,arcKind)[0];
 const p=socketGoal(target,slot,w.placementAxes,BuildSnap.attrBounds(model));
 const solved=w.solvePlacement(p);
 assert(solved?.curveJoin,'Scaled incoming curve must snap to wall socket');
 w.applyGhostPlacement(p);
 const sockets=BuildCurves.sourceSockets(BuildJoin.wallInfo(w,{kind:arcKind,mesh:w.ghost,data:{category:'wall'}}));
 const joined=sockets.find(s=>dist(s.point,target.point)<eps);
 assert(joined,'Scaled incoming curve cap must coincide with wall end');
 assert(joined.out.dot(target.out)<-.99,'Scaled incoming cap normal must oppose wall normal');
}
// An existing stretched arc must expose correct physical cap normals to a new wall.
{
 const w=setup();
 const curved=w.instantiate(arcKind,{id:2,pos:[4,0,-2],rot:22,scale:1,
  dimensionScale:{x:1.8,y:1,z:.7},category:'wall',storey:0});
 const source=BuildCurves.sourceSockets(BuildJoin.wallInfo(w,curved))[0];
 w.setPlacement('wall','wall');
 const model=w.makeBuiltin('wall'),slot={point:new THREE.Vector3(-1,0,0),out:new THREE.Vector3(-1,0,0)};
 const p=socketGoal(source,slot,{x:1,z:1},BuildSnap.attrBounds(model));
 assert(w.solvePlacement(p)?.curveJoin,'Wall should snap to stretched existing arc');
 w.applyGhostPlacement(p);
 const sockets=BuildCurves.sourceSockets(BuildJoin.wallInfo(w,{kind:'wall',mesh:w.ghost,data:{category:'wall'}}));
 const joined=sockets.find(s=>dist(s.point,source.point)<eps);
 assert(joined,'Wall end must coincide with stretched arc cap');
 assert(joined.out.dot(source.out)<-.99,'Stretched arc cap normal must oppose straight wall normal');
}
// Incoming quarter/L corner with nonuniform dimensions must use scaled real tip.
{
 const w=setup();
 const wall=w.instantiate('wall',{id:3,pos:[0,0,0],rot:0,scale:1,category:'wall',storey:0});
 const target=BuildJoin.wallInfo(w,wall).c;
 w.setPlacement('corner','corner');axes(w,2,.7);
 const b=BuildSnap.attrBounds(w.ghost);
 const p=new THREE.Vector3(target.x+4+(b.min.x+b.max.x),0,(b.min.z+b.max.z)*.35);
 const solved=w.solvePlacement(p);
 assert(solved?.corner&&solved.snapped,'Stretched corner must snap by a real tip');
 w.applyGhostPlacement(p);
 const corners=BuildJoin.wallInfo(w,{kind:'corner',mesh:w.ghost,data:{category:'corner',storey:0}}).sockets;
 assert(corners.some(s=>dist(s.point,target)<eps),'Scaled L corner tip must touch existing wall end');
}
console.log('Scaled curved caps, cap normals, straight-wall joints, and stretched L corner sockets align');
