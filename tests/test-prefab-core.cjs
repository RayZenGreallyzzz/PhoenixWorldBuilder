'use strict';
const assert=require('node:assert/strict');
const {PhoenixPrefabCatalog,VERSION,MAX_PREFABS,normalize}=
 require('../app/src/main/assets/engine/core/phoenix-prefabs.js');
assert.equal(VERSION,1);
const catalog=new PhoenixPrefabCatalog();
const id=catalog.create({name:'Лесной волк',assetId:'glb:wolf',type:'mob',
 faction:'enemy',stats:{hp:200,damage:30,speed:3.2},
 animations:{idle:'Wolf_Idle',walk:'Wolf_Walk',attack:'Wolf_Attack'}});
assert.equal(id,'prefab-1');
assert.equal(catalog.get(id).stats.hp,200);
const mutated=catalog.get(id);mutated.stats.hp=0;
assert.equal(catalog.get(id).stats.hp,200,'Template must not leak mutable references');
catalog.update(id,{name:'Волк вожак',stats:{hp:500,damage:50,speed:4}});
assert.equal(catalog.get(id).stats.hp,500);
assert.equal(catalog.get(id).assetId,'');
assert.equal(catalog.get(id).faction,'enemy');
assert.equal(normalize({name:'Старый моб'}).nameColor,'#ffffff',
 'Legacy prefabs keep a plain white name');
assert.equal(normalize({name:'Старый моб'}).ai.engagement,'auto',
 'Legacy AI behavior remains unchanged');
const skin=normalize({name:'Асура',nameColor:'#EA2D2D',
 ai:{mode:'patrol',engagement:'defensive',aggroRadius:14}});
assert.equal(skin.nameColor,'#EA2D2D');
assert.equal(skin.ai.engagement,'defensive');
assert.equal(skin.ai.aggroRadius,14);
assert.throws(()=>normalize({name:'bad',nameColor:'red'}),/nickname color/);
assert.throws(()=>normalize({name:'bad',ai:{engagement:'run-away'}}),/engagement/);
const exported=JSON.parse(JSON.stringify(catalog.serialize()));
const other=new PhoenixPrefabCatalog();other.load(exported);
assert.deepEqual(other.serialize(),exported);
assert.equal(other.create({name:'NPC',type:'npc',faction:'neutral'}),'prefab-2');
assert.throws(()=>catalog.create({name:'',stats:{hp:20}}),/Invalid name/);
assert.throws(()=>catalog.create({name:'Bad',assetId:'../../game.js'}),/GLB/);
assert.throws(()=>catalog.create({name:'Bad',stats:{hp:-1}}),/hp/);
assert.throws(()=>catalog.create({name:'Bad',stats:{damage:NaN}}),/damage/);
assert.throws(()=>catalog.create({name:'Bad',animations:{idle:{evil:true}}}),/animation/);
const before=other.serialize();
assert.throws(()=>other.load({...exported,prefabs:[...exported.prefabs,exported.prefabs[0]]}),/duplicate/);
assert.deepEqual(other.serialize(),before,'Failed validation must be atomic');
assert.equal(other.remove('prefab-1'),true);
assert.equal(other.get('prefab-1'),null);
assert.equal(other.remove('prefab-1'),false);
console.log('PASS: Phoenix Prefab Core: templates, validation and portable JSON round-trip');
