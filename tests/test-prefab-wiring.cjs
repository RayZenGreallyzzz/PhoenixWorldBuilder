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
 'phoenixPrefabDeath','phoenixPrefabCast',
 'phoenixEntityX','phoenixEntityY','phoenixEntityZ','phoenixEntityYaw',
 'btnPrefabApplyTransform','btnPrefabSnapGround','phoenixEntityAI',
 'phoenixEntityWaypoints','btnPrefabWaypointTap','btnPrefabWaypointAdd',
 'btnPrefabWaypointRemove','btnPrefabPreviewAttack',
 'phoenixPrefabAttackClip','avatarAttackClip',
 'phoenixCombatHud','btnPhoenixAttack','phoenixCombatHP','phoenixCombatTarget','phoenixCombatNotice','phoenixPlayerHP','phoenixPlayerHPText','phoenixKills','phoenixDeathNotice','btnPhoenixRespawn']){
 assert(html.includes('id="'+id+'"'),'Prefab UI field missing '+id);
}
assert(js.includes('this.prefabEditor=new PhoenixPrefabEditor(this)'));
assert(js.includes('this.prefabEditor?.update(dt)'), 'Must reuse UV44 frame loop');
assert(js.includes('phoenixGame:this.prefabEditor?.serialize()'), 'Project JSON must save game');
assert(js.includes('avatar:this.avatarAssetId?{'), 'Player avatar GLB reference must persist');
assert(js.includes('attackClip:this.avatarAttackClip||'),
 'Player GLB attack clip choice must persist in project');
assert(js.includes('this.avatarClips.find(c=>c.name===this.avatarAttackClip)'),
 'Selected player attack clip must be used by Attack action');
assert(js.includes('await putAsset(id,await file.arrayBuffer())'),
 'Imported player GLB must be persisted in IndexedDB rather than RAM only');
assert(js.includes('await this.restoreAvatarFromProject(doc.avatar||null)'),
 'Reopening JSON must restore saved player GLB from its reference');
assert(js.includes('...usedMobs,...(this.avatarAssetId?[this.avatarAssetId]:[])'),
 'Portable backups must include every used mob GLB and the player avatar');
assert(js.includes('await this.prefabEditor.loadFromProject(doc.phoenixGame||null)'),
 'Project restore must load game data (old projects load empty)');
assert(js.includes('this.prefabEditor?.pendingPlace||this.prefabEditor?.pendingWaypointId'),
 'Touch placement must route mob instantiation AND waypoint taps without blocking Builder');
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
assert(editor.includes('this.world.setComponent(id,\'character\''),
 'Each placed mob must store independent AI/waypoints and persist changes');
assert(editor.includes("this.b.save()"),
 'NPC position and route edits must be saved with the project');
console.log('PASS: Player GLB persistence, per-instance NPC routes, touch waypoints and single-loop Prefab Editor');
