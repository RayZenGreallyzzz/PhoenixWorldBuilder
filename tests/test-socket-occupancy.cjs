// Regression: do not place a new straight or curved wall on an already
// occupied, collinear physical socket. Preserve legal 90-degree connections.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(base,'three.min.js'));
global.BuildSnap=require(path.join(base,'build-snap.js'));
global.BuildJoin=require(path.join(base,'build-join.js'));
global.BuildCurves=require(path.join(base,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(base,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(base,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
function setup(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),nextId:1,
  ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',placement:null,
  placementCategory:null,placementRotation:0,placementScale:1,smartSnap:true,joinMode:'auto',
  autoThickness:true,edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,
  floorLevel:0,storeyHeight:2.6,snap:2,currentPaint:'#ffffff',placementSurfacePaint:{},
  lastSnapResult:null});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};w.categoryForKind=()=> 'wall';
 return w;
}
const w=setup();
const a=w.instantiate('wall',{id:1,pos:[0,0,0],rot:0,scale:1,category:'wall',storey:0});
const b=w.instantiate('wall',{id:2,pos:[2,0,0],rot:0,scale:1,category:'wall',storey:0});
const infoA=BuildJoin.wallInfo(w,a),infoB=BuildJoin.wallInfo(w,b),infos=[infoA,infoB];
const aEnd=BuildCurves.sourceSockets(infoA)[1];
const bStart=BuildCurves.sourceSockets(infoB)[0];
assert(aEnd.point.distanceTo(bStart.point)<.00001,'The two wall end sockets meet');
assert(aEnd.out.dot(bStart.out)<-.999,'Existing connected ends point in opposite directions');
assert(BuildJoin.socketDirectionOccupied(infos,infoA,aEnd.point,bStart.out),
 'Do not allow a third wall with identical outgoing orientation on a consumed endpoint');
assert(!BuildJoin.socketDirectionOccupied(infos,infoA,aEnd.point,new THREE.Vector3(0,0,1)),
 'Perpendicular third wall at a corner is allowed');
assert(!BuildJoin.socketDirectionOccupied(infos,infoA,aEnd.point,aEnd.out),
 'Reverse-facing end is not the same as overlapping an existing outgoing segment');
assert(!BuildJoin.socketDirectionOccupied(infos,infoA,new THREE.Vector3(-1,0,0),
 new THREE.Vector3(-1,0,0)),'An unused end is still available');
const upper=w.instantiate('wall',{id:3,pos:[2,2.6,0],rot:0,scale:1,category:'wall',storey:1});
const upInfo=BuildJoin.wallInfo(w,upper);
assert(!BuildJoin.socketDirectionOccupied([infoA,upInfo],infoA,aEnd.point,bStart.out),
 'Identical XZ socket at a different floor is not occupied');
// The same logic must also work for a source with an offset pivot and rotation.
const custom=new THREE.Group();
const shape=new THREE.Mesh(new THREE.BoxGeometry(3,2.6,.22),
 new THREE.MeshStandardMaterial());
shape.position.set(.8,1.3,.45);custom.add(shape);
w.assetCache.set('glb:offset',custom);
const first=w.instantiate('glb:offset',{id:4,pos:[12,0,6],rot:30,scale:1,category:'wall',storey:0});
const firstInfo=BuildJoin.wallInfo(w,first);
const firstEnd=BuildCurves.sourceSockets(firstInfo)[1];
const direction=firstInfo.dir;
const secondOffset=new THREE.Vector3(
 first.mesh.position.x+3*direction.x,0,
 first.mesh.position.z+3*direction.z
);
const second=w.instantiate('glb:offset',{id:5,pos:secondOffset.toArray(),rot:30,scale:1,category:'wall',storey:0});
const secondInfo=BuildJoin.wallInfo(w,second);
const otherStart=BuildCurves.sourceSockets(secondInfo)[0];
// The exact offset-pivot position can be derived from end-socket coordinates.
const correction=firstEnd.point.clone().sub(otherStart.point);
second.mesh.position.add(correction);second.mesh.updateMatrixWorld(true);
const actual=BuildJoin.wallInfo(w,second),actualStart=BuildCurves.sourceSockets(actual)[0];
assert(firstEnd.point.distanceTo(actualStart.point)<.0001,
 'Offset-pivot / rotated GLBs use world-space physical sockets');
assert(BuildJoin.socketDirectionOccupied([firstInfo,actual],firstInfo,firstEnd.point,actualStart.out),
 'Offset-pivot/rotated occupied sockets cannot be reused');
const joinText=fs.readFileSync(path.join(base,'build-join.js'),'utf8');
const curveText=fs.readFileSync(path.join(base,'build-curves.js'),'utf8');
assert(joinText.includes('socketDirectionOccupied(occupancyCandidates,old,join'),
 'Straight wall placement must use occupancy guard');
assert(curveText.includes('BuildJoin.socketDirectionOccupied?.(candidates,info,target.point,newOut)'),
 'Curved wall placement must use occupancy guard');
console.log('Occupied straight/curved socket guard; legal perpendicular join; floors; offset pivot OK');
