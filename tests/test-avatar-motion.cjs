'use strict';
const assert=require('node:assert/strict');
const T=require('../app/src/main/assets/js/three.min.js');
const Motion=require('../app/src/main/assets/js/avatar-motion.js');
const fs=require('node:fs'),path=require('node:path');

const actor=new T.Group();
const leg=new T.Bone();leg.name='Leg';actor.add(leg);
const clips=[
 new T.AnimationClip('Idle',.8,[new T.NumberKeyframeTrack('Leg.position[y]',
  [0,.4,.8],[0,.02,0])]),
 new T.AnimationClip('Walk',.6,[new T.NumberKeyframeTrack('Leg.position[y]',
  [0,.3,.6],[0,.4,0])]),
 new T.AnimationClip('Attack',.3,[new T.NumberKeyframeTrack('Leg.position[y]',
  [0,.15,.3],[0,.6,0])])
];
assert.equal(Motion.choose(clips,true).name,'Walk');
assert.equal(Motion.choose(clips,false).name,'Idle');
assert.equal(Motion.choose([clips[2],clips[0]],true).name,'Idle',
 'Attack one-shot is never the first locomotion fallback');
const mixer=new T.AnimationMixer(actor);
const actions=Object.fromEntries(clips.map(c=>[c.name,mixer.clipAction(c)]));
let state='';
function drive(moving,dt=.033){
 const result=Motion.reconcile(clips,actions,state,moving,T,.12);
 state=result.state;
 mixer.update(dt);
 return result;
}
assert.equal(drive(true).state,'walk');
for(let i=0;i<100;i++){
 const result=drive(true);
 assert.equal(result.updated,false,'Held joystick should not restart Walk every frame');
}
assert(actions.Walk.isRunning(),'Walk must continue beyond its clip duration');
assert.equal(actions.Walk.loop,T.LoopRepeat,'Locomotion must loop forever');
assert.equal(actions.Walk.clampWhenFinished,false,'Locomotion must not freeze at end');
assert(actions.Walk.getEffectiveWeight()>.95);

// A rapid idle/walk switch can leave an existing action fading toward zero.
// Previously, isRunning() was true and avatarState was already "walk", so
// UV44 returned early and could remain stuck in a T-pose until finger-up.
drive(false,.015);
drive(true,.015);
for(let i=0;i<10;i++)drive(true);
assert(actions.Walk.getEffectiveWeight()>.8,'Re-entry must cancel stale fade-out');

// Simulate a race where an action is faded out externally while the
// joystick remains held (no new pointerdown/pointerup event).
actions.Walk.fadeOut(.03);
mixer.update(.07);
assert(actions.Walk.getEffectiveWeight()<=.0001,
 'Regression setup: walking has zero influence on the skeleton');
const recovered=drive(true,.17);
assert.equal(recovered.recovered,true,'Held joystick must recover a lost loop');
assert(actions.Walk.isRunning());
assert(actions.Walk.getEffectiveWeight()>.95);
assert(leg.position.y>.02,'Skeleton must leave the bind/T-pose after recovery');

// Legacy one-shot settings may stick to the Walk action when a GLB clip
// gets reused: recover even though the current joystick mode did not change.
actions.Walk.reset();
actions.Walk.setLoop(T.LoopOnce,1);
actions.Walk.clampWhenFinished=true;
actions.Walk.play();
mixer.update(1);
assert.equal(actions.Walk.isRunning(),false,
 'Regression setup: Walk incorrectly finished as a one-shot');
const resumed=drive(true,.12);
assert.equal(resumed.recovered,true);
assert.equal(actions.Walk.loop,T.LoopRepeat);
assert.equal(actions.Walk.clampWhenFinished,false);
assert(actions.Walk.isRunning());
for(let i=0;i<90;i++)drive(true);
assert(actions.Walk.isRunning(),'Animation must not stop again under continuous joystick');

const initial=actor.position.clone();
assert.deepEqual(actor.position.toArray(),initial.toArray(),
 'Recovery must not teleport or sink the player world position');

// Syntax/wiring checks for the real Phoenix Builder, not just the helper.
const assets=path.resolve(__dirname,'../app/src/main/assets');
const html=fs.readFileSync(path.join(assets,'index.html'),'utf8');
const app=fs.readFileSync(path.join(assets,'js/clean-app.js'),'utf8');
assert(html.indexOf('src="js/avatar-motion.js"')>0);
assert(html.indexOf('src="js/avatar-motion.js"')<
 html.indexOf('src="js/clean-app.js"'),
 'Locomotion recovery must load before Builder starts');
assert(app.includes('PhoenixAvatarMotion.reconcile('));
assert(app.includes('this.avatarGroundTimer=.22'),
 'After T-pose recovery the next frame must recheck the avatar feet');
console.log('PASS: continuous joystick Walk survives fade-out/one-shot, restarts skeleton without T-pose or sinking');
