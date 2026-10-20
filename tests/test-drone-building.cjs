const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const dir=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const w=Object.create(WorldBuilder.prototype);
Object.assign(w,{scene:new THREE.Scene(),objects:[],target:new THREE.Vector3(0,0,0),
 camera:new THREE.PerspectiveCamera(59,1,.08,280),
 player:new THREE.Group(),floorLevel:1,storeyHeight:3,mode:'playbuild',
 droneMode:false,droneReturnView:null,smartSnap:false,
 placement:'wall',placementCategory:'wall',placementRotation:0,placementScale:1,
 yaw:.6,pitch:.34,distance:5.2,joy:{x:0,y:0},keys:{},playerSpeed:4,
 running:false,invertJoystickX:false,invertJoystickY:false});
w.heightAt=()=>0;w.updateGameGhost=()=>{};w.onChanged=()=>{};
w.player.position.set(5,2,7);w.scene.add(w.player);w.player.visible=true;
const avatar=w.player.position.clone(),orbit={yaw:w.yaw,pitch:w.pitch,distance:w.distance};
assert.equal(w.setDroneMode(true),true);
assert.equal(w.droneMode,true);
assert.equal(w.player.visible,false,'Drone hides avatar without moving it');
assert.deepEqual(w.player.position.toArray(),avatar.toArray());
assert.equal(w.distance,20,'Drone zooms out for an overhead construction view');
const start=w.target.clone();assert(Math.abs(start.x-5)<1e-8&&Math.abs(start.z-7)<1e-8);
assert(w.camera.position.y>w.target.y,'Drone floats above construction plane');
let point=w.forwardPlacementPoint();
assert.equal(point.x,start.x);
assert.equal(point.z,start.z);
assert.equal(point.y,3,'Upper floor placement uses the active floor elevation');
assert.equal(w.setDroneView('top'),true);
assert(w.pitch>1.5,'Top view must be almost vertical');
assert.equal(w.setDroneView('angled'),true);
assert(w.pitch<1,'Angle view exposes vertical walls');
w.joy={x:1,y:0};w.updatePlayer(.4);
assert(w.target.distanceTo(start)>.5,'Joystick pans the camera over the site');
assert.deepEqual(w.player.position.toArray(),avatar.toArray(),'Joystick does not move avatar in drone mode');
w.joy={x:0,y:0};const beforePan=w.target.clone();
assert.equal(w.panDrone(55,-30),true);assert(w.target.distanceTo(beforePan)>.1,'Two-finger pan moves the camera target');
point=w.forwardPlacementPoint();assert(Math.abs(point.x-w.target.x)<1e-9);
assert(Math.abs(point.z-w.target.z)<1e-9);
assert.equal(w.setDroneMode(false),false);
assert.equal(w.player.visible,true);
assert.equal(w.yaw,orbit.yaw);assert.equal(w.pitch,orbit.pitch);assert.equal(w.distance,orbit.distance);
assert.deepEqual(w.player.position.toArray(),avatar.toArray());
w.updateCamera();
point=w.forwardPlacementPoint();
assert(Math.hypot(point.x-avatar.x,point.z-avatar.z)>3,'Walking placement is still in front of avatar');
const original=w.target.clone();assert.equal(w.panDrone(10,10),false);assert.deepEqual(w.target.toArray(),original.toArray());
assert.equal(w.setDroneMode(true),true);
w.droneMode=true;w.grid={visible:true};w.highlight={visible:false};w.selected=null;
w.setMode('build');
assert.equal(w.droneMode,false,'Leaving game build must restore normal camera');
assert.equal(w.player.visible,false,'Avatar hidden in desktop editor');
// The original overhead editor also needs drone orbit, not only playbuild.
const editorFocus=w.target.clone(),editorYaw=w.yaw;
assert.equal(w.setDroneMode(true),true,'Free camera works in overhead editor');
assert(Math.abs(w.target.x-editorFocus.x)<1e-9&&Math.abs(w.target.z-editorFocus.z)<1e-9,
 'Editor drone keeps focus on current building rather than jumping to the avatar');
w.keys={KeyW:true};w.joy={x:0,y:0};
w.updatePlayer(.3);
assert(w.target.distanceTo(editorFocus)>.5,'Keyboard pans overhead camera');
assert.deepEqual(w.player.position.toArray(),avatar.toArray(),'Editor camera does not affect avatar');
w.keys={};
assert.equal(w.setDroneMode(false),false);
assert.equal(w.yaw,editorYaw,'Exiting editor drone restores camera orbit');
assert.equal(w.player.visible,false);
const html=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
for(const id of ['btnDroneToggle','btnDroneTop','btnDroneAngle','btnDroneZoomIn','btnDroneZoomOut','btnDroneCenter','btnDroneExit','btnDroneEditor'])
 assert(html.includes('id="'+id+'"'),'Missing drone camera UI control '+id);
for(const needle of ["w.panDrone((e.clientX-old.x)/2","if(w.mode==='playbuild'&&w.droneMode){","w.forwardPlacementPoint()","w.setDroneMode(enabled)"])
 assert(app.includes(needle),'Drone touch/placement wiring missing: '+needle);
assert(fs.readFileSync(path.join(dir,'world.js'),'utf8').includes("(this.mode==='playbuild'&&this.droneMode))&&this.floorLevel>0"),
 'Upper-storey hit testing must work in drone construction mode');
console.log('Drone camera independent of avatar, 1/2/3 floor targets, orbit/pan/zoom presets, normal controls and HUD OK');
