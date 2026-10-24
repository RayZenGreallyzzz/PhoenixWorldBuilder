const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.BuildSnap=require(path.join(dir,'build-snap.js'));
global.BuildJoin=require(path.join(dir,'build-join.js'));
global.BuildCurves=require(path.join(dir,'build-curves.js'));
global.BuildRoundedSnap=require(path.join(dir,'build-rounded-snap.js'));
global.BuildOuterEdge=require(path.join(dir,'build-outer-edge.js'));
global.BuildPlacementValidator=require(path.join(dir,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),eps=.035;
const theta=v=>Math.atan2(-v.z,v.x);
const rotate=(v,y)=>V(v.x*Math.cos(y)+v.z*Math.sin(y),v.y,-v.x*Math.sin(y)+v.z*Math.cos(y));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function makeArc(radius,angle){
 const data=[],count=Math.max(6,Math.ceil(angle/5)),half=angle*Math.PI/360;
 for(let i=0;i<=count;i++){
  const phi=-half+(i/count)*2*half;
  for(const r of [radius-.11,radius+.11]){
   data.push(r*Math.sin(phi),0,r*Math.cos(phi)-radius*.86);
   data.push(r*Math.sin(phi),2.6,r*Math.cos(phi)-radius*.86);
  }
 }
 const root=new THREE.Group(),geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(data,3));
 root.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial()));return root;
}
const kind='glb:rounded/arc_r1_5_90deg.glb';
function fresh(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
  nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',
  placement:null,placementCategory:null,placementRotation:0,placementScale:1,
  placementAxes:{x:1,y:1,z:1},smartSnap:true,joinMode:'auto',
  autoThickness:false,edgeShift:0,placementLift:0,
  cornerOffsetX:0,cornerOffsetZ:0,floorLevel:0,storeyHeight:2.6,
  snap:2,currentPaint:'#fff',placementSurfacePaint:{},placementDecals:[],lastSnapResult:null});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=name=>name==='floor'?'foundation':name===kind?'wall':name==='corner'?'corner':'wall';
 w.assetCache.set(kind,makeArc(1.5,90));
 return w;
}
function vertices(root){
 root.updateWorldMatrix(true,true);const out=[];
 root.traverse(obj=>{
  const attr=obj.geometry?.attributes?.position;
  if(!obj.isMesh||!attr)return;
  for(let i=0;i<attr.count;i++)out.push(V(attr.getX(i),attr.getY(i),attr.getZ(i)).applyMatrix4(obj.matrixWorld));
 });return out;
}
function testFloor(rotation,storey,axes){
 const w=fresh();w.floorLevel=storey;
 const fl=w.instantiate('floor',{id:1,pos:[4,storey*2.6,-3],rot:rotation,scale:1,
  category:'foundation',storey});
 fl.mesh.updateWorldMatrix(true,true);
 const b=BuildSnap.attrBounds(fl.mesh);
 for(const sx of [-1,1])for(const sz of [-1,1]){
  w.setPlacement(kind,'wall');w.placementAxes={x:axes[0],y:1,z:axes[1]};
  w.applyAxisScale(w.ghost,1,w.placementAxes);
  w.cornerOffsetX=.2;w.cornerOffsetZ=-.2; // Must not pollute an automatic rounded magnet.
  const at=V(sx*.83,b.max.y,sz*.83).applyMatrix4(fl.mesh.matrixWorld);
  const sol=w.solvePlacement(at);
  assert(sol?.roundedOnFloor,'Round corner must fit floor without a wall, rotated '+rotation+' storey '+storey);
  assert.equal(sol.reference,1);
  w.applyGhostPlacement(at);
  const nx=V(sx,0,0).transformDirection(fl.mesh.matrixWorld).setY(0).normalize();
  const nz=V(0,0,sz).transformDirection(fl.mesh.matrixWorld).setY(0).normalize();
  const corner=V(sx, b.max.y,sz).applyMatrix4(fl.mesh.matrixWorld);
  const all=vertices(w.ghost);
  const maxX=Math.max(...all.map(v=>v.clone().sub(corner).dot(nx)));
  const maxZ=Math.max(...all.map(v=>v.clone().sub(corner).dot(nz)));
  assert(Math.abs(maxX)<eps,'Round outside X face to real floor edge, got '+maxX);
  assert(Math.abs(maxZ)<eps,'Round outside Z face to real floor edge, got '+maxZ);
  const source=BuildJoin.wallInfo(w,{mesh:w.ghost,kind,data:{category:'wall',storey}});
  const slots=BuildCurves.sourceSockets(source);
  const targets=[nx.clone().negate(),nz.clone().negate()];
  const valid=(slots[0].out.dot(targets[0])>.99&&slots[1].out.dot(targets[1])>.99)||
   (slots[0].out.dot(targets[1])>.99&&slots[1].out.dot(targets[0])>.99);
  assert(valid,'Quarter arc must point along both floor sides, not diagonal');
 }
}
for(const rotation of [0,37,90])for(const storey of [0,1])
 for(const axes of [[1,1],[1.3,.7]])testFloor(rotation,storey,axes);
{
 const w=fresh();const arc=w.assetCache.get(kind);
 const slots=BuildCurves.localSockets(arc,kind);
 assert(slots?.length===2);
 for(let i=0;i<2;i++){
  const localPoint=V(-1,0,0),localOut=V(-1,0,0),desired=slots[i].out.clone().negate();
  const yaw=theta(desired)-theta(localOut);
  const pos=slots[i].point.clone().sub(rotate(localPoint,yaw));
  w.instantiate('wall',{id:50+i,pos:pos.toArray(),rot:yaw*180/Math.PI,scale:1,
   category:'wall',storey:0});
 }
 w.setPlacement(kind,'wall');
 const box=BuildSnap.attrBounds(arc),click=box.getCenter(V());
 const result=w.solvePlacement(click);
 assert(result?.dualSocket,'Round corner must connect BOTH physically matching wall ends');
 w.applyGhostPlacement(click);
 const placed=BuildCurves.sourceSockets(BuildJoin.wallInfo(w,{
  kind,mesh:w.ghost,data:{category:'wall',storey:0}}));
 for(let i=0;i<2;i++){
  const wall=BuildJoin.wallInfo(w,w.objects[i]);
  const target=[...BuildCurves.sourceSockets(wall)].find(s=>distance(s.point,slots[i].point)<.03);
  assert(target,'Expected wall socket exists');
  assert(placed.some(s=>distance(s.point,target.point)<.025&&s.out.dot(target.out)<-.99),
   'Both end caps must meet exactly without overlapping or arbitrary offsets');
 }
}
{
 const w=fresh(),other='glb:arcs/arc_r1_5_180deg.glb';
 w.assetCache.set(other,makeArc(1.5,180));w.categoryForKind=k=>k===other?'wall':'foundation';
 w.instantiate('floor',{id:5,pos:[0,0,0],rot:0,scale:1,category:'foundation',storey:0});
 w.setPlacement(other,'wall');
 assert.equal(BuildRoundedSnap.resolve(w,V(.8,.17,.8)),null,
  'Half-circle must never be forced into a ninety-degree exterior corner');
}
const html=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
assert(html.includes('src="js/build-rounded-snap.js"'),'Offline builder loads new rounded snap engine');
console.log('Rounded corners: four sides, rotated/sloped screen frame, X/Z scaling, storeys 1/2, two-wall dual sockets, 180° safety OK');
