'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const base=path.join(root,'app/src/main/assets');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const css=fs.readFileSync(path.join(base,'clean.css'),'utf8');
const gradle=fs.readFileSync(path.join(root,'app/build.gradle'),'utf8');
const header=html.match(/<header class="topbar">([\s\S]*?)<\/header>/);
const dock=html.match(/<div id="phoenixEngineDock"([\s\S]*?)<\/div>/);
assert(header&&dock,'Engine dock and original builder header must both exist');
assert(!header[0].includes('id="btnPhoenixPlay"'),'PLAY must not be clipped in UV44 header');
assert(!header[0].includes('id="btnPhoenixPrefabs"'),'Prefab button must not be clipped in UV44 header');
assert(dock[0].includes('id="btnPhoenixPlay"'));
assert(dock[0].includes('id="btnPhoenixPrefabs"'));
assert(dock[0].includes('ENGINE'));
assert(dock[0].includes('v2.0'));
assert(dock[0].includes('id="btnPhoenixSkills"'), 'Skill editor must be visible beside PLAY');
for(const id of ['btnPhoenixPlay','btnPhoenixPrefabs','btnPhoenixSkills','phoenixEngineDock']){
 const matches=html.match(new RegExp('id="'+id+'"','g'))||[];
 assert.equal(matches.length,1,'UI element must have a unique ID: '+id);
}
for(const id of ['phoenixMobCard','phoenixMobCardName','phoenixMobCardRole',
 'phoenixMobCardHP','phoenixMobCardHPText','phoenixMobCardStats',
 'phoenixMobCardSkills','phoenixMobCardRespawn','btnPhoenixMobCardClose',
 'phoenixEntityNickname','btnPrefabApplyNickname','phoenixPrefabLevel',
 'phoenixPrefabNameColor','phoenixPrefabEngagement','phoenixEntityNameColor',
 'phoenixEntityPreset','btnPrefabApplyPreset','phoenixEntityEngagement','phoenixEntityAggroRadius',
 'phoenixPrefabDefense','phoenixPrefabRespawnEnabled','phoenixPrefabRespawnDelay',
 'phoenixPrefabAttackEffect','skillDefFxPreset','skillDefFxColor',
 'skillDefFxSize','skillDefFxDuration','phoenixPlayerAttackEffect']){
 assert(html.includes('id="'+id+'"'),'Missing 2.0 mobile mob/skill control: '+id);
}
const featuresScript=html.indexOf('engine/core/phoenix-mob-features.js');
const vfxScript=html.indexOf('engine/runtime/phoenix-vfx.js');
const prefabScript=html.indexOf('engine/builder/prefab-editor.js');
const skillDefScript=html.indexOf('engine/builder/skill-definition-editor.js');
assert(featuresScript>0&&vfxScript>0&&featuresScript<prefabScript&&vfxScript<skillDefScript,
 'NPC data and VFX modules must load before frontend editors');
assert(css.includes('#phoenixMobCard{position:fixed'),
 'Selected NPC profile must be visible on phone in PLAY mode');
assert(css.includes('#phoenixEngineDock{position:fixed'),
 'Game controls must be independent of oversized UV44 topbar');
assert(css.includes('body.phoenixPlaying #phoenixEngineDock{display:none!important}'),
 'Editor controls must disappear during PLAY');
assert(html.includes('<title>Phoenix Engine 2.0 — Респаун, навыки, карточка моба</title>'));
assert(html.includes('id="phoenixSkillEditor"'));
for(const id of ['btnPhoenixWorld','btnWorldGrid','phoenixWorldPanel',
 'worldCanvasPreset','worldCanvasWidth','worldCanvasDepth',
 'worldTilePreset','worldTileCustom','btnWorldApply','btnWorldPaint',
 'btnWorldRaise','btnWorldLower','btnWorldSmooth','btnWorldClearHeights',
 'worldBrushRadius','worldBrushPower','btnCatalogLandscape']){
 assert(html.includes('id="'+id+'"'),'Missing 1.4 world/terrain control '+id);
}
for(const id of ['worldTextureRadius','worldTextureRadiusValue']){
 assert(html.includes('id="'+id+'"'), 'Landscape brush size slider must be visible');
}
for(const value of [0.2,0.5,1,2,5,10,25,50])
 assert(html.includes('data-texture-brush-radius="'+value+'"'),
  'Missing quick terrain brush size '+value+'m');
assert(html.includes('id="worldTextureRadius" type="range" min="0.2" max="50" step="0.1"'),
 'Texture brush must allow precise 20cm–50m settings');
assert(html.includes('value="5000"'),'Missing 5km canvas preset');
for(const name of ['50 × 50 м','100 × 100 м','250 × 250 м',
 '500 × 500 м','1000 × 1000 м','Свой размер'])
 assert(html.includes(name),'Missing requested world size '+name);
const builderSource=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const worldCore=html.indexOf('src="engine/core/phoenix-world-layout.js"');
const worldUI=html.indexOf('src="engine/builder/phoenix-world-editor.js"');
const appScript=html.indexOf('src="js/clean-app.js"');
assert(worldCore>0&&worldUI>worldCore&&appScript>worldUI,
 'World layout/editor scripts must load before Builder starts');
assert(builderSource.includes('new PhoenixWorldEditor(this)'));
assert(builderSource.includes('worldCanvas:this.worldEditor?.serialize()'));
assert(builderSource.includes('this.worldEditor?.loadFromProject(doc.worldCanvas||null,{preserveUI})'));
assert(!builderSource.includes('new THREE.GridHelper('),
 'Grid must not be always-on; only user button toggles sector grid');
assert(css.includes('#phoenixWorldPanel{position:fixed'),
 'Mobile world editor must have an actual visible panel');

for(const id of ['phoenixSkillImageFile','phoenixSkillImagePreview',
 'btnSkillImagePick','btnSkillImageRemove','skillDefImageFile',
 'skillDefImagePreview','btnSkillDefImagePick','btnSkillDefImageRemove']){
 assert(html.includes('id="'+id+'"'),'Missing PNG/WebP gallery picker '+id);
}
const imageScript=html.indexOf('<script src="engine/core/phoenix-skill-images.js">');
const skillScript=html.indexOf('<script src="engine/core/phoenix-skills.js">');
const layoutScript=html.indexOf('<script src="engine/core/phoenix-skill-layout.js">');
assert(imageScript>0&&imageScript<skillScript&&imageScript<layoutScript,
 'PNG/WebP image sanitizer must load before both skill schemas');

assert(html.includes('id="phoenixSkillLayer"'));
assert(html.includes('id="btnPhoenixHeal"'));
assert(html.includes('id="phoenixSkillPreset"'));
assert(html.includes('id="btnSkillApplyPreset"'));
assert(html.includes('id="btnPhoenixSlot5"'));
assert(html.includes('id="btnPhoenixUltimate"'));
assert(!html.includes('Mobile Legends'));
assert(!html.includes('Wild Rift'));
assert(html.includes('value="moba"'));
assert(html.includes('MMORPG'));
assert(html.includes('Шутер'));
assert(dock[0].includes('btnPhoenixSkillDefs'),'Skill definition editor must be in dock');
for(const id of ['phoenixSkillDefinitions','btnPhoenixSkillDefs','skillDefCharacter',
 'skillDefSlot','skillDefBasePower','skillDefGrowth','skillDefManaCost',
 'skillDefCooldown','skillDefLevel','skillDefMaxLevel',
 'phoenixAmmoText','phoenixAmmoLine','phoenixMpLine','phoenixMpText','phoenixCrosshair']){
 assert(html.includes('id="'+id+'"'),'Missing FPS/Skill Editor UI element: '+id);
}

for(const id of ['btnPhoenixSlot6','btnPhoenixSlot7','btnPhoenixFire',
 'btnPhoenixAim','btnPhoenixReload','btnPhoenixJump','btnPhoenixCrouch']){
 assert(html.includes('id="'+id+'"'),'Missing separate genre HUD control '+id);
}


assert(css.includes('#phoenixSkillLayer{position:fixed'));
assert(css.includes('#phoenixSkillEditor{position:fixed'));
assert(gradle.includes("applicationIdSuffix '.engine.stable'"),
 'Permanent Android ID must not vary between new engine versions');
assert(gradle.includes('versionCode 24'), 'New APK must update above 2.0.3');
assert(gradle.includes("applicationIdSuffix '.engine.stable'"));
assert(gradle.includes("appLabel: 'Phoenix Engine 2.0'"));
console.log('PASS: distinct Phoenix Engine 2.0 badge, visible PLAY/Prefabs/Skills dock and stable package ID');
