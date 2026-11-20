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
const retaliation=new Session({playerHp:60});
retaliation.reset(start);
assert.deepEqual(retaliation.getPlayer(),{hp:60,maxHp:60,dead:false,kills:0});
assert.equal(retaliation.damagePlayer('friend',20).ok,false,
 'Allied or neutral NPCs cannot damage the player');
assert.equal(retaliation.damagePlayer('unknown',20).ok,false);
let incoming=retaliation.damagePlayer('wolf',25);
assert.deepEqual([incoming.ok,incoming.hp,incoming.dead],[true,35,false]);
incoming=retaliation.damagePlayer('wolf',40);
assert.equal(incoming.hp,0);
assert.equal(incoming.dead,true);
assert.equal(retaliation.isPlayerDead(),true);
assert.equal(retaliation.attack([0,0,0],targets,1).reason,'player-dead',
 'Dead player cannot attack');
assert.equal(retaliation.damagePlayer('wolf',10).ok,false,
 'Further NPC hits must not underflow player HP');
retaliation.reset(start);
assert.equal(retaliation.getPlayer().hp,60);
assert.equal(retaliation.getPlayer().dead,false);
assert.equal(retaliation.getPlayer().kills,0);
assert.throws(()=>retaliation.damagePlayer('wolf',Infinity),/Invalid enemy damage/);
retaliation.attack([0,0,0],targets,1);
retaliation.attack([0,0,0],targets,2);
retaliation.attack([0,0,0],targets,3);
assert.equal(retaliation.getPlayer().kills,1);
retaliation.reset(start);
assert.equal(retaliation.getPlayer().kills,0);
const healing=new Session({playerHp:100});
healing.reset(start);
assert.equal(healing.healPlayer(30).reason,'full','Cannot heal above max HP');
healing.damagePlayer('wolf',40);
const healed=healing.healPlayer(30);
assert.equal(healed.ok,true);
assert.equal(healed.healed,30);
assert.equal(healing.getPlayer().hp,90);
assert.equal(healing.healPlayer(30).hp,100,'Healing must clamp to max HP');
healing.damagePlayer('wolf',200);
assert.equal(healing.healPlayer(30).reason,'player-dead','No heal after death');
healing.reset(start);
assert.equal(healing.getPlayer().hp,100);
console.log('PASS: Phoenix Combat: player death, enemy retaliation, protection, respawn HP and kills');
console.log('PASS: Phoenix Combat HP, death, range, cooldown, blocked walls, factions and PLAY reset');
