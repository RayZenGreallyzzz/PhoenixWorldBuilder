const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(root,'three.min.js'));
global.BuildSnap=require(path.join(root,'build-snap.js'));
global.BuildJoin=require(path.join(root,'build-join.js'));
global.BuildPlacementValidator=require(path.join(root,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(root,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
function fresh(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
 nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',
 placement:null,placementCategory:null,placementRotation:0,placementScale:1,
 smartSnap:true,autoThickness:true,joinMode:'auto',edgeShift:0,placementLift:0,
 cornerOffsetX:0,cornerOffsetZ:0,lastSnapResult:null,floorLevel:0,storeyHeight:2.6,
 snap:2,currentPaint:'#ffffff',placementSurfacePaint:{},yaw:0});
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=id=>id.startsWith('glb:')?'wall':
  ({wall:'wall',corner:'corner',floor:'foundation',door:'door'})[id]||'prop';
 return w;
}
const near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const p=(x,y,z)=>new THREE.Vector3(x,y,z);
const w=fresh();
const base=w.instantiate('wall',{id:41,pos:[0,0,0],rot:0,scale:1,category:'wall',storey:0});
w.setPlacement('wall','wall');
let result=w.solvePlacement(p(2,0,0));
assert(result.wallEnd&&result.snapped,'Wall chooses existing wall end instead of 2m floor grid');
assert(Math.abs(result.position.x-2)<.02,'New wall center must connect exactly to old wall end');
let top=w.placeAt(p(2,0,0));assert(top,'Straight joint must be placeable despite overlap policy');
const origInfo=BuildJoin.wallInfo(w,base),newInfo=BuildJoin.wallInfo(w,top);
assert(Math.min(near(origInfo.c,newInfo.a),near(origInfo.c,newInfo.c))<.0001,'Wall world endpoints meet without gap');
w.setPlacement('wall','wall'); // prevents copied fine offset
result=w.solvePlacement(p(1,0,-1));
assert(result.wallEnd&&result.wallCorner,'Placing new panel perpendicular chooses 90 degree end joint');
assert(Math.abs(result.position.z+1)<.06,'Perpendicular wall ends at corner');
const cornerPiece=w.placeAt(p(1,0,-1));
assert(cornerPiece,'90-degree turn should install without false red collision');
const cornerInfo=BuildJoin.wallInfo(w,cornerPiece);
assert(Math.min(near(origInfo.c,cornerInfo.a),near(origInfo.c,cornerInfo.c))<.0001,'90-degree wall endpoint connects exactly');
w.setPlacement('wall','wall');w.shiftCorner(.1,-.2);
result=w.solvePlacement(p(2,0,0));assert(result.wallEnd);
assert(Math.abs(result.position.x-2.1)<.05,'Fine X offset may adjust wall joint');
assert(Math.abs(result.position.z+.2)<.05,'Fine Z offset may adjust wall joint');
w.setPlacement('wall','wall');
assert.equal(w.cornerOffsetX,0,'New module starts without old corrections');
w.setJoinMode('corner');
result=w.solvePlacement(p(1,0,0));
assert(result.wallEnd&&result.wallCorner,'Corner mode connects wall endpoints at 90 degrees');
w.applyGhostPlacement(p(1,0,0));
const selectedWall=w.objects.find(e=>e.data.id===result.reference);
const refDir=BuildJoin.wallInfo(w,selectedWall).dir;
const newDir=BuildJoin.wallInfo(w,{mesh:w.ghost,data:{},kind:'wall'}).dir;
assert(Math.abs(refDir.dot(newDir))<.03,'Corner mode creates a right angle to the selected reference wall');
const target=fresh();
const custom=new THREE.Group(),offsetMesh=new THREE.Mesh(new THREE.BoxGeometry(3,2.6,.25),new THREE.MeshStandardMaterial());
offsetMesh.position.set(1,1.3,.55);custom.add(offsetMesh);target.assetCache.set('glb:offpivot',custom);
const first=target.instantiate('glb:offpivot',{id:52,pos:[10,0,3],rot:38,scale:1,category:'wall',storey:0});
const original=BuildJoin.wallInfo(target,first),ending=original.c;
const forward=original.dir;
const desired=p(ending.x+forward.x*1.5,0,ending.z+forward.z*1.5);
target.setPlacement('glb:offpivot','wall');result=target.solvePlacement(desired);
assert(result.wallEnd&&result.snapped,'Imported GLB with offset pivot finds physical wall endpoint');
const second=target.placeAt(desired);assert(second,'Imported offset pivot wall should install');
const more=BuildJoin.wallInfo(target,second);
const gap=Math.min(near(ending,more.a),near(ending,more.c));
assert(gap<.0001,'Offset-pivot GLB physical ends must meet exactly: gap '+gap);
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const java=fs.readFileSync(path.join(root,'../../java/com/phoenix/worldbuilder/MainActivity.java'),'utf8');
const html=fs.readFileSync(path.join(root,'../index.html'),'utf8');
assert(app.includes('● Не сохранено'));
assert(app.includes('if(!notify||isLoading||pendingRecovery)return false'),'Project writes require manual intent');
assert(!app.includes('setTimeout(()=>saveLocal('),'Never autosave after placement');
assert(!app.includes("addEventListener('visibilitychange'"),'Never autosave on Android pause');
assert(!app.includes("addEventListener('pagehide'"),'Never autosave on exit');
assert(!app.includes('15000);'),'No periodic 15s save');
assert(java.includes('Выйти без сохранения'),'Explicit exit without saving');
assert(java.includes('super.onPause();'),'Normal onPause without save');
assert(html.includes('Точная подгонка стены'),'Fine X/Z controls should be visible');
console.log('Straight/90-degree real GLB wall endpoint joints, offset pivots, manual XZ nudges and no autosave OK');
