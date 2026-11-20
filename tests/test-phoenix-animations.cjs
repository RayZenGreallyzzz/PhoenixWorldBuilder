'use strict';
const assert=require('node:assert/strict');
const T=require('../app/src/main/assets/js/three.min.js');
const {Controller}=require('../app/src/main/assets/engine/runtime/phoenix-animations.js');
const model=new T.Group();
const clips=[
 new T.AnimationClip('Hero_Idle',1,[]),
 new T.AnimationClip('Hero_Walk',.9,[]),
 new T.AnimationClip('Hero_Attack',.7,[]),
 new T.AnimationClip('Hero_Damage',.5,[]),
 new T.AnimationClip('Hero_Death',2,[])
];
const manager=new Controller(model,clips,{idle:'Hero_Idle',walk:'Hero_Walk',attack:'Hero_Attack'},T);
assert.equal(manager.resolve('idle').name,'Hero_Idle');
assert.equal(manager.resolve('walk').name,'Hero_Walk');
assert.equal(manager.resolve('attack').name,'Hero_Attack');
assert.equal(manager.resolve('hit').name,'Hero_Damage');
assert.equal(manager.resolve('death').name,'Hero_Death');
assert.equal(manager.resolve('cast'),null,'Missing cast must not play an arbitrary action');
assert.equal(manager.setState('idle'),true);
assert.equal(manager.state,'idle');
assert.equal(manager.setState('idle'),false);
assert.equal(manager.setState('walk'),true);
assert.equal(manager.setState('attack'),true);
assert.equal(manager.action.loop,T.LoopOnce);
manager.update(.016);
manager.stop();
assert.equal(manager.action,null);
assert.equal(manager.state,'');
const empty=new Controller(new T.Group(),[],{},T);
empty.setState('idle');empty.update(.1);empty.stop();
console.log('PASS: GLB animation Idle/Walk/Attack/Hit/Death, crossfade and clean STOP');
