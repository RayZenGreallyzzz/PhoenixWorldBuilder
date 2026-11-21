'use strict';
const assert=require('node:assert/strict');
const schema=require('../app/src/main/assets/engine/core/phoenix-skill-layout.js');
global.PhoenixSkillLayout=schema;
global.window={innerWidth:1280,innerHeight:800};
const settings=new Map();
global.localStorage={
 getItem:k=>settings.has(k)?settings.get(k):null,
 setItem:(k,v)=>settings.set(k,String(v))
};
class E{
 constructor(id){this.id=id;this.hidden=true;this.value='';this.checked=true;
  this.style={};this.listeners={};this.children=[];this.textContent='';
  const names=new Set();this.classList={
   add:n=>names.add(n),remove:n=>names.delete(n),
   contains:n=>names.has(n),toggle:(n,value)=>{
    if(value)names.add(n);else names.delete(n);
   }};
 }
 addEventListener(name,fn){this.listeners[name]=fn}
 replaceChildren(...children){this.children=children;}
 setAttribute(name,value){this[name]=value;}
 setPointerCapture(){}
}
const ids=['phoenixSkillLayer','phoenixSkillEditor','phoenixSkillSelect',
 'phoenixSkillIcon','phoenixSkillLabel','phoenixSkillSize','phoenixSkillColor',
 'phoenixSkillShape','phoenixSkillOpacity','phoenixSkillEnabled',
 'phoenixSkillFeedback','btnPhoenixAttack','btnPhoenixHeal','btnPhoenixSlot3',
 'btnPhoenixSlot4','btnPhoenixSlot5','btnPhoenixUltimate',
 'btnPhoenixSlot6','btnPhoenixSlot7','btnPhoenixFire','btnPhoenixAim',
 'btnPhoenixReload','btnPhoenixJump','btnPhoenixCrouch',
 'btnPhoenixSkills','btnSkillClose','btnSkillSave','btnSkillReset',
 'phoenixSkillPreset','btnSkillApplyPreset',
 'phoenixSkillImageFile','phoenixSkillImagePreview',
 'btnSkillImagePick','btnSkillImageRemove',
 'phoenixCombatNotice'];
const elements=Object.fromEntries(ids.map(id=>[id,new E(id)]));
const doc={body:new E('body'),getElementById:id=>elements[id]||null,
 createElement:name=>new E(name)};
const builder={playBridge:{active:false,heals:0,shots:0,heals:0,heal(){this.heals++},fire(){this.shots++;return true}},
 prefabEditor:{closes:0,close(){this.closes++}},
 saves:0,save(){this.saves++}};
const Editor=require('../app/src/main/assets/engine/builder/skill-hud-editor.js');
const editor=new Editor(builder,doc);
assert.equal(editor.layout.slots.length,13);
assert.equal(elements.phoenixSkillLayer.hidden,true);
assert.equal(editor.open(),true);
assert.equal(elements.phoenixSkillEditor.hidden,false);
assert.equal(elements.phoenixSkillLayer.hidden,false);
assert.equal(builder.prefabEditor.closes,1);
editor.dragStart('attack',{pointerId:9,preventDefault(){}});
editor.dragMove('attack',{pointerId:9,clientX:960,clientY:540,preventDefault(){}});
editor.dragEnd('attack',{pointerId:9});
const moved=editor.serialize().slots[0];
assert.equal(Math.round(moved.x),75);
assert.equal(Math.round(moved.y*10)/10,67.5);
elements.phoenixSkillIcon.value='🔥';
elements.phoenixSkillLabel.value='ПЛАМЯ';
elements.phoenixSkillSize.value='98';
elements.phoenixSkillColor.value='#b51234';
elements.phoenixSkillShape.value='rounded';
elements.phoenixSkillOpacity.value='75';
editor.updateFromForm();
const styled=editor.serialize().slots[0];
assert.equal(styled.icon,'🔥');
assert.equal(styled.label,'ПЛАМЯ');
assert.equal(styled.size,98);
assert.equal(styled.shape,'rounded');
assert.equal(styled.color,'#b51234');
assert.equal(styled.opacity,.75);
assert.equal(elements.btnPhoenixAttack.children[0].textContent,'🔥');
editor.save();
assert.equal(builder.saves,1);
const stored=JSON.parse(settings.get('phoenix-engine-skill-hud-v1'));
assert.deepEqual(stored,editor.serialize());
editor.close();
assert.equal(elements.phoenixSkillLayer.hidden,true);
editor.setPlaying(true);
assert.equal(elements.phoenixSkillLayer.hidden,false);
assert.equal(elements.btnPhoenixSlot3.hidden,false);
assert.equal(elements.btnPhoenixSlot5.hidden,true);
elements.btnPhoenixHeal.listeners.click();
assert.equal(builder.playBridge.heals,1,'Heal slot must trigger PLAY action');
editor.setPlaying(false);
assert.equal(elements.phoenixSkillLayer.hidden,true);
const restored=new Editor(builder,doc);
assert.deepEqual(restored.serialize(),stored,'Layout persists on device');
const alternate=schema.update(schema.defaultLayout(),'heal',{x:50,y:50});
restored.loadFromProject(alternate);
assert.equal(restored.serialize().slots[1].x,50);
restored.loadFromProject({version:999,slots:[]});
assert.deepEqual(restored.serialize(),stored,'Invalid project UI must preserve device preference');
elements.phoenixSkillPreset.value='moba';
elements.btnSkillApplyPreset.listeners.click();
assert.equal(restored.serialize().version,3);
assert.equal(restored.serialize().slots.length,13);
assert.equal(restored.serialize().slots[2].label,'УМЕНИЕ 1');
assert.equal(restored.serialize().slots[5].label,'УЛЬТА');
assert.equal(restored.serialize().slots[5].enabled,true);
assert.equal(elements.phoenixSkillLayer.hidden,true,'Outside EDIT/PLAY, HUD layer must remain hidden');
restored.open();
assert.equal(elements.btnPhoenixUltimate.hidden,false,'MOBA ultimate slot must be visible in EDIT');
restored.save();
restored.close();
restored.setPlaying(true);
assert.equal(elements.btnPhoenixUltimate.hidden,false,'Enabled MOBA ultimate must show in PLAY');
assert.equal(elements.btnPhoenixSlot5.hidden,false,'MOBA third skill must show in PLAY');
restored.setPlaying(false);
// Switching genres must not replace the scene, just the authored HUD.
restored.applyPreset('mmorpg');
assert.equal(restored.serialize().slots.filter(s=>s.enabled).length,8);
assert.equal(restored.serialize().slots.find(s=>s.id==='slot7').enabled,true);
restored.open();
assert.equal(elements.btnPhoenixSlot7.hidden,false);
assert.equal(elements.btnPhoenixFire.hidden,true);
restored.close();
restored.applyPreset('shooter');
assert.equal(restored.serialize().slots.filter(s=>s.enabled).length,7);
assert.equal(restored.serialize().slots.find(s=>s.id==='fire').enabled,true);
restored.setPlaying(true);
for(const id of ['btnPhoenixFire','btnPhoenixAim','btnPhoenixReload','btnPhoenixJump','btnPhoenixCrouch'])
 assert.equal(elements[id].hidden,false,id+' must be visible in shooter PLAY');
elements.btnPhoenixFire.listeners.click();
assert.equal(builder.playBridge.shots,1,'Shooter fire must dispatch real weapon input');
assert.equal(elements.btnPhoenixSlot7.hidden,true,'MMO actions hidden in shooter PLAY');
restored.setPlaying(false);
const earlier={version:2,slots:schema.presetLayout('moba').slots.slice(0,6)};
earlier.slots[0]={...earlier.slots[0],x:71};
settings.set('phoenix-engine-skill-hud-v1',JSON.stringify(earlier));
const migratedEditor=new Editor(builder,doc);
assert.equal(migratedEditor.serialize().version,3);
assert.equal(migratedEditor.serialize().slots[0].x,71,
 'Old 0.8 HUD position must migrate without resetting custom values');
assert.equal(migratedEditor.serialize().slots.length,13);
const validPng='data:image/png;base64,'+
 Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
migratedEditor.layout=schema.update(migratedEditor.layout,'attack',{image:validPng});
migratedEditor.loadForm();migratedEditor.render();
assert.equal(elements.phoenixSkillImagePreview.src,validPng);
assert.equal(elements.phoenixSkillImagePreview.hidden,false);
assert.equal(elements.btnPhoenixAttack.children[0].src,validPng,
 'Rendered HUD button must show embedded PNG instead of emoji');
migratedEditor.save();
assert.equal(JSON.parse(settings.get('phoenix-engine-skill-hud-v1')).slots[0].image,
 validPng,'Device saved HUD must persist embedded image');
migratedEditor.removeImage();
assert.equal(migratedEditor.layout.slots[0].image,'');
assert.equal(elements.phoenixSkillImagePreview.hidden,true);
console.log('PASS: MOBA/MMO/Shooter + PNG HUD finger-drag, display, placeholders and safe 0.8 migration');
