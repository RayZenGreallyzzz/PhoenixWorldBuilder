const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.BuildCore=require(path.join(dir,'build-core.js'));
global.BuildSnap=require(path.join(dir,'build-snap.js'));
global.BuildJoin=require(path.join(dir,'build-join.js'));
global.BuildCurves=require(path.join(dir,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(dir,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const close=(a,b,msg)=>assert(Math.abs(a-b)<.03,msg+': '+a+' != '+b);
function fresh(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),nextId:1,
  ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'playbuild',placement:null,
  placementCategory:null,placementRotation:0,placementScale:1,placementAxes:{x:1,y:1,z:1},
  smartSnap:true,joinMode:'auto',autoThickness:true,edgeShift:0,placementLift:0,
  cornerOffsetX:0,cornerOffsetZ:0,centerOverhead:false,storeyHeight:9.9,floorLevel:77,snap:2,
  currentPaint:'#fff',placementSurfacePaint:{},lastSnapResult:null,yaw:0,
  gameSnapChoice:'auto',gameSnapResolvedChoice:null,gameSnapTargetId:null,gameSnapSocketName:null,
  gameSnapStackT:null,_gameAimSignature:'',onAimTargetChanged:()=>{},onSnapChanged:()=>{}});
 w.player=new THREE.Group();w.player.position.set(0,.85,5);w.scene.add(w.player);
 w.camera=new THREE.PerspectiveCamera(59,1,.08,100);w.camera.position.set(0,2.2,6);
 w.camera.lookAt(0,1.3,0);w.camera.updateProjectionMatrix();w.camera.updateMatrixWorld(true);
 w.pointer=new THREE.Vector2();w.ray=new THREE.Raycaster();
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=id=>id==='wall'?'wall':'prop';
 return w;
}
function wall(w,id,x=0,z=0){
 return w.instantiate('wall',{id,pos:[x,0,z],rot:0,scale:1,category:'wall',storey:id});
}
// Aim at one wall while another wall is close enough to have stolen older heuristic snapping.
{
 const w=fresh(),target=wall(w,1,0,0),distractor=wall(w,2,2.05,0);
 w.buildAimHit=()=>({entry:target,point:new THREE.Vector3(.75,1.3,.11),normal:new THREE.Vector3(0,0,1),distance:5});
 w.setPlacement('wall','wall');
 w.setGameSnapChoice('top');
 const point=w.forwardPlacementPoint();
 assert.equal(w.gameSnapTargetId,1,'Crosshair locks a concrete target wall');
 const solved=w.solvePlacement(point);
 assert(solved.stacked&&solved.snapped,'Top choice stacks wall on aimed wall');
 assert.equal(solved.reference,1,'Nearby wall cannot hijack aimed target');
 assert(solved.boundsContained,'Stacked wall is contained by support boundaries');
 close(solved.position.y,2.6,'Upper wall bottom is actual target top');
 close(solved.position.x,0,'Equal-width wall is centered on target bounds');
 assert.notEqual(solved.reference,distractor.data.id);
}
// Explicit endpoint selection chooses that aimed wall socket, not a nearby endpoint.
{
 const w=fresh(),target=wall(w,10,0,0);wall(w,11,2.1,.15);
 w.buildAimHit=()=>({entry:target,point:new THREE.Vector3(-.9,1.1,.11),normal:new THREE.Vector3(0,0,1),distance:4});
 w.setPlacement('wall','wall');
 const options=w.gameAimOptions();
 assert(options?.choices['left-end']&&options?.choices['right-end'],'Aimed wall exposes both physical end choices');
 w.setGameSnapChoice('left-end');
 const point=w.forwardPlacementPoint(),solved=w.solvePlacement(point);
 assert(solved.wallEnd&&solved.physicalSocket,'Endpoint choice uses physical socket alignment');
 assert.equal(solved.reference,10,'Endpoint remains locked to crosshair wall');
 assert.equal(solved.targetSocket,w.gameSnapSocketName,'Solver uses the selected target socket');
}
// Wider incoming wall is rejected instead of hanging outside support wall boundaries.
{
 const w=fresh(),target=wall(w,20,0,0);
 w.buildAimHit=()=>({entry:target,point:new THREE.Vector3(0,1.4,.11),normal:new THREE.Vector3(0,0,1),distance:4});
 w.setPlacement('wall','wall');w.setDimensionFactor('x',1.6);
 w.setGameSnapChoice('top');
 const point=w.forwardPlacementPoint(),solved=w.solvePlacement(point);
 assert.equal(solved.valid,false,'Too-wide upper wall is blocked');
 assert(/шире опорной|границ/.test(solved.missingTarget||''),'Boundary error is explained to player');
}
// Game UI no longer exposes floor/storey controls and offers aimed snap choices.
const html=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
assert(html.includes('data-game-snap="left-end"')&&html.includes('data-game-snap="top"')&&html.includes('data-game-snap="right-end"'),
 'Game HUD exposes aimed physical snap choices');
assert(html.includes('legacyStoreyControls hidden'),'Legacy storey controls are hidden from game construction UI');
const worldText=fs.readFileSync(path.join(dir,'world.js'),'utf8');
assert(worldText.includes('buildAimHit(maxDistance=24)'),'Game placement raycasts the crosshair into real walls');
assert(worldText.includes("this.pointer.set(0,0)"),'Game construction uses center crosshair ray');
console.log('Game crosshair target lock, explicit wall sockets, bounded stacking and hidden storey UI OK');
