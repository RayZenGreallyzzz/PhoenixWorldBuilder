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
 'btnPhoenixSlot4','btnPhoenixSkills','btnSkillClose','btnSkillSave','btnSkillReset',
 'phoenixCombatNotice'];
const elements=Object.fromEntries(ids.map(id=>[id,new E(id)]));
const doc={body:new E('body'),getElementById:id=>elements[id]||null,
 createElement:name=>new E(name)};
const builder={playBridge:{active:false,heals:0,heal(){this.heals++}},
 prefabEditor:{closes:0,close(){this.closes++}},
 saves:0,save(){this.saves++}};
const Editor=require('../app/src/main/assets/engine/builder/skill-hud-editor.js');
const editor=new Editor(builder,doc);
assert.equal(editor.layout.slots.length,4);
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
assert.equal(elements.btnPhoenixSlot3.hidden,true);
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
console.log('PASS: finger-drag HUD, icon/color/shape, device save, JSON restore and heal click');
