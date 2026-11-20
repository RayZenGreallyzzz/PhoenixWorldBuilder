'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
const html=read('index.html'),js=read('js/clean-app.js'),
 css=read('clean.css'),editor=read('engine/builder/prefab-editor.js'),
 bridge=read('engine/builder/play-bridge.js');
const scripts=['engine/core/phoenix-core.js','engine/core/phoenix-ai.js','engine/core/phoenix-combat.js','engine/core/phoenix-prefabs.js','engine/runtime/phoenix-animations.js',
 'engine/builder/play-bridge.js','engine/builder/prefab-editor.js','js/clean-app.js'];
let previous=-1;
for(const name of scripts){
 const pos=html.indexOf('<script src="'+name+'"></script>');
 assert(pos>previous,'Bad script order or absent '+name);previous=pos;
}
for(const id of ['btnPhoenixPrefabs','phoenixPrefabPanel','btnPrefabSave',
 'btnPrefabPlace','btnPrefabCancelPlace','btnPrefabImportGlb',
 'phoenixPrefabName','phoenixPrefabAsset','phoenixPrefabSaved',
 'phoenixPrefabIdle','phoenixPrefabWalk','phoenixPrefabAttack',
 'phoenixPrefabHP','phoenixPrefabDamage','phoenixPrefabSpeed',
 'phoenixPrefabEntities','btnPrefabRemoveEntity','phoenixPrefabAI',
 'phoenixPrefabPatrolRadius','phoenixPrefabAggroRadius','phoenixPrefabAttackRange',
 'phoenixPrefabCooldown','phoenixPrefabRun','phoenixPrefabHit',
 'phoenixPrefabDeath','phoenixPrefabCast','phoenixCombatHud','btnPhoenixAttack','phoenixCombatHP','phoenixCombatTarget','phoenixCombatNotice','phoenixPlayerHP','phoenixPlayerHPText','phoenixKills','phoenixDeathNotice','btnPhoenixRespawn']){
 assert(html.includes('id="'+id+'"'),'Prefab UI field missing '+id);
}
assert(js.includes('this.prefabEditor=new PhoenixPrefabEditor(this)'));
assert(js.includes('this.prefabEditor?.update(dt)'), 'Must reuse UV44 frame loop');
assert(js.includes('phoenixGame:this.prefabEditor?.serialize()'), 'Project JSON must save game');
assert(js.includes('await this.prefabEditor.loadFromProject(doc.phoenixGame||null)'),
 'Project restore must load game data (old projects load empty)');
assert(js.includes('if(this.prefabEditor?.pendingPlace){this.prefabEditor.placeFromEvent(e);return}'),
 'Touch placement must intercept builder actions');
assert(js.includes('this.prefabEditor?.refreshModels(id)'),
 'Imported GLB should appear in Prefab model picker');
assert(bridge.includes('b.prefabEditor?.setPlaying(true)'));
assert(bridge.includes('b.prefabEditor?.setPlaying(false)'));
assert(css.includes('.phoenixPrefabPanel[hidden]'));
assert(css.includes('#phoenixCombatHud[hidden]'));
assert(editor.includes('this.combat.attack('),'No combat attack integration');
assert(editor.includes('this.combat.isDead(id)'),'Dead enemies must not move');
assert(bridge.includes('this.builder.prefabEditor?.attackNearest(now)'),
 'PLAY button must attack the game session');
assert(!editor.includes('new THREE.WebGLRenderer'));
assert(!bridge.includes('new THREE.WebGLRenderer'));
assert(!editor.includes('requestAnimationFrame('),'No additional RAF');
assert(!editor.includes('new THREE.WebGLRenderer'),'Do not create 2nd renderer');
assert(!editor.includes('localStorage.setItem('),'Do not create per-object localStorage saves');
assert(!editor.includes('builder.entries.push('),'Do not mix game entities with building geometry');
assert(js.includes('playDeathAnimation()'),'GLB avatar death animation must exist');
assert(js.includes('this.prefabEditor?.combat?.isPlayerDead()'),
 'Dead player movement must stop');
assert(bridge.includes('onPlayerHit(hit'),'PLAY bridge must handle NPC attacks');
assert(bridge.includes('  respawn()'),'PLAY must support safe respawn');
assert(editor.includes('this.combat.damagePlayer('),
 'Hostile mob must use combat runtime to damage player');
assert(css.includes('#phoenixPlayerHP'),'Player HP should be visible');
console.log('PASS: Phoenix Prefab Editor integrated into UV44 with isolated project JSON and single RAF');
