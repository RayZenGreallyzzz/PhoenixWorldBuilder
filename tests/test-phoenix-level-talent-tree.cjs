'use strict';
const assert=require('node:assert/strict');
const RPG=require('../app/src/main/assets/engine/core/phoenix-progression.js');
const {Catalog,Runtime}=require('../app/src/main/assets/engine/core/phoenix-skills.js');
const hero=RPG.preset('assassin');
hero.level=1;hero.maxLevel=150;
const session=new RPG.Session(hero);
assert.equal(session.level,1);
assert.equal(session.stats.hp,90);
assert.equal(session.stats.speed,4.2);
assert.equal(session.stats.critChance,.18);
assert.equal(session.nextXP,100);
assert.equal(session.grant(52).xp,52);
const increase=session.grant(48);
assert.equal(increase.level,2);
assert.equal(increase.levels,1);
assert.equal(increase.skillPoints,1);
assert.equal(session.stats.hp,98);
assert.equal(session.stats.damage,32.3);
const saved=JSON.parse(JSON.stringify(session.serialize()));
const next=new RPG.Session(hero,saved);
assert.deepEqual(next.serialize(),saved);
assert.throws(()=>session.load({version:1,level:2,xp:100000,skillPoints:2}),/runtime/);
assert.throws(()=>session.grant(-1),/XP/);
assert.throws(()=>session.grant(NaN),/XP/);
const cap={...RPG.preset('mage'),level:149};
const nearCap=new RPG.Session(cap);
nearCap.grant(1000000);
assert.equal(nearCap.level,150);
assert.equal(nearCap.nextXP,0);
assert.equal(nearCap.xp,0);
assert.equal(nearCap.grant(99).gained,0);
const unchanged={...RPG.preset('warrior')};
assert.equal(unchanged.level,1,'Authoring profile must never be advanced by PLAY session');
const base={name:'Arrow',description:'',icon:'🏹',type:'damage',basePower:30,
 growth:2,level:1,maxLevel:5,manaCost:10,cooldown:1,range:9,animation:'cast'};
const catalog=new Catalog();
catalog.set('player','slot3',{...base,name:'Quick shot'});
catalog.set('player','slot4',{...base,name:'Double shot',
 unlockLevel:2,requiresSlot:'slot3',requiresLevel:1});
catalog.set('player','ultimate',{...base,name:'Rain of arrows',
 unlockLevel:50,requiresSlot:'slot4',requiresLevel:2});
const level1=new Runtime(catalog,'player',250,1);
assert.equal(level1.status().maxMp,250);
assert.equal(level1.cast('slot4',1).reason,'level');
const tree=new Runtime(catalog,'player',250,2);
assert.equal(tree.unlocked('slot4'),true);
assert.equal(tree.cast('slot4',1).ok,true);
assert.equal(tree.cast('ultimate',3).reason,'level');
tree.setLevel(50);
assert.equal(tree.cast('ultimate',4).reason,'prerequisite');
catalog.set('player','slot4',{...base,name:'Double shot',level:2,
 unlockLevel:2,requiresSlot:'slot3',requiresLevel:1});
const unlocked=new Runtime(catalog,'player',250,50);
assert.equal(unlocked.cast('ultimate',7).ok,true);
assert.throws(()=>catalog.set('player','slot3',{...base,
 requiresSlot:'ultimate'}),/Circular/);
assert.throws(()=>catalog.set('player','slot5',{...base,
 requiresSlot:'slot5'}),/itself/);
const snapshot=JSON.parse(JSON.stringify(catalog.serialize()));
const again=new Catalog();again.load(snapshot);
assert.deepEqual(again.serialize(),snapshot);
assert.equal(new Runtime(again,'player',100,1).cast('slot3',1).ok,true,
 'No progression profile must preserve legacy skill behavior');
assert.equal(catalog.get('player','slot3').unlockLevel,1);
assert.equal(catalog.get('player','slot3').requiresSlot,'');
console.log('PASS: 150-level RPG XP, capped session, JSON reload, skill prerequisites, cycle prevention and old skills');
