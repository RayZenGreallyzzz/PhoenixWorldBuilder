'use strict';
const assert=require('node:assert/strict');
const Inv=require('../app/src/main/assets/engine/core/phoenix-inventory.js');
const store=new Inv.Store();
const sword={name:'Ледяной меч',kind:'weapon',slot:'weapon',assetId:'glb:sword',
 stats:{damage:46,defense:1}};
const armor={name:'Стальная броня',kind:'armor',slot:'chest',
 stats:{defense:90,hp:25}};
const gun={name:'Плазменный пистолет',kind:'weapon',slot:'weapon',
 stats:{damage:72}};
const hero=store.add('player',sword);
const chest=store.add('player',armor);
const mage=store.add('prefab-1',{name:'Посох мага',
 kind:'weapon',slot:'weapon',stats:{magicPower:44}});
const wolf=store.add('prefab-2',gun);
assert.equal(hero,'item-1');
assert.equal(store.state('prefab-1').items.length,1);
assert.equal(store.state('prefab-2').items.length,1);
assert.equal(store.bonuses('player').damage,0,
 'Items in bag must not grant combat bonuses before equip');
store.equip('player',hero);store.equip('player',chest);
store.equip('prefab-1',mage);store.equip('prefab-2',wolf);
assert.deepEqual(store.bonuses('player'),{damage:46,defense:91,hp:25,mp:0,
 magicPower:0,magicDefense:0,speed:0});
assert.equal(store.bonuses('prefab-1').magicPower,44);
assert.equal(store.bonuses('prefab-2').damage,72);
assert.equal(store.state('player').items.length,2);
assert.equal(store.equipped('player').weapon.name,'Ледяной меч');
assert.throws(()=>store.add('player',{...sword,name:'<script>'}),/name/);
assert.throws(()=>store.add('player',{...sword,slot:'custom'}),/slot/);
assert.throws(()=>store.add('player',{...sword,stats:{damage:-4}}),/damage/);
const duplicate=store.add('player',{...sword,name:'Новый меч'});
store.equip('player',duplicate);
assert.equal(store.bonuses('player').damage,46);
assert.equal(store.equipped('player').weapon.id,duplicate);
assert.equal(store.remove('player',duplicate),true);
assert.equal(store.bonuses('player').damage,0,
 'Removing equipped weapon must remove combat buff');
assert.equal(store.equipped('player').weapon,undefined);
assert.equal(store.state('prefab-1').items.length,1,
 'Unrelated NPC inventory must remain untouched');
store.equip('player',hero);
const saved=JSON.parse(JSON.stringify(store.serialize()));
const loaded=new Inv.Store();loaded.load(saved);
assert.deepEqual(loaded.serialize(),saved,'Inventory and equipment survive JSON reload');
assert.equal(loaded.bonuses('player').damage,46);
assert.equal(loaded.bonuses('prefab-1').magicPower,44);
const bad=JSON.parse(JSON.stringify(saved));
bad.characters[0].equipped.weapon='item-999';
assert.throws(()=>loaded.load(bad),/equipped/);
assert.deepEqual(loaded.serialize(),saved,'Invalid load must be atomic');
loaded.load(null);
assert.equal(loaded.state('player').items.length,0,
 'Old project without inventory must use an empty bag');
console.log('PASS: independent player, NPC and mob item bags; weapon, armor, magic gear; JSON roundtrip and legacy saves');
