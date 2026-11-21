'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Profile=require('../app/src/main/assets/engine/core/phoenix-player-combat.js');
const root=path.join(__dirname,'../app/src/main/assets');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
assert.deepEqual(Profile.normalize(),{
 mode:'melee',hp:100,damage:25,range:2.7,cooldown:.65,
 magazineSize:12,reserveCapacity:48,reloadDuration:1.4
},'Existing saved projects without hero settings must keep original melee hero');
const ranged=Profile.preset('ranged');
assert.equal(ranged.mode,'ranged');
assert.equal(ranged.damage,20);
assert.equal(ranged.range,32);
assert.equal(ranged.cooldown,.22);
const archer=Profile.normalize({...ranged,hp:300,damage:65,range:40,
 magazineSize:20,reserveCapacity:160,cooldown:.4,reloadDuration:2});
assert.equal(archer.hp,300);
assert.equal(archer.magazineSize,20);
assert.equal(archer.reloadDuration,2);
assert.equal(Profile.normalize(JSON.parse(JSON.stringify(archer))).damage,65,
 'Hero profile must survive JSON project roundtrip');
Profile.preset('ranged').damage=1;
assert.equal(Profile.preset('ranged').damage,20,'Templates must not mutate one another');
for(const bad of [
 {mode:'wizard'},{hp:0},{hp:1.5},{damage:-1},{range:101},
 {cooldown:0},{magazineSize:0},{magazineSize:5.2},
 {reserveCapacity:-1},{reloadDuration:25}
])assert.throws(()=>Profile.normalize(bad),/Invalid player/,
 'Invalid hero profiles must never corrupt a stored project');
const html=read('index.html'),bridge=read('engine/builder/play-bridge.js'),
 prefabs=read('engine/builder/prefab-editor.js'),app=read('js/clean-app.js');
assert(html.includes('src="engine/core/phoenix-player-combat.js"'));
for(const id of ['phoenixPlayerCombatPanel','phoenixPlayerCombatMode',
 'phoenixPlayerCombatHP','phoenixPlayerCombatDamage','phoenixPlayerCombatRange',
 'phoenixPlayerCombatCooldown','phoenixPlayerCombatMagazineSize',
 'phoenixPlayerCombatReserveCapacity','phoenixPlayerCombatReloadDuration',
 'btnPlayerCombatPreset','btnPlayerCombatApply','phoenixRangedControls',
 'btnPhoenixRangedAim','btnPhoenixRangedReload'])
 assert(html.includes('id="'+id+'"'),'Missing standalone hero UI control '+id);
assert(bridge.includes("if(this.playerCombat.mode==='ranged')return this.fire()"),
 'Ranged normal attack must actually shoot in PLAY');
assert(bridge.includes('this.builder.markProjectDirty?.()'),
 'Hero changes should not force a full autosave');
assert(!bridge.includes('this.playerAttackEffect=selected;this.builder.save?.()'),
 'Visual effects should not force full autosaves');
assert(prefabs.includes('playerCombat:this.b.playBridge?.playerCombat||null'),
 'Hero style must persist within same world/project JSON');
assert(prefabs.includes('Profiles.normalize(doc?.playerCombat)'),
 'Old project compatibility must load a safe default');
assert(prefabs.includes('this.combat.playerMaxHp=hero.hp'),
 'Hero HP must change actual combat HP');
assert(prefabs.includes('this.combat.range=hero.range'),
 'Hero attack range must change actual combat range');
assert(app.includes('phoenixGame:this.prefabEditor?.serialize()||null'),
 'Hero profile must travel with entire Builder project');
console.log('PASS: melee/ranged character templates, numeric validation, JSON persistence, PLAY wiring and manual save');
