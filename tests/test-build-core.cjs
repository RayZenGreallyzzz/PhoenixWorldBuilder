const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets/js');
const BuildCore=require(path.join(base,'build-core.js'));

function close(a,b,eps=1e-6,msg=''){assert(Math.abs(a-b)<=eps,msg||`${a} != ${b}`)}
// Core stays renderer independent.
const source=fs.readFileSync(path.join(base,'build-core.js'),'utf8');
assert(!/\bTHREE\b/.test(source),'BuildCore must not depend on Three.js');
assert(!/document\.|window\.|WebGLRenderer|canvas\.|getContext\(/i.test(source),'BuildCore must not depend on DOM/WebGL runtime APIs');

// Absolute storey coordinates: no accumulation from previously placed parts.
for(const h of [2.6,3.2,5.75]){
 for(let level=0;level<8;level++){
  close(BuildCore.nominalFloorY(.37,level,h),.37+level*h);
 }
}
assert.equal(BuildCore.safeFloorLevel(-2),0);
assert.equal(BuildCore.safeFloorLevel(3),3);
close(BuildCore.safeStoreyHeight(99),6);

// Same support policy as legacy Builder, but now pure numeric rules.
let d=BuildCore.chooseFloorDatum({terrainY:0,floorLevel:1,storeyHeight:2.6,category:'wall',
 candidates:[
  {story:0,type:'wall',top:2.58,distance:.2},
  {story:0,type:'ceiling',top:2.62,distance:.4},
  {story:1,type:'foundation',top:2.64,distance:.5}
 ]});
assert.equal(d.source,'floor','Current-storey foundation wins for a wall');
close(d.height,2.64);
d=BuildCore.chooseFloorDatum({terrainY:0,floorLevel:2,storeyHeight:2.6,category:'foundation',
 candidates:[
  {story:1,type:'ceiling',top:5.2,distance:.3},
  {story:1,type:'wall',top:5.19,distance:.01},
  {story:2,type:'foundation',top:5.3,distance:0}
 ]});
assert.equal(d.source,'ceiling','Next slab uses previous ceiling before previous wall');
close(d.height,5.2);
d=BuildCore.chooseFloorDatum({terrainY:.1,floorLevel:4,storeyHeight:2.6,category:'wall',
 smartSnap:false,candidates:[{story:4,type:'foundation',top:999,distance:0}]});
assert.equal(d.source,'configured');
close(d.height,.1+4*2.6);

// Socket transform and exact alignment.
const left={id:'L',point:[-1,0,0],out:[-1,0,0]};
const right={id:'R',point:[1,0,0],out:[1,0,0]};
let pose=BuildCore.alignSockets(left,{point:[5,0,2],out:[1,0,0]});
assert(pose&&pose.error<1e-8);
assert.deepEqual(pose.position,[6,0,2]);
close(pose.rotation,0);
let ws=BuildCore.transformSocket(left,{position:pose.position,yawDeg:pose.rotation});
close(ws.point[0],5);close(ws.point[2],2);
assert(ws.out[0]<-.999);

pose=BuildCore.alignSockets(left,{point:[3,2.6,-4],out:[0,0,1]});
assert(pose.error<1e-8,'90-degree socket alignment must be exact');
ws=BuildCore.transformSocket(left,{position:pose.position,yawDeg:pose.rotation});
close(ws.point[0],3);close(ws.point[1],2.6);close(ws.point[2],-4);
close(ws.out[2],-1);

// Non-uniform scaling changes the socket's local offset but not its outward heading.
pose=BuildCore.alignSockets(right,{point:[10,0,7],out:[-1,0,0]},{scale:[2,1,.5]});
assert(pose.error<1e-8);
assert.deepEqual(pose.position,[8,0,7]);

// Occupancy is direction-aware and floor-aware by Y tolerance.
const world=[
 {owner:1,point:[2,0,0],out:[-1,0,0]},
 {owner:2,point:[2,2.6,0],out:[-1,0,0]}
];
assert(BuildCore.socketOccupied(world,[2,0,0],[-1,0,0]));
assert(!BuildCore.socketOccupied(world,[2,0,0],[0,0,1]),'Perpendicular corner remains legal');
assert(!BuildCore.socketOccupied(world,[2,1.3,0],[-1,0,0]),'Other storey is not the same socket');
assert(!BuildCore.socketOccupied(world,[2,0,0],[-1,0,0],{excludeOwner:1}),
 'Excluding the current owner leaves no same-floor occupant');

const html=fs.readFileSync(path.join(base,'../index.html'),'utf8');
assert(html.indexOf('js/build-core.js')>=0,'BuildCore is bundled offline');
assert(html.indexOf('js/build-core.js')<html.indexOf('js/world.js'),'BuildCore loads before WorldBuilder');
const worldSource=fs.readFileSync(path.join(base,'world.js'),'utf8');
assert(worldSource.includes('BuildCore.chooseFloorDatum'),'WorldBuilder delegates floor policy to BuildCore');
console.log('BuildCore: renderer-free floors, sockets, alignment and occupancy OK');
