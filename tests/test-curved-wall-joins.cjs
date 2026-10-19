const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(base,'three.min.js'));
global.BuildSnap=require(path.join(base,'build-snap.js'));
global.BuildJoin=require(path.join(base,'build-join.js'));
global.BuildCurves=require(path.join(base,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(base,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(base,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const theta=v=>Math.atan2(-v.z,v.x);
const rotate=(v,yaw)=>new THREE.Vector3(v.x*Math.cos(yaw)+v.z*Math.sin(yaw),0,-v.x*Math.sin(yaw)+v.z*Math.cos(yaw));
function makeArc(radius,angle){
 const count=Math.max(4,Math.ceil(angle/10)),half=angle*Math.PI/360;
 const data=[];
 for(let i=0;i<=count;i++){
  const phi=-half+(i/count)*(2*half);
  for(const r of [radius-.11,radius+.11]){
   data.push(r*Math.sin(phi),0,r*Math.cos(phi)-radius*.86);
   data.push(r*Math.sin(phi),2.6,r*Math.cos(phi)-radius*.86);
  }
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(data,3));
 const root=new THREE.Group();root.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial()));
 return root;
}
function world(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),nextId:1,
 ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',placement:null,
 placementCategory:null,placementRotation:0,placementScale:1,smartSnap:true,joinMode:'auto',
 autoThickness:false,edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,
 floorLevel:0,storeyHeight:2.6,snap:2,currentPaint:'#aaa',yaw:0,placementSurfacePaint:{},
 lastSnapResult:null});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=kind=>BuildCurves.isArc(kind)?'wall':kind==='wall'?'wall':'prop';
 return w;
}
function expectedPosition(point,out,socket,scale,box){
 const yaw=theta(out.clone().negate())-theta(socket.out);
 const pivot=point.clone().sub(rotate(socket.point,yaw).multiplyScalar(scale));
 const center=new THREE.Vector3((box.min.x+box.max.x)/2,0,(box.min.z+box.max.z)/2);
 return {p:pivot.clone().add(rotate(center,yaw).multiplyScalar(scale)),yaw};
}
for(const radius of [1.5,3,5])for(const angle of [30,45,60,90,180]){
 const kind='glb:02_полукруглые_стены/arc_r'+String(radius).replace('.','_')+'_'+angle+'deg.glb';
 const w=world();const arc=makeArc(radius,angle);
 w.assetCache.set(kind,arc);
 const curved=BuildCurves.localSockets(arc,kind);
 assert(curved?.length===2,'Recognize both physical arc ends of '+kind);
 assert(Math.abs(curved[0].out.length()-1)<.001);
 assert(Math.abs(curved[1].out.length()-1)<.001);
 const initialWall=w.instantiate('wall',{id:50,pos:[0,0,0],rot:0,scale:1,category:'wall',storey:0});
 const startWall=BuildJoin.wallInfo(w,initialWall);
 const start={point:startWall.c,out:startWall.dir};
 const box=BuildSnap.attrBounds(arc);
 const goal=expectedPosition(start.point,start.out,curved[0],1,box);
 w.setPlacement(kind,'wall');
 let solved=w.solvePlacement(goal.p);
 assert(solved.curveJoin&&solved.wallEnd,'Join straight -> arc: '+kind);
 const arcentry=w.placeAt(goal.p);assert(arcentry,'Placed curved module '+kind);
 const gotSockets=BuildCurves.sourceSockets(BuildJoin.wallInfo(w,arcentry));
 const connected=gotSockets.find(x=>near(x.point,start.point)<.0001);
 assert(connected,'Arc cap coincides with real straight-wall endpoint '+kind);
 assert(connected.out.dot(start.out)<-.99,'Arc tangent is continuous with straight wall '+kind);
 // Now test a second copy of the curved wall attached by actual end cap.
 const secondGoal=expectedPosition(gotSockets.find(x=>x!==connected).point,
   gotSockets.find(x=>x!==connected).out,curved[0],1,box);
 w.setPlacement(kind,'wall');
 solved=w.solvePlacement(secondGoal.p);
 assert(solved.curveJoin,'Join arc -> arc '+kind);
 const next=w.placeAt(secondGoal.p);assert(next,'Second arc installs '+kind);
 const nextSockets=BuildCurves.sourceSockets(BuildJoin.wallInfo(w,next));
 const originalOther=gotSockets.find(x=>x!==connected);
 const matched=nextSockets.find(x=>near(x.point,originalOther.point)<.0001);
 assert(matched,'Arc to arc sockets meet without gap '+kind);
 assert(matched.out.dot(originalOther.out)<-.99,'Arc to arc tangent continuity '+kind);
 // Existing arc must also accept an incoming standard straight wall.
 const thirdGoalPoint=nextSockets.find(x=>x!==matched).point;
 const thirdDir=nextSockets.find(x=>x!==matched).out;
 const straight=world();straight.assetCache.set(kind,arc);
 const source=straight.instantiate(kind,{id:85,pos:next.mesh.position.toArray(),rot:next.data.rot,scale:1,category:'wall',storey:0});
 const sourceSock=BuildCurves.sourceSockets(BuildJoin.wallInfo(straight,source));
 const nearest=sourceSock.find(x=>near(x.point,thirdGoalPoint)<.0001);
 assert(nearest,'Mirrored arc source socket found');
 const baseWall=straight.makeBuiltin('wall');
 const wallBox=BuildSnap.attrBounds(baseWall);
 const localStart={point:new THREE.Vector3(-1,0,0),out:new THREE.Vector3(-1,0,0)};
 const go=expectedPosition(nearest.point,nearest.out,localStart,1,wallBox);
 straight.setPlacement('wall','wall');
 solved=straight.solvePlacement(go.p);
 assert(solved.curveJoin,'Join arc -> straight '+kind);
 const wall=straight.placeAt(go.p);assert(wall,'Straight wall accepts arc end '+kind);
 const outInfo=BuildJoin.wallInfo(straight,wall);
 const actual=BuildCurves.sourceSockets(outInfo);
 const joined=actual.find(x=>near(x.point,nearest.point)<.0001);
 assert(joined,'Straight wall end touches actual curved cap '+kind);
 assert(joined.out.dot(nearest.out)<-.99,'Correct straight wall orientation at arc cap '+kind);
}
const app=fs.readFileSync(path.join(base,'app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'../index.html'),'utf8');
assert(app.includes('arc[_-]?r'),'Arc filenames classified as wall');
assert(html.includes('src="js/build-curves.js"'),'Curved socket engine included offline');
console.log('All 15 rounded wall modules: straight-to-arc, arc-to-arc and arc-to-straight physical endpoint alignment OK');
