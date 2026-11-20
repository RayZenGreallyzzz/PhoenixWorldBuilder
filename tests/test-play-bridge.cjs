'use strict';
const assert = require('node:assert/strict');
const PhoenixPlayBridge = require('../app/src/main/assets/engine/builder/play-bridge.js');
class V {
 constructor(x, y, z) {this.x = x;this.y = y;this.z = z;}
 clone() {return new V(this.x,this.y,this.z);}
 copy(other) {this.x=other.x;this.y=other.y;this.z=other.z;return this;}
}
const classes = new Set();
const dom = {};
for(const id of ['btnPhoenixPlay','btnPhoenixEdit','phoenixPlayHud','phoenixCombatHud','btnPhoenixAttack','phoenixCombatHP','phoenixCombatTarget','phoenixCombatNotice','status','placementDot']) {
 dom[id] = {hidden:id==='phoenixPlayHud'||id==='phoenixCombatHud',textContent:'',className:'',listeners:{},
  addEventListener(event,cb){this.listeners[event]=cb;}};
}
const document = {
 body:{classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n)}},
 getElementById:id=>dom[id]
};
let ids=0;
class World {constructor(){this.entities=[];}createEntity(n){this.entities.push(n);return ++ids;}}
class Controller {
 constructor(m){this.mode=m;}
 setMode(m){if(!['edit','play','live-edit'].includes(m))throw Error('invalid');this.mode=m;}
}
let modeChanges=[];
let attacks=0,playAttackAnimations=0,playingSwitches=[];
const builder = {
 mode:'build',tool:'place',projectLoadRunning:false,restoringProject:false,
 projectLoadPaused:false,bakeBusy:false,gizmoPointer:null,dragMove:null,
 shapeDragPointer:null,shapeSourceMode:false,shapePlaceMode:false,
 controls:{target:new V(10,1,5),enabled:true,update(){this.updates=(this.updates||0)+1}},
 camera:{position:new V(10,5,8)},player:{position:new V(1,0,1),rotation:new V(0,2,0)},
 preview:{root:{visible:true}},previewOutline:{visible:true},keys:new Set(['w']),
 joystick:{reset(){this.resets=(this.resets||0)+1}},
 setMode(m){this.mode=m;modeChanges.push(m);if(m==='character') {
  this.camera.position.copy(new V(1,3,7));
  this.controls.target.copy(new V(1,1,1));
  this.preview.root.visible=true;
 }},
 setAvatarAnimation(moving){this.avatarMoving=moving;},
 playAttackAnimation(){playAttackAnimations++;return true;},
 prefabEditor:{
  close(){},
  setPlaying(v){playingSwitches.push(v);},
  attackNearest(){attacks++;return {ok:true,id:'wolf',name:'Волк',
   hp:75,maxHp:100,damage:25,killed:false}}
 }
};
const bridge = new PhoenixPlayBridge(builder,{PhoenixWorld:World,PhoenixModeController:Controller},document);
assert.equal(bridge.active,false);
const originalCamera=builder.camera.position.clone();
const originalTarget=builder.controls.target.clone();
const originalPosition=builder.player.position.clone();
const originalRotation=builder.player.rotation.clone();
assert.equal(bridge.enter(),true);
assert.equal(bridge.enter(),false);
assert.equal(bridge.active,true);
assert.equal(builder.mode,'character');
assert.equal(bridge.modeController.mode,'play');
assert.equal(builder.preview.root.visible,false);
assert.equal(builder.previewOutline.visible,false);
assert.equal(dom.phoenixPlayHud.hidden,false);
assert.equal(dom.phoenixCombatHud.hidden,false);
dom.btnPhoenixAttack.listeners.click();
assert.equal(attacks,1);
assert.equal(dom.phoenixCombatTarget.textContent,'Волк · HP 75/100');
assert.equal(dom.phoenixCombatHP.value,75);
assert.equal(dom.phoenixCombatHP.hidden,false);
assert.equal(playAttackAnimations,1);
assert.equal(classes.has('phoenixPlaying'),true);
assert.equal(builder.keys.size,0);
assert.equal(bridge.gameWorld instanceof World,true);
assert.equal(bridge.canEnter(),true);
const entries=[{id:4}];builder.entries=entries;
builder.player.position.copy(new V(20,0,30));
builder.player.rotation.copy(new V(0,5,0));
builder.camera.position.copy(new V(30,10,30));
let prevented=0;
assert.equal(bridge.handleKeyDown({key:'f',code:'KeyF',repeat:false,
 preventDefault(){prevented++;}}),true);
assert.equal(attacks,2);
assert.equal(bridge.handleKeyDown({key:'Delete',preventDefault(){prevented++;}}),true);
assert.equal(bridge.handleKeyDown({key:'w',preventDefault(){prevented++;}}),false);
assert.equal(bridge.handleKeyDown({key:'Escape',preventDefault(){prevented++;}}),true);
assert.equal(prevented,3);
assert.equal(bridge.active,false);
assert.equal(builder.mode,'build');
assert.deepEqual(builder.camera.position,originalCamera);
assert.deepEqual(builder.controls.target,originalTarget);
assert.deepEqual(builder.player.position,originalPosition);
assert.deepEqual(builder.player.rotation,originalRotation);
assert.equal(builder.preview.root.visible,true);
assert.equal(builder.previewOutline.visible,true);
assert.equal(builder.entries,entries);
assert.equal(classes.has('phoenixPlaying'),false);
assert.equal(dom.phoenixPlayHud.hidden,true);
assert.equal(dom.phoenixCombatHud.hidden,true);
assert.deepEqual(playingSwitches.slice(0,2),[true,false]);
assert.equal(bridge.modeController.mode,'edit');
assert.equal(bridge.exit(),false);
assert.equal(builder.avatarMoving,false);
// Starting PLAY during a project restore or object drag must do nothing.
builder.projectLoadRunning=true;
assert.equal(bridge.enter(),false);
assert.equal(builder.mode,'build');
builder.projectLoadRunning=false;
builder.dragMove={id:1};
assert.equal(bridge.enter(),false);
builder.dragMove=null;
builder.shapePlaceMode=true;
assert.equal(bridge.enter(),false);
builder.shapePlaceMode=false;
assert.equal(bridge.enter(),true);
assert.equal(dom.btnPhoenixEdit.listeners.click(),true);
assert.equal(builder.mode,'build');
assert.equal(builder.preview.root.visible,true);
assert.equal(modeChanges.length,4);
console.log('PASS: Phoenix PLAY -> EDIT restores camera/player/preview; blocks unsafe actions; no extra RAF');
