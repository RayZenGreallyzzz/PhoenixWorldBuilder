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
// Regression: opened NPC editor must not turn "Установить" into a static
// model placement. Test the actual early-return guard extracted from place().
const placeGuard=js.match(/\n place\(\)\{\n([\s\S]*?)\n  if\(!this\.preview\)return;/);
assert(placeGuard,'Missing construction placement safety guard');
const warnings=[];
const safePlace=new Function('notify',
 'return function(){'+placeGuard[1]+'\n return true; }')(
 message=>warnings.push(message));
const app={mode:'build',tool:'place',
 prefabEditor:{panel:{hidden:false},pendingPlace:'',pendingWaypointId:''}};
assert.equal(safePlace.call(app),false,'Open NPC editor must block static GLB placement');
app.prefabEditor.panel.hidden=true;app.prefabEditor.pendingPlace='prefab-1';
assert.equal(safePlace.call(app),false,'Placing an NPC must block static GLB');
app.prefabEditor.pendingPlace='';app.prefabEditor.pendingWaypointId='entity-1';
assert.equal(safePlace.call(app),false,'Placing waypoint must block static GLB');
app.prefabEditor.pendingWaypointId='';
assert.equal(safePlace.call(app),true,'Ordinary construction must remain possible');
app.mode='character';
assert.equal(safePlace.call(app),false,'Character mode cannot spawn construction walls');
app.mode='build';app.tool='pick';
assert.equal(safePlace.call(app),false,'Select mode cannot spawn a construction wall');
app.tool='place';
assert.equal(warnings.length,3);
assert(js.includes('this.prefabEditor=new PhoenixPrefabEditor(this)'));
assert(js.includes('this.prefabEditor?.update(dt)'), 'Must reuse UV44 frame loop');
assert(js.includes('phoenixGame:this.prefabEditor?.serialize()'), 'Project JSON must save game');
assert(js.includes('avatar:this.avatarAssetId?{'), 'Player avatar GLB reference must persist');
assert(js.includes('attackClip:this.avatarBindings.attack||this.avatarAttackClip||')&&
 js.includes('animationBindings:{...this.avatarBindings}'),
 'Player GLB attack and seven authored animation bindings must persist in project');
assert(js.includes('this.avatarClips.find(c=>c.name===explicit)')&&
 js.includes("(state==='attack'?this.avatarAttackClip:'')"),
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
assert(bridge.includes('this.builder.prefabEditor?.attackNearest(now,this.selectedMobId)'),
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
assert(!editor.includes('this.b.save()'),
 'Mob editing must not write the full project after every action');
assert(editor.includes('this.b.markProjectDirty?.()'),
 'Mob edits must mark the project as unsaved until manual save');
assert(js.includes("this.markProjectSaved();"),
 'Successful manual save must reset unsaved marker');
assert(js.includes("$('btnSave').onclick=()=>this.save()"),
 'Top save button must continue to save whole project');
console.log('PASS: Player GLB persistence, per-instance NPC routes, touch waypoints and single-loop Prefab Editor');
