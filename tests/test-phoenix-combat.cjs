'use strict';
const assert=require('node:assert/strict');
const {Session}=require('../app/src/main/assets/engine/core/phoenix-combat.js');
const combat=new Session({damage:25,range:2.7,cooldown:.65});
const start=[
 {id:'wolf',name:'Волк',maxHp:55,faction:'enemy'},
 {id:'friend',name:'NPC',maxHp:100,faction:'ally'},
 {id:'remote',name:'Дальний враг',maxHp:100,faction:'enemy'}
];
combat.reset(start);
const targets=[
 {id:'wolf',position:[2,0,0]},
 {id:'friend',position:[.3,0,0]},
 {id:'remote',position:[30,0,0]}
];
let event=combat.attack([0,0,0],targets,1);
assert.equal(event.ok,true);
assert.equal(event.id,'wolf');
assert.equal(event.hp,30);
assert.equal(event.killed,false);
assert.equal(combat.get('wolf').maxHp,55);
assert.equal(combat.get('wolf').hp,30);
assert.equal(combat.attack([0,0,0],targets,1.01).reason,'cooldown');
event=combat.attack([0,0,0],targets,1.66);
assert.equal(event.hp,5);
event=combat.attack([0,0,0],targets,2.32);
assert.equal(event.hp,0);
assert.equal(event.killed,true);
assert.equal(combat.isDead('wolf'),true);
event=combat.attack([0,0,0],targets,3);
assert.equal(event.ok,false);
assert.equal(event.reason,'miss','Dead mobs cannot be attacked');
assert.equal(combat.get('friend').hp,100,'Friendly NPC never receives player attack');
combat.reset(start);
event=combat.attack([0,0,0],targets,1,()=>false);
assert.equal(event.reason,'blocked','Solid wall blocks a melee attack');
assert.equal(combat.get('wolf').hp,55);
event=combat.attack([0,0,0],[{id:'wolf',position:[2,4,0]}],2);
assert.equal(event.reason,'miss','Different storeys cannot hit');
combat.reset(start);
assert.equal(combat.get('wolf').hp,55,'New PLAY resets authored HP');
assert.throws(()=>combat.reset([{id:'bad',maxHp:Infinity}]),/Invalid HP/);
assert.equal(combat.get('wolf').hp,55,'Invalid session reset must be atomic');
assert.throws(()=>combat.attack([Infinity,0,0],[],1),/Invalid combat target/);
assert.throws(()=>new Session({damage:-1}),/Invalid damage/);
const missing=new Session();
missing.reset([]);
assert.equal(missing.attack([0,0,0],[],5).reason,'miss');
console.log('PASS: Phoenix Combat HP, death, range, cooldown, blocked walls, factions and PLAY reset');
