const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const d=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(d,'three.min.js'));
global.BuildSnap=require(path.join(d,'build-snap.js'));
global.BuildJoin=require(path.join(d,'build-join.js'));
global.BuildCurves=require(path.join(d,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(d,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(d,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const nearly=(n,v,desc)=>assert(Math.abs(n-v)<.025,desc+': '+n+' vs '+v);
function fresh(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
  nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,
  mode:'playbuild',placement:null,placementCategory:null,placementRotation:0,
  placementScale:1,smartSnap:true,joinMode:'auto',autoThickness:true,
  edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,
  floorLevel:0,storeyHeight:2.6,snap:2,currentPaint:'#ffffff',
  placementSurfacePaint:{},placementDecals:[],lastSnapResult:null});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=id=>id==='corner'||id==='glb:L_corner'?'corner':id==='wall'?'wall':'prop';
 return w;
}
function instance(w,kind,id,center,yaw,story){
 return w.instantiate(kind,{id,pos:center,rot:yaw,scale:1,category:'corner',storey:story});
}
function outgoingTip(line){return line.a.clone().add(line.a.clone().sub(line.c).normalize())}
for(const yaw of [0,90,180,270]){
 for(const floor of [0,1,2]){
  const w=fresh();w.floorLevel=floor;
  // An old first-storey corner at nearly the same screen coordinates must
  // never be mistaken for the active second- or third-floor corner.
  if(floor>0)instance(w,'corner',10,[4,0,6],yaw,0);
  const corner=instance(w,'corner',20,[4,2.6*floor,6],yaw,floor);
  const info=BuildJoin.wallInfo(w,corner);
  assert.equal(info.segments?.length,2,'Two real L-arm segments, yaw '+yaw);
  assert.equal(info.sockets.length,2);
  for(const line of info.segments){
   const tip=line.a,center=outgoingTip(line);
   assert(Math.abs(line.length-1.9)<.025,'Real exposed end is 1.9m from corner pivot');
   w.setPlacement('wall','wall');
   const solved=w.solvePlacement(center);
   assert(solved.wallEnd&&solved.snapped,'Straight wall must snap after corner: '+yaw+' floor '+floor+' '+line.name);
   assert.equal(solved.reference,20,'Active floor corner must be chosen instead of lower floor');
   nearly(solved.position.y,2.6*floor,'Connected wall must keep same floor base');
   w.applyGhostPlacement(center);
   const preview=BuildJoin.wallInfo(w,{kind:'wall',mesh:w.ghost,data:{}});
   const nearest=Math.min(dist(preview.a,tip),dist(preview.c,tip));
   assert(nearest<.025,'Wall endpoint must touch actual corner cap, not corner AABB midpoint; '+yaw+' floor '+floor+' '+line.name+' gap '+nearest);
   const face=new THREE.Box3().setFromObject(w.ghost);
   assert(face.min.y>=2.6*floor-.05,'Preview wall must not descend to a lower story');
  }
 }
}
// Building a new corner after a straight wall must attach one of the
// corner's FAR caps to the old wall. Previously the L pivot was placed on
// the old cap and nearly 2m of the corner overlapped the straight panel.
for(const yaw of [0,90,180,270])for(const story of [0,1]){
 const w=fresh();w.floorLevel=story;
 const start=w.instantiate('wall',{id:60,pos:[0,story*2.6,0],rot:yaw,scale:1,category:'wall',storey:story});
 const source=BuildJoin.wallInfo(w,start);
 const click=source.c.clone().add(source.dir.clone().multiplyScalar(1.1));
 w.setPlacement('corner','corner');
 const solved=w.solvePlacement(click);
 assert(solved.corner&&solved.snapped,'Corner must connect to straight wall at real arm end');
 assert.equal(solved.reference,60);
 w.applyGhostPlacement(click);
 const cornerInfo=BuildJoin.wallInfo(w,{kind:'corner',data:{category:'corner',storey:story},mesh:w.ghost});
 const gap=Math.min(...cornerInfo.sockets.map(s=>dist(s.point,source.c)));
 assert(gap<.025,'New L arm tip joins old wall cap, not central pivot. Angle '+yaw+' floor '+story+' gap '+gap);
 assert(Math.hypot(solved.position.x-source.c.x,solved.position.z-source.c.z)>1.8,
  'The corner pivot must not be incorrectly placed over the old wall end');
 const entry=w.placeAt(click);
 assert(entry,'Corner must be placeable without overlapping existing straight wall');
 const free=BuildJoin.wallInfo(w,entry).sockets.filter(s=>dist(s.point,source.c)>.1);
 assert.equal(free.length,1,'One L arm is still available for the next wall');
 w.setPlacement('wall','wall');
 const target=free[0].point.clone().add(free[0].out.clone().multiplyScalar(1));
 const next=w.solvePlacement(target);
 assert(next.wallEnd&&next.reference===entry.data.id,'Next straight wall joins the other L cap');
 w.applyGhostPlacement(target);
 const info=BuildJoin.wallInfo(w,{kind:'wall',data:{},mesh:w.ghost});
 assert(Math.min(dist(info.a,free[0].point),dist(info.c,free[0].point))<.025,
  'Straight → corner → straight joint remains continuous on active story');
}
// Same corner sockets can be recovered from a pivot-shifted custom GLB
// whose L arms are separate geometry parts, even when the GLB is rotated.
{
 const w=fresh(),root=new THREE.Group();
 const x=new THREE.Mesh(new THREE.BoxGeometry(2,2.6,.22),new THREE.MeshStandardMaterial());
 x.position.set(-.65,1.3,.4);
 const z=new THREE.Mesh(new THREE.BoxGeometry(.22,2.6,2),new THREE.MeshStandardMaterial());
 z.position.set(.25,1.3,-.5);
 root.add(x,z);w.assetCache.set('glb:L_corner',root);
 const source=instance(w,'glb:L_corner',33,[9,0,-7],45,0);
 const sourceInfo=BuildJoin.wallInfo(w,source);
 assert.equal(sourceInfo.segments?.length,2,'Imported offset pivot L has two physical sockets');
 for(const line of sourceInfo.segments){
  w.setPlacement('wall','wall');
  const goal=outgoingTip(line),solved=w.solvePlacement(goal);
  assert(solved.wallEnd&&solved.reference===33,'Imported corner arm end must be used');
  w.applyGhostPlacement(goal);
  const preview=BuildJoin.wallInfo(w,{kind:'wall',mesh:w.ghost,data:{}});
  assert(Math.min(dist(preview.a,line.a),dist(preview.c,line.a))<.025,'No inward/outward offset after custom GLB corner');
 }
}
// Both sides of a 90° L module must also have real end sockets for
// round-wall connections, not the diagonal of its bounding rectangle.
{
 const w=fresh(),arcKind='glb:polukruglye/arc_r1_5_90deg.glb';
 const vertices=[],radius=1.5,angle=90,count=9,half=angle*Math.PI/360;
 for(let i=0;i<=count;i++){
  const phi=-half+i/count*(2*half);
  for(const r of [radius-.11,radius+.11]){
   vertices.push(r*Math.sin(phi),0,r*Math.cos(phi)-radius*.86);
   vertices.push(r*Math.sin(phi),2.6,r*Math.cos(phi)-radius*.86);
  }
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 const arc=new THREE.Group();arc.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial()));
 w.assetCache.set(arcKind,arc);
 const source=instance(w,'corner',75,[0,0,0],90,0);
 const original=BuildJoin.wallInfo(w,source),socket=original.sockets[0];
 assert.equal(BuildCurves.sourceSockets(original).length,2,'A corner exposes two physical arc-join sockets');
 w.categoryForKind=id=>id===arcKind?'wall':id==='corner'?'corner':'wall';
 w.setPlacement(arcKind,'wall');
 const incoming=BuildCurves.localSockets(arc,arcKind);
 assert(incoming?.length===2,'Arc test geometry exposes true end-cap sockets');
 const theta=v=>Math.atan2(-v.z,v.x);
 const rotate=(v,t)=>new THREE.Vector3(v.x*Math.cos(t)+v.z*Math.sin(t),0,-v.x*Math.sin(t)+v.z*Math.cos(t));
 const yaw=theta(socket.out.clone().negate())-theta(incoming[0].out);
 const pos=socket.point.clone().sub(rotate(incoming[0].point,yaw));
 const box=BuildSnap.attrBounds(arc);
 const center=pos.clone().add(rotate(new THREE.Vector3((box.min.x+box.max.x)/2,0,(box.min.z+box.max.z)/2),yaw));
 const solved=w.solvePlacement(center);
 assert(solved.curveJoin&&solved.reference===75,'Arc must meet real L-tip without phantom offset');
 w.applyGhostPlacement(center);
 const newInfo=BuildJoin.wallInfo(w,{kind:arcKind,data:{category:'wall'},mesh:w.ghost});
 const arcSockets=BuildCurves.sourceSockets(newInfo);
 assert(arcSockets.some(s=>dist(s.point,socket.point)<.025),'Physical L-to-arc end caps coincide');
}
// A real imported L may contain only one merged indexed mesh. Detect
// its thin exposed end caps without assuming a two-mesh scene hierarchy.
{
 const w=fresh(),x=new THREE.BoxGeometry(2,2.6,.22),z=new THREE.BoxGeometry(.22,2.6,2);
 x.translate(-.9,1.3,0);z.translate(0,1.3,-.9);
 const combined=new THREE.BufferGeometry();
 const xyz=[...x.attributes.position.array,...z.attributes.position.array];
 combined.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
 const root=new THREE.Group();root.add(new THREE.Mesh(combined,new THREE.MeshStandardMaterial()));
 w.assetCache.set('glb:L_corner',root);
 const entry=instance(w,'glb:L_corner',42,[10,0,4],135,0);
 const info=BuildJoin.wallInfo(w,entry);
 assert.equal(info.segments?.length,2,'Merged one-mesh L has two real physical arm tips');
 for(const arm of info.segments){
  w.setPlacement('wall','wall');
  const dest=outgoingTip(arm),s=w.solvePlacement(dest);
  assert(s.wallEnd&&s.reference===42,'Merged GLB corner must accept straight wall at both exposed caps');
  w.applyGhostPlacement(dest);
  const next=BuildJoin.wallInfo(w,{kind:'wall',mesh:w.ghost,data:{}});
  assert(Math.min(dist(next.a,arm.a),dist(next.c,arm.a))<.025,
   'Merged GLB wall cap touches straight wall without inward/outward shift');
 }
}
// Non-L shapes that merely have the category "corner" must not be
// promoted to imaginary rectangular sockets.
{
 const w=fresh(),root=new THREE.Group();
 root.add(new THREE.Mesh(new THREE.BoxGeometry(2,2.6,2),new THREE.MeshStandardMaterial()));
 w.assetCache.set('glb:L_corner',root);
 const bad=instance(w,'glb:L_corner',44,[0,0,0],0,0);
 const info=BuildJoin.wallInfo(w,bad);
 assert(info.unresolvedCorner,'Unknown mesh lacks reliable physical corner caps');
 w.setPlacement('wall','wall');
 const snapped=w.solvePlacement(new THREE.Vector3(2,0,0));
 assert(!snapped.wallEnd,'Never snap to fake diagonal AABB endpoints');
}
// Test that choosing an L angle on the upper floor cannot snap to two
// lower-floor orthogonal walls even if the cursor is over those walls.
{
 const w=fresh();w.floorLevel=1;w.joinMode='corner';
 w.instantiate('wall',{id:90,pos:[0,0,0],rot:0,scale:1,category:'wall',storey:0});
 w.instantiate('wall',{id:91,pos:[1,0,-1],rot:90,scale:1,category:'wall',storey:0});
 w.setPlacement('corner','corner');
 const solved=w.solvePlacement(new THREE.Vector3(1,2.6,-.9));
 assert(!solved.corner,'Corner placement must not use different storey wall pair');
}
const html=fs.readFileSync(path.join(d,'../index.html'),'utf8');
assert(html.includes('id="buildJoinMode"'));
console.log('Physical corner end sockets: 4 rotations × 3 stories × 2 arms, offset GLB and multi-floor isolation OK');