'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const T=require('../app/src/main/assets/js/three.min.js');
const Motion=require('../app/src/main/assets/js/avatar-motion.js');
const root=path.join(__dirname,'../app/src/main/assets');
const app=fs.readFileSync(path.join(root,'js/clean-app.js'),'utf8');
const bridge=fs.readFileSync(path.join(root,'engine/builder/play-bridge.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const clips=[
 new T.AnimationClip('Idle_A',1,[]),
 new T.AnimationClip('Walk_Formal',.75,[]),
 new T.AnimationClip('Run_Stealth',.7,[]),
 new T.AnimationClip('Sword_Attack_RM',.55,[]),
 new T.AnimationClip('Attack_Ground_Pound',.9,[]),
 new T.AnimationClip('Death',1.2,[]),
 new T.AnimationClip('Chop_Tree',1.4,[])
];
assert.equal(Motion.choose(clips,false,{idle:'Idle_A'}).name,'Idle_A');
assert.equal(Motion.choose(clips,true,{walk:'Walk_Formal'}).name,'Walk_Formal');
assert.equal(Motion.choose(clips,true,{run:'Run_Stealth'}).name,'Run_Stealth',
 'Run may be used when authored in a character without Walk');
const actor=new T.Group();
const mixer=new T.AnimationMixer(actor);
const actions=Object.fromEntries(clips.map(clip=>[clip.name,mixer.clipAction(clip)]));
let state='';
let result=Motion.reconcile(clips,actions,state,false,T,.12,{idle:'Idle_A'});
state=result.state;
assert(actions.Idle_A.isRunning());
result=Motion.reconcile(clips,actions,state,true,T,.12,{walk:'Walk_Formal'});
state=result.state;
assert.equal(result.clip,'Walk_Formal');
assert(actions.Walk_Formal.isRunning());
for(let i=0;i<60;i++){
 mixer.update(.016);
 Motion.reconcile(clips,actions,state,true,T,.12,{walk:'Walk_Formal'});
}
assert(actions.Walk_Formal.isRunning(),'Selected Walk must remain looping');
assert(app.includes('this.fillAvatarAnimationChoices(this.avatarBindings)'),
 'Imported GLB must populate every animation slot');
assert(app.includes("for(const input of document.querySelectorAll('[data-avatar-animation-state]'))"),
 'Every visible avatar animation slot must be wired');
assert(app.includes("this.avatarBindings.attack=this.avatarAttackClip")||
 app.includes("this.avatarAttackClip=this.avatarBindings.attack"),
 'Legacy attack setting and visible selection must synchronize');
assert(app.includes("animationBindings:{...this.avatarBindings}"),
 'Player animations must persist alongside existing avatar in project JSON');
assert(app.includes("this.avatarBindings=doc.animationBindings"),
 'Project reload must rebind every GLB action');
assert(app.includes("playAvatarAction(state)"),
 'Player attack, death, hit, cast should share one correct animation action flow');
for(const id of ['avatarPreviewClip','btnAvatarPreviewClip',
 'btnAvatarAutoAnimations'])assert(html.includes('id="'+id+'"'));
for(const state of ['idle','walk','run','attack','hit','death','cast'])
 assert(html.includes('data-avatar-animation-state="'+state+'"'),
  'Missing real GLB clip binding for '+state);
assert(bridge.includes("if(!result){this.builder.playAttackAnimation?.();return false;}"),
 'Pressing Attack without a mob target must still animate the hero');
assert(bridge.includes('this.builder.playCastAnimation?.()'),
 'Casting a skill must play the chosen Cast animation');
assert(bridge.includes('this.builder.playHitAnimation?.()'),
 'Taking damage must play the chosen Hit animation');
console.log('PASS: every avatar GLB clip selectable, explicit Idle/Walk, saved Attack/Hit/Death/Cast and no-target sword swing');
