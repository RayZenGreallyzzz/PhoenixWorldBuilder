'use strict';
const assert=require('node:assert/strict');
const AI=require('../app/src/main/assets/engine/core/phoenix-ai.js');
assert.deepEqual(AI.BEHAVIORS,['idle','patrol','chase','patrol-aggro','guard']);
assert.throws(()=>AI.normalize({mode:'teleport'}),/Invalid AI mode/);
assert.throws(()=>AI.normalize({aggroRadius:-3}),/aggroRadius/);
const idle=AI.tick(AI.initial([0,0,0]),[0,0,0],[2,0,1],
 {mode:'idle'},{speed:5},.1);
assert.deepEqual(idle.move,[0,0,0]);
assert.equal(idle.animation,'idle');
let home=AI.initial([0,0,0]);
let patrol=AI.tick(home,[0,0,0],[100,0,100],
 {mode:'patrol',patrolRadius:3},{speed:2},.15);
assert.equal(patrol.animation,'walk');
assert(patrol.move[0]>0,'Patrol must walk to first waypoint');
assert.equal(patrol.attack,false);
let seek=AI.tick(home,[0,0,0],[3,0,2],{mode:'chase',aggroRadius:7,attackRange:1.2},
 {speed:3},.1,'enemy');
assert.equal(seek.animation,'walk');
assert(seek.move[0]>0&&seek.move[2]>0);
assert.equal(seek.yaw!==null,true);
let attack=AI.tick(home,[0,0,0],[.6,0,0],
 {mode:'chase',aggroRadius:7,attackRange:1.25,attackCooldown:1.8},
 {speed:2},.15,'enemy');
assert.equal(attack.animation,'attack');
assert.equal(attack.attack,true);
let still=AI.tick(attack.state,[0,0,0],[.6,0,0],
 {mode:'chase'}, {speed:2},.15,'enemy');
assert.equal(still.attack,false);
assert.equal(still.animation,'attack');
const ally=AI.tick(home,[0,0,0],[.6,0,0],
 {mode:'chase'}, {speed:2},.15,'ally');
assert.equal(ally.attack,false);
assert.equal(ally.animation,'idle');
const returnHome=AI.tick(home,[5,0,5],[50,0,50],
 {mode:'chase',aggroRadius:5},{speed:4},.15,'enemy');
assert.equal(returnHome.animation,'walk');
assert(returnHome.move[0]<0&&returnHome.move[2]<0);
assert.deepEqual(home.home,[0,0,0],'Runtime decisions must not mutate authored home');
// Identical GLBs can now have distinct authored waypoints per placed mob.
const left=AI.tick(AI.initial([0,0,0]),[0,0,0],[100,0,100],
 {mode:'patrol',waypoints:[[-8,0,0],[-8,0,8]]},{speed:3},.1,'enemy');
const right=AI.tick(AI.initial([0,0,0]),[0,0,0],[100,0,100],
 {mode:'patrol',waypoints:[[8,0,0],[8,0,8]]},{speed:3},.1,'enemy');
assert(left.move[0]<0&&right.move[0]>0);
assert.equal(left.attack,false);
const patroller=AI.tick(AI.initial([0,0,0]),[0,0,0],[.8,0,.3],
 {mode:'patrol-aggro',aggroRadius:7,attackRange:1.25,attackDuration:1.1,
  waypoints:[[3,0,4]]},{speed:2},.15,'enemy');
assert.equal(patroller.attack,true,'Patrol + aggro must actually enter Attack');
assert.equal(patroller.animation,'attack');
assert(patroller.state.attackHold>.85,
 'Attack holds for the actual GLB clip duration, not a hard-coded 0.5sec');
const guard=AI.tick(AI.initial([0,0,0]),[0,0,0],[.5,0,0],
 {mode:'guard',aggroRadius:5},{speed:2},.15,'enemy');
assert.equal(guard.animation,'attack');
const guardFar=AI.tick(AI.initial([0,0,0]),[0,0,0],[40,0,0],
 {mode:'guard',aggroRadius:5},{speed:2},.15,'enemy');
assert.equal(guardFar.animation,'idle');
assert.throws(()=>AI.normalize({waypoints:[[NaN,0,0]]}),/waypoint/);
assert.throws(()=>AI.normalize({waypoints:new Array(33).fill([0,0,0])}),/waypoints/);
const points=[[1,0,0]];
const safeAI=AI.normalize({mode:'patrol-aggro',waypoints:points});
points[0][0]=100;
assert.equal(safeAI.waypoints[0][0],1,'Each route must own independent waypoint data');
// Named appearance is independent from intent: white defensive patrol does not aggro.
const defensive=AI.normalize({mode:'patrol',engagement:'defensive',aggroRadius:7});
let peaceful=AI.tick(AI.initial([0,0,0]),[0,0,0],[.5,0,0],
 defensive,{speed:2},.1,'enemy');
assert.equal(peaceful.attack,false,'White defensive patroller must not attack first');
assert.equal(peaceful.animation,'walk','Defensive NPC still patrols');
const retaliate=AI.tick(AI.provoke(peaceful.state,12),[0,0,0],[.5,0,0],
 defensive,{speed:2},.1,'enemy');
assert.equal(retaliate.attack,true,'Defensive NPC must retaliate after being hit');
assert.equal(retaliate.engaged,true);
const proactive=AI.tick(AI.initial([0,0,0]),[0,0,0],[.5,0,0],
 {...defensive,engagement:'aggressive'}, {speed:2},.1,'enemy');
assert.equal(proactive.attack,true,'Red preset automatically attacks in aggro range');
const outside=AI.tick(AI.initial([0,0,0]),[0,0,0],[5,0,0],
 {...defensive,engagement:'aggressive',aggroRadius:2},{speed:2},.1,'enemy');
assert.equal(outside.attack,false,'Per-mob aggro radius must be respected');
const trulyPassive=AI.tick(AI.provoke(AI.initial([0,0,0])),[0,0,0],[.5,0,0],
 {...defensive,engagement:'passive'}, {speed:2},.1,'enemy');
assert.equal(trulyPassive.attack,false);
const friend=AI.tick(AI.provoke(AI.initial([0,0,0])),[0,0,0],[.5,0,0],
 {...defensive,engagement:'aggressive'}, {speed:2},.1,'ally');
assert.equal(friend.attack,false,'Allied mob never attacks the player');
assert.throws(()=>AI.normalize({engagement:'unknown'}),/engagement/);
console.log('PASS: per-NPC waypoint routes, patrol+attack, guards, combat clip timing, cooldown and factions + defensive/aggressive presets');
