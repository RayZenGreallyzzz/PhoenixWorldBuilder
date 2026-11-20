'use strict';
const assert=require('node:assert/strict');
const AI=require('../app/src/main/assets/engine/core/phoenix-ai.js');
assert.deepEqual(AI.BEHAVIORS,['idle','patrol','chase']);
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
console.log('PASS: NPC idle, patrol, chase, return home, attack cooldown and faction AI');
