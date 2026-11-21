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
assert(dock[0].includes('v1.4'));
assert(dock[0].includes('id="btnPhoenixSkills"'), 'Skill editor must be visible beside PLAY');
for(const id of ['btnPhoenixPlay','btnPhoenixPrefabs','btnPhoenixSkills','phoenixEngineDock']){
 const matches=html.match(new RegExp('id="'+id+'"','g'))||[];
 assert.equal(matches.length,1,'UI element must have a unique ID: '+id);
}
assert(css.includes('#phoenixEngineDock{position:fixed'),
 'Game controls must be independent of oversized UV44 topbar');
assert(css.includes('body.phoenixPlaying #phoenixEngineDock{display:none!important}'),
 'Editor controls must disappear during PLAY');
assert(html.includes('<title>Phoenix Engine 1.4 — Общий мир и ландшафт</title>'));
assert(html.includes('id="phoenixSkillEditor"'));
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
assert(gradle.includes('versionCode 14'));
assert(gradle.includes("applicationIdSuffix '.engine.stable'"));
assert(gradle.includes("appLabel: 'Phoenix Engine 1.4'"));
console.log('PASS: distinct Phoenix Engine 1.4 badge, visible PLAY/Prefabs/Skills dock and stable package ID');
