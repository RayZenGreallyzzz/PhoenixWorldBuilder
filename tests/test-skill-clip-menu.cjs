'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const css=fs.readFileSync(path.join(base,'clean.css'),'utf8');
const builderJS=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const playJS=fs.readFileSync(path.join(base,'engine/builder/play-bridge.js'),'utf8');
const mobJS=fs.readFileSync(path.join(base,'engine/builder/prefab-editor.js'),'utf8');
const {Catalog}=require('../app/src/main/assets/engine/core/phoenix-skills.js');
globalThis.PhoenixSkills=require('../app/src/main/assets/engine/core/phoenix-skills.js');
const Editor=require('../app/src/main/assets/engine/builder/skill-definition-editor.js');
assert(css.includes('#phoenixSkillDefinitions{position:fixed;'),
 'Skill definition menu must be positioned above fullscreen 3D canvas');
assert(css.includes('z-index:75'),'Skill definition panel must be above the skill HUD overlay');
for(const id of ['btnPhoenixSkillDefs','phoenixSkillDefinitions','skillDefAnimationChoice',
 'skillDefAnimation','skillDefAnimationInfo','btnSkillDefPreviewAnimation'])
 assert(html.includes('id="'+id+'"'),'Missing UI element '+id);
assert(builderJS.includes('playSkillAnimation(clip='),'GLB skill clip API missing on hero');
assert(playJS.includes('playSkillAnimation?.(result.skill.animation)'),
 'Casting a player skill must play that exact saved GLB clip');
assert(mobJS.includes("render.animation?.playClip(clip,"),
 'NPC skill must play its own named GLB clip');
assert(mobJS.includes('previewSkillClip(prefabId,name)'),
 'NPC GLB animations should preview in EDIT');
class Element{
 constructor(id='',value=''){this.id=id;this.value=value;this.hidden=true;this.listeners={};
  this.children=[];this.options=this.children;this.dataset={};this.textContent='';this.src='';}
 addEventListener(name,listener){this.listeners[name]=listener}
 appendChild(child){this.children.push(child);child.parentElement=this;return child}
 replaceChildren(...children){this.children=[...children];this.options=this.children}
 remove(){if(this.parentElement){
  const list=this.parentElement.children;list.splice(list.indexOf(this),1);
  this.parentElement.options=this.parentElement.children;
 }}
}
const defaults={
 skillDefCharacter:'player',skillDefSlot:'slot3',skillDefName:'Fireball',
 skillDefDescription:'',skillDefIcon:'🔥',skillDefType:'damage',skillDefLevel:'1',
 skillDefMaxLevel:'5',skillDefUnlockLevel:'1',skillDefRequiresSlot:'',
 skillDefRequiresLevel:'1',skillDefBasePower:'30',skillDefGrowth:'10',
 skillDefManaCost:'5',skillDefCooldown:'1',skillDefRange:'10',
 skillDefAnimation:'cast',skillDefFxPreset:'magic',skillDefFxColor:'#ffce65',
 skillDefFxSize:'1',skillDefFxDuration:'.5'
};
const elements=new Map();
for(const id of Object.keys(defaults))elements.set(id,new Element(id,defaults[id]));
for(const id of ['btnPhoenixSkillDefs','btnSkillDefClose','btnSkillDefSave',
 'btnSkillDefDelete','btnSkillDefLevelUp','skillDefAnimationChoice',
 'btnSkillDefPreviewAnimation','skillDefAnimationInfo','skillDefMessage',
 'skillDefPreview','skillDefImagePreview','skillDefImageFile',
 'btnSkillDefImagePick','btnSkillDefImageRemove','phoenixTalentTreePreview',
 'phoenixSkillDefinitions']){
 if(!elements.has(id))elements.set(id,new Element(id));
}
const document={getElementById:id=>elements.get(id)||null,
 createElement:tag=>new Element(tag)};
const calls=[],mobCalls=[];
const prefab={id:'prefab-1',name:'Mage',assetId:'glb:mage'};
const builder={
 playBridge:{active:false},
 prefabEditor:{registry:{list:()=>[prefab],get:id=>id==='prefab-1'?prefab:null},
  close(){},previewSkillClip:(id,clip)=>{mobCalls.push({id,clip});return true}},
 skillEditor:{close(){},layout:null},
 assets:new Map([['glb:mage',{animations:[{name:'Slash_A',duration:.7},
  {name:'Cast_Magic',duration:1.3}]}]]),
 avatarAssetId:'glb:hero',
 avatarClips:[{name:'Idle',duration:2},{name:'Cast_Fire',duration:1.5},
  {name:'Cast_Shadow',duration:2}],
 previewAvatarClip:name=>{calls.push(name);return true},
 markProjectDirty(){}
};
const editor=new Editor(builder,document);
const panel=elements.get('phoenixSkillDefinitions');
assert.equal(panel.hidden,true,'Skill menu starts closed');
elements.get('btnPhoenixSkillDefs').listeners.click();
assert.equal(panel.hidden,false,'Tap skills button must expose panel');
assert(editor.availableClips.some(c=>c.name==='Cast_Fire'),'Show all clips in hero GLB');
const chooser=elements.get('skillDefAnimationChoice');
chooser.value='Cast_Fire';chooser.listeners.change({target:chooser});
assert.equal(elements.get('skillDefAnimation').value,'Cast_Fire');
assert.equal(editor.previewSkillAnimation(),true);
assert.deepEqual(calls,['Cast_Fire']);
assert.equal(editor.save(),true);
assert.equal(editor.catalog.get('player','slot3').animation,'Cast_Fire');
elements.get('skillDefSlot').value='slot4';editor.loadForm();
chooser.value='Cast_Shadow';chooser.listeners.change({target:chooser});
assert.equal(editor.save(),true);
assert.equal(editor.catalog.get('player','slot4').animation,'Cast_Shadow');
assert.equal(editor.catalog.get('player','slot3').animation,'Cast_Fire',
 'Editing second skill cannot replace first skill animation');
const data=editor.serialize();
const second=new Editor(builder,document);second.loadFromProject(data);
assert.equal(second.catalog.get('player','slot3').animation,'Cast_Fire');
assert.equal(second.catalog.get('player','slot4').animation,'Cast_Shadow');
elements.get('skillDefCharacter').value='prefab-1';second.loadForm();
await second.refreshClipChoices();
assert(second.availableClips.some(x=>x.name==='Slash_A'));
chooser.value='Cast_Magic';chooser.listeners.change({target:chooser});
assert.equal(second.previewSkillAnimation(),true);
assert.deepEqual(mobCalls,[{id:'prefab-1',clip:'Cast_Magic'}]);
assert.equal(second.save(),true);
assert.equal(second.catalog.get('prefab-1','slot4').animation,'Cast_Magic');
second.close();assert.equal(panel.hidden,true);
console.log('PASS: skills menu visibly opens; per-hero/per-mob GLB clips list, preview and survive JSON per slot');
